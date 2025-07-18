import WebSocket from "ws";
import { WebSocketServer } from "ws";
import OpenAI from "openai";
import { storage } from "./storage";
import { DEFAULT_PROFILE } from "../shared/childProfile";
import { APPU_SYSTEM_PROMPT } from "../shared/appuPrompts";
import { memoryService } from "./memory-service";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface RealtimeSession {
  ws: WebSocket;
  openaiWs: WebSocket | null;
  isConnected: boolean;
  conversationId: number | null;
  childId: number;
  sessionStartTime: Date;
  messageCount: number;
}

const sessions = new Map<string, RealtimeSession>();

// Function to form memories from conversation content
async function formMemoryFromContent(
  childId: number,
  content: string,
  role: "user" | "assistant",
  conversationId: number,
) {
  try {
    if (role === "user") {
      // Child's message - analyze for interests, emotions, learning content
      const childMessage = content.toLowerCase();

      // Detect conversational memories
      if (
        childMessage.includes("love") ||
        childMessage.includes("like") ||
        childMessage.includes("favorite")
      ) {
        await memoryService.createMemory(
          childId,
          `Child expressed interest: "${content}"`,
          "conversational",
          {
            conversationId,
            emotionalTone: "positive",
            concepts: extractConcepts(content),
            importance_score: 0.7,
          },
        );
      }

      // Detect learning content
      if (containsLearningContent(content)) {
        await memoryService.createMemory(
          childId,
          `Learning interaction: "${content}"`,
          "learning",
          {
            conversationId,
            concepts: extractConcepts(content),
            learning_outcome: "engagement",
          },
        );
      }

      // Detect emotional expressions
      const emotion = detectEmotion(content);
      if (emotion) {
        await memoryService.createMemory(
          childId,
          `Child showed ${emotion} emotion: "${content}"`,
          "emotional",
          {
            conversationId,
            emotionalTone: emotion,
            concepts: [emotion],
          },
        );
      }
    } else {
      // Appu's response - track teaching moments and relationship building
      if (
        content.includes("great job") ||
        content.includes("wonderful") ||
        content.includes("proud")
      ) {
        await memoryService.createMemory(
          childId,
          `Appu provided encouragement: "${content.slice(0, 100)}..."`,
          "relationship",
          {
            conversationId,
            emotionalTone: "encouraging",
            importance_score: 0.6,
          },
        );
      }
    }
  } catch (error) {
    console.error("Error forming memory from content:", error);
  }
}

// Helper functions for memory analysis
function extractConcepts(text: string): string[] {
  const concepts: string[] = [];
  const lowerText = text.toLowerCase();

  // Educational concepts
  const educationalTerms = [
    "count",
    "number",
    "color",
    "shape",
    "letter",
    "word",
    "math",
    "read",
  ];
  educationalTerms.forEach((term) => {
    if (lowerText.includes(term)) concepts.push(term);
  });

  // Interest topics
  const interests = [
    "dinosaur",
    "animal",
    "story",
    "song",
    "game",
    "family",
    "friend",
  ];
  interests.forEach((interest) => {
    if (lowerText.includes(interest)) concepts.push(interest);
  });

  return concepts;
}

function containsLearningContent(text: string): boolean {
  const learningIndicators = [
    "count",
    "learn",
    "teach",
    "show",
    "how",
    "what",
    "why",
    "number",
    "letter",
    "color",
  ];
  return learningIndicators.some((indicator) =>
    text.toLowerCase().includes(indicator),
  );
}

function detectEmotion(text: string): string | null {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes("happy") ||
    lowerText.includes("excited") ||
    lowerText.includes("fun")
  )
    return "happy";
  if (lowerText.includes("sad") || lowerText.includes("cry")) return "sad";
  if (lowerText.includes("angry") || lowerText.includes("mad")) return "angry";
  if (lowerText.includes("scared") || lowerText.includes("afraid"))
    return "scared";
  if (lowerText.includes("tired") || lowerText.includes("sleepy"))
    return "tired";

  return null;
}

