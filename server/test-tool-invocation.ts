
import { createServiceLogger } from "./logger";

const testLogger = createServiceLogger("tool-test");

// Manual test function to simulate getEyesTool invocation
export async function testGetEyesTool(testFrameData?: string) {
  try {
    testLogger.info("🧪 Testing getEyesTool invocation manually");

    // Use a test image or the provided frame data
    const frameData = testFrameData || generateTestImageBase64();

    // Call the analyze-frame endpoint directly
    const response = await fetch('http://localhost:5000/api/analyze-frame', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        frameData,
        reason: 'Manual tool testing'
      })
    });

    if (response.ok) {
      const result = await response.json();
      testLogger.info("✅ Manual tool test successful:", {
        analysis: result.analysis,
        processingTime: result.processingTime
      });
      return result;
    } else {
      const error = await response.text();
      testLogger.error("❌ Manual tool test failed:", { error });
      return { error };
    }
  } catch (error) {
    testLogger.error("❌ Manual tool test exception:", { error: error.message });
    return { error: error.message };
  }
}

// Generate a simple test image (red square) as base64
function generateTestImageBase64(): string {
  // Create a simple 100x100 red square as test data
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.fillText('TEST', 35, 55);
    
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  }
  
  // Fallback: minimal base64 image data
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

// Test the complete tool flow including WebRTC response
export async function testCompleteToolFlow() {
  testLogger.info("🧪 Testing complete getEyesTool flow");
  
  // Simulate the complete flow:
  // 1. Tool invocation
  // 2. Frame capture  
  // 3. Analysis
  // 4. Response formatting
  
  const mockCallId = 'test-call-' + Date.now();
  const mockMessage = {
    type: 'response.function_call_arguments.done',
    name: 'getEyesTool',
    call_id: mockCallId,
    arguments: { reason: 'Testing tool flow' }
  };
  
  console.log('🧪 Simulating tool message:', mockMessage);
  
  // Test frame analysis
  const testResult = await testGetEyesTool();
  
  // Test response formatting
  const toolResponse = {
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id: mockCallId,
      output: testResult.analysis || "Test analysis result"
    }
  };
  
  console.log('🧪 Tool response format:', toolResponse);
  
  return {
    mockMessage,
    analysisResult: testResult,
    toolResponse
  };
}
