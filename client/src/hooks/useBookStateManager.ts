
import { useRef, useCallback } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface BookStateManagerOptions {
  onStorybookPageDisplay?: (pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
  }) => void;
}

export function useBookStateManager(options: BookStateManagerOptions = {}) {
  const logger = createServiceLogger('book-state-manager');

  // Book tracking refs
  const selectedBookRef = useRef<any>(null);
  const currentPageRef = useRef<number>(1);

  // Reading session optimization refs
  const isInReadingSessionRef = useRef<boolean>(false);
  const readingSessionMessagesRef = useRef<any[]>([]);

  // Helper method to send function call output
  const sendFunctionCallOutput = useCallback((callId: string, result: any, dataChannel: RTCDataChannel | null) => {
    if (!dataChannel) {
      logger.warn('No data channel available for function call output', { callId });
      return;
    }

    const response = JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: result,
      },
    });
    
    logger.info("Sending function call output", { callId, response });
    dataChannel.send(response);
  }, [logger]);

  // Helper function to manage reading session state
  const enterReadingSession = useCallback((dataChannel: RTCDataChannel | null) => {
    if (!isInReadingSessionRef.current) {
      logger.info("Entering optimized reading session mode");
      isInReadingSessionRef.current = true;

      // Send optimized session update for reading
      dataChannel?.send(JSON.stringify({
        type: "session.update",
        session: {
          max_response_output_tokens: 250, // Shorter responses during reading
          temperature: 0.6, // Slightly more consistent for storytelling
        }
      }));
    }
  }, [logger]);

  const exitReadingSession = useCallback((dataChannel: RTCDataChannel | null) => {
    if (isInReadingSessionRef.current) {
      logger.info("Exiting reading session mode");
      isInReadingSessionRef.current = false;
      selectedBookRef.current = null;
      currentPageRef.current = 1;

      // Restore normal session settings
      dataChannel?.send(JSON.stringify({
        type: "session.update",
        session: {
          max_response_output_tokens: 300,
          temperature: 0.8,
        }
      }));
    }
  }, [logger]);

  const handleBookSearchTool = useCallback(async (callId: string, args: any, dataChannel: RTCDataChannel | null) => {
    logger.info("bookSearchTool was called!", { callId, args });

    const argsJson = JSON.parse(args);
    logger.info("Parsed JSON arguments", { callId, argsJson });

    try {
      const searchResponse = await fetch('/api/books/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: argsJson.query }),
      });

      if (!searchResponse.ok) {
        throw new Error(`Book search failed: ${searchResponse.status}`);
      }

      const searchResults = await searchResponse.json();
      logger.info("Book search results", { results: searchResults });

      // Send search results back to OpenAI
      sendFunctionCallOutput(callId, JSON.stringify(searchResults), dataChannel);

      // Trigger model response after function call
      dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));
      
    } catch (error: any) {
      logger.error("Error in book search", { error: error.message });
      
      sendFunctionCallOutput(
        callId,
        "I'm having trouble searching for books right now. Please try again later.",
        dataChannel
      );

      // Trigger model response after error
      dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));
    }
  }, [sendFunctionCallOutput, logger]);

  const handleDisplayBookPage = useCallback(async (callId: string, args: any, dataChannel: RTCDataChannel | null) => {
    logger.info("display_book_page was called!", { callId, args });

    const argsJson = JSON.parse(args);
    logger.info("Parsed display book page arguments", { callId, argsJson });

    try {
      const { bookId, pageNumber } = argsJson;
      
      // Fetch page data from API
      const pageResponse = await fetch(`/api/books/${bookId}/pages/${pageNumber}`);
      
      if (!pageResponse.ok) {
        throw new Error(`Failed to fetch page: ${pageResponse.status}`);
      }

      const pageData = await pageResponse.json();
      logger.info("Fetched page data", { pageData });

      // Update book state
      selectedBookRef.current = { id: bookId };
      currentPageRef.current = pageNumber;

      // Enter reading session mode
      enterReadingSession(dataChannel);

      // Call the storybook display callback
      if (options.onStorybookPageDisplay) {
        options.onStorybookPageDisplay({
          pageImageUrl: pageData.pageImageUrl,
          pageText: pageData.pageText,
          pageNumber: pageData.pageNumber,
          totalPages: pageData.totalPages,
          bookTitle: pageData.bookTitle,
        });
      }

      // Send success response
      sendFunctionCallOutput(
        callId,
        `Successfully displayed page ${pageNumber} of "${pageData.bookTitle}"`,
        dataChannel
      );

      // Trigger model response
      dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));

    } catch (error: any) {
      logger.error("Error displaying book page", { error: error.message });
      
      sendFunctionCallOutput(
        callId,
        "I'm having trouble displaying that book page right now. Please try again.",
        dataChannel
      );

      dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));
    }
  }, [sendFunctionCallOutput, enterReadingSession, options.onStorybookPageDisplay, logger]);

  const optimizeTokenUsage = useCallback(() => {
    if (isInReadingSessionRef.current) {
      // Archive older messages during reading sessions to save tokens
      const maxMessages = 10;
      if (readingSessionMessagesRef.current.length > maxMessages) {
        const messagesToArchive = readingSessionMessagesRef.current.splice(0, 
          readingSessionMessagesRef.current.length - maxMessages
        );
        logger.info("Archived reading session messages for token optimization", {
          archivedCount: messagesToArchive.length,
          remainingCount: readingSessionMessagesRef.current.length
        });
      }
    }
  }, [logger]);

  return {
    // State refs (for external access if needed)
    selectedBookRef,
    currentPageRef,
    isInReadingSessionRef,
    
    // Methods
    handleBookSearchTool,
    handleDisplayBookPage,
    enterReadingSession,
    exitReadingSession,
    optimizeTokenUsage,
  };
}