// Function to create enhanced system prompt with child profile and learning milestones
async function createEnhancedRealtimePrompt(childId: number): Promise<string> {
  try {
    // Get child profile
    const child = await storage.getChild(childId);
    const childProfile = child?.profile || DEFAULT_PROFILE;

    // Get learning milestones for the child
    const milestones = await storage.getMilestonesByChild(childId);

    // Get recent memories and child context
    const childContext = await memoryService.getChildContext(childId);
    const recentMemories = await memoryService.retrieveMemories({
      query: "",
      childId,
      limit: 5,
      timeframe: "week",
    });

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

    // Generate profile information
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

    // Generate memory context section
    const generateMemorySection = (): string => {
      if (!recentMemories || recentMemories.length === 0) {
        return "\nMEMORY CONTEXT:\n- No recent conversation memories available. Start building rapport with the child.\n";
      }

      let result = "\nMEMORY CONTEXT AND PERSONALIZATION:\n";
      result +=
        "Recent conversation memories to reference for personalized interactions:\n";

      recentMemories.forEach((memory, index) => {
        const typeIndicator =
          memory.type === "conversational"
            ? "💬"
            : memory.type === "learning"
              ? "📚"
              : memory.type === "emotional"
                ? "😊"
                : memory.type === "relationship"
                  ? "🤝"
                  : "💭";
        result += `- ${typeIndicator} ${memory.content}\n`;
      });

      result += "\nCHILD CONTEXT INSIGHTS:\n";
      result += `- Active interests: ${childContext.activeInterests.join(", ")}\n`;
      result += `- Communication style: ${childContext.personalityProfile.communication_style}\n`;
      result += `- Relationship level: ${childContext.relationshipLevel}/10\n`;
      if (childContext.emotionalState) {
        result += `- Current emotional state: ${childContext.emotionalState}\n`;
      }

      result += "\nMEMORY USAGE GUIDANCE:\n";
      result +=
        "- Reference past conversations naturally to show you remember the child\n";
      result +=
        "- Build on previous interests and topics the child has shown enthusiasm for\n";
      result +=
        "- Acknowledge emotional states and continue building positive relationships\n";
      result +=
        "- Use memories to make conversations feel continuous and personalized\n";

      return result;
    };

    const memoryInfo = generateMemorySection();

    return (
      APPU_SYSTEM_PROMPT +
      dateTimeInfo +
      profileInfo +
      milestonesInfo +
      memoryInfo
    );
  } catch (error) {
    console.error("Error creating enhanced realtime prompt:", error);
    // Fallback to basic prompt if there's an error
    return APPU_SYSTEM_PROMPT;
  }
}

// Handle video frame with OpenAI's vision capabilities
async function handleVideoFrame(session: RealtimeSession, frameData: string) {
  try {
    if (!session.isConnected || !session.conversationId) {
      console.log("Video frame received but session not ready");
      return;
    }

    console.log(
      `OpenAI Realtime processing video frame: ${frameData.slice(0, 50)}...`,
    );

    // Use OpenAI's vision model to analyze the frame
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What do you see in this image? Please describe it briefly in a child-friendly way, as if you're Appu the elephant talking to a young child.",
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
      max_tokens: 100,
    });

    const visionResponse = response.choices[0].message.content;
    console.log(`OpenAI vision response: ${visionResponse}`);

    // Send vision response back to client
    session.ws.send(
      JSON.stringify({
        type: "vision_response",
        text: visionResponse,
        conversationId: session.conversationId,
      }),
    );

    // Optional: Store vision analysis as a message
    await storage.createMessage({
      conversationId: session.conversationId,
      type: "vision_analysis",
      content: `Vision: ${visionResponse}`,
    });
  } catch (error) {
    console.error("Error handling video frame:", error);
    // Don't send error to client for vision processing - it's supplementary
  }
}

