import { WebSocket } from "ws";
import { storage } from "../storage";
import { memoryFormationService } from "../memory-formation-service";
import { createServiceLogger } from "../logger";

const sessionLogger = createServiceLogger("gemini-session");

export interface GeminiLiveSession {
  ws: WebSocket;
  geminiWs: WebSocket | null;
  isConnected: boolean;
  conversationId: number | null;
  childId: string;
  sessionStartTime: Date;
  messageCount: number;
}

export class GeminiSessionManager {
  private sessions = new Map<WebSocket, GeminiLiveSession>();

  async startSession(session: GeminiLiveSession, message: any): Promise<void> {
    try {
      sessionLogger.info("Starting Gemini session", {
        childId: session.childId,
        messageType: message.type,
      });

      // Create conversation record
      const conversationData = {
        childId: session.childId,
        startTime: new Date(),
        provider: "gemini_live",
        metadata: {
          sessionId: this.generateSessionId(),
          userAgent: message.userAgent || "unknown",
        },
      };

      /* This needs to be fixed.
      const conversation = await storage.createConversation(conversationData);*/
      //session.conversationId = conversation.id;
      session.isConnected = true;

      // Send session started confirmation
      session.ws.send(
        JSON.stringify({
          type: "session_started",
          conversationId: '',//conversation.id,
          timestamp: new Date().toISOString(),
        }),
      );

      sessionLogger.info("Gemini session started successfully", {
        conversationId: '',//conversation.id,
        childId: session.childId,
      });
    } catch (error: any) {
      sessionLogger.error("Error starting Gemini session", {
        error: error.message,
        childId: session.childId,
      });

      session.ws.send(
        JSON.stringify({
          type: "error",
          error: "Failed to start session",
        }),
      );
    }
  }

  async handleTextInput(
    session: GeminiLiveSession,
    message: any,
  ): Promise<void> {
    try {
      if (!session.conversationId) {
        throw new Error("No active conversation");
      }

      sessionLogger.info("Handling text input", {
        conversationId: session.conversationId,
        textLength: message.text?.length || 0,
      });

      // Store user message
      await storage.messages.create({
        conversationId: session.conversationId,
        role: "user",
        content: message.text,
        timestamp: new Date(),
        metadata: { type: "text_input" },
      });

      session.messageCount++;

      // Send acknowledgment
      session.ws.send(
        JSON.stringify({
          type: "text_received",
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error: any) {
      sessionLogger.error("Error handling text input", {
        error: error.message,
        conversationId: session.conversationId,
      });
    }
  }

  async endSession(session: GeminiLiveSession): Promise<void> {
    try {
      sessionLogger.info("Ending Gemini session", {
        conversationId: session.conversationId,
        messageCount: session.messageCount,
      });

      if (session.conversationId) {
        // Update conversation end time
        await storage.conversations.update(session.conversationId, {
          endTime: new Date(),
          messageCount: session.messageCount,
        });

        // Trigger memory formation if there were messages
        if (session.messageCount > 0) {
          await memoryFormationService.processConversation(
            session.conversationId,
          );
        }
      }

      // Clean up WebSocket connections
      if (session.geminiWs) {
        session.geminiWs.close();
        session.geminiWs = null;
      }

      session.isConnected = false;
      this.sessions.delete(session.ws);

      // Send session ended confirmation
      session.ws.send(
        JSON.stringify({
          type: "session_ended",
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error: any) {
      sessionLogger.error("Error ending Gemini session", {
        error: error.message,
        conversationId: session.conversationId,
      });
    }
  }

  private generateSessionId(): string {
    return `gemini_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getSession(ws: WebSocket): GeminiLiveSession | undefined {
    return this.sessions.get(ws);
  }

  setSession(ws: WebSocket, session: GeminiLiveSession): void {
    this.sessions.set(ws, session);
  }
}

export const geminiSessionManager = new GeminiSessionManager();
