import { StateGraph, MemorySaver, Annotation, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { storage } from "./storage";
import { memoryService } from "./memory-service";
import { defaultAIService } from "./ai-service";
import { createServiceLogger } from "./logger";

const workflowLogger = createServiceLogger("langgraph-workflow");

// Simplified state structure following LangGraph best practices
const ConversationState = Annotation.Root({
  // Core input
  childId: Annotation<number>,
  conversationId: Annotation<number | null>,
  textInput: Annotation<string>,

  // Messages array (standard LangGraph pattern)
  messages: Annotation<any[]>,

  // Context and configuration
  childContext: Annotation<any>,
  systemPrompt: Annotation<string>,

  // Processing results
  audioResponse: Annotation<Buffer | null>,

  // Tool results
  visualAnalysis: Annotation<string | null>,

  // Workflow metadata
  nextStep: Annotation<string | null>
});

type ConversationStateType = typeof ConversationState.State;

// Define the getEyesTool outside of workflow (standard practice)
const getEyesTool = new DynamicStructuredTool({
  name: "getEyesTool",
  description: "Use this tool when the child is showing, pointing to, or talking about something visual that you should look at. This tool analyzes what the child is showing through their camera.",
  schema: z.object({
    reason: z.string().describe("Why you want to look at what the child is showing")
  }),
  func: async ({ reason }, config) => {
    workflowLogger.info("👁️ getEyesTool invoked:", { reason });

    // Extract conversationId from config runnable
    const conversationId = config?.configurable?.conversationId;

    if (!conversationId) {
      workflowLogger.warn("No conversationId available for getEyesTool");
      return "No video session available to analyze what you're showing.";
    }

    // Access the global video frame storage
    const frameStorage = global.videoFrameStorage || new Map();
    const storedFrame = frameStorage.get(`session_${conversationId}`);

    if (!storedFrame || !storedFrame.frameData) {
      workflowLogger.info("No video frame available in session storage");
      return "I don't see anything right now. Make sure your camera is on and try showing me again!";
    }

    // Check if frame is recent (within last 30 seconds)
    const frameAge = Date.now() - storedFrame.timestamp.getTime();
    if (frameAge > 30000) {
      workflowLogger.warn("Video frame is older than 30 seconds");
      return "That was a while ago! Can you show me again?";
    }

    try {
      workflowLogger.debug(`Analyzing video frame - Size: ${storedFrame.frameData.length} bytes`);
      const analysis = await analyzeVideoFrame(storedFrame.frameData);

      workflowLogger.info("Video analysis completed:", { analysis: analysis.slice(0, 100) });
      return `I can see: ${analysis}`;
    } catch (error) {
      workflowLogger.error("getEyesTool analysis failed:", { error: error.message });
      return "I'm having trouble seeing what you're showing me right now. Can you try again?";
    }
  }
});

// Initialize the LLM with tools (standard LangGraph pattern)
const createLLMWithTools = () => {
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o",
    temperature: 0.7,
    maxTokens: 200
  });

  return llm.bindTools([getEyesTool]);
};

// Workflow nodes following LangGraph patterns
async function loadContext(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  workflowLogger.info("Loading child context and creating system prompt");

  try {
    // Load child data
    const child = await storage.getChild(state.childId);
    const milestones = await storage.getMilestonesByChild(state.childId);
    const childContext = await memoryService.getChildContext(state.childId);

    // Create enhanced system prompt
    const systemPrompt = await createEnhancedPrompt(state.childId, child, milestones, childContext);

    // Initialize messages with system prompt
    const messages = [
      new SystemMessage(systemPrompt)
    ];

    return {
      childContext,
      systemPrompt,
      messages,
      nextStep: "callModel"
    };
  } catch (error) {
    workflowLogger.error("Context loading failed:", { error: error.message });

    const fallbackPrompt = "You are Appu, a friendly elephant AI assistant for children.";
    return {
      systemPrompt: fallbackPrompt,
      messages: [new SystemMessage(fallbackPrompt)],
      nextStep: "callModel"
    };
  }
}

