import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { milestoneService } from "./milestone-service";
import multer from "multer";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import {
  transcribeAudio,
  generateResponse,
  generateSpeech,
  createAIService,
  AI_CONFIGS,
} from "./openai-service";
import { setupRealtimeWebSocket } from "./realtime-service";
import { setupGeminiLiveWebSocket } from "./gemini-live-service";
import bodyParser from "body-parser";
import { getErrorMessage } from "../shared/errorMessages";
import { APPU_SYSTEM_PROMPT } from "../shared/appuPrompts";
import { DEFAULT_PROFILE } from "../shared/childProfile";
import { seedDatabase } from "./seed";
import { openSourceMem0Service } from "./mem0-service";
import { mem0HybridService } from "./mem0-hybrid-service";

// Define a custom interface for the request with file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer for audio uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Function to create enhanced system prompt with child profile and learning milestones
async function createEnhancedSystemPrompt(
  childId: number = 1,
): Promise<string> {
  try {
    // Get child profile
    const child = await storage.getChild(childId);
    const childProfile = child?.profile || DEFAULT_PROFILE;

    // Get learning milestones for the child
    const milestones = await storage.getMilestonesByChild(childId);

    // Generate current date and time information
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    };
    const currentDateTime = now.toLocaleDateString("en-US", options);
    const timeOfDay =
      now.getHours() < 12
        ? "morning"
        : now.getHours() < 17
          ? "afternoon"
          : now.getHours() < 20
            ? "evening"
            : "night";

    // Dynamically generate profile information from childProfile keys
    const generateProfileSection = (obj: any): string => {
      let result = "";

      for (const [key, value] of Object.entries(obj)) {
        const displayKey =
          key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");

        if (Array.isArray(value)) {
          result += `- ${displayKey}: ${value.join(", ")}\n`;
        } else if (typeof value === "object" && value !== null) {
          result += `- ${displayKey}:\n`;
          const subItems = generateProfileSection(value);
          result +=
            subItems
              .split("\n")
              .map((line) => (line ? `  ${line}` : ""))
              .join("\n") + "\n";
        } else {
          result += `- ${displayKey}: ${value}\n`;
        }
      }

      return result;
    };

    // Generate learning milestones section
    const generateMilestonesSection = (): string => {
      if (!milestones || milestones.length === 0) {
        return "\nLEARNING MILESTONES:\n- No specific milestones tracked yet. Focus on general age-appropriate learning activities.\n";
      }

      let result = "\nLEARNING MILESTONES AND PROGRESS:\n";

      const activeMilestones = milestones.filter((m: any) => !m.isCompleted);
      const completedMilestones = milestones.filter((m: any) => m.isCompleted);

      if (activeMilestones.length > 0) {
        result += "\nCurrent Learning Goals:\n";
        activeMilestones.forEach((milestone: any) => {
          const progressPercent = milestone.targetValue
            ? Math.round(
                (milestone.currentProgress / milestone.targetValue) * 100,
              )
            : 0;
          result += `- ${milestone.milestoneDescription} (${progressPercent}% complete - ${milestone.currentProgress}/${milestone.targetValue})\n`;
        });
      }

      if (completedMilestones.length > 0) {
        result += "\nCompleted Achievements:\n";
        completedMilestones.forEach((milestone: any) => {
          const completedDate = milestone.completedAt
            ? new Date(milestone.completedAt).toLocaleDateString()
            : "Recently";
          result += `- ✅ ${milestone.milestoneDescription} (Completed: ${completedDate})\n`;
        });
      }

      result += "\nMILESTONE GUIDANCE:\n";
      result +=
        "- Reference these milestones during conversations to encourage progress\n";
      result += "- Celebrate achievements and progress made\n";
      result +=
        "- Incorporate learning activities that support current goals\n";
      result += "- Use age-appropriate language to discuss progress\n";

      return result;
    };

    const dateTimeInfo = `

CURRENT DATE AND TIME INFORMATION:
- Current Date & Time: ${currentDateTime}
- Time of Day: ${timeOfDay}
- Use this information to provide contextually appropriate responses based on the time of day and current date.`;

    const profileInfo = `

CHILD PROFILE INFORMATION:
${generateProfileSection(childProfile)}
Use this information to personalize your responses and make them more engaging for ${(childProfile as any).name || "the child"}.`;

    const milestonesInfo = generateMilestonesSection();

    return APPU_SYSTEM_PROMPT + dateTimeInfo + profileInfo + milestonesInfo;
  } catch (error) {
    console.error("Error creating enhanced system prompt:", error);
    // Fallback to basic prompt if there's an error
    return APPU_SYSTEM_PROMPT;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure body parser
  app.use(bodyParser.json());

  // Store generated audio in memory for testing
  const audioCache = new Map<string, Buffer>();

  // Endpoint to generate and download audio directly
  app.post("/api/generate-audio", async (req: Request, res: Response) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "No text provided" });
      }

      console.log(`Generating downloadable audio for: ${text}`);
      const speechAudio = await generateSpeech(text);

      // Store in cache for download
      const audioId = `audio-${Date.now()}`;
      audioCache.set(audioId, speechAudio);

      console.log(
        `Audio generated: ${speechAudio.length} bytes, ID: ${audioId}`,
      );
      console.log(
        `Download URL: http://localhost:5000/api/download-audio/${audioId}`,
      );

      res.json({
        audioId,
        downloadUrl: `/api/download-audio/${audioId}`,
        size: speechAudio.length,
      });
    } catch (error) {
      console.error("Error generating audio:", error);
      res.status(500).json({ error: "Failed to generate audio" });
    }
  });

  // Download endpoint for cached audio
  app.get("/api/download-audio/:audioId", (req: Request, res: Response) => {
    const { audioId } = req.params;
    const audioBuffer = audioCache.get(audioId);

    if (!audioBuffer) {
      return res.status(404).json({ error: "Audio not found" });
    }

    res.set({
      "Content-Type": "audio/wav",
      "Content-Disposition": `attachment; filename="appu-speech-${audioId}.wav"`,
      "Content-Length": audioBuffer.length,
    });

    res.send(audioBuffer);
    console.log(`Audio downloaded: ${audioId}`);
  });

  // Debug endpoint to show the enhanced system prompt structure
  app.get(
    "/api/debug/enhanced-prompt/:childId?",
    async (req: Request, res: Response) => {
      try {
        const childId = parseInt(req.params.childId) || 1;
        const enhancedPrompt = await createEnhancedSystemPrompt(childId);

        res.json({
          childId,
          promptLength: enhancedPrompt.length,
          sections: {
            basePrompt: "APPU_SYSTEM_PROMPT (character definition)",
            dateTimeInfo: "Current date, time, and time of day context",
            childProfile:
              "Child's personal preferences, likes, dislikes, learning goals",
            learningMilestones:
              "Current progress, completed achievements, guidance",
          },
          fullPrompt: enhancedPrompt,
        });
      } catch (error) {
        console.error("Error generating enhanced prompt debug info:", error);
        res.status(500).json({ error: "Failed to generate prompt debug info" });
      }
    },
  );

  // Simple test endpoint to generate and return download URL
  app.get("/api/test-audio", async (req: Request, res: Response) => {
    try {
      const testText =
        "Hello! Main Appu hoon, tumhara magical elephant dost! Namaste!";
      console.log("Generating test audio...");

      const speechAudio = await generateSpeech(testText);
      const audioId = `test-${Date.now()}`;
      audioCache.set(audioId, speechAudio);

      const downloadUrl = `http://localhost:5000/api/download-audio/${audioId}`;
      console.log(`Test audio ready: ${downloadUrl}`);

      res.json({
        success: true,
        text: testText,
        audioId,
        downloadUrl,
        size: speechAudio.length,
        message: "Click the download URL to get the audio file",
      });
    } catch (error) {
      console.error("Test audio generation failed:", error);
      res.status(500).json({ error: "Failed to generate test audio" });
    }
  });

  // Handle direct text input - skips audio transcription
  app.post("/api/process-text", async (req: Request, res: Response) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: "No text provided" });
      }

      console.log(`Received text: ${text}`);

      // Get or create conversation for the default child (demo child)
      const childId = 1; // Using the seeded child ID for demo
      let conversation = await storage.getCurrentConversation(childId);

      if (!conversation) {
        // Create new conversation if none exists
        conversation = await storage.createConversation({
          childId: childId,
        });
        console.log(
          `Created new conversation ${conversation.id} for child ${childId}`,
        );
      }

      // Generate a response using enhanced system prompt with milestone details
      const enhancedPrompt = await createEnhancedSystemPrompt(childId);

      // Log the enhanced prompt structure for debugging
      console.log("=== ENHANCED PROMPT STRUCTURE FOR REALTIME API ===");
      console.log("Child ID:", childId);
      console.log("Prompt Length:", enhancedPrompt.length);
      console.log(
        "Prompt Preview (first 500 chars):",
        enhancedPrompt.substring(0, 500) + "...",
      );
      console.log("=== END PROMPT STRUCTURE ===");

      const responseText = await generateResponse(
        `${enhancedPrompt}\n\nChild's message: ${text}`,
      );

      console.log(`Response text: ${responseText}`);

      // Store messages in database
      try {
        // Store child's input message
        await storage.createMessage({
          conversationId: conversation.id,
          type: "child_input",
          content: text,
          transcription: text,
        });

        // Store Appu's response message
        await storage.createMessage({
          conversationId: conversation.id,
          type: "appu_response",
          content: responseText,
        });

        // Update conversation message count
        const currentMessages = await storage.getMessagesByConversation(
          conversation.id,
        );
        await storage.updateConversation(conversation.id, {
          totalMessages: currentMessages.length,
        });

        console.log(`Stored messages for conversation ${conversation.id}`);
      } catch (error) {
        console.error("Error storing messages:", error);
      }

      // Generate speech audio using OpenAI's TTS API
      const speechAudio = await generateSpeech(responseText);

      console.log(`Generated speech audio: ${speechAudio.length} bytes`);

      // Save the audio file for download/testing
      const timestamp = Date.now();
      const audioFileName = `appu-speech-${timestamp}.wav`;
      const publicDir = path.join(process.cwd(), "public");
      const audioFilePath = path.join(publicDir, audioFileName);

      // Ensure public directory exists
      try {
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
          console.log(`Created public directory: ${publicDir}`);
        }

        // Save the audio file
        fs.writeFileSync(audioFilePath, speechAudio);
        console.log(
          `Speech audio saved as: ${audioFileName} (${speechAudio.length} bytes)`,
        );
        console.log(
          `Download URL: http://localhost:5000/public/${audioFileName}`,
        );
        console.log(`Direct file path: ${audioFilePath}`);
      } catch (saveError) {
        console.error(`Error saving audio file: ${saveError}`);
      }

      // Return a JSON response with both the text and Base64 encoded audio
      res.json({
        text: responseText,
        transcribedText: text, // We use the input text as the "transcription"
        audioData: speechAudio.toString("base64"),
        contentType: "audio/wav",
      });
    } catch (error: any) {
      console.error("Error processing text:", error);

      // Get the appropriate error type and message
      let errorType = "generic";

      // Map the error message to an error type
      if (error.message === "rateLimit") {
        errorType = "rateLimit";
      } else if (error.message === "auth") {
        errorType = "auth";
      } else if (error.message === "serviceUnavailable") {
        errorType = "serviceUnavailable";
      } else if (error.message === "network") {
        errorType = "network";
      } else if (error.message === "audioProcessingError") {
        errorType = "audioProcessingError";
      } else if (error.message === "textProcessingError") {
        errorType = "textProcessingError";
      }

      const errorState = getErrorMessage(errorType);

      res.status(500).json({
        error: errorState.userMessage,
        errorType: errorType,
        debugMessage: errorState.debugMessage,
      });
    }
  });

  // AI Configuration-based processing endpoint
  app.post("/api/process-with-config", async (req: Request, res: Response) => {
    try {
      const { text, aiConfig = "standard", useCreative = false } = req.body;

      if (!text || text.trim() === "") {
        return res.status(400).json({ error: "Text input is required" });
      }

      console.log(
        `Processing text with AI config: ${aiConfig}, creative: ${useCreative}`,
      );

      // Create AI service based on configuration
      const aiService = createAIService(aiConfig as keyof typeof AI_CONFIGS);

      // Generate response using the configured AI service
      const responseText = await aiService.generateResponse(text);
      console.log(`Response text: ${responseText}`);

      // Generate speech with optional creative voice
      const speechConfig = useCreative
        ? { audioVoice: "fable" as const }
        : undefined;
      const speechAudio = await aiService.generateSpeech(
        responseText,
        speechConfig,
      );

      // Convert audio to base64 for response
      const audioBase64 = speechAudio.toString("base64");

      res.json({
        text: responseText,
        audioData: audioBase64,
        config: aiConfig,
        creative: useCreative,
      });
    } catch (error: any) {
      console.error("Error in config-based processing:", error);
      res.status(500).json({
        error: "Processing failed",
        details: error.message,
      });
    }
  });

  // Get children by parent ID
  app.get("/api/parents/:parentId/children", async (req: Request, res: Response) => {
    try {
      const parentId = req.params.parentId;

      if (!parentId) {
        return res.status(400).json({ error: "Invalid parent ID" });
      }

      console.log("Fetching children for parent ID:", parentId);
      const children = await storage.getChildrenByParent(parentId);
      console.log("Found children:", children.length);

      res.json(children);
    } catch (error) {
      console.error("Error fetching children by parent:", error);
      res.status(500).json({ error: "Failed to fetch children" });
    }
  });

  // Test endpoint for manual tool invocation
  app.post("/api/test-tool", async (req: Request, res: Response) => {
    try {
      const { testGetEyesTool, testCompleteToolFlow } = await import(
        "./test-tool-invocation"
      );

      const { frameData, testType = "simple" } = req.body;

      let result;
      if (testType === "complete") {
        result = await testCompleteToolFlow();
      } else {
        result = await testGetEyesTool(frameData);
      }

      res.json({
        success: true,
        testType,
        result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Tool test error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Handle audio processing with OpenAI
  // Endpoint to create ephemeral token for OpenAI Realtime API
  // Parent Dashboard API Routes

  // Parent registration
  app.post("/api/parents/register", async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;

      // Check if parent already exists
      const existingParent = await storage.getParentByEmail(email);
      if (existingParent) {
        return res
          .status(400)
          .json({ error: "Parent already exists with this email" });
      }

      const parent = await storage.createParent({ email, password, name });
      res.json({
        parent: { id: parent.id, email: parent.email, name: parent.name },
      });
    } catch (error) {
      console.error("Error registering parent:", error);
      res.status(500).json({ error: "Failed to register parent" });
    }
  });

  // Parent login
  app.post("/api/parents/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      const parent = await storage.getParentByEmail(email);
      if (!parent || parent.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      res.json({
        parent: { id: parent.id, email: parent.email, name: parent.name },
      });
    } catch (error) {
      console.error("Error logging in parent:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Get parent dashboard data
  app.get(
    "/api/parents/:parentId/dashboard",
    async (req: Request, res: Response) => {
      try {
        const parentId = req.params.parentId;
        console.log(
          "Fetching dashboard data for parent ID:",
          parentId,
          "Type:",
          typeof parentId,
        );

        if (!parentId) {
          return res.status(400).json({ error: "Invalid parent ID" });
        }

        // Keep as string to handle large numbers correctly
        const dashboardData = await storage.getParentDashboardData(parentId);
        console.log(
          "Dashboard data being returned:",
          JSON.stringify(dashboardData, null, 2),
        );
        res.json(dashboardData);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({ error: "Failed to fetch dashboard data" });
      }
    },
  );

  // Create child profile
  app.post("/api/children", async (req: Request, res: Response) => {
    try {
      const { parentId, name, age, profile } = req.body;
      const child = await storage.createChild({ parentId, name, age, profile });
      res.json(child);
    } catch (error) {
      console.error("Error creating child:", error);
      res.status(500).json({ error: "Failed to create child profile" });
    }
  });

  // Get conversations for a child
  app.get(
    "/api/children/:childId/conversations",
    async (req: Request, res: Response) => {
      try {
        const childId = parseInt(req.params.childId);
        const limit = parseInt(req.query.limit as string) || 10;
        const conversations = await storage.getConversationsByChild(
          childId,
          limit,
        );
        res.json(conversations);
      } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ error: "Failed to fetch conversations" });
      }
    },
  );

  // Get messages for a conversation
  app.get(
    "/api/conversations/:conversationId/messages",
    async (req: Request, res: Response) => {
      try {
        const conversationId = parseInt(req.params.conversationId);
        const messages =
          await storage.getMessagesByConversation(conversationId);
        res.json(messages);
      } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ error: "Failed to fetch messages" });
      }
    },
  );

  // Close current conversation
  app.post("/api/close-conversation", async (req: Request, res: Response) => {
    try {
      const childId = 1; // Using the seeded child ID for demo
      const conversation = await storage.getCurrentConversation(childId);

      if (conversation) {
        const endTime = new Date();
        const duration = Math.floor(
          (endTime.getTime() - new Date(conversation.startTime).getTime()) /
            1000,
        );

        await storage.updateConversation(conversation.id, {
          endTime,
          duration,
          totalMessages: conversation.totalMessages,
        });

        console.log(
          `Closed conversation ${conversation.id} - Duration: ${duration}s`,
        );
        res.json({
          message: "Conversation closed successfully",
          conversationId: conversation.id,
          duration: duration,
        });
      } else {
        res.json({ message: "No active conversation to close" });
      }
    } catch (error) {
      console.error("Error closing conversation:", error);
      res.status(500).json({ error: "Failed to close conversation" });
    }
  });

  // Seed database with sample data for demo
  app.post("/api/seed-database", async (req: Request, res: Response) => {
    try {
      const result = await seedDatabase();
      res.json({
        message: "Database seeded successfully",
        demoCredentials: {
          email: "demo@parent.com",
          password: "demo123",
        },
        data: result,
      });
    } catch (error) {
      console.error("Error seeding database:", error);
      res.status(500).json({ error: "Failed to seed database" });
    }
  });

  // Start realtime conversation endpoint
  app.post(
    "/api/start-realtime-conversation",
    async (req: Request, res: Response) => {
      try {
        const { childId } = req.body;

        // Create a new conversation for the realtime session
        const conversation = await storage.createConversation({ childId });

        res.json({ success: true, conversationId: conversation.id });
      } catch (error) {
        console.error("Error starting realtime conversation:", error);
        res.status(500).json({ error: "Failed to start conversation" });
      }
    },
  );

  // Store realtime message endpoint
  app.post(
    "/api/store-realtime-message",
    async (req: Request, res: Response) => {
      try {
        const { type, content, transcription } = req.body;

        // Get the current active conversation for child ID 1 (default child)
        const childId = 1;
        let conversation = await storage.getCurrentConversation(childId);

        // If no active conversation, create one
        if (!conversation) {
          conversation = await storage.createConversation({ childId });
        }

        // Store the message
        await storage.createMessage({
          conversationId: conversation.id,
          type,
          content,
          transcription,
        });

        // Update conversation message count
        const currentMessages = await storage.getMessagesByConversation(
          conversation.id,
        );
        await storage.updateConversation(conversation.id, {
          totalMessages: currentMessages.length,
        });

        res.json({ success: true, conversationId: conversation.id });
      } catch (error) {
        console.error("Error storing realtime message:", error);
        res.status(500).json({ error: "Failed to store message" });
      }
    },
  );

  app.post("/api/session", async (req: Request, res: Response) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      // Generate enhanced prompt and ensure it's a string
      console.log("Starting enhanced prompt generation...");
      let enhancedInstructions;

      try {
        enhancedInstructions = await createEnhancedSystemPrompt(1);
        console.log("Enhanced instructions generated successfully");
        console.log("Type:", typeof enhancedInstructions);
        console.log("Length:", enhancedInstructions?.length || 0);
        console.log("Is string:", typeof enhancedInstructions === "string");

        if (typeof enhancedInstructions !== "string") {
          console.error("Instructions is not a string:", enhancedInstructions);
          return res
            .status(500)
            .json({ error: "Failed to generate instructions - not a string" });
        }

        if (!enhancedInstructions || enhancedInstructions.length === 0) {
          console.error("Instructions is empty");
          return res
            .status(500)
            .json({ error: "Failed to generate instructions - empty" });
        }
      } catch (promptError) {
        console.error("Error generating enhanced prompt:", promptError);
        const errorMessage =
          promptError instanceof Error ? promptError.message : "Unknown error";
        return res
          .status(500)
          .json({
            error: "Failed to generate enhanced prompt",
            details: errorMessage,
          });
      }

      // Define the getEyesTool for OpenAI Realtime API
      const tools = [
        {
          type: "function",
          name: "getEyesTool",
          description:
            "Use this tool when the child is showing, pointing to, or talking about something visual that you should look at. This tool analyzes what the child is showing through their camera.",
          parameters: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                description:
                  "Why you want to look at what the child is showing",
              },
            },
            required: ["reason"],
          },
        },
      ];

      console.log("Enhanced Instructions:", enhancedInstructions);

      const response = await fetch(
        "https://api.openai.com/v1/realtime/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-realtime-preview-2024-12-17",
            voice: "alloy",
            instructions: enhancedInstructions,
            tools,
            tool_choice: "auto",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            modalities: ["text", "audio"],
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Failed to create session:", response.status, errorData);
        return res.status(response.status).json({
          error: "Failed to create realtime session",
          details: errorData,
        });
      }

      const sessionData = await response.json();
      res.json({
        client_secret:
          sessionData.client_secret?.value || sessionData.client_secret,
        expires_at: sessionData.client_secret?.expires_at,
      });
    } catch (error) {
      console.error("Error creating realtime session:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Learning milestones endpoints
  app.post("/api/milestones", async (req: Request, res: Response) => {
    try {
      const milestone = await storage.createLearningMilestone(req.body);
      res.json(milestone);
    } catch (error) {
      console.error("Error creating milestone:", error);
      res.status(500).json({ message: "Failed to create milestone" });
    }
  });

  app.get(
    "/api/children/:childId/milestones",
    async (req: Request, res: Response) => {
      try {
        const childId = parseInt(req.params.childId);
        const milestones = await storage.getMilestonesByChild(childId);
        res.json(milestones);
      } catch (error) {
        console.error("Error fetching milestones:", error);
        res.status(500).json({ message: "Failed to fetch milestones" });
      }
    },
  );

  app.patch(
    "/api/milestones/:milestoneId/progress",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = parseInt(req.params.milestoneId);
        const { progress } = req.body;
        const milestone = await storage.updateMilestoneProgress(
          milestoneId,
          progress,
        );
        res.json(milestone);
      } catch (error) {
        console.error("Error updating milestone progress:", error);
        res
          .status(500)
          .json({ message: "Failed to update milestone progress" });
      }
    },
  );

  app.patch(
    "/api/milestones/:milestoneId/complete",
    async (req: Request, res: Response) => {
      try {
        const milestoneId = parseInt(req.params.milestoneId);
        const milestone = await storage.completeMilestone(milestoneId);

        // Create milestone achievement notification
        const child = await storage.getChild(milestone.childId);
        if (child) {
          await storage.createNotification({
            parentId: child.parentId,
            childId: milestone.childId,
            milestoneId: milestone.id,
            type: "milestone_achieved",
            title: "Milestone Achieved!",
            message: `${child.name} has completed: ${milestone.milestoneDescription}`,
            priority: "high",
          });
        }

        res.json(milestone);
      } catch (error) {
        console.error("Error completing milestone:", error);
        res.status(500).json({ message: "Failed to complete milestone" });
      }
    },
  );

  // Notifications endpoints
  app.get(
    "/api/parents/:parentId/notifications",
    async (req: Request, res: Response) => {
      try {
        const parentId = parseInt(req.params.parentId);
        const unreadOnly = req.query.unreadOnly === "true";
        const notifications = await storage.getNotificationsByParent(
          parentId,
          unreadOnly,
        );
        res.json(notifications);
      } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ message: "Failed to fetch notifications" });
      }
    },
  );

  app.post("/api/notifications", async (req: Request, res: Response) => {
    try {
      const notification = await storage.createNotification(req.body);
      res.json(notification);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(500).json({ message: "Failed to create notification" });
    }
  });

  app.patch(
    "/api/notifications/:notificationId/read",
    async (req: Request, res: Response) => {
      try {
        const notificationId = parseInt(req.params.notificationId);
        const notification =
          await storage.markNotificationAsRead(notificationId);
        res.json(notification);
      } catch (error) {
        console.error("Error marking notification as read:", error);
        res
          .status(500)
          .json({ message: "Failed to mark notification as read" });
      }
    },
  );

  app.patch(
    "/api/parents/:parentId/notifications/read-all",
    async (req: Request, res: Response) => {
      try {
        const parentId = parseInt(req.params.parentId);
        await storage.markAllNotificationsAsRead(parentId);
        res.json({ message: "All notifications marked as read" });
      } catch (error) {
        console.error("Error marking all notifications as read:", error);
        res
          .status(500)
          .json({ message: "Failed to mark all notifications as read" });
      }
    },
  );

  // Notification preferences endpoints
  app.get(
    "/api/parents/:parentId/notification-preferences",
    async (req: Request, res: Response) => {
      try {
        const parentId = parseInt(req.params.parentId);
        const preferences = await storage.getNotificationPreferences(parentId);
        res.json(preferences);
      } catch (error) {
        console.error("Error fetching notification preferences:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch notification preferences" });
      }
    },
  );

  // Video frame analysis endpoint for OpenAI Realtime API
  app.post("/api/analyze-frame", async (req, res) => {
    try {
      const { frameData, reason } = req.body;

      if (!frameData) {
        return res.status(400).json({ error: "No frame data provided" });
      }

      console.log("🔍 Analyzing video frame for OpenAI Realtime API:", {
        reason,
      });

      // Use OpenAI's vision model to analyze the frame
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "A child is showing something to their AI companion Appu. Please describe what you see in this image in a child-friendly way. Focus on objects, toys, drawings, books, or anything the child mightbe proudly showing off. Be specific about colors, shapes, and details that would help Appu respond enthusiastically to what the child is showing.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${frameData}`,
                },
              },
            ],
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      });

      const analysis =
        response.choices[0]?.message?.content ||
        "I can see something interesting!";

      console.log("✅ Frame analysis completed:", analysis.slice(0, 100));

      res.json({
        analysis,
        success: true,
      });
    } catch (error: any) {
      console.error("❌ Frame analysis error:", error);
      res.status(500).json({
        error: "Failed to analyze frame",
        analysis: "I can see you're showing me something special!",
      });
    }
  });

  app.post(
    "/api/notification-preferences",
    async (req: Request, res: Response) => {
      try {
        const preferences = await storage.createNotificationPreferences(
          req.body,
        );
        res.json(preferences);
      } catch (error) {
        console.error("Error creating notification preferences:", error);
        res
          .status(500)
          .json({ message: "Failed to create notification preferences" });
      }
    },
  );

  app.patch(
    "/api/parents/:parentId/notification-preferences",
    async (req: Request, res: Response) => {
      try {
        const parentId = parseInt(req.params.parentId);
        const preferences = await storage.updateNotificationPreferences(
          parentId,
          req.body,
        );
        res.json(preferences);
      } catch (error) {
        console.error("Error updating notification preferences:", error);
        res
          .status(500)
          .json({ message: "Failed to update notification preferences" });
      }
    },
  );

  // Process audio with AI endpoint using LangGraph workflow
  app.post(
    "/api/process-audio",
    upload.single("audio"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No audio file provided" });
        }

        console.log(
          "Processing audio file with LangGraph workflow:",
          req.file.originalname,
        );

        // Use LangGraph workflow for processing
        const { processConversation } = await import("./langgraph-workflows");

        const result = await processConversation({
          childId: 1, // Default child for demo
          audioData: req.file.buffer,
        });

        // Save audio file if generated
        let audioUrl = null;
        if (result.audioResponse) {
          const audioFileName = `appu-speech-${Date.now()}.wav`;
          const audioPath = path.join(
            process.cwd(),
            "public",
            "public",
            audioFileName,
          );
          fs.writeFileSync(audioPath, result.audioResponse);
          audioUrl = `/${audioFileName}`;
        }

        res.json({
          transcription: result.transcription,
          response: result.aiResponse,
          audioUrl,
          processingSteps: result.processingSteps,
          errors: result.errors,
          conversationId: result.conversationId,
        });
      } catch (error: any) {
        console.error("Error processing audio with workflow:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Profile update suggestions endpoints
  app.get(
    "/api/parents/:parentId/profile-suggestions",
    async (req: Request, res: Response) => {
      try {
        const parentId = parseInt(req.params.parentId);
        const status = req.query.status as string;

        const suggestions = await storage.getProfileUpdateSuggestionsByParent(
          parentId,
          status,
        );
        res.json(suggestions);
      } catch (error) {
        console.error("Error fetching profile suggestions:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch profile suggestions" });
      }
    },
  );

  app.patch(
    "/api/profile-suggestions/:suggestionId",
    async (req: Request, res: Response) => {
      try {
        const suggestionId = parseInt(req.params.suggestionId);
        const { status, parentResponse } = req.body;

        const updatedSuggestion =
          await storage.updateProfileUpdateSuggestionStatus(
            suggestionId,
            status,
            parentResponse,
          );

        res.json(updatedSuggestion);
      } catch (error) {
        console.error("Error updating profile suggestion:", error);
        res
          .status(500)
          .json({ message: "Failed to update profile suggestion" });
      }
    },
  );

  // Job scheduler endpoints for testing/management
  app.post("/api/admin/run-analysis", async (req: Request, res: Response) => {
    try {
      const { jobScheduler } = await import("./job-scheduler");
      await jobScheduler.runJobsManually();
      res.json({
        message: "Conversation analysis jobs triggered successfully",
      });
    } catch (error) {
      console.error("Error running analysis jobs:", error);
      res.status(500).json({ message: "Failed to run analysis jobs" });
    }
  });

  // Workflow monitoring endpoints
  app.get(
    "/api/admin/workflow-metrics",
    async (req: Request, res: Response) => {
      try {
        const { workflowMonitor } = await import("./workflow-monitor");
        const metrics = workflowMonitor.getMetrics();
        const health = workflowMonitor.getHealthStatus();

        res.json({ metrics, health });
      } catch (error) {
        console.error("Error getting workflow metrics:", error);
        res.status(500).json({ message: "Failed to get workflow metrics" });
      }
    },
  );

  app.post(
    "/api/admin/workflow-metrics/reset",
    async (req: Request, res: Response) => {
      try {
        const { workflowMonitor } = await import("./workflow-monitor");
        workflowMonitor.reset();

        res.json({ message: "Workflow metrics reset successfully" });
      } catch (error) {
        console.error("Error resetting workflow metrics:", error);
        res.status(500).json({ message: "Failed to reset workflow metrics" });
      }
    },
  );

  // Debug video frame reception
  app.get("/api/debug/video-status", async (req: Request, res: Response) => {
    try {
      res.json({
        message: "Video frame debug endpoint active",
        services: {
          realtime: "Listening on /ws/realtime for video_frame messages",
          gemini: "Listening on /gemini-ws for video_frame messages",
          langgraph: "getEyesTool available for LLM-controlled video analysis",
        },
        note: 'Check server console for "📹" logs when video frames are received',
      });
    } catch (error) {
      res.status(500).json({ error: "Debug endpoint failed" });
    }
  });

  // Test LangGraph workflow endpoint
  app.post("/api/admin/test-workflow", async (req: Request, res: Response) => {
    try {
      const { textInput, childId = 1 } = req.body;

      if (!textInput) {
        return res.status(400).json({ error: "textInput is required" });
      }

      const { processConversation } = await import("./langgraph-workflows");

      const result = await processConversation({
        childId,
        textInput,
      });

      res.json({
        success: true,
        result: {
          transcription: result.transcription,
          aiResponse: result.aiResponse,
          processingSteps: result.processingSteps,
          errors: result.errors,
          conversationId: result.conversationId,
        },
      });
    } catch (error) {
      console.error("Error testing workflow:", error);
      res
        .status(500)
        .json({ error: "Workflow test failed", details: String(error) });
    }
  });

  // Visualize LangGraph workflow structure
  app.get("/api/admin/workflow-graph", async (req: Request, res: Response) => {
    try {
      // Provide a structured representation of the main conversation workflow
      const conversationWorkflow = {
        nodes: [
          { id: "__start__", type: "start", label: "Start" },
          { id: "loadContext", type: "process", label: "Load Child Context" },
          { id: "callModel", type: "process", label: "Call LLM with Tools" },
          {
            id: "useTool",
            type: "process",
            label: "Execute Tools (getEyesTool)",
          },
          {
            id: "synthesizeSpeech",
            type: "process",
            label: "Synthesize Speech",
          },
          {
            id: "storeConversation",
            type: "process",
            label: "Store Conversation",
          },
          { id: "__end__", type: "end", label: "End" },
        ],
        edges: [
          { source: "__start__", target: "loadContext", label: "start" },
          {
            source: "loadContext",
            target: "callModel",
            label: "context loaded",
          },
          { source: "callModel", target: "useTool", label: "tools requested" },
          {
            source: "callModel",
            target: "synthesizeSpeech",
            label: "no tools needed",
          },
          {
            source: "useTool",
            target: "synthesizeSpeech",
            label: "tools executed",
          },
          {
            source: "synthesizeSpeech",
            target: "storeConversation",
            label: "speech synthesized",
          },
          { source: "storeConversation", target: "__end__", label: "stored" },
        ],
        entryPoint: "__start__",
      };

      res.json({
        success: true,
        workflows: {
          conversationWorkflow,
        },
        note: "Video analysis is integrated into the conversation workflow via getEyesTool",
      });
    } catch (error) {
      console.error("Error getting workflow graphs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get workflow graphs",
        details: String(error),
      });
    }
  });

  app.post("/api/parent-chat", async (req: Request, res: Response) => {
    try {
      const { parentId, question, childrenIds } = req.body;

      if (
        !parentId ||
        !question ||
        !childrenIds ||
        !Array.isArray(childrenIds)
      ) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Fetch comprehensive data for all children
      const childrenData = await Promise.all(
        childrenIds.map(async (childId: number) => {
          const [child, milestones, conversations] = await Promise.all([
            storage.getChild(childId),
            storage.getMilestonesByChild(childId),
            storage.getConversationsByChild(childId, 10), // Last 10 conversations
          ]);

          // Fetch messages for each conversation to analyze content
          const conversationsWithMessages = await Promise.all(
            conversations.map(async (conv: any) => {
              const messages = await storage.getMessagesByConversation(conv.id);
              return {
                ...conv,
                messages: messages,
              };
            }),
          );

          return {
            child,
            milestones,
            recentConversations: conversationsWithMessages,
          };
        }),
      );

      // Generate comprehensive data summary for AI analysis
      const dataContext = childrenData
        .map(({ child, milestones, recentConversations }) => {
          if (!child) return null;

          const completedMilestones =
            milestones?.filter((m: any) => m.isCompleted) || [];
          const inProgressMilestones =
            milestones?.filter(
              (m: any) => !m.isCompleted && m.currentProgress > 0,
            ) || [];
          const upcomingMilestones =
            milestones?.filter(
              (m: any) => !m.isCompleted && m.currentProgress === 0,
            ) || [];

          const totalMessages =
            recentConversations?.reduce(
              (sum: number, conv: any) => sum + (conv.totalMessages || 0),
              0,
            ) || 0;
          const avgConversationDuration =
            recentConversations?.length > 0
              ? recentConversations.reduce(
                  (sum: number, conv: any) => sum + (conv.duration || 0),
                  0,
                ) / recentConversations.length
              : 0;

          return {
            name: child.name,
            age: child.age,
            profile: child.profile,
            isActive: child.isActive,
            learningProgress: {
              completed: completedMilestones.length,
              inProgress: inProgressMilestones.length,
              upcoming: upcomingMilestones.length,
              milestoneDetails:
                milestones?.map((m: any) => ({
                  type: m.milestoneType,
                  description: m.milestoneDescription,
                  progress: `${m.currentProgress}/${m.targetValue || 1}`,
                  completed: m.isCompleted,
                  progressPercentage: Math.round(
                    (m.currentProgress / (m.targetValue || 1)) * 100,
                  ),
                })) || [],
            },
            recentActivity: {
              totalConversations: recentConversations?.length || 0,
              totalMessages: totalMessages,
              averageConversationDuration: Math.round(avgConversationDuration),
              lastConversation: recentConversations?.[0]?.startTime || null,
              conversationSummaries:
                recentConversations?.slice(0, 5).map((conv: any) => ({
                  date: conv.startTime,
                  duration: conv.duration,
                  messageCount: conv.totalMessages,
                  topics:
                    conv.messages?.map((msg: any) => msg.content).join(" ") ||
                    "",
                  childMessages:
                    conv.messages
                      ?.filter((msg: any) => msg.type === "child_input")
                      .map((msg: any) => msg.content) || [],
                  appuResponses:
                    conv.messages
                      ?.filter((msg: any) => msg.type === "appu_response")
                      .map((msg: any) => msg.content) || [],
                })) || [],
            },
          };
        })
        .filter(Boolean);

      // Create AI prompt for parent assistant
      const systemPrompt = `You are a helpful AI assistant for parents using the Appu educational platform. Your role is to answer questions about their children's learning progress, conversation insights, and milestone achievements using ONLY the authentic data provided.

IMPORTANT GUIDELINES:
1. Only use the specific data provided about the children - never make up or assume information
2. Questions about conversation topics, what children discuss with Appu, learning interests, and educational interactions ARE within your scope
3. If asked about topics completely unrelated to children's learning/education (like weather, news, etc.), politely redirect
4. Be encouraging and supportive while being factual
5. Use the child's name when relevant
6. Provide specific numbers and details from the data when available
7. When asked about conversation topics, analyze the actual message content in conversationSummaries
8. Look at both childMessages and appuResponses to understand conversation themes
9. Identify patterns in what the child asks about and discusses
10. If data is missing or unavailable, clearly state this

CONVERSATION ANALYSIS GUIDANCE:
- Review the childMessages arrays to see what topics the child brings up
- Look at appuResponses to understand how conversations develop
- Identify recurring themes, interests, or learning areas from actual conversations
- Extract specific examples from the conversation content when relevant
- Note any educational progress or interests shown in conversations

DATA CONTEXT:
${JSON.stringify(dataContext, null, 2)}

Answer the parent's question using this data. Be specific, helpful, and encouraging. When discussing conversation topics, reference actual content from the conversations.`;

      const response = await generateResponse(
        `Parent Question: ${question}`,
        false, // Use standard mode, not creative
        systemPrompt,
      );

      res.json({ response });
    } catch (error) {
      console.error("Error in parent chat:", error);
      res.status(500).json({ error: "Failed to process chat request" });
    }
  });

  // Update child profile endpoint
  app.patch(
    "/api/children/:childId/profile",
    async (req: Request, res: Response) => {
      try {
        const { childId } = req.params;
        const { updates } = req.body;

        if (!updates || typeof updates !== "object") {
          return res.status(400).json({ error: "Updates object is required" });
        }

        const child = await storage.getChild(parseInt(childId));
        if (!child) {
          return res.status(404).json({ error: "Child not found" });
        }

        // Merge updates with existing profile
        const currentProfile: any = child.profile || {};
        const updatedProfile: any = { ...currentProfile };

        // Handle different types of updates
        if (updates.likes) {
          updatedProfile.likes = Array.isArray(updates.likes)
            ? updates.likes
            : [...(currentProfile.likes || []), updates.likes];
        }

        if (updates.dislikes) {
          updatedProfile.dislikes = Array.isArray(updates.dislikes)
            ? updates.dislikes
            : [...(currentProfile.dislikes || []), updates.dislikes];
        }

        if (updates.favoriteThings) {
          updatedProfile.favoriteThings = {
            ...(currentProfile.favoriteThings || {}),
            ...updates.favoriteThings,
          };
        }

        if (updates.learningGoals) {
          updatedProfile.learningGoals = Array.isArray(updates.learningGoals)
            ? updates.learningGoals
            : [...(currentProfile.learningGoals || []), updates.learningGoals];
        }

        if (updates.preferredLanguages) {
          updatedProfile.preferredLanguages = Array.isArray(
            updates.preferredLanguages,
          )
            ? updates.preferredLanguages
            : [
                ...(currentProfile.preferredLanguages || []),
                updates.preferredLanguages,
              ];
        }

        if (updates.dailyRoutine) {
          updatedProfile.dailyRoutine = {
            ...(currentProfile.dailyRoutine || {}),
            ...updates.dailyRoutine,
          };
        }

        // Update the child profile
        await storage.updateChildProfile(parseInt(childId), updatedProfile);

        res.json({
          message: "Profile updated successfully",
          updatedProfile,
        });
      } catch (error) {
        console.error("Error updating child profile:", error);
        res.status(500).json({ error: "Failed to update profile" });
      }
    },
  );

  // Enhanced parent chat with profile update capabilities
  app.post(
    "/api/parent-chat-with-updates",
    async (req: Request, res: Response) => {
      try {
        const { parentId, question, childrenIds } = req.body;

        if (!parentId || !question) {
          return res
            .status(400)
            .json({ error: "parentId and question are required" });
        }

        // Get children data for context
        const children = childrenIds
          ? await Promise.all(
              childrenIds.map((id: number) => storage.getChild(id)),
            )
          : await storage.getChildrenByParent(parentId);

        // Build comprehensive data context for AI
        const dataContext = await Promise.all(
          children.map(async (child: any) => {
            if (!child) return null;

            // Get conversations for this child
            const recentConversations = await storage.getConversationsByChild(
              child.id,
              10,
            );

            const totalMessages =
              recentConversations?.reduce(
                (sum: number, conv: any) => sum + (conv.totalMessages || 0),
                0,
              ) || 0;

            const avgConversationDuration =
              recentConversations?.length > 0
                ? recentConversations.reduce(
                    (sum: number, conv: any) => sum + (conv.duration || 0),
                    0,
                  ) / recentConversations.length
                : 0;

            // Get milestones for this child
            const milestones = await storage.getMilestonesByChild(child.id);
            const completedMilestones =
              milestones?.filter((m: any) => m.isCompleted) || [];
            const inProgressMilestones =
              milestones?.filter(
                (m: any) => !m.isCompleted && m.currentProgress > 0,
              ) || [];
            const upcomingMilestones =
              milestones?.filter(
                (m: any) => !m.isCompleted && m.currentProgress === 0,
              ) || [];

            return {
              id: child.id,
              name: child.name,
              age: child.age,
              profile: child.profile,
              isActive: child.isActive,
              learningProgress: {
                completed: completedMilestones.length,
                inProgress: inProgressMilestones.length,
                upcoming: upcomingMilestones.length,
                milestoneDetails:
                  milestones?.map((m: any) => ({
                    type: m.milestoneType,
                    description: m.milestoneDescription,
                    progress: `${m.currentProgress}/${m.targetValue || 1}`,
                    completed: m.isCompleted,
                    progressPercentage: Math.round(
                      (m.currentProgress / (m.targetValue || 1)) * 100,
                    ),
                  })) || [],
              },
              recentActivity: {
                totalConversations: recentConversations?.length || 0,
                totalMessages: totalMessages,
                averageConversationDuration: Math.round(
                  avgConversationDuration,
                ),
                lastConversation: recentConversations?.[0]?.startTime || null,
                conversationSummaries:
                  recentConversations?.slice(0, 5).map((conv: any) => ({
                    date: conv.startTime,
                    duration: conv.duration,
                    messageCount: conv.totalMessages,
                    topics:
                      conv.messages?.map((msg: any) => msg.content).join(" ") ||
                      "",
                    childMessages:
                      conv.messages
                        ?.filter((msg: any) => msg.type === "child_input")
                        .map((msg: any) => msg.content) || [],
                    appuResponses:
                      conv.messages
                        ?.filter((msg: any) => msg.type === "appu_response")
                        .map((msg: any) => msg.content) || [],
                  })) || [],
              },
            };
          }),
        ).filter(Boolean);

        // Enhanced system prompt with profile update capabilities
        const systemPrompt = `You are a helpful AI assistant for parents using the Appu educational platform. Your role is to answer questions about their children learning progress, conversation insights, milestone achievements, AND help parents update their children profiles based on new information.

IMPORTANT CAPABILITIES:
1. Answer questions about children learning progress using authentic data
2. Analyze conversation topics and learning patterns
3. Help parents update child profiles when they provide new information
4. Process profile update requests and return structured data for implementation

PROFILE UPDATE GUIDELINES:
- When parents mention new information about their child (likes, dislikes, favorite things, learning goals, etc.), offer to update the profile
- Extract structured profile updates from parent input
- If the parent wants to update a profile, end your response with this EXACT format (no markdown, no code blocks):

PROFILE_UPDATE_REQUEST:
{"childId": 1, "updates": {"favoriteThings": {"characters": ["Peppa Pig"]}}}

CRITICAL: Do NOT use markdown formatting around the JSON. Write the JSON directly after the colon.

CONVERSATION ANALYSIS GUIDANCE:
- Review childMessages arrays to see what topics the child brings up
- Look at appuResponses to understand how conversations develop
- Identify recurring themes, interests, or learning areas from actual conversations
- Extract specific examples from conversation content when relevant

GENERAL GUIDELINES:
1. Only use the specific data provided about the children
2. Be encouraging and supportive while being factual
3. Use the child name when relevant
4. Provide specific numbers and details from the data when available
5. If asked about topics completely unrelated to children learning education, politely redirect

DATA CONTEXT:
${JSON.stringify(dataContext, null, 2)}

Answer the parent question using this data. Be specific, helpful, and encouraging. When discussing conversation topics, reference actual content from the conversations. If the parent provides new information about their child, offer to update the profile and include the PROFILE_UPDATE_REQUEST JSON at the end.`;

        const response = await generateResponse(
          `Parent Question: ${question}`,
          false, // Use standard mode, not creative
          systemPrompt,
        );

        // Check if response contains profile update request
        const profileUpdateMarker = "PROFILE_UPDATE_REQUEST:";
        const markerIndex = response.indexOf(profileUpdateMarker);
        let profileUpdateData = null;
        let cleanResponse = response;

        if (markerIndex !== -1) {
          try {
            // Extract the JSON part after the marker
            const afterMarker = response.substring(
              markerIndex + profileUpdateMarker.length,
            );

            // Simple approach: extract the first line that looks like JSON after the marker
            const lines = afterMarker.split("\n");
            let jsonLine = "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                jsonLine = trimmed;
                break;
              }
            }

            if (jsonLine) {
              console.log("Found JSON line:", jsonLine);
              profileUpdateData = JSON.parse(jsonLine);
              cleanResponse = response.substring(0, markerIndex).trim();
            }
          } catch (e) {
            console.error("Failed to parse profile update JSON:", e);
          }
        }

        // If profile update was requested, process it
        if (
          profileUpdateData &&
          profileUpdateData.childId &&
          profileUpdateData.updates
        ) {
          try {
            const child = await storage.getChild(profileUpdateData.childId);
            if (child) {
              const currentProfile: any = child.profile || {};
              const updatedProfile: any = { ...currentProfile };

              // Process updates
              Object.keys(profileUpdateData.updates).forEach((key) => {
                if (key === "favoriteThings") {
                  updatedProfile.favoriteThings = {
                    ...(currentProfile.favoriteThings || {}),
                    ...profileUpdateData.updates.favoriteThings,
                  };
                } else if (key === "dailyRoutine") {
                  updatedProfile.dailyRoutine = {
                    ...(currentProfile.dailyRoutine || {}),
                    ...profileUpdateData.updates.dailyRoutine,
                  };
                } else if (Array.isArray(profileUpdateData.updates[key])) {
                  // For arrays, add new items or replace entirely based on context
                  const existingItems = currentProfile[key] || [];
                  const newItems = profileUpdateData.updates[key];
                  updatedProfile[key] = [...existingItems, ...newItems].filter(
                    (item, index, arr) => arr.indexOf(item) === index,
                  );
                } else {
                  updatedProfile[key] = profileUpdateData.updates[key];
                }
              });

              await storage.updateChildProfile(
                profileUpdateData.childId,
                updatedProfile,
              );

              res.json({
                response:
                  cleanResponse + "\n\n✅ Profile updated successfully!",
                profileUpdated: true,
                updatedFields: Object.keys(profileUpdateData.updates),
              });
              return;
            }
          } catch (error) {
            console.error("Error updating profile:", error);
          }
        }

        res.json({ response: cleanResponse, profileUpdated: false });
      } catch (error) {
        console.error("Error in enhanced parent chat:", error);
        res.status(500).json({ error: "Failed to process chat request" });
      }
    },
  );

  app.get("/api/admin/job-status", async (req: Request, res: Response) => {
    try {
      const { jobScheduler } = await import("./job-scheduler");
      const status = jobScheduler.getStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting job status:", error);
      res.status(500).json({ message: "Failed to get job status" });
    }
  });

  // Memory Console API endpoints
  app.get("/api/memories/:userId", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const memories = await openSourceMem0Service.getAllMemories(userId);
      res.json(memories);
    } catch (error) {
      console.error("Error fetching memories:", error);
      res.status(500).json({ message: "Failed to fetch memories" });
    }
  });

  app.post("/api/memories/search", async (req: Request, res: Response) => {
    try {
      const { query, userId, limit = 10 } = req.body;
      const results = await openSourceMem0Service.searchMemories(
        query,
        userId,
        limit,
      );
      res.json(results);
    } catch (error) {
      console.error("Error searching memories:", error);
      res.status(500).json({ message: "Failed to search memories" });
    }
  });

  app.post("/api/memories", async (req: Request, res: Response) => {
    try {
      const { content, userId, metadata } = req.body;
      const memory = await openSourceMem0Service.addMemory(
        content,
        userId,
        metadata,
      );
      res.json(memory);
    } catch (error) {
      console.error("Error adding memory:", error);
      res.status(500).json({ message: "Failed to add memory" });
    }
  });

  app.delete("/api/memories/:memoryId", async (req: Request, res: Response) => {
    try {
      const { memoryId } = req.params;
      const success = await openSourceMem0Service.deleteMemory(memoryId);
      res.json({ success });
    } catch (error) {
      console.error("Error deleting memory:", error);
      res.status(500).json({ message: "Failed to delete memory" });
    }
  });

  app.put("/api/memories/:memoryId", async (req: Request, res: Response) => {
    try {
      const { memoryId } = req.params;
      const { content, metadata } = req.body;
      const memory = await openSourceMem0Service.updateMemory(
        memoryId,
        content,
        metadata,
      );
      res.json(memory);
    } catch (error) {
      console.error("Error updating memory:", error);
      res.status(500).json({ message: "Failed to update memory" });
    }
  });

  // Hybrid Memory Service endpoints - supports both open source and managed Mem0
  app.get(
    "/api/hybrid-memories/status",
    async (req: Request, res: Response) => {
      try {
        const status = mem0HybridService.getServiceStatus();
        res.json({
          ...status,
          storageInfo: mem0HybridService.getStorageInfo(),
          consoleUrl: mem0HybridService.getConsoleUrl(),
          isReady: mem0HybridService.isReady(),
        });
      } catch (error) {
        console.error("Error getting hybrid service status:", error);
        res.status(500).json({ message: "Failed to get service status" });
      }
    },
  );

  app.get(
    "/api/hybrid-memories/:userId",
    async (req: Request, res: Response) => {
      try {
        const { userId } = req.params;
        const memories = await mem0HybridService.getAllMemories(userId);
        console.log(
          `✅ Retrieved ${memories.length} memories for user ${userId}`,
        );
        res.json(memories);
      } catch (error) {
        console.error("Error fetching hybrid memories:", error);
        res.status(500).json({ message: "Failed to fetch memories" });
      }
    },
  );

  app.post(
    "/api/hybrid-memories/search",
    async (req: Request, res: Response) => {
      try {
        const { query, userId, limit = 10 } = req.body;
        const results = await mem0HybridService.searchMemories(
          query,
          userId,
          limit,
        );
        res.json(results);
      } catch (error) {
        console.error("Error searching hybrid memories:", error);
        res.status(500).json({ message: "Failed to search memories" });
      }
    },
  );

  app.post("/api/hybrid-memories", async (req: Request, res: Response) => {
    try {
      const { content, userId, metadata } = req.body;
      const memory = await mem0HybridService.addMemory(
        content,
        userId,
        metadata,
      );
      res.json(memory);
    } catch (error) {
      console.error("Error adding hybrid memory:", error);
      res.status(500).json({ message: "Failed to add memory" });
    }
  });

  app.delete(
    "/api/hybrid-memories/:memoryId",
    async (req: Request, res: Response) => {
      try {
        const { memoryId } = req.params;
        const success = await mem0HybridService.deleteMemory(memoryId);
        res.json({ success });
      } catch (error) {
        console.error("Error deleting hybrid memory:", error);
        res.status(500).json({ message: "Failed to delete memory" });
      }
    },
  );

  app.put(
    "/api/hybrid-memories/:memoryId",
    async (req: Request, res: Response) => {
      try {
        const { memoryId } = req.params;
        const { content, metadata } = req.body;
        const memory = await mem0HybridService.updateMemory(
          memoryId,
          content,
          metadata,
        );
        res.json(memory);
      } catch (error) {
        console.error("Error updating hybrid memory:", error);
        res.status(500).json({ message: "Failed to update memory" });
      }
    },
  );

  // Service mode switching endpoint
  app.post(
    "/api/hybrid-memories/switch-mode",
    async (req: Request, res: Response) => {
      try {
        const { mode } = req.body;
        if (!["open-source", "managed", "hybrid"].includes(mode)) {
          return res
            .status(400)
            .json({
              message: "Invalid mode. Must be open-source, managed, or hybrid",
            });
        }
        mem0HybridService.switchMode(mode);
        res.json({
          message: `Switched to ${mode} mode`,
          status: mem0HybridService.getServiceStatus(),
        });
      } catch (error) {
        console.error("Error switching hybrid service mode:", error);
        res.status(500).json({ message: "Failed to switch mode" });
      }
    },
  );

  // Test Mem0 API key endpoint
  app.post("/api/test-mem0-key", async (req: Request, res: Response) => {
    try {
      const { mem0ManagedService } = await import("./mem0-managed-service");
      const isValid = await mem0ManagedService.testConnection();
      res.json({
        valid: isValid,
        message: isValid ? "API key is valid" : "API key is invalid or expired",
        dashboardUrl: "https://app.mem0.ai/dashboard/api-keys",
      });
    } catch (error) {
      console.error("Error testing Mem0 API key:", error);
      res.status(500).json({
        valid: false,
        message: "Failed to test API key",
        error: (error as Error).message,
      });
    }
  });

  const httpServer = createServer(app);

  // Set up OpenAI Realtime API WebSocket service
  setupRealtimeWebSocket(httpServer);

  // Set up Gemini Live API WebSocket service
  setupGeminiLiveWebSocket(httpServer);

  // Set up WebSocket server for real-time communication (future use)
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");

    ws.on("message", (message) => {
      console.log("Received message:", message);

      // Echo back for now
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ message: "Received message" }));
      }
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });
  });

  return httpServer;
}
