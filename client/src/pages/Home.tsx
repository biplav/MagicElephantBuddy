import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Settings, Bug, Speaker } from "lucide-react";
import { Link } from "wouter";
import Elephant from "@/components/Elephant";
import { motion, AnimatePresence } from "framer-motion";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import useRealtimeAudio from "@/hooks/useRealtimeAudio";
import PermissionModal from "@/components/PermissionModal";
// Import error messages when needed

type AppState = "welcome" | "interaction";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("welcome");
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [elephantState, setElephantState] = useState<"idle" | "listening" | "thinking" | "speaking" | "error" | "rateLimit" | "network" | "auth" | "serviceUnavailable">("idle");
  const [speechText, setSpeechText] = useState<string | undefined>(undefined);
  const [transcribedText, setTranscribedText] = useState<string>("");
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [directTextInput, setDirectTextInput] = useState<string>("");
  const [isProcessingText, setIsProcessingText] = useState<boolean>(false);
  const [enableLocalPlayback, setEnableLocalPlayback] = useState<boolean>(false); // Default to false for server testing
  const [useRealtimeAPI, setUseRealtimeAPI] = useState<boolean>(false); // Toggle for OpenAI Realtime API

  // Initialize realtime audio hook
  const realtimeAudio = useRealtimeAudio({
    onTranscriptionReceived: (transcription) => {
      setTranscribedText(transcription);
    },
    onResponseReceived: (text) => {
      setElephantState("speaking");
      setSpeechText(text);
      
      // Return to idle state after speaking
      setTimeout(() => {
        setElephantState("idle");
        setTimeout(() => {
          setSpeechText(undefined);
        }, 1000);
      }, 4000);
    },
    onAudioResponseReceived: (audioData) => {
      if (enableLocalPlayback) {
        try {
          // Convert base64 to blob and play
          const audioBlob = base64ToBlob(audioData, 'audio/pcm');
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
          };
          
          audio.play();
          console.log("Playing realtime audio response");
        } catch (audioError) {
          console.error("Error playing realtime audio:", audioError);
        }
      }
    },
    onError: (error) => {
      console.error("Realtime API error:", error);
      setElephantState("error");
      setSpeechText("Something went wrong with the connection. Let's try again.");
      
      setTimeout(() => {
        setElephantState("idle");
        setSpeechText(undefined);
      }, 3000);
    }
  });

  const traditionalRecorder = useAudioRecorder({
    enableLocalPlayback,
    onProcessingStart: () => {
      setElephantState("thinking");
      setSpeechText(undefined);
    },
    onTranscriptionReceived: (transcription) => {
      setTranscribedText(transcription);
    },
    onResponseReceived: (textOrData) => {
      let text: string;
      let errorType: string | undefined;
      
      // Check if the response is an object with error information
      if (typeof textOrData === 'object' && textOrData !== null && 'text' in textOrData) {
        text = textOrData.text;
        errorType = textOrData.errorType;
        
        // Set the proper elephant state based on error type
        if (errorType === 'rateLimit') {
          setElephantState('rateLimit');
        } else if (errorType === 'network') {
          setElephantState('network');
        } else if (errorType === 'auth') {
          setElephantState('auth');
        } else if (errorType === 'serviceUnavailable') {
          setElephantState('serviceUnavailable');
        } else {
          setElephantState('error');
        }
      } else {
        // It's a regular text response
        text = String(textOrData);
        setElephantState("speaking");
      }
      
      // Set the speech text
      setSpeechText(text);
      
      // Return to idle state after speaking
      setTimeout(() => {
        setElephantState("idle");
        
        // Small delay to allow state to update and animations to complete
        setTimeout(() => {
          setSpeechText(undefined);
        }, 1000);
      }, 4000);
    }
  });

  // Create unified recorder interface
  const currentRecorder = useRealtimeAPI ? {
    isReady: realtimeAudio.isConnected,
    isRecording: realtimeAudio.isRecording,
    isProcessing: realtimeAudio.isProcessing,
    startRecording: realtimeAudio.startRecording,
    stopRecording: realtimeAudio.stopRecording,
    requestMicrophonePermission: realtimeAudio.requestMicrophonePermission,
    recorderState: realtimeAudio.isRecording ? 'recording' : 'inactive'
  } : {
    isReady: traditionalRecorder.isReady,
    isRecording: traditionalRecorder.isRecording,
    isProcessing: traditionalRecorder.isProcessing,
    startRecording: traditionalRecorder.startRecording,
    stopRecording: traditionalRecorder.stopRecording,
    requestMicrophonePermission: traditionalRecorder.requestMicrophonePermission,
    recorderState: traditionalRecorder.recorderState
  };

  // Destructure for backward compatibility
  const { isReady, isRecording, startRecording, stopRecording, requestMicrophonePermission, isProcessing, recorderState } = currentRecorder;

  // Initialize realtime connection when toggling to realtime API
  useEffect(() => {
    if (useRealtimeAPI && !realtimeAudio.isConnected) {
      realtimeAudio.connect();
    } else if (!useRealtimeAPI && realtimeAudio.isConnected) {
      realtimeAudio.disconnect();
    }
  }, [useRealtimeAPI, realtimeAudio]);

  useEffect(() => {
    if (isReady && appState === "interaction") {
      setTimeout(() => {
        setElephantState("speaking");
        setSpeechText("Hi there! I'm Appu. What would you like to talk about?");
        
        setTimeout(() => {
          setElephantState("idle");
          setTimeout(() => {
            setSpeechText(undefined);
            
            // Auto-restart recording after initial greeting
            if (isReady && appState === "interaction" && !isRecording && !isProcessing) {
              console.log("Auto-restarting recording after initial greeting");
              startRecording();
            }
          }, 1000);
        }, 3000);
      }, 1000);
    }
  }, [isReady, appState, isRecording, isProcessing, startRecording]);

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
      console.log("Microphone permission granted, starting interaction");
      setAppState("interaction");
    } else {
      console.error("Failed to get microphone permission");
      // Show error state for microphone permission issues
      setElephantState("error");
      setSpeechText("I can't hear you! Please allow microphone access and try again.");
      
      // Reset state after showing error
      setTimeout(() => {
        setElephantState("idle");
        setSpeechText(undefined);
      }, 4000);
      
      // You might want to show another dialog or message here
      // explaining how to enable microphone permissions
    }
  };

  // Start recording automatically when ready
  useEffect(() => {
    if (isReady && appState === "interaction" && !isRecording && !isProcessing) {
      console.log("Auto-starting recording because system is ready and not busy");
      startRecording();
    }
  }, [isReady, appState, isRecording, isProcessing, startRecording]);
  
  // Restart recording after processing is complete
  useEffect(() => {
    // Only trigger when processing changes from true to false
    if (!isProcessing && isReady && appState === "interaction" && elephantState !== "speaking") {
      // Small delay to ensure everything is reset properly
      const timer = setTimeout(() => {
        if (!isRecording && !isProcessing) {
          console.log("Restarting recording after processing completed");
          startRecording();
        }
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isProcessing, isReady, appState, elephantState, isRecording, startRecording]);

  // Handle microphone button to stop current recording and trigger processing
  const handleMicrophoneButton = () => {
    if (isRecording) {
      console.log("Stopping recording manually via microphone button");
      stopRecording();
      
      // Add a small delay before processing
      setTimeout(() => {
        // Log current state after stopping
        console.log("Current state after stopping recording:", { 
          isRecording, 
          isProcessing, 
          elephantState
        });
      }, 100);
    } else {
      console.log("Starting recording manually via microphone button");
      
      // Reset state if needed
      if (elephantState !== "idle" && elephantState !== "listening") {
        console.log("Resetting elephant state before starting recording");
        setElephantState("idle");
      }
      
      // Start recording
      startRecording();
      
      // Log current state after starting
      setTimeout(() => {
        console.log("Current state after starting recording:", { 
          isRecording, 
          isProcessing, 
          elephantState
        });
      }, 100);
    }
  };
  
  // Helper function to convert base64 to blob
  const base64ToBlob = (base64: string, contentType: string): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  };

  // Process direct text input (for debugging)
  const processDirectTextInput = async () => {
    if (!directTextInput.trim() || isProcessingText) return;
    
    try {
      setIsProcessingText(true);
      setElephantState("thinking");
      setSpeechText(undefined);
      
      // Set the transcribed text immediately since we're bypassing Whisper
      setTranscribedText(directTextInput);
      
      // Send the text to the backend for processing
      const response = await fetch('/api/process-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: directTextInput }),
      });
      
      if (!response.ok) {
        // Parse the error response
        const errorData = await response.json();
        // Create an error object with the response data
        const error: any = new Error(errorData.error || 'Failed to process text');
        error.response = { data: errorData };
        throw error;
      }
      
      const responseData = await response.json();
      
      // Process the response
      const responseText = responseData.text;
      const audioData = responseData.audioData;

      console.log(responseData);
      
      // Play the audio if available
      setElephantState("speaking");
      setSpeechText(responseText);

      console.log("Setting it up!!!");
      console.log(audioData);
      
      if (audioData && enableLocalPlayback) {
        try {
          // Convert base64 to blob and play
          const audioBlob = base64ToBlob(audioData, 'audio/wav');
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
          };
          
          await audio.play();
          console.log("Playing generated audio from direct text input");
        } catch (audioError) {
          console.error("Error playing audio:", audioError);
        }
      }
      
      // Clear the input
      setDirectTextInput("");
      
      // Return to idle state after speaking and restart recording
      setTimeout(() => {
        setElephantState("idle");
        
        // Small delay to allow state to update and animations to complete
        setTimeout(() => {
          setSpeechText(undefined);
          
          // Auto-restart recording after Appu finishes speaking
          if (isReady && appState === "interaction" && !isRecording && !isProcessing) {
            console.log("Auto-restarting recording after processing text input response");
            startRecording();
          }
        }, 1000);
      }, 4000);
      
    } catch (error: any) {
      console.error('Error processing text:', error);
      
      // Check if it's an API error response with an error type
      if (error.response && error.response.data && error.response.data.errorType) {
        // Set the elephant state based on the error type
        const errorType = error.response.data.errorType;
        if (errorType === 'rateLimit') {
          setElephantState('rateLimit');
          setSpeechText("I'm feeling a bit tired right now. Can we talk again in a little bit?");
        } else if (errorType === 'network') {
          setElephantState('network');
          setSpeechText("I can't hear you very well. Please check your internet connection and try again.");
        } else if (errorType === 'auth') {
          setElephantState('auth');
          setSpeechText("I need to take a quick break. Please try again later.");
        } else if (errorType === 'serviceUnavailable') {
          setElephantState('serviceUnavailable');
          setSpeechText("I'm having trouble thinking right now. Can we try again soon?");
        } else {
          setElephantState('error');
          setSpeechText("Oops! Something went wrong. Let's try again.");
        }
      } else {
        // Generic error handling
        setElephantState('error');
        setSpeechText("Oops! Something went wrong. Let's try again.");
      }
      
      // Reset to idle state after showing the error message
      setTimeout(() => {
        setElephantState("idle");
        
        // Small delay to allow state to update and animations to complete
        setTimeout(() => {
          setSpeechText(undefined);
          
          // Auto-restart recording after error message
          if (isReady && appState === "interaction" && !isRecording && !isProcessing) {
            console.log("Auto-restarting recording after error message");
            startRecording();
          }
        }, 1000);
      }, 4000);
    } finally {
      setIsProcessingText(false);
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
              <path d="M11 15C11 15 12 16 13 15" stroke="black" strokeWidth="0.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="font-bold text-xl text-primary">Appu</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/audio-test">
            <Button 
              variant="ghost" 
              size="icon" 
              aria-label="Audio Test" 
            >
              <Speaker className="h-6 w-6 text-neutral" />
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            size="icon" 
            aria-label="Debug" 
            onClick={() => setShowDebug(!showDebug)}
          >
            <Bug className="h-6 w-6 text-neutral" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Settings">
            <Settings className="h-6 w-6 text-neutral" />
          </Button>
        </div>
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
                  <path d="M236 300C236 300 256 320 276 300" stroke="black" strokeWidth="4" strokeLinecap="round"/>
                  <path d="M256 330C256 330 256 380 216 400" stroke="#9D78C9" strokeWidth="20" strokeLinecap="round"/>
                  <path d="M243 370H269" stroke="black" strokeWidth="4" strokeLinecap="round"/>
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
                    {isProcessing 
                      ? "Appu is thinking..." 
                      : elephantState === "speaking" 
                        ? "Appu is speaking..." 
                        : isRecording 
                          ? "Appu is listening..." 
                          : "Appu is getting ready to listen..."}
                  </p>
                  
                  {isProcessing ? (
                    <div className="w-20 h-20 rounded-full shadow-lg bg-yellow-400 flex items-center justify-center animate-pulse">
                      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Audio level indicator rings - visible when recording */}
                      {isRecording && (
                        <>
                          <div className="absolute inset-0 w-20 h-20 rounded-full bg-green-400 opacity-20 animate-ping-slow"></div>
                          <div className="absolute inset-0 w-20 h-20 rounded-full bg-green-300 opacity-10 animate-ping"></div>
                        </>
                      )}
                      
                      <Button 
                        className={`w-20 h-20 rounded-full shadow-lg transition transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-pink-300 flex items-center justify-center relative z-10 ${
                          isRecording 
                            ? "bg-[hsl(var(--success))] hover:bg-green-600" 
                            : "bg-accent hover:bg-pink-400"
                        }`}
                        onClick={handleMicrophoneButton}
                        disabled={!isReady || isProcessing}
                      >
                        {isRecording ? (
                          <div className="relative">
                            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                            {/* Recording indicator pulse */}
                            <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                          </div>
                        ) : (
                          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                        )}
                      </Button>
                    </div>
                  )}
                  
                  <p className="text-neutral text-sm">
                    {isProcessing 
                      ? "Please wait while Appu thinks..." 
                      : isRecording 
                        ? "Appu is listening to you now! Tap when you're done talking" 
                        : "Tap to start talking with Appu!"}
                  </p>
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
      
      {/* Debug Panel - only visible when debug mode is enabled */}
      {showDebug && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-800 text-white p-4 z-50 max-h-80 overflow-auto">
          <h3 className="font-bold mb-2">Debug Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p><span className="font-semibold">State:</span> {elephantState}</p>
              <p><span className="font-semibold">Recording:</span> {currentRecorder.isRecording ? 'Yes' : 'No'}</p>
              <p><span className="font-semibold">Processing:</span> {currentRecorder.isProcessing || isProcessingText ? 'Yes' : 'No'}</p>
              
              <div className="mt-3">
                <p><span className="font-semibold">Direct Text Input:</span></p>
                <div className="flex items-center mt-1">
                  <input
                    type="text"
                    value={directTextInput}
                    onChange={(e) => setDirectTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        processDirectTextInput();
                      }
                    }}
                    placeholder="Type here instead of speaking..."
                    className="flex-grow p-2 rounded bg-gray-700 text-white mr-2"
                    disabled={isProcessingText || currentRecorder.isProcessing}
                  />
                  <Button
                    onClick={processDirectTextInput}
                    disabled={isProcessingText || currentRecorder.isProcessing || !directTextInput.trim()}
                    className="bg-primary hover:bg-primary-dark px-3 py-1.5 rounded"
                  >
                    {isProcessingText ? 'Processing...' : 'Send'}
                  </Button>
                </div>
                
                <div className="mt-3">
                  <p><span className="font-semibold">Recording Method:</span></p>
                  <div className="flex items-center mt-1 gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={!useRealtimeAPI}
                        onChange={() => setUseRealtimeAPI(false)}
                        className="text-primary"
                      />
                      <span className="text-sm">Traditional (Upload)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={useRealtimeAPI}
                        onChange={() => setUseRealtimeAPI(true)}
                        className="text-primary"
                      />
                      <span className="text-sm">Realtime API (Streaming)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <p><span className="font-semibold">Transcribed:</span></p>
              <p className="bg-gray-700 p-2 rounded">{transcribedText || '(Nothing yet)'}</p>
              <p className="mt-2"><span className="font-semibold">Response:</span></p>
              <p className="bg-gray-700 p-2 rounded">{speechText || '(Nothing yet)'}</p>
              
              <div className="mt-3">
                <p><span className="font-semibold">Audio Debug:</span></p>
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Mic State:</span>
                    <div className={`px-2 py-0.5 rounded-full text-xs ${
                      currentRecorder.isRecording 
                        ? 'bg-green-600' 
                        : 'bg-gray-600'
                    }`}>
                      {currentRecorder.isRecording ? 'Recording' : 'Not Recording'}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Recorder:</span>
                    <div className={`px-2 py-0.5 rounded-full text-xs ${
                      currentRecorder.recorderState === 'recording' 
                        ? 'bg-green-600' 
                        : currentRecorder.recorderState === 'paused'
                          ? 'bg-yellow-600'
                          : currentRecorder.recorderState === 'error'
                            ? 'bg-red-600'
                            : 'bg-gray-600'
                    }`}>
                      {currentRecorder.recorderState}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Processing:</span>
                    <div className={`px-2 py-0.5 rounded-full text-xs ${
                      currentRecorder.isProcessing ? 'bg-yellow-600' : 'bg-gray-600'
                    }`}>
                      {currentRecorder.isProcessing ? 'Processing' : 'Not Processing'}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Elephant:</span>
                    <div className={`px-2 py-0.5 rounded-full text-xs ${
                      elephantState === 'idle' 
                        ? 'bg-blue-600' 
                        : elephantState === 'listening'
                          ? 'bg-green-600'
                          : elephantState === 'thinking'
                            ? 'bg-yellow-600'
                            : elephantState === 'speaking'
                              ? 'bg-purple-600'
                              : 'bg-red-600'
                    }`}>
                      {elephantState}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Local Playback:</span>
                    <div className={`px-2 py-0.5 rounded-full text-xs ${
                      enableLocalPlayback ? 'bg-green-600' : 'bg-gray-600'
                    }`}>
                      {enableLocalPlayback ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                  
                  <div className="flex flex-row gap-2 mt-2">
                    <Button
                      onClick={() => currentRecorder.startRecording()}
                      disabled={currentRecorder.isRecording || currentRecorder.isProcessing}
                      className="bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded text-sm"
                    >
                      Force Start Mic
                    </Button>
                    
                    <Button
                      onClick={() => currentRecorder.stopRecording()}
                      disabled={!currentRecorder.isRecording || currentRecorder.isProcessing}
                      className="bg-red-700 hover:bg-red-800 px-3 py-1.5 rounded text-sm"
                    >
                      Force Stop Mic
                    </Button>
                  </div>
                  
                  <div className="flex flex-row gap-2 mt-2">
                    <Button
                      onClick={() => {
                        setElephantState("idle");
                        setSpeechText(undefined);
                      }}
                      className="bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded text-sm"
                    >
                      Reset Elephant
                    </Button>
                    
                    <Button
                      onClick={() => {
                        fetch('/api/process-text', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ text: "test" })
                        })
                        .then(res => res.json())
                        .then(data => {
                          console.log("Test API response:", data);
                          alert("API test successful - check console");
                        })
                        .catch(err => {
                          console.error("API test failed:", err);
                          alert("API test failed - check console");
                        });
                      }}
                      className="bg-purple-700 hover:bg-purple-800 px-3 py-1.5 rounded text-sm"
                    >
                      Test API
                    </Button>
                  </div>
                  
                  <div className="flex flex-row gap-2 mt-4 items-center justify-between bg-gray-700 p-2 rounded">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${enableLocalPlayback ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm">Local Audio Playback:</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs mr-2">{enableLocalPlayback ? 'Enabled' : 'Disabled'}</span>
                      <Button 
                        onClick={() => setEnableLocalPlayback(!enableLocalPlayback)}
                        className={`px-3 py-1 rounded text-xs ${enableLocalPlayback 
                          ? 'bg-green-700 hover:bg-green-800' 
                          : 'bg-gray-500 hover:bg-gray-600'}`}
                      >
                        {enableLocalPlayback ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