export function setupRealtimeWebSocket(server: any) {
  const wss = new WebSocketServer({ server, path: "/ws/realtime" });

  wss.on("connection", (ws: WebSocket) => {
    const sessionId = generateSessionId();
    console.log(`Realtime session connected: ${sessionId}`);

    // Initialize session with default child (for demo purposes, in production this would come from user authentication)
    const session: RealtimeSession = {
      ws,
      openaiWs: null,
      isConnected: false,
      conversationId: null,
      childId: 1, // Using the seeded child ID
      sessionStartTime: new Date(),
      messageCount: 0,
    };
    sessions.set(sessionId, session);

    // Handle messages from client
    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "start_session":
            // Create a new conversation in the database
            try {
              const conversation = await storage.createConversation({
                childId: session.childId,
              });
              session.conversationId = conversation.id;
              console.log(
                `Created conversation ${conversation.id} for child ${session.childId}`,
              );
              
              // Send confirmation that session is ready
              session.ws.send(JSON.stringify({
                type: 'session_started',
                conversationId: conversation.id,
                message: 'Video session ready for frames'
              }));
            } catch (error) {
              console.error("Error creating conversation:", error);
              session.ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to start session'
              }));
            }
            break;
          case "audio_chunk":
            if (session.openaiWs && session.isConnected) {
              // Forward audio chunk to OpenAI
              session.openaiWs.send(
                JSON.stringify({
                  type: "input_audio_buffer.append",
                  audio: message.audio,
                }),
              );
            }
            break;
          case "video_frame":
            // Store video frame for potential use by the main conversation workflow's getEyesToool
            console.log(
              `📹 REALTIME: Received video frame from client - Size: ${message.frameData?.length || 0} bytes`,
            );
            
            // Store the latest video frame in the session for the LLM to access via getEyesTool
            if (session.conversationId) {
              try {
                // Just store it as a temporary visual context - the LLM will decide when to analyze it
                await storage.createMessage({
                  conversationId: session.conversationId,
                  type: "video_frame_available",
                  content: `Video frame available for analysis (${message.frameData?.length || 0} bytes)`,
                  metadata: { hasVideoFrame: true }
                });
                console.log(`📹 REALTIME: Video frame stored for potential LLM analysis via getEyesTool`);
              } catch (error) {
                console.error("Error storing video frame availability:", error);
              }
            }
            break;
          case "commit_audio":
            if (session.openaiWs && session.isConnected) {
              // Commit the audio buffer for transcription
              session.openaiWs.send(
                JSON.stringify({
                  type: "input_audio_buffer.commit",
                }),
              );
            }
            break;
          case "end_session":
            await endRealtimeSession(session);
            break;
        }
      } catch (error) {
        console.error("Error handling realtime message:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Failed to process message",
          }),
        );
      }
    });

    ws.on("close", () => {
      console.log(`Realtime Video session closed: ${sessionId}`);
      endRealtimeSession(session);
      sessions.delete(sessionId);
    });

    ws.on("error", (error) => {
      console.error(`Realtime Video session error: ${sessionId}`, error);
      endRealtimeSession(session);
      sessions.delete(sessionId);
    });
  });

  return wss;
}

