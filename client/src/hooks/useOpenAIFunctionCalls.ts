import { useRef, useCallback, useMemo } from 'react';
import { createServiceLogger } from '@/lib/logger';

interface OpenAIFunctionCallsOptions {
  dataChannel?: RTCDataChannel | null;
  onStorybookPageDisplay?: (pageData: {
    pageImageUrl: string;
    pageText: string;
    pageNumber: number;
    totalPages: number;
    bookTitle: string;
  }) => void;
  enableVideo?: boolean;
  hasVideoPermission?: boolean;
  requestMediaPermissions?: () => Promise<MediaStream>;
  captureFrame?: () => string | null;
  childId?: string;
}

export function useOpenAIFunctionCalls(options: OpenAIFunctionCallsOptions = {}) {
  const logger = useMemo(() => createServiceLogger('openai-function-calls'), []);

  // Book tracking refs
  const selectedBookRef = useRef<any>(null);
  const currentPageRef = useRef<number>(1);
  const conversationIdRef = useRef<string | null>(null);

  // Reading session optimization refs
  const isInReadingSessionRef = useRef<boolean>(false);
  const readingSessionMessagesRef = useRef<any[]>([]);

  // Helper method to send function call output
  const sendFunctionCallOutput = useCallback((callId: string, result: any) => {
    if (!options.dataChannel) {
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
    options.dataChannel.send(response);
  }, [options.dataChannel, logger]);

  // Helper function to manage reading session state
  const enterReadingSession = useCallback(() => {
    if (!isInReadingSessionRef.current) {
      logger.info("Entering optimized reading session mode");
      isInReadingSessionRef.current = true;

      // Send optimized session update for reading
      options.dataChannel?.send(JSON.stringify({
        type: "session.update",
        session: {
          max_response_output_tokens: 250, // Shorter responses during reading
          temperature: 0.6, // Slightly more consistent for storytelling
        }
      }));
    }
  }, [options.dataChannel, logger]);

  const exitReadingSession = useCallback(() => {
    if (isInReadingSessionRef.current) {
      logger.info("Exiting reading session mode");
      isInReadingSessionRef.current = false;
      selectedBookRef.current = null;
      currentPageRef.current = 1;

      // Restore normal session settings
      options.dataChannel?.send(JSON.stringify({
        type: "session.update",
        session: {
          max_response_output_tokens: 300,
          temperature: 0.8,
        }
      }));
    }
  }, [options.dataChannel, logger]);

  const handleBookSearchTool = useCallback(async (callId: string, args: any) => {
    logger.info("bookSearchTool was called!", { callId, args });

    const argsJson = JSON.parse(args);
    logger.info("Parsed JSON arguments", { callId, argsJson });

    try {
      // Search for books
      const searchBody = {
        context: argsJson.context,
        bookTitle: argsJson.bookTitle,
        keywords: argsJson.keywords,
        ageRange: argsJson.ageRange
      };

      const response = await fetch('/api/books/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchBody),
      });

      if (!response.ok) {
        throw new Error(`Book search failed: ${response.status}`);
      }

      const searchResults = await response.json();
      logger.info("Book search completed", { 
        resultsCount: searchResults.books?.length || 0,
        searchParams: args 
      });

      let resultMessage: string;

      if (searchResults.books?.length > 0) {
        // Store the first book for later display
        selectedBookRef.current = searchResults.books[0];
        currentPageRef.current = 1;

        // Enter reading session mode for token optimization
        enterReadingSession();

        logger.info("Stored book for display", { 
          bookTitle: selectedBookRef.current.title,
          totalPages: selectedBookRef.current.pages?.length || selectedBookRef.current.totalPages
        });

        // Optimized response - shorter and more direct
        if (searchResults.books.length === 1) {
          resultMessage = `Found "${selectedBookRef.current.title}"! Ready to read it to you. Should I start?`;
        } else {
          resultMessage = `Found ${searchResults.books.length} books! Selected "${selectedBookRef.current.title}". Should I start reading?`;
        }
      } else {
        resultMessage = `No books found. Let me suggest something else!`;
        selectedBookRef.current = null;
      }

      sendFunctionCallOutput(callId, resultMessage);

      // Trigger model response
      options.dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));

    } catch (error: any) {
      logger.error("Error handling bookSearchTool", {
        error: error.message,
        args
      });

      sendFunctionCallOutput(
        callId,
        "I'm having trouble searching for books right now. Can you try asking for a story in a different way?"
      );

      // Trigger model response after error
      options.dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));
    }
  }, [sendFunctionCallOutput, enterReadingSession, logger, options.dataChannel]);

  const handleDisplayBookPage = useCallback(async (callId: string, args: any) => {
    logger.info("display_book_page was called!", { callId, args });

    try {
      // Check if we have a stored book
      if (!selectedBookRef.current) {
        sendFunctionCallOutput(
          callId,
          "I need to search for a book first before I can display pages. What kind of story would you like to read?"
        );

        options.dataChannel?.send(JSON.stringify({
          type: 'response.create'
        }));
        return;
      }

      // Parse the page request (could be "first", "next", "previous", or a number)
      let targetPageNumber = currentPageRef.current;
      if(!args.pageRequest) args = JSON.parse(args);
      if (args.pageRequest) {
        const request = args.pageRequest.toLowerCase();
        if (request === 'first' || request === 'start') {
          targetPageNumber = 1;
        } else if (request === 'next') {
          targetPageNumber = Math.min(currentPageRef.current + 1, selectedBookRef.current.pages?.length || selectedBookRef.current.totalPages);
        } else if (request === 'previous' || request === 'back') {
          targetPageNumber = Math.max(currentPageRef.current - 1, 1);
        } else if (!isNaN(parseInt(request))) {
          targetPageNumber = Math.max(1, Math.min(parseInt(request), selectedBookRef.current.pages?.length || selectedBookRef.current.totalPages));
        }
      }

      // Get the page data from stored book
      const pages = selectedBookRef.current.pages || [];
      const targetPage = pages.find((p: any) => p.pageNumber === targetPageNumber);

      if (!targetPage) {
        // If page data not found in stored book, try to fetch from API
        logger.warn("Page not found in stored book, attempting API fetch", {
          targetPageNumber,
          bookId: selectedBookRef.current?.id,
          availablePages: selectedBookRef.current?.pages?.length || 0
        });

        // Check if we have a valid book ID before making API call
        if (!selectedBookRef.current?.id) {
          logger.error("No book ID available for API fetch");
          sendFunctionCallOutput(
            callId,
            "I need to search for a book first before I can display pages. What kind of story would you like to read?"
          );

          options.dataChannel?.send(JSON.stringify({
            type: 'response.create'
          }));
          return;
        }

        try {
          const response = await fetch(`/api/books/${selectedBookRef.current.id}/page/${targetPageNumber}`);
          if (response.ok) {
            const pageData = await response.json();
            if (pageData.success && pageData.page) {
              const apiPage = pageData.page;

              // Update current page and display the page
              currentPageRef.current = targetPageNumber;

              if (options.onStorybookPageDisplay) {
                options.onStorybookPageDisplay({
                  pageImageUrl: apiPage.pageImageUrl,
                  pageText: apiPage.pageText,
                  pageNumber: apiPage.pageNumber,
                  totalPages: apiPage.totalPages,
                  bookTitle: apiPage.bookTitle,
                });
              }

              // Send context to Appu with appropriate language instruction
              const isFirstPage = targetPageNumber === 1;
              const isLastPage = targetPageNumber === (apiPage.totalPages || selectedBookRef.current.totalPages);

              let pageContext: string;
              if (isFirstPage) {
                pageContext = `Page 1 displayed. Read this story in Hinglish (mix of Hindi and English) to make it engaging for the child. Page text: "${apiPage.pageText}" - Use simple Hindi words mixed with English, add expressions like "dekho", "kya baat hai", "wah", and make it playful and interactive.`;
              } else if (isLastPage) {
                pageContext = `Final page displayed. Read in Hinglish: "${apiPage.pageText}" Then say "Bas! Kahani khatam! The End! Kya maza aaya na?"`;
              } else {
                pageContext = `Page ${targetPageNumber} displayed. Continue reading in Hinglish (Hindi-English mix): "${apiPage.pageText}" - Keep it engaging with expressions like "aur phir", "dekho kya hua", "kitna mazedaar hai na!"`;
              }

              sendFunctionCallOutput(callId, pageContext);

              logger.info("Successfully fetched and displayed page from API", {
                pageNumber: targetPageNumber,
                bookTitle: apiPage.bookTitle
              });
              return;
            }
          } else {
            logger.error("API response not ok", { status: response.status, statusText: response.statusText });
          }
        } catch (apiError) {
          logger.error("Failed to fetch page from API", { error: apiError });
        }

        sendFunctionCallOutput(
          callId,
          `I'm having trouble finding page ${targetPageNumber} of the book. Let me try to continue with the story from where we left off.`
        );

        options.dataChannel?.send(JSON.stringify({
          type: 'response.create'
        }));
        return;
      }

      // Update current page
      currentPageRef.current = targetPageNumber;

      // Trigger the storybook display component
      if (options.onStorybookPageDisplay) {
        options.onStorybookPageDisplay({
          pageImageUrl: targetPage.imageUrl,
          pageText: targetPage.pageText,
          pageNumber: targetPage.pageNumber,
          totalPages: pages.length,
          bookTitle: selectedBookRef.current.title
        });
      }

      // Optimized page context - much shorter to save tokens
      const isFirstPage = targetPage.pageNumber === 1;
      const isLastPage = targetPage.pageNumber === pages.length;

      let pageContext: string;
      if (isFirstPage) {
        pageContext = `Page 1 displayed. Read this story in Hinglish (mix of Hindi and English) to make it engaging for the child. Page text: "${targetPage.pageText}" - Use simple Hindi words mixed with English, add expressions like "dekho", "kya baat hai", "wah", and make it playful and interactive.`;
      } else if (isLastPage) {
        pageContext = `Final page displayed. Read in Hinglish: "${targetPage.pageText}" Then say "Bas! Kahani khatam! The End! Kya maza aaya na?"`;
      } else {
        pageContext = `Page ${targetPage.pageNumber} displayed. Continue reading in Hinglish (Hindi-English mix): "${targetPage.pageText}" - Keep it engaging with expressions like "aur phir", "dekho kya hua", "kitna mazedaar hai na!"`;
      }

      sendFunctionCallOutput(callId, pageContext);

      // Trigger model response
      options.dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));

      logger.info("Displayed page and sent context to Appu", {
        pageNumber: targetPageNumber,
        bookTitle: selectedBookRef.current.title,
        pageText: targetPage.pageText?.substring(0, 100) + "..."
      });

    } catch (error: any) {
      logger.error("Error handling display_book_page", {
        error: error.message,
        args
      });

      sendFunctionCallOutput(
        callId,
        "I'm having trouble displaying the book page right now. Let me try to continue with the story."
      );

      // Trigger model response after error
      options.dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));
    }
  }, [sendFunctionCallOutput, logger, options.dataChannel, options.onStorybookPageDisplay]);

  const handleGetEyesTool = useCallback(async (callId: string, args: any) => {
    logger.info("getEyesTool was called!", { callId, args });

    try {
      let frameData: string | null = null;

      // First check if video is enabled in options
      if (!options.enableVideo) {
        logger.warn("Video not enabled, cannot capture frame");
        sendFunctionCallOutput(
          callId,
          "I can't see anything because video is not enabled. Please enable video mode so I can see what you're showing me!"
        );
        return;
      }

      // Check if we already have camera permission and can capture
      if (options.hasVideoPermission && options.captureFrame) {
        // Try capturing frame with retry mechanism
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts && !frameData) {
          attempts++;
          logger.info(`Frame capture attempt ${attempts}/${maxAttempts}`);

          frameData = options.captureFrame();

          if (!frameData && attempts < maxAttempts) {
            // Wait a bit before retrying
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        logger.info("Frame capture completed", {
          hasFrame: !!frameData,
          attempts,
          frameLength: frameData?.length || 0,
        });
      } else {
        // Request camera permission if not already granted
        logger.info("Requesting camera permission for frame capture");
        try {
          if (options.requestMediaPermissions) {
            await options.requestMediaPermissions();
            // Wait a bit for video to initialize
            await new Promise((resolve) => setTimeout(resolve, 1000));
            // Try capturing after permission granted
            if (options.captureFrame) {
              frameData = options.captureFrame();
              logger.info("Captured frame after permission request", {
                hasFrame: !!frameData,
              });
            }
          }
        } catch (permissionError) {
          logger.warn("Camera permission denied for getEyesTool", {
            error: permissionError,
          });
        }
      }

      if (!frameData) {
        // No frame available - return appropriate response
        sendFunctionCallOutput(
          callId,
          "I can't see anything right now. Please make sure your camera is working and try showing me again!"
        );
        return;
      }

      // Call the frame analysis API with enhanced context
      const response = await fetch("/api/analyze-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameData,
          childId: options.childId,
          conversationId: conversationIdRef.current,
          reason: args.reason || "Child wants to show something",
          lookingFor: args.lookingFor || null,
          context: args.context || null,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status}`);
      }

      const analysisResult = await response.json();
      logger.info("Frame analysis completed", {
        analysis: analysisResult.analysis,
      });

      // Send the analysis result back to OpenAI
      sendFunctionCallOutput(callId, analysisResult.analysis);

      // Trigger model response after function call
      options.dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));
      logger.info("Triggered response.create after successful function call");
    } catch (error: any) {
      logger.error("Error handling getEyesTool", {
        error: error.message,
        stack: error.stack,
      });

      // Send error response back to OpenAI
      sendFunctionCallOutput(
        callId,
        "I'm having trouble seeing what you're showing me right now. Can you try again?"
      );

      // Trigger model response after error function call
      options.dataChannel?.send(JSON.stringify({
        type: 'response.create'
      }));
      logger.info("Triggered response.create after error function call");
    }
  }, [
    sendFunctionCallOutput,
    logger,
    options.enableVideo,
    options.hasVideoPermission,
    options.captureFrame,
    options.requestMediaPermissions,
    options.childId,
    options.dataChannel
  ]);

  const processFunctionCall = useCallback(async (message: any) => {
    logger.info("Processing function call", {
      callId: message.call_id,
      name: message.name,
      arguments: message.arguments,
    });

    // Handle different tool calls
    if (message.name === "getEyesTool") {
      await handleGetEyesTool(message.call_id, message.arguments);
    } else if (message.name === "bookSearchTool") {
      await handleBookSearchTool(message.call_id, message.arguments);
    } else if (message.name === "display_book_page") {
      await handleDisplayBookPage(message.call_id, message.arguments);
    } else {
      logger.warn("Unknown function call", { name: message.name });
      sendFunctionCallOutput(
        message.call_id,
        "I don't know how to handle that request right now."
      );
    }
  }, [handleGetEyesTool, handleBookSearchTool, handleDisplayBookPage, sendFunctionCallOutput, logger]);

  // Navigation methods for external use
  const handleNextPage = useCallback(() => {
    if (selectedBookRef.current && currentPageRef.current < (selectedBookRef.current.pages?.length || selectedBookRef.current.totalPages)) {
      // Trigger display_book_page with "next"
      const nextPageMessage = {
        call_id: `nav_${Date.now()}`,
        name: "display_book_page",
        arguments: JSON.stringify({ pageRequest: "next" })
      };
      processFunctionCall(nextPageMessage);
    }
  }, [processFunctionCall]);

  const handlePreviousPage = useCallback(() => {
    if (selectedBookRef.current && currentPageRef.current > 1) {
      // Trigger display_book_page with "previous"
      const prevPageMessage = {
        call_id: `nav_${Date.now()}`,
        name: "display_book_page",
        arguments: JSON.stringify({ pageRequest: "previous" })
      };
      processFunctionCall(prevPageMessage);
    }
  }, [processFunctionCall]);

  return {
    processFunctionCall,
    selectedBook: selectedBookRef.current,
    currentPage: currentPageRef.current,
    isInReadingSession: isInReadingSessionRef.current,
    handleNextPage,
    handlePreviousPage,
    enterReadingSession,
    exitReadingSession
  };
}