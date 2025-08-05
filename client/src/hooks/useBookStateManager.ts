// Initialize WebSocket connection and manage state related to OpenAI interactions.
import {
  useEffect,
  useRef,
  useState,
  useCallback
} from 'react';
import OpenAI from 'openai';
import {
  useChat
} from './useChat';
import {
  BookSearchTool,
  DisplayBookPage
} from './tools';

// Mocking the environment variable for demonstration purposes
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

// Define the tool specifications
const tools = [{
  type: 'function',
  function: {
    name: 'BookSearchTool',
    description: 'Searches for books based on title, author, or ISBN. Returns book details, including title, author, publication year, and a brief summary.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query for the book (title, author, or ISBN)'
        }
      },
      required: ['query']
    }
  }
}, {
  type: 'function',
  function: {
    name: 'DisplayBookPage',
    description: 'Displays a specific book page with its title, author, publication year, and summary. Accepts the entire book object as input.',
    parameters: {
      type: 'object',
      properties: {
        book: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'The title of the book'
            },
            author: {
              type: 'string',
              description: 'The author of the book'
            },
            publication_year: {
              type: 'integer',
              description: 'The year the book was published'
            },
            summary: {
              type: 'string',
              description: 'A brief summary of the book'
            }
          },
          required: ['title', 'author', 'publication_year', 'summary']
        }
      },
      required: ['book']
    }
  }
}, ];

