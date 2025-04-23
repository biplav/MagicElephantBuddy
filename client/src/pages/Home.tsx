import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import Elephant from "@/components/Elephant";
import { motion, AnimatePresence } from "framer-motion";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import PermissionModal from "@/components/PermissionModal";

type AppState = "welcome" | "interaction";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("welcome");
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [elephantState, setElephantState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [speechText, setSpeechText] = useState<string | undefined>(undefined);

  const {
    isReady,
    isRecording,
    startRecording,
    stopRecording,
    requestMicrophonePermission,
    isProcessing
  } = useAudioRecorder({
    onProcessingStart: () => {
      setElephantState("thinking");
      setSpeechText(undefined);
    },
    onResponseReceived: (text) => {
      setElephantState("speaking");
      setSpeechText(text);
      
      // Return to idle state after speaking
      setTimeout(() => {
        setElephantState("idle");
        setTimeout(() => {
          setSpeechText(undefined);
        }, 5000);
      }, 4000);
    }
  });

  useEffect(() => {
    if (isReady && appState === "interaction") {
      setTimeout(() => {
        setElephantState("speaking");
        setSpeechText("Hi there! I'm Appu. What would you like to talk about?");
        
        setTimeout(() => {
          setElephantState("idle");
          setTimeout(() => {
            setSpeechText(undefined);
          }, 5000);
        }, 3000);
      }, 1000);
    }
  }, [isReady, appState]);

  useEffect(() => {
    if (isRecording) {
      setElephantState("listening");
    }
  }, [isRecording]);

  const handleStartButton = () => {
    setPermissionModalOpen(true);
  };

  const handleAllowPermission = async () => {
    setPermissionModalOpen(false);
    const granted = await requestMicrophonePermission();
    if (granted) {
      setAppState("interaction");
    }
  };

  const handleMicrophoneButton = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center p-4 bg-white bg-opacity-70 shadow-sm">
        <div className="flex items-center">
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white mr-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 8C18 8 19 7 20 7C21 7 22 8 22 9C22 10 21 11 20 11C19 11 18 10 18 9" fill="white"/>
              <path d="M6 8C6 8 5 7 4 7C3 7 2 8 2 9C2 10 3 11 4 11C5 11 6 10 6 9" fill="white"/>
              <ellipse cx="12" cy="14" rx="8" ry="7" fill="white"/>
              <circle cx="10" cy="12.5" r="0.75" fill="black"/>
              <circle cx="14" cy="12.5" r="0.75" fill="black"/>
              <path d="M11 15C11 15 12 16 13 15" stroke="black" stroke-width="0.5" stroke-linecap="round"/>
            </svg>
          </div>
          <h1 className="font-bold text-xl text-primary">Appu</h1>
        </div>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="h-6 w-6 text-neutral" />
        </Button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-between p-4 md:p-6 overflow-hidden relative">
        {/* Decorative blobs in background */}
        <div className="absolute top-1/4 -left-20 w-40 h-40 blob opacity-20 z-0"></div>
        <div className="absolute bottom-1/3 -right-20 w-60 h-60 blob opacity-20 z-0"></div>

        <AnimatePresence mode="wait">
          {appState === "welcome" ? (
            <motion.div 
              key="welcome"
              className="flex flex-col items-center justify-center space-y-4 text-center max-w-lg p-4 z-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="font-bold text-2xl text-primary">Meet Appu!</h2>
              <p className="text-neutral text-lg">Your magical elephant friend who loves to talk and play with you!</p>
              
              <motion.div 
                className="w-48 h-48 my-4"
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M388 160C388 160 408 140 428 140C448 140 468 160 468 180C468 200 448 220 428 220C408 220 388 200 388 180" fill="#9D78C9"/>
                  <path d="M124 160C124 160 104 140 84 140C64 140 44 160 44 180C44 200 64 220 84 220C104 220 124 200 124 180" fill="#9D78C9"/>
                  <ellipse cx="256" cy="280" rx="160" ry="140" fill="#9D78C9"/>
                  <circle cx="216" cy="250" r="15" fill="white"/>
                  <circle cx="217" cy="250" r="5" fill="black"/>
                  <circle cx="296" cy="250" r="15" fill="white"/>
                  <circle cx="297" cy="250" r="5" fill="black"/>
                  <path d="M236 300C236 300 256 320 276 300" stroke="black" stroke-width="4" stroke-linecap="round"/>
                  <path d="M256 330C256 330 256 380 216 400" stroke="#9D78C9" stroke-width="20" stroke-linecap="round"/>
                  <path d="M243 370H269" stroke="black" stroke-width="4" stroke-linecap="round"/>
                </svg>
              </motion.div>
              
              <Button 
                className="bg-secondary hover:bg-yellow-400 text-black font-bold py-4 px-8 rounded-full text-xl shadow-lg transition transform hover:scale-105 active:scale-95"
                onClick={handleStartButton}
              >
                Let's Talk to Appu!
              </Button>
            </motion.div>
          ) : (
            <motion.div 
              key="interaction"
              className="w-full max-w-xl flex-1 flex flex-col items-center justify-between space-y-4 z-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <Elephant state={elephantState} speechText={speechText} />
              
              <div className="w-full px-4 py-6 bg-white bg-opacity-80 rounded-t-3xl shadow-lg">
                <div className="flex flex-col items-center space-y-4">
                  <p className="text-primary font-medium text-lg">
                    {isRecording 
                      ? "Appu is listening..." 
                      : isProcessing 
                        ? "Appu is thinking..." 
                        : elephantState === "speaking" 
                          ? "Appu is speaking..." 
                          : "Tap the microphone to talk with Appu!"}
                  </p>
                  
                  <Button 
                    className={`w-20 h-20 rounded-full shadow-lg transition transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-pink-300 flex items-center justify-center ${
                      isRecording 
                        ? "bg-[hsl(var(--success))] hover:bg-green-600" 
                        : "bg-accent hover:bg-pink-400"
                    }`}
                    onClick={handleMicrophoneButton}
                    disabled={!isReady || isProcessing}
                  >
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </Button>
                  
                  <p className="text-neutral text-sm">Appu can hear you when the microphone is active</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <PermissionModal 
        isOpen={permissionModalOpen} 
        onClose={() => setPermissionModalOpen(false)} 
        onAllow={handleAllowPermission} 
      />
    </div>
  );
}
