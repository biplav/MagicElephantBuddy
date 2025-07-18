
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
  const { workflowMonitor } = await import('./workflow-monitor');
  const workflowId = `conversation-${input.childId}-${Date.now()}`;
  const { startTime } = workflowMonitor.startWorkflow(workflowId);

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
      const videoWorkflowId = `video-${input.childId}-${Date.now()}`;
      const { startTime: videoStartTime } = workflowMonitor.startWorkflow(videoWorkflowId);
      
      try {
        await videoAnalysisWorkflow.invoke({
          childId: input.childId,
          conversationId: result.conversationId,
          videoFrame: input.videoFrame,
          processingSteps: [],
          errors: []
        });
        workflowMonitor.completeWorkflow(videoWorkflowId, videoStartTime, true);
      } catch (videoError) {
        workflowMonitor.completeWorkflow(videoWorkflowId, videoStartTime, false, [String(videoError)]);
        console.error("Video workflow failed:", videoError);
      }
    }

    const success = result.errors.length === 0;
    workflowMonitor.completeWorkflow(workflowId, startTime, success, result.errors);

    return result;
  } catch (error) {
    console.error("❌ Workflow failed:", error);
    workflowMonitor.completeWorkflow(workflowId, startTime, false, [String(error)]);
    throw error;
  }
}
