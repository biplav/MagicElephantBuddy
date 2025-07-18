
import { StateGraph, MemorySaver, Annotation } from "@langchain/langgraph";
import { OpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { storage } from "./storage";
import { memoryService } from "./memory-service";
import { defaultAIService } from "./ai-service";

// Define the state structure for our conversation workflow
const ConversationState = Annotation.Root({
  // Input data
  childId: Annotation<number>,
  conversationId: Annotation<number | null>,
  audioData: Annotation<Buffer | null>,
  textInput: Annotation<string | null>,
  videoFrame: Annotation<string | null>,
  
  // Processing state
  transcription: Annotation<string | null>,
  childContext: Annotation<any>,
  enhancedPrompt: Annotation<string>,
  
  // Output data
  aiResponse: Annotation<string>,
  audioResponse: Annotation<Buffer | null>,
  
  // Tools and decisions
  toolCalls: Annotation<any[]>,
  visualAnalysis: Annotation<string | null>,
  
  // Metadata
  processingSteps: Annotation<string[]>,
  errors: Annotation<string[]>
});

type ConversationStateType = typeof ConversationState.State;

// Individual workflow nodes
async function transcribeAudio(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  console.log("🎤 Transcribing audio...");
  
  if (!state.audioData) {
    return { 
      transcription: state.textInput || "",
      processingSteps: [...state.processingSteps, "Skipped transcription - using text input"]
    };
  }

  try {
    const transcription = await defaultAIService.transcribeAudio(state.audioData, "input.wav");
    return {
      transcription,
      processingSteps: [...state.processingSteps, `Audio transcribed: "${transcription.slice(0, 50)}..."`]
    };
  } catch (error) {
    return {
      transcription: "",
      errors: [...state.errors, `Transcription failed: ${error}`],
      processingSteps: [...state.processingSteps, "Transcription failed"]
    };
  }
}

async function loadChildContext(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  console.log("👶 Loading child context and memories...");
  
  try {
    // Get child profile and milestones
    const child = await storage.getChild(state.childId);
    const milestones = await storage.getMilestonesByChild(state.childId);
    const childContext = await memoryService.getChildContext(state.childId);
    
    // Create enhanced prompt with all context
    const enhancedPrompt = await createEnhancedPrompt(state.childId, child, milestones, childContext);
    
    return {
      childContext,
      enhancedPrompt,
      processingSteps: [...state.processingSteps, "Child context loaded with memories and milestones"]
    };
  } catch (error) {
    return {
      enhancedPrompt: "You are Appu, a friendly elephant AI assistant for children.",
      errors: [...state.errors, `Context loading failed: ${error}`],
      processingSteps: [...state.processingSteps, "Using fallback prompt due to context error"]
    };
  }
}

// Create the getEyesTool as a LangChain tool
const createGetEyesTool = (state: ConversationStateType) => {
  return new DynamicStructuredTool({
    name: "getEyesTool",
    description: "Use this tool when the child is showing, pointing to, or talking about something visual that you should look at. This tool analyzes what the child is showing through their camera.",
    schema: z.object({
      reason: z.string().describe("Why you want to look at what the child is showing")
    }),
    func: async ({ reason }) => {
      console.log("👁️ LLM decided to use getEyesTool:", reason);
      
      // Try to get video frame from session storage first
      let frameData = state.videoFrame;
      
      if (!frameData && state.conversationId) {
        // Access the global video frame storage
        const frameStorage = global.videoFrameStorage || new Map();
        const storedFrame = frameStorage.get(`session_${state.conversationId}`);
        
        if (storedFrame && storedFrame.frameData) {
          frameData = storedFrame.frameData;
          console.log("👁️ getEyesTool: Retrieved video frame from session storage");
          
          // Check if frame is recent (within last 30 seconds)
          const frameAge = Date.now() - storedFrame.timestamp.getTime();
          if (frameAge > 30000) {
            console.log("👁️ getEyesTool: Warning - video frame is older than 30 seconds");
          }
        }
      }
      
      if (!frameData) {
        console.log("👁️ getEyesTool: No video frame available in state or session storage");
        return "No video frame available to analyze what the child is showing.";
      }

      try {
        console.log(`👁️ getEyesTool: Analyzing video frame - Size: ${frameData.length} bytes`);
        const analysis = await analyzeVideoFrame(frameData);
        
        // Store as vision memory
        await memoryService.createMemory(
          state.childId,
          `Child showed something: ${analysis}`,
          'visual',
          { conversationId: state.conversationId, importance_score: 0.8 }
        );

        return `I can see: ${analysis}`;
      } catch (error) {
        console.error("getEyesTool error:", error);
        return "I'm having trouble seeing what you're showing me right now.";
      }
    }
  });
};

async function generateResponseWithTools(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  console.log("🤖 Generating AI response with tools...");
  
  if (!state.transcription) {
    return {
      aiResponse: "I didn't understand that. Could you try again?",
      errors: [...state.errors, "No transcription available for response generation"]
    };
  }

  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Create enhanced prompt with visual context
    let enhancedPrompt = state.enhancedPrompt;
    if (state.videoFrame) {
      enhancedPrompt += "\n\nNOTE: The child has their camera on and may be showing you something. If they mention showing, pointing to, or talking about something visual, use the getEyesTool to see what they're showing you.";
    }

    // Define available tools
    const tools = [
      {
        type: "function",
        function: {
          name: "getEyesTool",
          description: "Use this tool when the child is showing, pointing to, or talking about something visual that you should look at. This tool analyzes what the child is showing through their camera.",
          parameters: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                description: "Why you want to look at what the child is showing"
              }
            },
            required: ["reason"]
          }
        }
      }
    ];

    // First, let the LLM decide if it needs tools
    const initialResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: enhancedPrompt
        },
        {
          role: "user",
          content: state.transcription
        }
      ],
      tools: state.videoFrame ? tools : undefined,
      tool_choice: "auto",
      max_tokens: 150,
      temperature: 0.7
    });

    const message = initialResponse.choices[0]?.message;
    let finalResponse = message?.content || "I'm here to help!";
    let toolCalls: any[] = [];
    let visualAnalysis: string | null = null;

    // Handle tool calls if any
    if (message?.tool_calls && message.tool_calls.length > 0) {
      console.log("🔧 LLM requested tool calls:", message.tool_calls.length);
      
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "getEyesTool") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log("👁️ LLM wants to see:", args.reason);
          
          if (state.videoFrame) {
            try {
              visualAnalysis = await analyzeVideoFrame(state.videoFrame);
              
              // Store as vision memory
              await memoryService.createMemory(
                state.childId,
                `Child showed something: ${visualAnalysis}`,
                'visual',
                { conversationId: state.conversationId, importance_score: 0.8 }
              );

              toolCalls.push({
                tool: "getEyesTool",
                reason: args.reason,
                result: visualAnalysis
              });
            } catch (error) {
              console.error("Vision analysis failed:", error);
              toolCalls.push({
                tool: "getEyesTool",
                reason: args.reason,
                result: "I'm having trouble seeing what you're showing me."
              });
            }
          } else {
            toolCalls.push({
              tool: "getEyesTool",
              reason: args.reason,
              result: "No video available to see what you're showing."
            });
          }
        }
      }

      // Generate final response with tool results
      const toolResults = toolCalls.map(tc => `Tool: ${tc.tool}, Result: ${tc.result}`).join('\n');
      
      const finalResponseCall = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: enhancedPrompt
          },
          {
            role: "user",
            content: state.transcription
          },
          {
            role: "assistant",
            content: message.content,
            tool_calls: message.tool_calls
          },
          ...message.tool_calls.map((tc, i) => ({
            role: "tool" as const,
            tool_call_id: tc.id,
            content: toolCalls[i]?.result || "Tool execution failed"
          }))
        ],
        max_tokens: 150,
        temperature: 0.7
      });

      finalResponse = finalResponseCall.choices[0]?.message?.content || finalResponse;
    }

    return {
      aiResponse: finalResponse,
      toolCalls,
      visualAnalysis,
      processingSteps: [...state.processingSteps, 
        `AI response generated: "${finalResponse.slice(0, 50)}..."`,
        ...(toolCalls.length > 0 ? [`Used tools: ${toolCalls.map(tc => tc.tool).join(', ')}`] : [])
      ]
    };
  } catch (error) {
    return {
      aiResponse: "Sorry, I'm having trouble right now. Let's try again!",
      errors: [...state.errors, `Response generation failed: ${error}`],
      processingSteps: [...state.processingSteps, "Using fallback response due to AI error"]
    };
  }
}