async function callModel(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  workflowLogger.info("Calling LLM with tools");

  const llm = createLLMWithTools();

  // Add user message to conversation
  const messagesWithInput = [
    ...state.messages,
    new HumanMessage(state.textInput)
  ];

  try {
    const response = await llm.invoke(messagesWithInput);

    // Update messages with AI response
    const updatedMessages = [
      ...messagesWithInput,
      response
    ];

    // Check if the model wants to use tools
    if (response.tool_calls && response.tool_calls.length > 0) {
      workflowLogger.info("Model requested tool calls:", { toolCount: response.tool_calls.length });
      return {
        messages: updatedMessages,
        nextStep: "useTool"
      };
    } else {
      // No tools needed, proceed to synthesis
      return {
        messages: updatedMessages,
        nextStep: "synthesizeSpeech"
      };
    }
  } catch (error) {
    workflowLogger.error("Model call failed:", { error: error.message });

    // Fallback response
    const fallbackResponse = new AIMessage("Sorry, I'm having trouble right now. Let's try again!");
    return {
      messages: [...messagesWithInput, fallbackResponse],
      nextStep: "synthesizeSpeech"
    };
  }
}

async function useTool(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  workflowLogger.info("Executing tool calls");

  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    workflowLogger.warn("No tool calls found in last message");
    return { nextStep: "synthesizeSpeech" };
  }

  const llm = createLLMWithTools();
  let updatedMessages = [...state.messages];
  let visualAnalysis: string | null = null;

  try {
    // Execute each tool call
    for (const toolCall of lastMessage.tool_calls) {
      if (toolCall.name === "getEyesTool") {
        const config = {
          configurable: {
            conversationId: state.conversationId
          }
        };

        const toolResult = await getEyesTool.invoke(toolCall.args, config);
        visualAnalysis = toolResult;

        // Add tool result to messages
        updatedMessages.push({
          role: "tool",
          content: toolResult,
          tool_call_id: toolCall.id
        });
      }
    }

    // Get final response from model with tool results
    const finalResponse = await llm.invoke(updatedMessages);
    updatedMessages.push(finalResponse);

    return {
      messages: updatedMessages,
      visualAnalysis,
      nextStep: "synthesizeSpeech"
    };
  } catch (error) {
    workflowLogger.error("Tool execution failed:", { error: error.message });

    // Add error response
    const errorResponse = new AIMessage("I had trouble using my tools, but I'm here to help!");
    updatedMessages.push(errorResponse);

    return {
      messages: updatedMessages,
      nextStep: "synthesizeSpeech"
    };
  }
}

async function synthesizeSpeech(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  workflowLogger.info("Synthesizing speech from AI response");

  // Get the last AI message
  const lastAIMessage = [...state.messages].reverse().find(msg => 
    msg.constructor.name === 'AIMessage' || msg.role === 'assistant'
  );

  if (!lastAIMessage) {
    workflowLogger.warn("No AI message found for speech synthesis");
    return { nextStep: "storeConversation" };
  }

  const textContent = lastAIMessage.content || "I'm here to help!";

  try {
    const audioBuffer = await defaultAIService.generateSpeech(textContent);

    return {
      audioResponse: audioBuffer,
      nextStep: "storeConversation"
    };
  } catch (error) {
    workflowLogger.error("Speech synthesis failed:", { error: error.message });

    return {
      audioResponse: null,
      nextStep: "storeConversation"
    };
  }
}