export const useOpenAIConnection = () => {
  const {
    messages,
    addMessage,
    clearMessages
  } = useChat();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataChannel, setDataChannel] = useState < RTCDataChannel | null > (null);
  const peerConnection = useRef < RTCPeerConnection | null > (null);
  const dataChannelRef = useRef < RTCDataChannel | null > (null);
  const existingCall = useRef(false);

  // Initialize data channel
  const initializeDataChannel = useCallback(() => {
    if (peerConnection.current && !dataChannelRef.current) {
      const channel = peerConnection.current.createDataChannel('chat');

      channel.onopen = () => {
        console.log('Data channel is open');
        setDataChannel(channel);
        dataChannelRef.current = channel; // Store the data channel reference
      };

      channel.onmessage = (event) => {
        console.log('Message received:', event.data);
        try {
          const parsedData = JSON.parse(event.data);
          if (parsedData.type === 'response.create') {
            addMessage({
              role: 'assistant',
              content: parsedData.content
            });
          } else if (parsedData.type === 'books.found') {
            // Handle found books (e.g., display them)
            // This part might need refinement based on how you want to display search results
            if (parsedData.books && parsedData.books.length > 0) {
              // For now, just log the first book found
              console.log('Found books:', parsedData.books);
              addMessage({
                role: 'assistant',
                content: `I found ${parsedData.books.length} books matching your query. Here's the first one:\nTitle: ${parsedData.books[0].title}\nAuthor: ${parsedData.books[0].author}\nPublication Year: ${parsedData.books[0].publication_year}\nSummary: ${parsedData.books[0].summary}`
              });
            } else {
              addMessage({
                role: 'assistant',
                content: 'I could not find any books matching your query.'
              });
            }
          } else if (parsedData.type === 'book.displayed') {
            console.log('Book displayed:', parsedData.book);
            // You might want to update UI or state based on this confirmation
          }
        } catch (e) {
          console.error('Failed to parse message data:', e);
          addMessage({
            role: 'assistant',
            content: 'Received an invalid message format.'
          });
        }
      };

      channel.onclose = () => {
        console.log('Data channel is closed');
        setDataChannel(null);
        dataChannelRef.current = null; // Clear the data channel reference
      };

      channel.onerror = (error) => {
        console.error('Data channel error:', error);
        setError('Data channel error occurred.');
      };
    }
  }, [addMessage]); // Dependency array includes addMessage

  // Create offer for peer connection
  const createOffer = useCallback(async () => {
    if (!peerConnection.current) {
      console.error('Peer connection not established');
      return;
    }
    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      return offer;
    } catch (err) {
      console.error('Error creating offer:', err);
      setError('Failed to create offer.');
      return null;
    }
  }, []);

  // Create answer for peer connection
  const createAnswer = useCallback(async (offer) => {
    if (!peerConnection.current) {
      console.error('Peer connection not established');
      return;
    }
    try {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      return answer;
    } catch (err) {
      console.error('Error creating answer:', err);
      setError('Failed to create answer.');
      return null;
    }
  }, []);

  // Add ICE candidate
  const addIceCandidate = useCallback(async (candidate) => {
    if (peerConnection.current && candidate) {
      try {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
        // Avoid causing a cascade of errors, only log
      }
    }
  }, []);

  // Handle incoming ICE candidate
  useEffect(() => {
    if (peerConnection.current) {
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          // This candidate needs to be sent to the other peer.
          // In a real application, this would involve sending via WebSocket or another signaling mechanism.
          console.log('Local ICE candidate:', event.candidate);
        }
      };
    }
  }, [peerConnection]);

  // Setup peer connection
  const setupPeerConnection = useCallback(async () => {
    if (!existingCall.current) {
      existingCall.current = true;
      peerConnection.current = new RTCPeerConnection({
        iceServers: [{
          urls: 'stun:stun.l.google.com:19302'
        }]
      });

      // Initialize data channel when peer connection is established
      peerConnection.current.ondatachannel = (event) => {
        console.log('Data channel received');
        if (event.channel) {
          setDataChannel(event.channel);
          dataChannelRef.current = event.channel; // Store the data channel reference

          event.channel.onopen = () => {
            console.log('Data channel is open');
          };
          event.channel.onmessage = (messageEvent) => {
            console.log('Message received:', messageEvent.data);
            try {
              const parsedData = JSON.parse(messageEvent.data);
              if (parsedData.type === 'response.create') {
                addMessage({
                  role: 'assistant',
                  content: parsedData.content
                });
              } else if (parsedData.type === 'books.found') {
                if (parsedData.books && parsedData.books.length > 0) {
                  console.log('Found books:', parsedData.books);
                  addMessage({
                    role: 'assistant',
                    content: `I found ${parsedData.books.length} books matching your query. Here's the first one:\nTitle: ${parsedData.books[0].title}\nAuthor: ${parsedData.books[0].author}\nPublication Year: ${parsedData.books[0].publication_year}\nSummary: ${parsedData.books[0].summary}`
                  });
                } else {
                  addMessage({
                    role: 'assistant',
                    content: 'I could not find any books matching your query.'
                  });
                }
              } else if (parsedData.type === 'book.displayed') {
                console.log('Book displayed:', parsedData.book);
              }
            } catch (e) {
              console.error('Failed to parse message data:', e);
              addMessage({
                role: 'assistant',
                content: 'Received an invalid message format.'
              });
            }
          };
          event.channel.onclose = () => {
            console.log('Data channel is closed');
            setDataChannel(null);
            dataChannelRef.current = null;
          };
          event.channel.onerror = (error) => {
            console.error('Data channel error:', error);
            setError('Data channel error occurred.');
          };
        }
      };

      // Initialize the data channel immediately after creating the peer connection
      initializeDataChannel();
    }
  }, [initializeDataChannel, addMessage]); // Add addMessage to dependencies

  // Send message to OpenAI
  const sendMessageToOpenAI = useCallback(async (userInput) => {
    setIsLoading(true);
    setError(null);

    // Add user message to chat history
    addMessage({
      role: 'user',
      content: userInput
    });

    // Prepare messages for OpenAI API
    const threadMessages = [...messages, {
      role: 'user',
      content: userInput
    }];

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // or 'gpt-3.5-turbo' or other suitable models
        messages: threadMessages,
        tools: tools,
        tool_choice: 'auto', // Let the model decide whether to use a tool
      });

      const toolCalls = response.choices[0].message.tool_calls;

      if (toolCalls) {
        // Handle tool calls
        for (const toolCall of toolCalls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          console.log(`Calling tool: ${functionName} with args:`, functionArgs);

          if (functionName === 'BookSearchTool') {
            // Call the BookSearchTool with the dataChannel
            BookSearchTool({
              query: functionArgs.query
            }, dataChannel); // Pass dataChannel here
          } else if (functionName === 'DisplayBookPage') {
            // Call the DisplayBookPage with the dataChannel
            DisplayBookPage({
              book: functionArgs.book
            }, dataChannel); // Pass dataChannel here
          }
        }
      } else if (response.choices[0].message.content) {
        // Handle text response
        addMessage({
          role: 'assistant',
          content: response.choices[0].message.content
        });
      }
    } catch (err) {
      console.error('Error sending message to OpenAI:', err);
      setError('Failed to get response from OpenAI. Please try again.');
      addMessage({
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  }, [messages, addMessage, dataChannel]); // Include dataChannel in dependencies

  // Function to handle offer from remote peer
  const handleOffer = useCallback(async (offer) => {
    const answer = await createAnswer(offer);
    if (answer) {
      // Send the answer back to the remote peer
      console.log('Sending answer:', answer);
    }
  }, [createAnswer]);

  // Function to handle answer from remote peer
  const handleAnswer = useCallback(async (answer) => {
    if (peerConnection.current && answer) {
      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Remote description set with answer.');
      } catch (err) {
        console.error('Error setting remote description with answer:', err);
        setError('Failed to set remote description.');
      }
    }
  }, []);

  // Function to handle ICE candidates from remote peer
  useEffect(() => {
    if (peerConnection.current) {
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          // This candidate needs to be sent to the other peer.
          // In a real application, this would involve sending via WebSocket or another signaling mechanism.
          console.log('Local ICE candidate:', event.candidate);
          // Example: sendIceCandidate(event.candidate);
        }
      };
    }
  }, [peerConnection]); // Dependency on peerConnection to re-apply the handler if it changes

  // Cleanup function
  useEffect(() => {
    return () => {
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
      if (dataChannelRef.current) {
        dataChannelRef.current.close();
        dataChannelRef.current = null;
      }
      setDataChannel(null);
      existingCall.current = false;
    };
  }, []);

  return {
    messages,
    addMessage,
    clearMessages,
    isLoading,
    error,
    sendMessageToOpenAI,
    setupPeerConnection,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    dataChannel, // Expose dataChannel if needed by the UI
  };
};