async function synthesizeSpeech(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  console.log("🔊 Synthesizing speech...");
  
  if (!state.aiResponse) {
    return {
      audioResponse: null,
      errors: [...state.errors, "No AI response to synthesize"]
    };
  }

  try {
    const audioBuffer = await defaultAIService.generateSpeech(state.aiResponse);
    
    return {
      audioResponse: audioBuffer,
      processingSteps: [...state.processingSteps, "Speech synthesized successfully"]
    };
  } catch (error) {
    return {
      audioResponse: null,
      errors: [...state.errors, `Speech synthesis failed: ${error}`],
      processingSteps: [...state.processingSteps, "Speech synthesis failed - text response only"]
    };
  }
}

async function storeConversation(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  console.log("💾 Storing conversation data...");
  
  try {
    // Create conversation if needed
    let conversationId = state.conversationId;
    if (!conversationId) {
      const conversation = await storage.createConversation({ childId: state.childId });
      conversationId = conversation.id;
    }

    // Store child's message
    if (state.transcription) {
      await storage.createMessage({
        conversationId,
        type: 'child_input',
        content: state.transcription,
        transcription: state.transcription
      });

      // Create memory from child's input
      await memoryService.createMemory(
        state.childId,
        `Child said: "${state.transcription}"`,
        'conversational',
        { conversationId, emotionalTone: 'neutral' }
      );
    }

    // Store AI response
    if (state.aiResponse) {
      await storage.createMessage({
        conversationId,
        type: 'appu_response',
        content: state.aiResponse
      });

      // Create memory from AI response
      await memoryService.createMemory(
        state.childId,
        `Appu responded: "${state.aiResponse}"`,
        'conversational',
        { conversationId, emotionalTone: 'positive' }
      );
    }

    return {
      conversationId,
      processingSteps: [...state.processingSteps, "Conversation stored and memories created"]
    };
  } catch (error) {
    return {
      errors: [...state.errors, `Storage failed: ${error}`],
      processingSteps: [...state.processingSteps, "Failed to store conversation"]
    };
  }
}

