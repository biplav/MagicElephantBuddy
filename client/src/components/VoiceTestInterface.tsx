import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStableRealtimeAudio } from '@/hooks/useStableRealtimeAudio';
import { useServiceManager } from '@/context/ServiceManagerContext';
import { useBookStateManager } from '@/hooks/useBookStateManager';

export function VoiceTestInterface() {
  const { workflowStateMachine, mediaManager, openaiEventTranslator } = useServiceManager();
  const { selectedBook, handleBookSearch, handleDisplayBookPage } = useBookStateManager();
  const [currentPage, setCurrentPage] = useState<any>(null);

  // Storybook page display callback
  const handleStorybookPageDisplay = useCallback((pageData: any) => {
    console.log("📖 Voice test: Displaying storybook page", pageData);
    setCurrentPage(pageData);
  }, []);

  // Create stable book manager for voice interface
  const bookManager = {
    handleStorybookPageDisplay: (pageData: any) => {
      handleStorybookPageDisplay(pageData);
    },
    handleFunctionCall: (callId: string, result: any) => {
      console.log("📖 Voice test: Function call", { callId, result });
    },
    state: { bookState: 'IDLE' },
    dispatch: () => {},
    transitionToState: () => {},
    handleBookSearchTool: (callId: string, args: any) => handleBookSearch(callId, args),
    handleDisplayBookPage: (callId: string, args: any) => handleDisplayBookPage(callId, args, handleStorybookPageDisplay)
  };

  // Initialize voice functionality
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
    workflowStateMachine,
    bookManager,
    mediaManager,
    openaiEventTranslator
  });

  const handleConnect = useCallback(async () => {
    try {
      console.log("🎤 Voice test: Connecting...");
      await connect();
    } catch (error) {
      console.error("Voice test: Connection failed:", error);
    }
  }, [connect]);

  const handleDisconnect = useCallback(async () => {
    try {
      console.log("🛑 Voice test: Disconnecting...");
      await disconnect();
    } catch (error) {
      console.error("Voice test: Disconnect failed:", error);
    }
  }, [disconnect]);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Voice Interface Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        <div className="bg-gray-100 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">Voice Connection Status:</h3>
          <div className="text-sm space-y-1">
            <div>Connected: {isConnected ? "🟢 Yes" : "🔴 No"}</div>
            <div>Recording: {isRecording ? "🎤 Active" : "⏸️ Inactive"}</div>
            <div>Muted: {isMuted ? "🔇 Yes" : "🔊 No"}</div>
          </div>
        </div>

        {/* Voice Controls */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={handleConnect} 
            disabled={isConnected}
            className="bg-green-500 hover:bg-green-600"
          >
            Connect Voice
          </Button>
          <Button 
            onClick={handleDisconnect} 
            disabled={!isConnected}
            variant="destructive"
          >
            Disconnect
          </Button>
          <Button 
            onClick={toggleMute} 
            disabled={!isConnected}
            variant="outline"
          >
            {isMuted ? "Unmute" : "Mute"}
          </Button>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">How to Test:</h3>
          <ol className="text-sm space-y-1 list-decimal list-inside">
            <li>Click "Connect Voice" to establish WebRTC connection</li>
            <li>Once connected, speak to Appu</li>
            <li>Try saying: "Can you show me a story about Hanuman?"</li>
            <li>Watch the book state update in the test interface above</li>
            <li>Try: "Show me the first page" after a book is selected</li>
          </ol>
        </div>

        {/* Current Book State */}
        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">Current Book State:</h3>
          <div className="text-sm">
            {selectedBook ? (
              <>
                <div>📚 {selectedBook.title}</div>
                <div>👤 {selectedBook.author}</div>
                <div>📄 {selectedBook.totalPages} pages</div>
              </>
            ) : (
              <div>No book selected - try asking for a story!</div>
            )}
          </div>
        </div>

        {/* Current Page Display */}
        {currentPage && (
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Current Page:</h3>
            <div className="text-sm space-y-2">
              <div><strong>Title:</strong> {currentPage.bookTitle}</div>
              <div><strong>Page:</strong> {currentPage.pageNumber}</div>
              {currentPage.pageImageUrl && (
                <img 
                  src={currentPage.pageImageUrl} 
                  alt={`Page ${currentPage.pageNumber}`}
                  className="max-w-48 rounded border"
                />
              )}
              <div><strong>Text:</strong> {currentPage.pageText}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}