async function storeConversation(state: ConversationStateType): Promise<Partial<ConversationStateType>> {
  workflowLogger.info("Storing conversation and creating memories");

  try {
    // Create conversation if needed
    let conversationId = state.conversationId;
    if (!conversationId) {
      const conversation = await storage.createConversation({ childId: state.childId });
      conversationId = conversation.id;
    }

    // Get human and AI messages from the current interaction
    const recentMessages = state.messages.slice(-2); // Last 2 messages (human + AI)

    // Store child's message
    const humanMessage = recentMessages.find(msg => 
      msg.constructor.name === 'HumanMessage' || msg.role === 'user'
    );

    if (humanMessage) {
      await storage.createMessage({
        conversationId,
        type: 'child_input',
        content: humanMessage.content,
        transcription: humanMessage.content
      });

      // Create memory from child's input
      await memoryService.createMemory(
        state.childId,
        `Child said: "${humanMessage.content}"`,
        'conversational',
        { conversationId, emotionalTone: 'neutral' }
      );
    }

    // Store AI response
    const aiMessage = recentMessages.find(msg => 
      msg.constructor.name === 'AIMessage' || msg.role === 'assistant'
    );

    if (aiMessage) {
      await storage.createMessage({
        conversationId,
        type: 'appu_response',
        content: aiMessage.content
      });

      // Create memory from AI response
      await memoryService.createMemory(
        state.childId,
        `Appu responded: "${aiMessage.content}"`,
        'conversational',
        { conversationId, emotionalTone: 'positive' }
      );
    }

    // Store visual analysis if present
    if (state.visualAnalysis) {
      await memoryService.createMemory(
        state.childId,
        `Child showed something: ${state.visualAnalysis}`,
        'visual',
        { conversationId, importance_score: 0.8 }
      );
    }

    return {
      conversationId,
      nextStep: null // End of workflow
    };
  } catch (error) {
    workflowLogger.error("Storage failed:", { error: error.message });
    return { nextStep: null };
  }
}

// Conditional routing function (standard LangGraph pattern)
function routeAfterModel(state: ConversationStateType): string {
  return state.nextStep || END;
}

function routeAfterTool(state: ConversationStateType): string {
  return state.nextStep || END;
}

function routeAfterSpeech(state: ConversationStateType): string {
  return state.nextStep || END;
}

// Create the workflow with proper conditional routing
function createConversationWorkflow() {
  const workflow = new StateGraph(ConversationState)
    .addNode("loadContext", loadContext)
    .addNode("callModel", callModel)
    .addNode("useTool", useTool)
    .addNode("synthesizeSpeech", synthesizeSpeech)
    .addNode("storeConversation", storeConversation)
    .setEntryPoint("loadContext")
    .addEdge("loadContext", "callModel")
    .addConditionalEdges("callModel", routeAfterModel, {
      "useTool": "useTool",
      "synthesizeSpeech": "synthesizeSpeech"
    })
    .addConditionalEdges("useTool", routeAfterTool, {
      "synthesizeSpeech": "synthesizeSpeech"
    })
    .addConditionalEdges("synthesizeSpeech", routeAfterSpeech, {
      "storeConversation": "storeConversation"
    })
    .addEdge("storeConversation", END);

  // Use memory to persist state between calls
  const memory = new MemorySaver();
  return workflow.compile({ checkpointer: memory });
}

// Helper function for video frame analysis
async function analyzeVideoFrame(frameData: string): Promise<string> {
  try {
    workflowLogger.debug(`Analyzing video frame - Size: ${frameData?.length || 0} bytes`);

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    workflowLogger.debug("Video frame analysis completed:", { analysis: analysis.slice(0, 100) });
    return analysis;
  } catch (error) {
    workflowLogger.error("Video analysis error:", { error: error.message });
    return "I can see you're showing me something special!";
  }
}