// Helper function to create enhanced prompt
async function createEnhancedPrompt(childId: number, child: any, milestones: any[], childContext: any): Promise<string> {
  try {
    const { APPU_SYSTEM_PROMPT } = await import('../shared/appuPrompts');
    const { DEFAULT_PROFILE } = await import('../shared/childProfile');
    const { memoryService } = await import('./memory-service');
    
    const childProfile = child?.profile || DEFAULT_PROFILE;
    
    // Get recent memories for context
    const recentMemories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 5,
      timeframe: 'week'
    });
    
    // Generate current date and time information
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    };
    const currentDateTime = now.toLocaleDateString('en-US', options);
    const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : now.getHours() < 20 ? 'evening' : 'night';
    
    // Generate profile information
    const generateProfileSection = (obj: any): string => {
      let result = '';
      for (const [key, value] of Object.entries(obj)) {
        const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
        
        if (Array.isArray(value)) {
          result += `- ${displayKey}: ${value.join(', ')}\n`;
        } else if (typeof value === 'object' && value !== null) {
          result += `- ${displayKey}:\n`;
          const subItems = generateProfileSection(value);
          result += subItems.split('\n').map(line => line ? `  ${line}` : '').join('\n') + '\n';
        } else {
          result += `- ${displayKey}: ${value}\n`;
        }
      }
      return result;
    };

    // Generate learning milestones section
    const generateMilestonesSection = (): string => {
      if (!milestones || milestones.length === 0) {
        return '\nLEARNING MILESTONES:\n- No specific milestones tracked yet. Focus on general age-appropriate learning activities.\n';
      }

      let result = '\nLEARNING MILESTONES AND PROGRESS:\n';
      
      const activeMilestones = milestones.filter((m: any) => !m.isCompleted);
      const completedMilestones = milestones.filter((m: any) => m.isCompleted);
      
      if (activeMilestones.length > 0) {
        result += '\nCurrent Learning Goals:\n';
        activeMilestones.forEach((milestone: any) => {
          const progressPercent = milestone.targetValue ? Math.round((milestone.currentProgress / milestone.targetValue) * 100) : 0;
          result += `- ${milestone.milestoneDescription} (${progressPercent}% complete - ${milestone.currentProgress}/${milestone.targetValue})\n`;
        });
      }
      
      if (completedMilestones.length > 0) {
        result += '\nCompleted Achievements:\n';
        completedMilestones.forEach((milestone: any) => {
          const completedDate = milestone.completedAt ? new Date(milestone.completedAt).toLocaleDateString() : 'Recently';
          result += `- ✅ ${milestone.milestoneDescription} (Completed: ${completedDate})\n`;
        });
      }
      
      result += '\nMILESTONE GUIDANCE:\n';
      result += '- Reference these milestones during conversations to encourage progress\n';
      result += '- Celebrate achievements and progress made\n';
      result += '- Incorporate learning activities that support current goals\n';
      result += '- Use age-appropriate language to discuss progress\n';
      
      return result;
    };

    // Generate memory context section
    const generateMemorySection = (): string => {
      if (!recentMemories || recentMemories.length === 0) {
        return '\nMEMORY CONTEXT:\n- No recent conversation memories available. Start building rapport with the child.\n';
      }
      
      let result = '\nMEMORY CONTEXT AND PERSONALIZATION:\n';
      result += 'Recent conversation memories to reference for personalized interactions:\n';
      
      recentMemories.forEach((memory, index) => {
        const typeIndicator = memory.type === 'conversational' ? '💬' : 
                             memory.type === 'learning' ? '📚' : 
                             memory.type === 'emotional' ? '😊' : 
                             memory.type === 'relationship' ? '🤝' : '💭';
        result += `- ${typeIndicator} ${memory.content}\n`;
      });
      
      result += '\nCHILD CONTEXT INSIGHTS:\n';
      result += `- Active interests: ${childContext.activeInterests?.join(', ') || 'Not identified yet'}\n`;
      result += `- Communication style: ${childContext.personalityProfile?.communication_style || 'Observing'}\n`;
      result += `- Relationship level: ${childContext.relationshipLevel || 1}/10\n`;
      if (childContext.emotionalState) {
        result += `- Current emotional state: ${childContext.emotionalState}\n`;
      }
      
      result += '\nMEMORY USAGE GUIDANCE:\n';
      result += '- Reference past conversations naturally to show you remember the child\n';
      result += '- Build on previous interests and topics the child has shown enthusiasm for\n';
      result += '- Acknowledge emotional states and continue building positive relationships\n';
      result += '- Use memories to make conversations feel continuous and personalized\n';
      
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
Use this information to personalize your responses and make them more engaging for ${(childProfile as any).name || 'the child'}.`;

    const milestonesInfo = generateMilestonesSection();
    const memoryInfo = generateMemorySection();

    return APPU_SYSTEM_PROMPT + dateTimeInfo + profileInfo + milestonesInfo + memoryInfo;
    
  } catch (error) {
    console.error('Error creating enhanced prompt in workflow:', error);
    return "You are Appu, a friendly elephant AI assistant who speaks in simple Hinglish and helps children learn.";
  }
}

// Create the main conversation workflow
function createConversationWorkflow() {
  const workflow = new StateGraph(ConversationState)
    .addNode("transcribe", transcribeAudio)
    .addNode("loadContext", loadChildContext)
    .addNode("generateResponse", generateResponseWithTools)
    .addNode("synthesizeSpeech", synthesizeSpeech)
    .addNode("storeConversation", storeConversation)
    .addEdge("transcribe", "loadContext")
    .addEdge("loadContext", "generateResponse")
    .addEdge("generateResponse", "synthesizeSpeech")
    .addEdge("synthesizeSpeech", "storeConversation")
    .setEntryPoint("transcribe");

  // Use memory to persist state between calls
  const memory = new MemorySaver();
  return workflow.compile({ checkpointer: memory });
}



// Video analysis is now handled by the getEyesTool in the main conversation workflow

async function analyzeVideoFrame(frameData: string): Promise<string> {
  try {
    console.log(`👁️ LANGGRAPH: Analyzing video frame - Size: ${frameData?.length || 0} bytes`);
    const { defaultAIService } = await import('./ai-service');
    
    // Use OpenAI's vision model to analyze what the child is showing
    const openai = new (await import('openai')).default({ 
      apiKey: process.env.OPENAI_API_KEY 
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "A child is showing something to their AI companion Appu. Please describe what you see in this image in a child-friendly way. Focus on objects, toys, drawings, books, or anything the child might be proudly showing off. Be specific about colors, shapes, and details that would help Appu respond enthusiastically to what the child is showing."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${frameData}`
              }
            }
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.7
    });

    const analysis = response.choices[0]?.message?.content || "I can see something interesting!";
    console.log("🎯 Video frame analysis:", analysis);
    return analysis;
  } catch (error) {
    console.error("Video analysis error:", error);
    return "I can see you're showing me something special!";
  }
}