async function startRealtimeSession(session: RealtimeSession) {
  try {
    console.log("Attempting to connect to OpenAI Realtime API...");

    // Check if API key exists
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not found");
    }

    // Create enhanced system prompt with milestone details
    const enhancedPrompt = await createEnhancedRealtimePrompt(session.childId);
    console.log(
      "Enhanced Realtime Prompt with Milestones prepared for child:",
      session.childId,
    );

    // Connect to OpenAI Realtime API with WebSocket
    const realtimeUrl =
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

    session.openaiWs = new WebSocket(realtimeUrl, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    session.openaiWs.on("open", () => {
      console.log("Connected to OpenAI Realtime API");
      session.isConnected = true;

      // Send session configuration with enhanced prompt
      session.openaiWs!.send(
        JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions: enhancedPrompt,
            voice: "nova",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 200,
            },
            tools: [],
            tool_choice: "none",
            temperature: 0.8,
          },
        }),
      );

      // Notify client that session is ready
      session.ws.send(
        JSON.stringify({
          type: "session_started",
          message: "Connected to Realtime API with learning milestone context",
        }),
      );
    });

    session.openaiWs.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle different message types from OpenAI
        switch (message.type) {
          case "conversation.item.input_audio_transcription.completed":
            // Use LangGraph workflow for processing transcribed input
            if (session.conversationId && message.transcript) {
              try {
                const { processConversation } = await import(
                  "./langgraph-workflows"
                );
                await processConversation({
                  childId: session.childId,
                  conversationId: session.conversationId,
                  textInput: message.transcript,
                });
                session.messageCount++;
                console.log(
                  `LangGraph processed child input: "${message.transcript.slice(0, 50)}..."`,
                );
              } catch (workflowError) {
                console.error(
                  "LangGraph workflow error for input:",
                  workflowError,
                );
                // Fallback to original logic
                await storage.createMessage({
                  conversationId: session.conversationId,
                  type: "child_input",
                  content: message.transcript,
                  transcription: message.transcript,
                });
                await formMemoryFromContent(
                  session.childId,
                  message.transcript,
                  "user",
                  session.conversationId,
                );
              }
            }
            break;

          case "response.audio_transcript.done":
            // Use LangGraph workflow for processing AI responses
            if (session.conversationId && message.transcript) {
              try {
                const { processConversation } = await import(
                  "./langgraph-workflows"
                );
                await processConversation({
                  childId: session.childId,
                  conversationId: session.conversationId,
                  textInput: message.transcript,
                });
                session.messageCount++;
                console.log(
                  `LangGraph processed Appu response: "${message.transcript.slice(0, 50)}..."`,
                );
              } catch (workflowError) {
                console.error(
                  "LangGraph workflow error for response:",
                  workflowError,
                );
                // Fallback to original logic
                await storage.createMessage({
                  conversationId: session.conversationId,
                  type: "appu_response",
                  content: message.transcript,
                  transcription: null,
                });
                await formMemoryFromContent(
                  session.childId,
                  message.transcript,
                  "assistant",
                  session.conversationId,
                );
              }
            }
            break;
        }

        // Forward all messages from OpenAI to client
        session.ws.send(data.toString());
      } catch (error) {
        console.error("Error processing OpenAI message:", error);
      }
    });

    session.openaiWs.on("error", (error) => {
      console.error("OpenAI Realtime API error:", error);
      session.ws.send(
        JSON.stringify({
          type: "error",
          message: "Realtime API connection error",
        }),
      );
    });

    session.openaiWs.on("close", () => {
      console.log("OpenAI Realtime API connection closed");
      session.isConnected = false;
    });
  } catch (error) {
    console.error("Error starting realtime session:", error);
    session.ws.send(
      JSON.stringify({
        type: "error",
        message: "Failed to start realtime session",
      }),
    );
  }
}

async function endRealtimeSession(session: RealtimeSession) {
  // Clean up session state
  session.isConnected = false;

  // Close conversation and update database
  if (session.conversationId) {
    try {
      const endTime = new Date();
      const duration = Math.floor(
        (endTime.getTime() - session.sessionStartTime.getTime()) / 1000,
      );

      await storage.updateConversation(session.conversationId, {
        endTime,
        duration,
        totalMessages: session.messageCount,
      });

      console.log(
        `Closed conversation ${session.conversationId} - Duration: ${duration}s, Messages: ${session.messageCount}`,
      );
    } catch (error) {
      console.error("Error updating conversation:", error);
    }
  }
}

function generateSessionId(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}
