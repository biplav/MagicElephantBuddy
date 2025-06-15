# replit.md

## Overview

This is a full-stack Node.js application called "Appu" - an AI-powered magical elephant buddy designed to interact with young children aged 3-5. The application provides voice-based conversation capabilities using OpenAI's APIs (both traditional and Realtime) with a child-friendly interface.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite for development and production builds
- **UI Library**: Radix UI components with shadcn/ui styling system
- **Styling**: Tailwind CSS with custom child-friendly theming
- **State Management**: TanStack React Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Animation**: Framer Motion for interactive animations

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API and WebSocket handling
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **AI Service Layer**: Abstracted AI service with factory pattern for configuration-based provider selection
- **Multi-Provider AI**: OpenAI (GPT-4o, GPT-4o-mini) and Google Gemini (2.0-flash-exp, 1.5-flash)
- **Audio Processing**: OpenAI Whisper API for speech-to-text with FFmpeg preprocessing
- **Text-to-Speech**: OpenAI TTS API with multiple voice options (nova, fable, etc.)
- **Real-time Communication**: WebSockets for OpenAI Realtime API and Gemini Live API

## Key Components

### AI Service Architecture
- **Abstracted AI Service Layer**: Modular design with provider-agnostic interface
- **Factory Pattern**: Configuration-based service creation for different use cases
- **Multiple Configurations**: Standard, fast, creative modes with OpenAI and Gemini variants
- **Multi-Provider Support**: OpenAI (GPT-4o, GPT-4o-mini) and Google Gemini (2.0-flash-exp, 1.5-flash)
- **Configuration Options**: Model selection, token limits, temperature, voice selection
- **Live API Integration**: Gemini Live API for real-time conversations with WebSocket support

### Voice Interaction System
- Audio recording using Web Audio API with FFmpeg preprocessing
- Real-time audio streaming with WebSocket connections
- Speech transcription via OpenAI Whisper with audio format conversion
- Natural language processing with configurable GPT models (gpt-4o, gpt-4o-mini)
- Text-to-speech synthesis with multiple voice options (nova, fable, etc.)
- Support for both traditional API calls and OpenAI Realtime API

### Character System (Appu)
- Child-friendly AI character with consistent personality
- Hindi/English bilingual support (Hinglish)
- Age-appropriate responses and content filtering
- Emotional intelligence for child interactions
- Behavioral modeling and learning goals integration

### Database Schema
- **Parents**: User authentication and profile management
- **Children**: Individual child profiles with preferences and learning goals
- **Conversations**: Session tracking and duration monitoring
- **Messages**: Individual message storage with transcriptions
- **Conversation Insights**: Analytics for parent dashboard

### Parent Dashboard
- Child profile management
- Conversation history and analytics
- Progress tracking and insights
- Safety monitoring and content review
- Customizable notification system for learning milestones
- Real-time learning progress tracking with automatic milestone detection

## Data Flow

### Voice Interaction Flow
1. Child speaks → Browser captures audio
2. Audio sent to server → OpenAI Whisper transcription
3. Text processed by GPT with Appu's character prompt
4. Response generated → OpenAI TTS creates audio
5. Audio streamed back → Browser plays response
6. Conversation logged to database

### Real-time Audio Flow (Alternative)
1. WebSocket connection established with OpenAI Realtime API
2. Direct audio streaming between client and OpenAI
3. Real-time transcription and response generation
4. Conversation data synchronized with application database

## External Dependencies

### Core Services
- **OpenAI API**: Whisper (STT), GPT-4 (conversation), TTS (speech synthesis)
- **Neon Database**: Serverless PostgreSQL hosting
- **WebSocket**: Real-time communication protocol

### Development Tools
- **Drizzle Kit**: Database schema management and migrations
- **ESBuild**: Server-side code bundling for production
- **TSX**: TypeScript execution for development

### Audio Processing
- **FFmpeg**: Audio format conversion and processing
- **Multer**: File upload handling for audio data
- **Web Audio API**: Browser-based audio recording

## Deployment Strategy

### Development Environment
- **Platform**: Replit with Node.js 20 runtime
- **Database**: PostgreSQL 16 module
- **Port Configuration**: Server runs on port 5000, externally accessible on port 80
- **Live Reload**: Vite HMR for frontend, TSX for backend development

### Production Build Process
1. Frontend assets built with Vite → `dist/public`
2. Server code bundled with ESBuild → `dist/index.js`
3. Database migrations applied via Drizzle Kit
4. Environment variables configured for OpenAI API and database connection

### Environment Requirements
- `OPENAI_API_KEY`: Required for OpenAI services (Whisper, GPT, TTS)
- `GOOGLE_API_KEY`: Required for Google Gemini API services
- `DATABASE_URL`: PostgreSQL connection string (auto-provisioned in Replit)

## Changelog

- June 14, 2025: Initial setup
- June 14, 2025: Implemented complete conversation storage system with PostgreSQL database
- June 14, 2025: Abstracted ChatGPT API interactions into modular AI service with factory pattern for configuration-based selection
- June 14, 2025: Integrated Google Gemini Live API with multi-provider AI service architecture
- June 15, 2025: Fixed conversation storage for WebRTC realtime sessions - messages now properly stored in database during live conversations
- June 15, 2025: Added parent login gate for main interaction - users must log in before accessing Appu conversations
- June 15, 2025: Enhanced parent dashboard with proper conversation and message display functionality
- June 15, 2025: Implemented customizable notification system for learning milestones with automatic progress tracking from conversations
- June 15, 2025: Completed hourly job system for automated conversation analysis, profile suggestions, and daily summaries using OpenAI GPT-4o
- June 15, 2025: Implemented conversation summaries - hourly jobs now generate AI-powered summaries for new conversations and display them on parent dashboard
- June 15, 2025: Integrated learning milestone details into AI system prompts for both OpenAI Realtime API and Gemini Live API - all AI interactions now include child's current learning progress and goals

## User Preferences

Preferred communication style: Simple, everyday language.