// Export the main workflow
export const conversationWorkflow = createConversationWorkflow();

// Utility function to process a complete conversation
export async function processConversation(input: {
  childId: number;
  conversationId?: number;
  audioData?: Buffer;
  textInput?: string;
  videoFrame?: string;
}) {
  const { workflowMonitor } = await import('./workflow-monitor');
  const workflowId = `conversation-${input.childId}-${Date.now()}`;
  const { startTime } = workflowMonitor.startWorkflow(workflowId);

  const initialState: Partial<ConversationStateType> = {
    childId: input.childId,
    conversationId: input.conversationId || null,
    audioData: input.audioData || null,
    textInput: input.textInput || null,
    videoFrame: input.videoFrame || null,
    toolCalls: [],
    visualAnalysis: null,
    processingSteps: [],
    errors: []
  };

  const config = { configurable: { thread_id: `child-${input.childId}` } };
  
  try {
    const result = await conversationWorkflow.invoke(initialState, config);
    
    console.log("🎯 Workflow completed:", {
      steps: result.processingSteps,
      errors: result.errors,
      hasResponse: !!result.aiResponse,
      hasAudio: !!result.audioResponse,
      hasVideoAnalysis: !!input.videoFrame
    });

    const success = result.errors.length === 0;
    workflowMonitor.completeWorkflow(workflowId, startTime, success, result.errors);

    return result;
  } catch (error) {
    console.error("❌ Workflow failed:", error);
    workflowMonitor.completeWorkflow(workflowId, startTime, false, [String(error)]);
    throw error;
  }
}
