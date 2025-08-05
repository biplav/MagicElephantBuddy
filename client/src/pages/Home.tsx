import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Settings, Bug, Speaker, User, Brain, Eye, EyeOff } from "lucide-react";
import { Link } from "wouter";
import Elephant from "@/components/Elephant";
import PermissionModal from "@/components/PermissionModal";
import { VideoDisplay } from "@/components/VideoDisplay";
import { CapturedFrameDisplay } from "@/components/CapturedFrameDisplay";
import { motion, AnimatePresence } from "framer-motion";
import useAudioRecorder from "@/hooks/useAudioRecorder";
import useRealtimeAudio from "@/hooks/useRealtimeAudio";
import StorybookDisplay from "../components/StorybookDisplay";
import { CheckCircle, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import SilenceTestControls from "@/components/SilenceTestControls";

type AppState = "welcome" | "interaction";

const Home = memo(() => {
  const [appState, setAppState] = useState<AppState>("welcome");
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [elephantState, setElephantState] = useState<
    | "idle"
    | "listening"
    | "thinking"
    | "speaking"
    | "error"
    | "rateLimit"
    | "network"
    | "auth"
    | "serviceUnavailable"
  >("idle");
  const [speechText, setSpeechText] = useState<string | undefined>(undefined);
  const [transcribedText, setTranscribedText] = useState<string>("");
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [directTextInput, setDirectTextInput] = useState<string>("");
  const [isProcessingText, setIsProcessingText] = useState<boolean>(false);
  const [enableLocalPlayback, setEnableLocalPlayback] =
    useState<boolean>(false); // Default to false for server testing
  const [useRealtimeAPI, setUseRealtimeAPI] = useState<boolean>(true);
  const [enableVideo, setEnableVideo] = useState<boolean>(true); // Toggle for video capture - enabled by default
  const [aiSettings, setAiSettings] = useState({
    defaultProvider: "standard",
    voiceMode: "openai",
    creativeMode: false,
    voicePreference: "nova",
  });
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);

  // Derive aiProvider from saved settings
  const aiProvider: 'openai' | 'gemini' = aiSettings.voiceMode === 'gemini' ? 'gemini' : 'openai';

  // Check parent login status and selected child
  const [isParentLoggedIn, setIsParentLoggedIn] = useState<boolean>(() => {
    const currentParent = localStorage.getItem("currentParent");
    return !!currentParent;
  });

  const [selectedChildId, setSelectedChildId] = useState<string | null>(() => {
    const stored = localStorage.getItem("selectedChildId");
    return stored || null;
  });

  const [availableChildren, setAvailableChildren] = useState<any[]>([]);

  // Listen for localStorage changes to update parent login status
  useEffect(() => {
    const handleStorageChange = () => {
      const currentParent = localStorage.getItem("currentParent");
      const parentLoggedIn = !!currentParent;

      const selectedChild = localStorage.getItem("selectedChildId");
      const childId = selectedChild || null;

      // Only update state if values actually changed
      setIsParentLoggedIn(prev => prev !== parentLoggedIn ? parentLoggedIn : prev);
      setSelectedChildId(prev => prev !== childId ? childId : prev);
    };

    // Listen for storage changes
    window.addEventListener("storage", handleStorageChange);

    // Check on component mount only (remove interval polling)
    handleStorageChange();

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Memoize loadChildren function to prevent recreating on every render
  const loadChildren = useCallback(async () => {
    const currentParent = localStorage.getItem("currentParent");
    if (!currentParent) {
      setAvailableChildren([]);
      return;
    }

    try {
      const parent = JSON.parse(currentParent);
      console.log("Loading children for parent:", parent.id);

      if (!parent.id) {
        console.error("Parent ID is missing");
        setAvailableChildren([]);
        return;
      }

      const response = await fetch(`/api/parents/${parent.id}/children`);
      console.log("Children API response status:", response.status);

      if (response.ok) {
        const children = await response.json();
        console.log("Loaded children:", children);
        setAvailableChildren(children);

        // Auto-select first child if none selected - check localStorage directly
        const currentSelectedChildId = localStorage.getItem("selectedChildId");
        if (children.length > 0 && !currentSelectedChildId) {
          const firstChildId = String(children[0].id);
          setSelectedChildId(firstChildId);
          localStorage.setItem("selectedChildId", firstChildId);
          console.log("Auto-selected child:", firstChildId);
        }
      } else {
        const errorText = await response.text();
        console.error("Failed to load children:", response.status, errorText);
        setAvailableChildren([]);
      }
    } catch (error) {
      console.error("Error loading children:", error);
      setAvailableChildren([]);
    }
  }, []); // Remove selectedChildId dependency to break circular dependency

  // Load available children when parent logs in
  useEffect(() => {
    if (isParentLoggedIn) {
      loadChildren();
    } else {
      setAvailableChildren([]);
      setSelectedChildId(null);
    }
  }, [isParentLoggedIn]); // Remove loadChildren dependency to prevent circular updates

  // Fullscreen utility functions
  const enterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        await (document.documentElement as any).webkitRequestFullscreen();
      } else if ((document.documentElement as any).msRequestFullscreen) {
        await (document.documentElement as any).msRequestFullscreen();
      }
    } catch (error) {
      console.warn("Failed to enter fullscreen:", error);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (error) {
      console.warn("Failed to exit fullscreen:", error);
    }
  };

  // State for UI controls - enableLocalPlayback already declared above
  // enableVideo already declared above at line 37
  // const [useRealtimeAPI, setUseRealtimeAPI] = useState<boolean>(true); // Already declared above
  // const [selectedModel, setSelectedModel] = useState<'openai' | 'gemini'>('openai'); // Need to use aiProvider instead

  // Stabilize all callback functions to prevent hook recreation
  const handleTranscription = useCallback((transcription: string) => {
    console.log('🎤 HOME: Transcription callback received:', transcription);
    setTranscribedText(transcription);
  }, []);

  const handleResponse = useCallback((text: string) => {
    setElephantState("speaking");
    setSpeechText(text);

    // Return to idle state after speaking
    setTimeout(() => {
      setElephantState("idle");
      setTimeout(() => {
        setSpeechText(undefined);
      }, 1000);
    }, 4000);
  }, []);

  const handleAudioResponse = useCallback((audioData: string) => {
    if (enableLocalPlayback) {
      try {
        // Convert base64 to blob and play
        const audioBlob = base64ToBlob(audioData, "audio/pcm");
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
  }, [enableLocalPlayback]);

  const handleError = useCallback((error: string) => {
    console.error("Realtime API error:", error);
    setElephantState("error");
    setSpeechText(
      "Something went wrong with the connection. Let's try again.",
    );

    setTimeout(() => {
      setElephantState("idle");
      setSpeechText(undefined);
    }, 3000);
  }, []);

  const handleStorybookPageDisplay = useCallback((pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
    audioUrl?: string;
  }) => {
    console.log("Storybook page display callback received:", pageData);
    setCurrentStorybookPage(pageData);
    setIsStorybookVisible(true);
  }, []);

  // Initialize realtime audio hook with stable options
  const [isAppuSpeaking, setIsAppuSpeaking] = useState<boolean>(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const [autoPageTurnEnabled, setAutoPageTurnEnabled] = useState<boolean>(true);

  const realtimeOptions = useMemo(() => ({
    childId: selectedChildId || undefined,
    onTranscriptionReceived: handleTranscription,
    onResponseReceived: handleResponse,
    onAudioResponseReceived: handleAudioResponse,
    onError: handleError,
    onStorybookPageDisplay: handleStorybookPageDisplay,
    onAppuSpeakingChange: (speaking: boolean) => {
      setIsAppuSpeaking(speaking);
    },
    onUserSpeakingChange: (speaking: boolean) => {
      setIsUserSpeaking(speaking);
    },
    enableVideo: enableVideo,
    modelType: aiProvider,
  }), [
    selectedChildId,
    handleTranscription,
    handleResponse, 
    handleAudioResponse,
    handleError,
    handleStorybookPageDisplay,
    enableVideo, 
    aiProvider
  ]);

  const realtimeAudio = useRealtimeAudio(realtimeOptions);

  // Get individual connections for direct access
  const openaiConnection = (realtimeAudio as any).openaiConnection || { mediaCapture: null, lastCapturedFrame: null };
  const geminiConnection = (realtimeAudio as any).geminiConnection || {};
  const mediaManager = (realtimeAudio as any).mediaManager || { hasVideoPermission: false, videoElement: null };

  // Destructure realtime audio properties
  const {
    isConnected,
    isRecording: realtimeIsRecording,
    error: audioError,
    connect,
    disconnect,
    startRecording: realtimeStartRecording,
    stopRecording: realtimeStopRecording,
    requestMicrophonePermission: realtimeRequestPermission,
    captureCurrentFrame,
    videoEnabled,
    hasVideoPermission,
    isConnecting,
    isRecording,
    modelType,
    stopRecording,
    disconnect: disconnectRealtime
  } = realtimeAudio;

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
      if (
        typeof textOrData === "object" &&
        textOrData !== null &&
        "text" in textOrData
      ) {
        text = textOrData.text;
        errorType = textOrData.errorType;

        // Set the proper elephant state based on error type
        if (errorType === "rateLimit") {
          setElephantState("rateLimit");
        } else if (errorType === "network") {
          setElephantState("network");
        } else if (errorType === "auth") {
          setElephantState("auth");
        } else if (errorType === "serviceUnavailable") {
          setElephantState("serviceUnavailable");
        } else {
          setElephantState("error");
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
    },
  });

  // Create unified recorder interface (memoized to prevent infinite re-renders)
  const currentRecorder = useMemo(() => {
    return useRealtimeAPI
      ? {
          isReady: isConnected,
          isRecording: realtimeIsRecording,
          isProcessing: false, // Realtime API doesn't have isProcessing state
          startRecording: realtimeStartRecording,
          stopRecording: realtimeStopRecording,
          requestMicrophonePermission: realtimeRequestPermission,
          recorderState: realtimeIsRecording ? "recording" : "inactive",
        }
      : {
          isReady: traditionalRecorder.isReady,
          isRecording: traditionalRecorder.isRecording,
          isProcessing: traditionalRecorder.isProcessing,
          startRecording: traditionalRecorder.startRecording,
          stopRecording: traditionalRecorder.stopRecording,
          requestMicrophonePermission:
            traditionalRecorder.requestMicrophonePermission,
          recorderState: traditionalRecorder.recorderState,
        };
  }, [
    useRealtimeAPI,
    isConnected,
    realtimeIsRecording,
    realtimeStartRecording,
    realtimeStopRecording,
    realtimeRequestPermission,
    traditionalRecorder.isReady,
    traditionalRecorder.isRecording,
    traditionalRecorder.isProcessing,
    traditionalRecorder.startRecording,
    traditionalRecorder.stopRecording,
    traditionalRecorder.requestMicrophonePermission,
    traditionalRecorder.recorderState,
  ]);

  const handleStopSession = async () => {
    console.log("Stopping session and returning to welcome screen");

    // Stop any ongoing recording
    if (currentRecorder.isRecording) {
      currentRecorder.stopRecording();
    }

    // Disconnect from realtime API if connected
    if (useRealtimeAPI && isConnected) {
      console.log("Disconnecting from realtime API");
      disconnect();
    }

    // Clean up camera/video resources
    if (realtimeAudio) {
      // For OpenAI connection
      if (modelType === 'openai' && realtimeAudio.openaiConnection?.mediaCapture) {
        try {
          await realtimeAudio.openaiConnection.mediaCapture.cleanup();
          console.log("✅ OpenAI media capture cleaned up");
        } catch (error) {
          console.error("❌ Error cleaning up OpenAI media capture:", error);
        }
      }

      // For Gemini connection
      if (modelType === 'gemini' && realtimeAudio.mediaManager) {
        try {
          await realtimeAudio.mediaManager.cleanup();
          console.log("✅ Gemini media capture cleaned up");
        } catch (error) {
          console.error("❌ Error cleaning up Gemini media capture:", error);
        }
      }
    }

    // Close conversation in database
    try {
      console.log("Closing conversation in database");
      const response = await fetch("/api/close-conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Conversation closed:", result);
      } else {
        console.error("Failed to close conversation:", response.statusText);
      }
    } catch (error) {
      console.error("Error closing conversation:", error);
    }

    // Exit fullscreen mode
    await exitFullscreen();

    // Reset all states
    setElephantState("idle");
    setSpeechText(undefined);
    setAppState("welcome");
    setCapturedFrame(null);
  };

  // Load AI settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem("appuAISettings");
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setAiSettings(parsed);
        console.log("Loaded AI settings:", parsed);
        console.log("AI Provider will be:", parsed.voiceMode === 'gemini' ? 'gemini' : 'openai');
      } catch (error) {
        console.error("Error loading AI settings:", error);
      }
    }
  }, []);

  // Handle fullscreen exit via ESC key
  useEffect(() => {
    const handleFullscreenChange = () => {
      // If user exits fullscreen manually (e.g., ESC key) while in interaction mode
      if (!document.fullscreenElement && appState === "interaction") {
        console.log("Fullscreen exited manually, stopping session");
        handleStopSession();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange,
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange,
      );
    };
  }, [appState, handleStopSession]);

  // Camera initialization will happen when conversation starts
  // No automatic camera initialization on page load
  // Add debug info to see what's happening
  const [debugMode, setDebugMode] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState<any[]>([]);

  // Storybook state
  const [currentBook, setCurrentBook] = useState<any>(null);
  const [currentStorybookPage, setCurrentStorybookPage] = useState<any>(null);
  const [isStorybookVisible, setIsStorybookVisible] = useState(false);

  // Auto-start recording when connected (only for realtime API)
  useEffect(() => {
    if (useRealtimeAPI && realtimeAudio.isConnected && appState === "interaction") {
      setTimeout(() => {
        setElephantState("speaking");
        setSpeechText("Hi there! I'm Appu. What would you like to talk about?");

        setTimeout(() => {
          setElephantState("idle");
          setTimeout(() => {
            setSpeechText(undefined);

            // Auto-restart recording after initial greeting
            if (
              realtimeAudio.isConnected &&
              appState === "interaction" &&
              !currentRecorder.isRecording &&
              !currentRecorder.isProcessing
            ) {
              console.log("Auto-restarting recording after initial greeting");
              currentRecorder.startRecording();
            }
          }, 1000);
        }, 3000);
      }, 1000);
    }
  }, [useRealtimeAPI, realtimeAudio.isConnected, appState]);

  useEffect(() => {
    if (currentRecorder.isRecording) {
      setElephantState("listening");
    }
  }, [currentRecorder.isRecording]);

  const handleStartButton = async () => {
    // Check if microphone permission is already granted
    try {
      const permission = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      if (permission.state === "granted") {
        // Permission already granted, proceed directly
        console.log("Microphone permission already granted");
        //await enterFullscreen();
        setAppState("interaction");

        if (useRealtimeAPI && !isConnected) {
          console.log("Connecting to realtime API");
          connect();
        }
      } else {
        // Need to request permission
        setPermissionModalOpen(true);
      }
    } catch (error) {
      // Fallback if permissions API is not supported
      console.log("Permissions API not supported, showing permission modal");
      setPermissionModalOpen(true);
    }
  };

  const handleAllowPermission = async () => {
    setPermissionModalOpen(false);
    const granted = await currentRecorder.requestMicrophonePermission();

    if (granted) {
      console.log("Microphone permission granted, starting interaction");

      // Enter fullscreen mode
      await enterFullscreen();

      setAppState("interaction");

      // Connect to realtime API only after permission is granted
      if (useRealtimeAPI && !isConnected) {
        console.log("Connecting to realtime API after permission granted");
        connect();
      }
    } else {
      console.error("Failed to get microphone permission");
      // Show error state for microphone permission issues
      setElephantState("error");
      setSpeechText(
        "I can't hear you! Please allow microphone access and try again.",
      );

      // Reset state after showing error
      setTimeout(() => {
        setElephantState("idle");
        setSpeechText(undefined);
      }, 4000);

      // You might want to show another dialog or message here
      // explaining how to enable microphone permissions
    }
  };

  const memoizedStartRecording = useCallback(() => {
    if (currentRecorder.startRecording) {
      currentRecorder.startRecording();
    }
  }, [currentRecorder]); // Now safe to depend on the whole memoized object

  // Start recording automatically when ready (only for realtime API after connection is established)
  useEffect(() => {
    if (
      useRealtimeAPI &&
      realtimeAudio.isConnected &&
      appState === "interaction" &&
      !currentRecorder.isRecording &&
      !currentRecorder.isProcessing
    ) {
      console.log(
        "Auto-starting realtime recording because connection is established",
      );
      memoizedStartRecording();
    }
  }, [
    useRealtimeAPI,
    realtimeAudio.isConnected,
    appState,
    currentRecorder.isRecording,
    currentRecorder.isProcessing,
    memoizedStartRecording,
  ]);

  // Restart recording after processing is complete
  useEffect(() => {
    // Only trigger when processing changes from true to false
    if (
      !currentRecorder.isProcessing &&
      currentRecorder.isReady &&
      appState === "interaction" &&
      elephantState !== "speaking"
    ) {
      // Small delay to ensure everything is reset properly
      const timer = setTimeout(() => {
        if (!currentRecorder.isRecording && !currentRecorder.isProcessing) {
          console.log("Restarting recording after processing completed");
          memoizedStartRecording();
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [
    currentRecorder.isProcessing,
    currentRecorder.isReady,
    appState,
    elephantState,
    currentRecorder.isRecording,
    memoizedStartRecording,
  ]);

  // Handle microphone button to stop current recording and trigger processing
  const handleMicrophoneButton = () => {
    if (currentRecorder.isRecording) {
      console.log("Stopping recording manually via microphone button");
      currentRecorder.stopRecording();

      // Add a small delay before processing
      setTimeout(() => {
        // Log current state after stopping
        console.log("Current state after stopping recording:", {
          isRecording: currentRecorder.isRecording,
          isProcessing: currentRecorder.isProcessing,
          elephantState,
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
      memoizedStartRecording();

      // Log current state after starting
      setTimeout(() => {
        console.log("Current state after starting recording:", {
          isRecording: currentRecorder.isRecording,
          isProcessing: currentRecorder.isProcessing,
          elephantState,
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

      // Send the text to the backend for processing using user's AI settings
      const response = await fetch("/api/process-with-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: directTextInput,
          aiConfig: aiSettings.defaultProvider,
          useCreative: aiSettings.creativeMode,
        }),
      });

      if (!response.ok) {
        // Parse the error response
        const errorData = await response.json();
        // Create an error object with the response data
        const error: any = new Error(
          errorData.error || "Failed to process text",
        );
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
          const audioBlob = base64ToBlob(audioData, "audio/wav");
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
          if (
            currentRecorder.isReady &&
            appState === "interaction" &&
            !currentRecorder.isRecording &&
            !currentRecorder.isProcessing
          ) {
            console.log(
              "Auto-restarting recording after processing text input response",
            );
            memoizedStartRecording();
          }
        }, 1000);
      }, 4000);
    } catch (error: any) {
      console.error("Error processing text:", error);

      // Check if it's an API error response with an error type
      if (
        error.response &&
        error.response.data &&
        error.response.data.errorType
      ) {
        // Set the elephant state based on the error type
        const errorType = error.response.data.errorType;
        if (errorType === "rateLimit") {
          setElephantState("rateLimit");
          setSpeechText(
            "I'm feeling a bit tired right now. Can we talk again in a little bit?",
          );
        } else if (errorType === "network") {
          setElephantState("network");
          setSpeechText(
            "I can't hear you very well. Please check your internet connection and try again.",
          );
        } else if (errorType === "auth") {
          setElephantState("auth");
          setSpeechText(
            "I need to take a quick break. Please try again later.",
          );
        } else if (errorType === "serviceUnavailable") {
          setElephantState("serviceUnavailable");
          setSpeechText(
            "I'm having trouble thinking right now. Can we try again soon?",
          );
        } else {
          setElephantState("error");
          setSpeechText("Oops! Something went wrong. Let's try again.");
        }
      } else {
        // Generic error handling
        setElephantState("error");
        setSpeechText("Oops! Something went wrong. Let's try again.");
      }

      // Reset to idle state after showing the error message
      setTimeout(() => {
        setElephantState("idle");

        // Small delay to allow state to update and animations to complete
        setTimeout(() => {
          setSpeechText(undefined);

          // Auto-restart recording after error message
            if (
              currentRecorder.isReady &&
              appState === "interaction" &&
              !currentRecorder.isRecording &&
              !currentRecorder.isProcessing
            ) {
              console.log("Auto-restarting recording after error message");
              memoizedStartRecording();
            }
        }, 1000);
      }, 4000);
    } finally {
      setIsProcessingText(false);
    }
  };

  const testBasicAPI = async () => {
    try {
      const response = await fetch('/api/hello');
      const data = await response.json();
      alert(`API Response: ${data.message}`);
    } catch (error) {
      console.error("API test failed:", error);
      alert("API test failed - check console");
    }
  };

  // Handle video permissions and initialization
  const handleStartConversation = useCallback(async () => {
    if (!selectedChildId) {
      console.error('Please select a child first');
      return;
    }

    try {
      // Camera will be initialized on-demand when AI needs to see something
      console.log('Conversation started - camera will initialize when needed');
    } catch (error) {
      console.error('Failed to start conversation:', error);
    }
  }, [selectedChildId, enableVideo, modelType, mediaManager]);

  const handleEndConversation = useCallback(async () => {
    try {
      // Cleanup camera when ending conversation
      if (enableVideo) {
        if (modelType === 'gemini') {
          mediaManager.cleanup();
          console.log('Gemini camera cleaned up');
        }
        // OpenAI camera cleanup is handled by the realtime connection
      }
    } catch (error) {
      console.error('Failed to end conversation:', error);
    }
  }, [enableVideo, modelType, mediaManager]);

  const handleNextPage = () => {
    console.log("Next page requested");
    // Implement logic to fetch the next page and update state
  };

  const handlePreviousPage = () => {
    console.log("Previous page requested");
    // Implement logic to fetch the previous page and update state
  };

  const handleCloseStorybook = () => {
    console.log("Closing storybook");
    setIsStorybookVisible(false);
    setCurrentStorybookPage(null);

    // Exit reading session to restore normal AI settings
    if (realtimeAudio?.openaiConnection?.exitReadingSession) {
      realtimeAudio.openaiConnection.exitReadingSession();
    }

    // Send a brief message to Appu that reading session ended
    if (realtimeAudio.isConnected) {
      // This will help Appu know to exit reading mode and optimize tokens
      console.log("Notifying AI that reading session ended");
    }
  };

  const handlePageNavigation = (direction: 'next' | 'previous') => {
    // You could send a message to Appu about the page change
    // This would let Appu know the user manually navigated and can respond accordingly
    console.log(`User manually navigated to ${direction} page`);

    // Optional: Send a message to the AI about the navigation
    // This could trigger Appu to read the new page or comment on it
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Header - Reduced padding for mobile */}
      <header className="flex justify-between items-center p-2 sm:p-4 bg-white bg-opacity-70 shadow-sm flex-shrink-0">
        <div className="flex items-center">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary flex items-center justify-center text-white mr-2">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="sm:w-6 sm:h-6"
            >
              <path
                d="M18 8C18 8 19 7 20 7C21 7 22 8 22 9C22 10 21 11 20 11C19 11 18 10 18 9"
                fill="white"
              />
              <path
                d="M6 8C6 8 5 7 4 7C3 7 2 8 2 9C2 10 3 11 4 11C5 11 6 10 6 9"
                fill="white"
              />
              <ellipse cx="12" cy="14" rx="8" ry="7" fill="white" />
              <circle cx="10" cy="12.5" r="0.75" fill="black" />
              <circle cx="14" cy="12.5" r="0.75" fill="black" />
              <path
                d="M11 15C11 15 12 16 13 15"
                stroke="black"
                strokeWidth="0.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="font-bold text-lg sm:text-xl text-primary">Appu</h1>
        </div>
        <div className="flex gap-1 sm:gap-2">
          <Link href="/audio-test">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Audio Test"
              className="p-1 sm:p-2"
            >
              <Speaker className="h-4 w-4 sm:h-5 sm:w-5 text-neutral" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button
              variant="ghost"size="sm"
              aria-label="Parent Dashboard"
              className="p-1 sm:p-2"
            >
              <User className="h-4 w-4 sm:h-5 sm:w-5 text-neutral" />
            </Button>
          </Link>
          <Link href="/memories">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Memory Console"
              className="p-1 sm:p-2"
            >
              <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-neutral" />
            </Button>
          </Link>
          <Link href="/settings">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Settings"
              className="p-1 sm:p-2"
            >
              <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-neutral" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Debug"
            onClick={() => setShowDebug(!showDebug)}
            className="p-1 sm:p-2"
          >
            <Bug className="h-4 w-4 sm:h-5 sm:w-5 text-neutral" />
          </Button>
        </div>
      </header>

      {/* Main Content - Optimized for mobile with Replit banner and fullscreen */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden relative min-h-0max-h-screen">
        {/* Decorative blobs in background */}
        <div className="absolute top-1/4 -left-20 w-40 h-40 blob opacity-20 z-0"></div>
        <div className="absolute bottom-1/3 -right-20 w-60 h-60 blob opacity-20 z-0"></div>

        <AnimatePresence mode="wait">
          {appState === "welcome" ? (
            <motion.div
              key="welcome"
              className="flex flex-col items-center justify-center space-y-2 sm:space-y-4 text-center max-w-lg p-2 sm:p-4 z-10 flex-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="font-bold text-xl sm:text-2xl text-primary">
                Meet Appu!
              </h2>
              <p className="text-neutral text-base sm:text-lg px-4">
                Your magical elephant friend who loves to talk and play with
                you!
              </p>

              <motion.div
                className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 my-2 sm:my-4"
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <svg
                  viewBox="0 0 512 512"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M388 160C388 160 408 140 428 140C448 140 468 160 468 180C468 200 448 220 428 220C408 220 388 200 388 180"
                    fill="#9D78C9"
                  />
                  <path
                    d="M124 160C124 160 104 140 84 140C64 140 44 160 44 180C44 200 64 220 84 220C104 220 124 200 124 180"
                    fill="#9D78C9"
                  />
                  <ellipse cx="256" cy="280" rx="160" ry="140" fill="#9D78C9" />
                  <circle cx="216" cy="250" r="15" fill="white" />
                  <circle cx="217" cy="250" r="5" fill="black" />
                  <circle cx="296" cy="250" r="15" fill="white" />
                  <circle cx="297" cy="250" r="5" fill="black" />
                  <path
                    d="M236 300C236 300 256 320 276 300"
                    stroke="black"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <path
                    d="M256 330C256 330 256 380 216 400"
                    stroke="#9D78C9"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  <path
                    d="M243 370H269"
                    stroke="black"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </motion.div>

              {isParentLoggedIn ? (
                selectedChildId ? (
                  <div className="flex flex-col items-center space-y-4">                    {/* Child selection dropdown */}
                    <div className="flex flex-col items-center space-y-2">
                      <p className="text-sm text-neutral">
                        Select a child to talk with Appu:
                      </p>
                      <select
                        value={selectedChildId || ""}
                        onChange={(e) => {
                          const childId = e.target.value;
                          setSelectedChildId(childId);
                          localStorage.setItem("selectedChildId", childId);
                        }}
                        className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-neutral"
                      >
                        {availableChildren.map((child) => (
                          <option key={child.id} value={child.id}>
                            {child.name} (Age {child.age})
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button
                      className="bg-secondary hover:bg-yellow-400 text-black font-bold py-3 px-6 sm:py-4 sm:px-8 rounded-full text-lg sm:text-xl shadow-lg transition transform hover:scale-105 active:scale-95"
                      onClick={handleStartButton}
                    >
                      Let's Talk to Appu!
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-2">
                    <p className="text-sm text-neutral text-center">
                      Loading children...
                    </p>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                )
              ) : (
                <Link href="/dashboard">
                  <Button className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 sm:py-4 sm:px-8 rounded-full text-lg sm:text-xl shadow-lg transition transform hover:scale-105 active:scale-95 mt-2 sm:mt-4">
                    Parent Login
                  </Button>
                </Link>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="interaction"
              className="w-full h-full flex flex-col items-center justify-center space-y-4 z-10 max-w-xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
            >
              {/* Video displays section - positioned at top when enabled */}
              {enableVideo && realtimeAudio && (
                (modelType === 'openai' && realtimeAudio.openaiConnection?.mediaCapture && 
                 (realtimeAudio.openaiConnection.mediaCapture.hasVideoPermission || realtimeAudio.openaiConnection.lastCapturedFrame)) ||
                (modelType === 'gemini' && realtimeAudio.mediaManager && 
                 (realtimeAudio.mediaManager.hasVideoPermission || realtimeAudio.lastCapturedFrame))
              ) && (
                <motion.div
                  className="w-full flex flex-col sm:flex-row justify-center space-y-2 sm:space-y-0 sm:space-x-2 mb-2"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Live video feed - For OpenAI connection */}
                  {modelType === 'openai' && 
                   realtimeAudio.openaiConnection?.mediaCapture?.hasVideoPermission && 
                   realtimeAudio.openaiConnection.mediaCapture.videoElement && (
                    <div className="flex flex-col items-center space-y-2">
                      <p className="text-xs text-neutral font-medium">Live Camera</p>
                      <VideoDisplay 
                        videoElement={realtimeAudio.openaiConnection.mediaCapture.videoElement}
                        isEnabled={enableVideo && realtimeAudio.openaiConnection.mediaCapture.hasVideoPermission}
                        className="w-28 h-20 sm:w-32 sm:h-24 rounded-lg shadow-md border border-gray-200"
                      />

                    </div>
                  )}

                  {/* Live video feed - For Gemini connection */}
                  {modelType === 'gemini' && 
                   mediaManager.hasVideoPermission && 
                   mediaManager.videoElement && (
                    <div className="flex flex-col items-center space-y-2">
                      <p className="text-xs text-neutral font-medium">Live Camera</p>
                      <VideoDisplay 
                        videoElement={mediaManager.videoElement}
                        isEnabled={enableVideo && mediaManager.hasVideoPermission}
                        className="w-28 h-20 sm:w-32 sm:h-24 rounded-lg shadow-md border border-gray-200"
                      />

                    </div>
                  )}

                  {/* Captured frame when available - OpenAI */}
                  {(
                    (modelType === 'openai' && realtimeAudio.openaiConnection?.lastCapturedFrame) ||
                    (modelType === 'gemini' && realtimeAudio.lastCapturedFrame)
                  ) && (
                    <div className="flex flex-col items-center space-y-1">
                      <p className="text-xs text-neutral font-medium">Captured Frame</p>
                      <CapturedFrameDisplay 
                        frameData={
                          modelType === 'openai' 
                            ? realtimeAudio.openaiConnection?.lastCapturedFrame || ''
                            : realtimeAudio.lastCapturedFrame || ''
                        }
                        className="w-28 h-20 sm:w-32 sm:h-24 rounded-lg shadow-md border border-blue-200"
                      />
                    </div>
                  )}
                </motion.div>
              )}

              <div className="flex-1 flex items-center justify-center w-full min-h-0">
                <Elephant state={elephantState} speechText={speechText} />
              </div>

              <div className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white bg-opacity-80 rounded-t-3xl shadow-lg flex-shrink-0 max-h-40">
                <div className="flex flex-col items-center space-y-2 sm:space-y-3">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <p className="text-primary font-medium text-base sm:text-lg text-center px-2">
                      {currentRecorder.isProcessing
                        ? "Appu is thinking..."
                        : elephantState === "speaking"
                          ? "Appu is speaking..."
                          : currentRecorder.isRecording
                            ? "Appu is listening..."
                            : "Appu is getting ready to listen..."}
                    </p>

                    {/* Eye Toggle Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEnableVideo(!enableVideo)}
                      className={`p-2 rounded-full transition-colors ${
                        enableVideo 
                          ? 'bg-blue-100 hover:bg-blue-200 text-blue-600' 
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                      }`}
                      title={enableVideo ? 'Disable Appu\'s eyes' : 'Enable Appu\'s eyes'}
                    >
                      {enableVideo ? (
                        <Eye className="w-5 h-5" />
                      ) : (
                        <EyeOff className="w-5 h-5" />
                      )}
                    </Button>
                  </div>

                  {/* Video status indicator when enabled */}
                  {enableVideo && realtimeAudio && (
                    <div className="flex items-center space-x-2 text-xs text-neutral">
                      <div className={`w-2 h-2 rounded-full ${
                        (modelType === 'openai' && realtimeAudio.openaiConnection?.mediaCapture?.hasVideoPermission) ||
                        (modelType === 'gemini' && mediaManager.hasVideoPermission)
                          ? 'bg-green-500' : 'bg-gray-400'
                      }`}></div>
                      <span>{
                        (modelType === 'openai' && realtimeAudio.openaiConnection?.mediaCapture?.hasVideoPermission) ||
                        (modelType === 'gemini' && mediaManager.hasVideoPermission)
                          ? 'Camera ready' : 'Camera not ready'
                      }</span>
                    </div>
                  )}

                  {currentRecorder.isProcessing ? (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full shadow-lg bg-yellow-400 flex items-center justify-center animate-pulse">
                      <svg
                        className="w-6 h-6 sm:w-8 sm:h-8 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Audio level indicator rings - visible when recording */}
                      {currentRecorder.isRecording && (
                        <>
                          <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-400 opacity-20 animate-ping-slow"></div>
                          <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-300 opacity-10 animate-ping"></div>
                        </>
                      )}

                      <Button
                        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full shadow-lg transition transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-pink-300 relative z-10 ${
                          currentRecorder.isRecording
                            ? "bg-[hsl(var(--success))] hover:bg-green-600"
                            : "bg-accent hover:bg-pink-400"
                        }`}
                        onClick={handleMicrophoneButton}
                        disabled={
                          !currentRecorder.isReady ||
                          currentRecorder.isProcessing
                        }
                      >
                        {currentRecorder.isRecording ? (
                          <div className="relative">
                            <svg
                              className="w-8 h-8 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m-9 9a9 9 0 019-9"
                              />
                            </svg>
                            {/* Recording indicator pulse */}
                            <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                          </div>
                        ) : (
                          <svg
                            className="w-8 h-8 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                            />
                          </svg>
                        )}
                      </Button>
                    </div>
                  )}

                  <p className="text-neutral text-xs sm:text-sm text-center px-2">
                    {currentRecorder.isProcessing
                      ? "Please wait while Appu thinks..."
                      : currentRecorder.isRecording
                        ? enableVideo && realtimeAudio && (
                            (modelType === 'openai' && realtimeAudio.openaiConnection?.mediaCapture?.hasVideoPermission) ||
                            (modelType === 'gemini' && mediaManager.hasVideoPermission)
                          )
                          ? "Appu is listening and watching! Tap when you're done talking"
                          : "Appu is listening to you now! Tap when you're done talking"
                        : "Tap to start talking with Appu!"}
                  </p>

                  {/* Stop/Cancel Button */}
                  <Button
                    className="mt-1 sm:mt-2 bg-red-500 hover:bg-red-600 text-white font-medium py-1.5 px-3 sm:py-2 sm:px-4 rounded-full text-xs sm:text-sm shadow-md transition transform hover:scale-105 active:scale-95"
                    onClick={handleStopSession}
                    variant="default"
                  >
                    Stop Talking
                  </Button>
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
              <p>
                <span className="font-semibold">State:</span> {elephantState}
              </p>
              <p>
                <span className="font-semibold">Recording:</span>{" "}
                {currentRecorder.isRecording ? "Yes" : "No"}
              </p>
              <p>
                <span className="font-semibold">Processing:</span>{" "}
                {currentRecorder.isProcessing || isProcessingText
                  ? "Yes"
                  : "No"}
              </p>

              <div className="mt-3">
                <p>
                  <span className="font-semibold">Direct Text Input:</span>
                </p>
                <div className="flex items-center mt-1">
                  <input
                    type="text"
                    value={directTextInput}
                    onChange={(e) => setDirectTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        processDirectTextInput();
                      }
                    }}
                    placeholder="Type here instead of speaking..."
                    className="flex-grow p-2 rounded bg-gray-700 text-white mr-2"
                    disabled={isProcessingText || currentRecorder.isProcessing}
                  />
                  <Button
                    onClick={processDirectTextInput}
                    disabled={
                      isProcessingText ||
                      currentRecorder.isProcessing ||
                      !directTextInput.trim()
                    }
                    className="bg-primary hover:bg-primary-dark px-3 py-1.5 rounded"
                  >
                    {isProcessingText ? "Processing..." : "Send"}
                  </Button>
                </div>



                <div className="mt-3">
                  <p>
                    <span className="font-semibold">Recording Method:</span>
                  </p>
                  <div className="flex items-center mt-1 gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={!useRealtimeAPI}
                        onChange={() => setUseRealtimeAPI(false)}
                        className="text-primary"
                        disabled
                      />
                      <span className="text-sm text-gray-400">
                        Traditional (Disabled)
                      </span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={useRealtimeAPI}
                        onChange={() => setUseRealtimeAPI(true)}
                        className="text-primary"
                      />
                      <span className="text-sm">
                        Realtime API (WebRTC) - Default
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p>
                <span className="font-semibold">Transcribed:</span>
              </p>
              <p className="bg-gray-700 p-2 rounded">
                {transcribedText || "(Nothing yet)"}
              </p>
              <p className="mt-2">
                <span className="font-semibold">Response:</span>
              </p>
              <p className="bg-gray-700 p-2 rounded">
                {speechText || "(Nothing yet)"}
              </p>

              <div className="mt-3">
                <p>
                  <span className="font-semibold">Audio Debug:</span>
                </p>
                <div className="mt-1 flex flex-col gap-2">
                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Mic State:</span>
                    <div
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        currentRecorder.isRecording
                          ? "bg-green-600"
                          : "bg-gray-600"
                      }`}
                    >
                      {currentRecorder.isRecording
                        ? "Recording"
                        : "Not Recording"}
                    </div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Recorder:</span>
                    <div
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        currentRecorder.recorderState === "recording"
                          ? "bg-green-600"
                          : currentRecorder.recorderState === "paused"
                            ? "bg-yellow-600"
                            : currentRecorder.recorderState === "error"
                              ? "bg-red-600"
                              : "bg-gray-600"
                      }`}
                    >
                      {currentRecorder.recorderState}
                    </div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Processing:</span>
                    <div
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        currentRecorder.isProcessing
                          ? "bg-yellow-600"
                          : "bg-gray-600"
                      }`}
                    >
                      {currentRecorder.isProcessing
                        ? "Processing"
                        : "Not Processing"}
                    </div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Elephant:</span>
                    <div
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        elephantState === "idle"
                          ? "bg-blue-600"
                          : elephantState === "listening"
                            ? "bg-green-600"
                            : elephantState === "thinking"
                              ? "bg-yellow-600"
                              : elephantState === "speaking"
                                ? "bg-purple-600"
                                : "bg-red-600"
                      }`}
                    >
                      {elephantState}
                    </div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <span className="text-xs">Local Playback:</span>
                    <div
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        enableLocalPlayback ? "bg-green-600" : "bg-gray-600"
                      }`}
                    >
                      {enableLocalPlayback ? "Enabled" : "Disabled"}
                    </div>
                  </div>

                  <div className="flex flex-row gap-2 mt-2">
                    <Button
                      onClick={() => currentRecorder.startRecording()}
                      disabled={
                        currentRecorder.isRecording ||
                        currentRecorder.isProcessing
                      }
                      className="bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded text-sm"
                    >
                      Force Start Mic
                    </Button>

                    <Button
                      onClick={() => currentRecorder.stopRecording()}
                      disabled={
                        !currentRecorder.isRecording ||
                        currentRecorder.isProcessing
                      }
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
                        fetch("/api/process-text", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ text: "test" }),
                        })
                          .then((res) => res.json())
                          .then((data) => {
                            console.log("Test API response:", data);
                            alert("API test successful - check console");
                          })
                          .catch((err) => {
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
                      <div
                        className={`w-3 h-3 rounded-full ${enableLocalPlayback ? "bg-green-500" : "bg-red-500"}`}
                      ></div>
                      <span className="text-sm">Local Audio Playback:</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs mr-2">
                        {enableLocalPlayback ? "Enabled" : "Disabled"}
                      </span>
                      <Button
                        onClick={() =>
                          setEnableLocalPlayback(!enableLocalPlayback)
                        }
                        className={`px-3 py-1 rounded text-xs ${
                          enableLocalPlayback
                            ? "bg-green-700 hover:bg-green-800"
                            : "bg-gray-500 hover:bg-gray-600"
                        }`}
                      >
                        {enableLocalPlayback ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </div>


                </div>
              </div>
            </div>
            <div>
                <p>
                  <span className="font-semibold">Video Feed:</span>
                </p>
                <VideoDisplay enabled={enableVideo} />
                <p className="mt-2">
                  <span className="font-semibold">Captured Frame:</span>
                </p>
                {/* Pass the capturedFrame to the CapturedFrameDisplay component */}
                 <CapturedFrameDisplay frameData={capturedFrame} />
              </div>
          </div>
        </div>
      )}

      {/* Storybook Display */}
      {isStorybookVisible && (
        <StorybookDisplay
          currentPage={currentStorybookPage}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
          onClose={handleCloseStorybook}
          isVisible={isStorybookVisible}
          onPageNavigation={handlePageNavigation}
          autoPageTurnEnabled={autoPageTurnEnabled}
          isAppuSpeaking={isAppuSpeaking}
          isUserSpeaking={isUserSpeaking}
          openaiConnection={realtimeAudio?.openaiConnection}
        />
      )}
    </div>
  );
});

export default Home;