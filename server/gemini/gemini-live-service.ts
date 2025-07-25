import { storage } from "../storage";
import { APPU_SYSTEM_PROMPT } from "@shared/appuPrompts";
import { getCurrentTimeContext, DEFAULT_PROFILE } from "@shared/childProfile";
import { memoryService } from '../memory-service';
import { createServiceLogger } from '../logger';
import { GeminiLiveSession, geminiSessionManager } from './gemini-session-manager';
import { geminiMessageHandler } from './gemini-message-handler';