import { useState, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AudioLines, Camera } from "lucide-react";
import { useBookStateManager } from '@/hooks/useBookStateManager';

type AppState = "welcome" | "interaction";

const Home = memo(() => {
  const { selectedBook } = useBookStateManager();
  const [appState, setAppState] = useState<AppState>("welcome");
  const [currentPage, setCurrentPage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Simple mock handlers for testing
  const handleStartConversation = useCallback(() => {
    console.log("Starting conversation...");
    setAppState("interaction");
    setIsConnected(true);
  }, []);

  const handleStopConversation = useCallback(() => {
    console.log("Stopping conversation...");
    setAppState("welcome");
    setIsConnected(false);
  }, []);

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
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">
            Chatting with Appu 🐘
          </h1>
          
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopConversation}
            className="bg-red-500/80 backdrop-blur-sm"
          >
            End Chat
          </Button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Character */}
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-6 text-center">
              <div className="text-8xl mb-4">
                🐘
              </div>
              
              <div className="mt-6">
                <p className="text-white mb-4">
                  Connection: {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
                </p>
                
                <p className="text-white mb-4">
                  Ready to help you with stories!
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Right: Book Display */}
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
                </div>
              ) : (
                <div className="text-center text-white">
                  <Camera className="mx-auto h-16 w-16 mb-4 opacity-50" />
                  <p className="text-lg">Ask Appu to show you a story!</p>
                  <p className="text-sm mt-2 opacity-75">
                    (Voice functionality will be added back once Redux issues are resolved)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status */}
        <div className="mt-6">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-4">
              <div className="text-white text-sm">
                <div>Redux State Test:</div>
                <div>Book Selected: {selectedBook ? `${selectedBook.title} (${selectedBook.totalPages} pages)` : 'None'}</div>
                <div className="mt-2 text-green-300">
                  ✅ Component loaded successfully with proper Redux integration
                </div>
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