// Helper function to create enhanced prompt (simplified)
async function createEnhancedPrompt(childId: number, child: any, milestones: any[], childContext: any): Promise<string> {
  try {
    const { APPU_SYSTEM_PROMPT } = await import('../shared/appuPrompts');
    const { DEFAULT_PROFILE } = await import('../shared/childProfile');

    const childProfile = child?.profile || DEFAULT_PROFILE;

    // Get recent memories for context
    const recentMemories = await memoryService.retrieveMemories({
      query: '',
      childId,
      limit: 3,
      timeframe: 'week'
    });

    // Generate current time context
    const now = new Date();
    const timeOfDay = now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening';

    let enhancedPrompt = APPU_SYSTEM_PROMPT;

    enhancedPrompt += `\n\nCURRENT CONTEXT:`;
    enhancedPrompt += `\n- Time of day: ${timeOfDay}`;
    enhancedPrompt += `\n- Child's name: ${(childProfile as any).name || 'friend'}`;
    enhancedPrompt += `\n- Child's age: ${(childProfile as any).age || 'young'}`;

    if (recentMemories && recentMemories.length > 0) {
      enhancedPrompt += `\n\nRECENT MEMORIES:`;
      recentMemories.forEach((memory, index) => {
        enhancedPrompt += `\n- ${memory.content}`;
      });
    }

    enhancedPrompt += `\n\nINSTRUCTIONS:`;
    enhancedPrompt += `\n- If the child mentions showing, pointing to, or talking about something visual, use the getEyesTool to see what they're showing`;
    enhancedPrompt += `\n- Be enthusiastic and encouraging in your responses`;
    enhancedPrompt += `\n- Keep responses concise and age-appropriate`;

    return enhancedPrompt;
  } catch (error) {
    workflowLogger.error("Error creating enhanced prompt:", { error: error.message });
    return "You are Appu, a friendly elephant AI assistant who helps children learn and have fun.";
  }
}

// Export the main workflow
export const conversationWorkflow = createConversationWorkflow();

// Utility function to process a complete conversation
export async function processConversation(input: {
  childId: number;
  conversationId?: number;
  textInput?: string;
  audioData?: Buffer;
}) {
  const { workflowMonitor } = await import('./workflow-monitor');
  const workflowId = `conversation-${input.childId}-${Date.now()}`;
  const { startTime } = workflowMonitor.startWorkflow(workflowId);

  // Handle audio transcription if needed
  let textInput = input.textInput;
  if (!textInput && input.audioData) {
    try {
      textInput = await defaultAIService.transcribeAudio(input.audioData, "input.wav");
      workflowLogger.info("Audio transcribed for workflow:", { text: textInput?.slice(0, 50) });
    } catch (error) {
      workflowLogger.error("Audio transcription failed:", { error: error.message });
      textInput = "I couldn't understand that audio.";
    }
  }

  if (!textInput) {
    const error = "No text input or audio provided";
    workflowMonitor.completeWorkflow(workflowId, startTime, false, [error]);
    throw new Error(error);
  }

  const initialState: Partial<ConversationStateType> = {
    childId: input.childId,
    conversationId: input.conversationId || null,
    textInput,
    messages: []
  };

  const config = { 
    configurable: { 
      thread_id: `child-${input.childId}`,
      conversationId: input.conversationId
    } 
  };

  try {
    const result = await conversationWorkflow.invoke(initialState, config);

    workflowLogger.info("Workflow completed successfully:", {
      hasResponse: !!result.messages?.length,
      hasAudio: !!result.audioResponse,
      hasVisualAnalysis: !!result.visualAnalysis
    });

    workflowMonitor.completeWorkflow(workflowId, startTime, true, []);

    // Extract final AI response
    const lastAIMessage = [...(result.messages || [])].reverse().find(msg => 
      msg.constructor.name === 'AIMessage' || msg.role === 'assistant'
    );

    return {
      transcription: textInput,
      aiResponse: lastAIMessage?.content || "I'm here to help!",
      audioResponse: result.audioResponse,
      visualAnalysis: result.visualAnalysis,
      conversationId: result.conversationId,
      processingSteps: ["Context loaded", "Model called", "Response generated"],
      errors: []
    };
  } catch (error) {
    workflowLogger.error("Workflow failed:", { error: error.message });
    workflowMonitor.completeWorkflow(workflowId, startTime, false, [String(error)]);
    throw error;
  }
}