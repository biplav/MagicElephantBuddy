import { useState, useRef, useCallback, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AudioLines, Camera, Play, Square, Pause } from "lucide-react";
import { useStableRealtimeAudio } from '@/hooks/useStableRealtimeAudio';
import { useServiceManager } from '@/context/ServiceManagerContext';
import { useSilenceDetection } from '@/hooks/useSilenceDetection';
import { useOpenAIEventTranslator } from '@/hooks/useOpenAIEventTranslator';
import { useBookStateManager } from '@/hooks/useBookStateManager';

type AppState = "welcome" | "interaction";

const Home = memo(() => {
  // Book state management
  const { selectedBook, handleBookSearch, handleDisplayBookPage } = useBookStateManager();
  
  const [appState, setAppState] = useState<AppState>("welcome");
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [elephantState, setElephantState] = useState<
    "listening" | "speaking" | "thinking" | "idle"
  >("idle");

  // Services from context
  const { workflowStateMachine, mediaManager, openaiEventTranslator } = useServiceManager();
  
  // Visual state management
  const [currentPage, setCurrentPage] = useState<any>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);

  // Storybook page display callback
  const handleStorybookPageDisplay = useCallback((pageData: any) => {
    console.log("📖 Displaying storybook page", pageData);
    setCurrentPage(pageData);
  }, []);

  // Create stable workflow manager
  const workflowManager = useRef({
    handleAppuThinking: (context: string = 'openai-thinking') => {
      console.log('🤔 Appu thinking', { context });
      setElephantState('thinking');
      workflowStateMachine.current.handleStateTransition('APPU_THINKING', context);
    },
    
    handleChildSpeechStart: (context: string = 'openai-user-speech') => {
      console.log('🎤 Child started speaking', { context });
      setElephantState('listening');
      workflowStateMachine.current.handleStateTransition('CHILD_SPEAKING', context);
    },
    
    handleChildSpeechStop: (context: string = 'openai-user-speech-end') => {
      console.log('🔇 Child stopped speaking', { context });
      setElephantState('idle');
      workflowStateMachine.current.handleStateTransition('CHILD_SPEAKING_STOPPED', context);
    },
    
    resetWorkflow: () => {
      console.log('🔄 Resetting workflow');
      setElephantState('idle');
      workflowStateMachine.current.handleStateTransition('IDLE', 'workflow-reset');
    },
    
    setEnabled: (enabled: boolean) => {
      console.log('🔄 Setting enabled state', { enabled });
    },
    
    state: 'IDLE',
    setState: () => {},
    getState: () => workflowStateMachine.current.currentState
  });

  // Create stable book manager interface
  const bookManager = useRef({
    handleStorybookPageDisplay: (pageData: any) => {
      handleStorybookPageDisplay(pageData);
    },
    handleFunctionCall: (callId: string, result: any) => {
      console.log("📖 Function call", { callId, result });
    },
    state: { bookState: 'IDLE' },
    dispatch: () => {},
    transitionToState: () => {},
    handleBookSearchTool: (callId: string, args: any) => handleBookSearch(callId, args),
    handleDisplayBookPage: (callId: string, args: any) => handleDisplayBookPage(callId, args, handleStorybookPageDisplay)
  });

  // Audio controls
  const audioControls = useRef({
    stopAudio: () => {
      console.log("🔇 Audio controls: stop");
      setIsAudioPlaying(false);
      setAudioProgress(0);
    },
    
    pauseAudio: () => {
      console.log("⏸️ Audio controls: pause");
      setIsAudioPlaying(false);
    },
    
    resumeAudio: () => {
      console.log("▶️ Audio controls: resume");
      setIsAudioPlaying(true);
    },
    
    playAudio: (audioUrl: string) => {
      console.log("🔊 Audio controls: play", audioUrl);
      setIsAudioPlaying(true);
    }
  });

  // Initialize realtime audio with stable references
  const { 
    isConnected, 
    connect, 
    disconnect, 
    isRecording, 
    isMuted, 
    toggleMute 
  } = useStableRealtimeAudio({
    modelType: 'openai',
    enableVideo: false
  }, {
    workflowStateMachine: workflowManager.current,
    bookManager: bookManager.current,
    mediaManager: mediaManager.current,
    openaiEventTranslator: openaiEventTranslator.current
  });

  // Silence detection
  const { isListening: silenceListening } = useSilenceDetection({
    enabled: isConnected && isRecording,
    onSilenceStart: () => console.log("🔇 Silence started"),
    onSilenceEnd: () => console.log("🔊 Silence ended"),
    threshold: 0.01,
    silenceDuration: 2000
  });

  // Event translator for logging
  useOpenAIEventTranslator();

  const handleStartConversation = useCallback(async () => {
    try {
      console.log("🎤 Starting conversation...");
      setAppState("interaction");
      setElephantState("listening");
      await connect();
    } catch (error) {
      console.error("Failed to start conversation:", error);
    }
  }, [connect]);

  const handleStopConversation = useCallback(async () => {
    try {
      console.log("🛑 Stopping conversation...");
      setElephantState("idle");
      await disconnect();
      setAppState("welcome");
    } catch (error) {
      console.error("Failed to stop conversation:", error);
    }
  }, [disconnect]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      console.log("⏹️ Stopping recording");
    } else {
      console.log("🎤 Starting recording");
      setElephantState("listening");
    }
  }, [isRecording]);

  if (appState === "welcome") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl mx-auto shadow-2xl">
          <CardContent className="p-8 text-center">
            <div className="mb-8 text-8xl">
              🐘
            </div>
            
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Hi! I'm Appu! 🐘
            </h1>
            
            <p className="text-xl text-gray-600 mb-8">
              Ready to have fun and learn together? Let's start our magical adventure!
            </p>
            
            <Button 
              onClick={handleStartConversation}
              size="lg"
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-8 py-4 rounded-full shadow-lg transform transition-all duration-200 hover:scale-105"
            >
              <AudioLines className="mr-2 h-6 w-6" />
              Start Talking with Appu!
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header Controls */}
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">
            Chatting with Appu 🐘
          </h1>
          
          <div className="flex gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMute}
              className="bg-white/20 backdrop-blur-sm border-white/30"
            >
              {isMuted ? "🔇 Unmute" : "🔊 Mute"}
            </Button>
            
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStopConversation}
              className="bg-red-500/80 backdrop-blur-sm"
            >
              <Square className="mr-2 h-4 w-4" />
              End Chat
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Elephant Character */}
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-6 text-center">
              <div className="text-8xl mb-4">
                {elephantState === 'listening' ? '👂🐘' : 
                 elephantState === 'speaking' ? '🗣️🐘' : 
                 elephantState === 'thinking' ? '🤔🐘' : '🐘'}
              </div>
              
              <div className="mt-6">
                <p className="text-white mb-4">
                  Connection: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
                </p>
                
                <p className="text-white mb-4">
                  Status: {isRecording ? "🎤 Listening..." : silenceListening ? "🤫 Waiting..." : "💭 Thinking..."}
                </p>
                
                <Button
                  onClick={toggleRecording}
                  variant={isRecording ? "destructive" : "default"}
                  size="lg"
                  className="w-full"
                >
                  {isRecording ? (
                    <><Pause className="mr-2 h-5 w-5" /> Stop Talking</>
                  ) : (
                    <><Play className="mr-2 h-5 w-5" /> Start Talking</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right: Storybook Display */}
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-6">
              {currentPage ? (
                <div className="text-white">
                  <h3 className="text-xl font-bold mb-4">{currentPage.bookTitle}</h3>
                  {currentPage.pageImageUrl && (
                    <img 
                      src={currentPage.pageImageUrl} 
                      alt={`Page ${currentPage.pageNumber}`}
                      className="w-full rounded-lg mb-4"
                    />
                  )}
                  <p className="text-sm mb-2">Page {currentPage.pageNumber}</p>
                  <p className="text-base">{currentPage.pageText}</p>
                  {currentPage.audioUrl && (
                    <audio controls className="w-full mt-4">
                      <source src={currentPage.audioUrl} type="audio/wav" />
                    </audio>
                  )}
                </div>
              ) : (
                <div className="text-center text-white">
                  <Camera className="mx-auto h-16 w-16 mb-4 opacity-50" />
                  <p className="text-lg">Ask Appu to show you a story!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status Info */}
        <div className="mt-6">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-4">
              <div className="text-white text-sm">
                Book Selected: {selectedBook ? `${selectedBook.title} (${selectedBook.totalPages} pages)` : 'None'}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
});

Home.displayName = 'Home';

export default Home;