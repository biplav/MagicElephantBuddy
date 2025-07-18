
import { StateGraph, MemorySaver, Annotation } from "@langchain/langgraph";
import { OpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
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

async function generateResponse(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  console.log("🤖 Generating AI response...");
  
  if (!state.transcription) {
    return {
      aiResponse: "I didn't understand that. Could you try again?",
      errors: [...state.errors, "No transcription available for response generation"]
    };
  }

  try {
    const response = await defaultAIService.generateResponse(state.transcription);
    
    return {
      aiResponse: response,
      processingSteps: [...state.processingSteps, `AI response generated: "${response.slice(0, 50)}..."`]
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
  // Your existing prompt creation logic from realtime-service.ts
  const basePrompt = "You are Appu, a friendly elephant AI assistant who speaks in simple Hinglish and helps children learn.";
  
  // Add child profile, milestones, and memory context
  // (Implementation similar to your existing createEnhancedRealtimePrompt function)
  
  return basePrompt;
}

// Create the main conversation workflow
function createConversationWorkflow() {
  const workflow = new StateGraph(ConversationState)
    .addNode("transcribe", transcribeAudio)
    .addNode("loadContext", loadChildContext)
    .addNode("generateResponse", generateResponse)
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

// Video processing workflow
function createVideoAnalysisWorkflow() {
  const videoWorkflow = new StateGraph(ConversationState)
    .addNode("analyzeVideo", async (state: ConversationStateType) => {
      console.log("📹 Analyzing video frame...");
      
      if (!state.videoFrame) {
        return { processingSteps: [...state.processingSteps, "No video frame to analyze"] };
      }

      try {
        // Use OpenAI vision or Gemini vision
        const analysis = await analyzeVideoFrame(state.videoFrame);
        
        // Store as vision memory
        await memoryService.createMemory(
          state.childId,
          `Video analysis: ${analysis}`,
          'visual',
          { conversationId: state.conversationId }
        );

        return {
          processingSteps: [...state.processingSteps, `Video analyzed: ${analysis.slice(0, 50)}...`]
        };
      } catch (error) {
        return {
          errors: [...state.errors, `Video analysis failed: ${error}`],
          processingSteps: [...state.processingSteps, "Video analysis failed"]
        };
      }
    })
    .setEntryPoint("analyzeVideo");

  return videoWorkflow.compile();
}

async function analyzeVideoFrame(frameData: string): Promise<string> {
  // Your existing video analysis logic
  return "Child is showing something to the camera";
}

// Export the workflows
export const conversationWorkflow = createConversationWorkflow();
export const videoAnalysisWorkflow = createVideoAnalysisWorkflow();

// Utility function to process a complete conversation
export async function processConversation(input: {
  childId: number;
  conversationId?: number;
  audioData?: Buffer;
  textInput?: string;
  videoFrame?: string;
}) {
  const initialState: Partial<ConversationStateType> = {
    childId: input.childId,
    conversationId: input.conversationId || null,
    audioData: input.audioData || null,
    textInput: input.textInput || null,
    videoFrame: input.videoFrame || null,
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
      hasAudio: !!result.audioResponse
    });

    // Process video if provided
    if (input.videoFrame) {
      await videoAnalysisWorkflow.invoke({
        childId: input.childId,
        conversationId: result.conversationId,
        videoFrame: input.videoFrame,
        processingSteps: [],
        errors: []
      });
    }

    return result;
  } catch (error) {
    console.error("❌ Workflow failed:", error);
    throw error;
  }
}
