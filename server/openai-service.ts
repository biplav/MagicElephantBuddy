import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import ffmpeg from "fluent-ffmpeg";

// Create a temporary directory to store audio files
const tempDir = path.join(os.tmpdir(), 'appu-audio');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Convert audio file to WAV format using ffmpeg
 */
function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(16000)
      .on('end', () => {
        console.log(`Audio conversion completed: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error('Error converting audio:', err);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Transcribe audio to text using OpenAI's Whisper API
 */
export async function transcribeAudio(audioBuffer: Buffer, fileName: string): Promise<string> {
  let tempFilePath: string | null = null;
  let convertedFilePath: string | null = null;
  
  try {
    // Check if the audio buffer is empty
    if (!audioBuffer || audioBuffer.length === 0) {
      console.error("Empty audio buffer received");
      throw new Error("Empty audio buffer");
    }
    
    console.log(`Processing audio buffer of size ${audioBuffer.length} bytes`);
    
    // Generate unique file names with timestamps
    const timestamp = Date.now();
    const originalExt = path.extname(fileName).toLowerCase() || '.webm';
    const baseName = `recording-${timestamp}`;
    
    // Save the original audio buffer to a temporary file
    tempFilePath = path.join(tempDir, `${baseName}${originalExt}`);
    fs.writeFileSync(tempFilePath, audioBuffer);
    console.log(`Saved original audio file to ${tempFilePath}`);
    
    // Convert to WAV format for better compatibility with Whisper
    convertedFilePath = path.join(tempDir, `${baseName}.wav`);
    await convertToWav(tempFilePath, convertedFilePath);
    
    // Verify the converted file exists and has content
    if (!fs.existsSync(convertedFilePath)) {
      throw new Error('Audio conversion failed - output file not created');
    }
    
    const convertedStats = fs.statSync(convertedFilePath);
    if (convertedStats.size === 0) {
      throw new Error('Audio conversion failed - output file is empty');
    }
    
    console.log(`Converted audio file size: ${convertedStats.size} bytes`);
    
    // Create a readable stream from the converted file
    const audioReadStream = fs.createReadStream(convertedFilePath);
    
    // Call OpenAI's transcription API with the converted WAV file
    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
    });
    
    console.log(`Transcription result: ${transcription.text}`);
    
    return transcription.text;
  } catch (error: any) {
    console.error('Error transcribing audio:', error);
    
    // Check for rate limit errors (code 429)
    if (error.status === 429 || (error.error && error.error.type === 'insufficient_quota')) {
      throw new Error('rateLimit');
    }
    
    // Check for authentication errors (code 401)
    if (error.status === 401) {
      throw new Error('auth');
    }
    
    // Check for service unavailable errors (codes 500, 502, 503)
    if (error.status && [500, 502, 503].includes(error.status)) {
      throw new Error('serviceUnavailable');
    }
    
    // For transcription-specific errors
    throw new Error('transcriptionFailed');
  } finally {
    // Clean up temporary files
    try {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`Cleaned up original file: ${tempFilePath}`);
      }
      if (convertedFilePath && fs.existsSync(convertedFilePath)) {
        fs.unlinkSync(convertedFilePath);
        console.log(`Cleaned up converted file: ${convertedFilePath}`);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temporary files:', cleanupError);
    }
  }
}

/**
 * Generate a response using GPT-4o
 */
export async function generateResponse(transcribedText: string): Promise<string> {
  try {
    // Import the system prompt and child profile
    const { APPU_SYSTEM_PROMPT } = await import('../shared/appuPrompts');
    const { DEFAULT_PROFILE, getCurrentTimeContext } = await import('../shared/childProfile');
    
    // Get current time context
    const timeContext = getCurrentTimeContext();
    
    // Prepare child profile and time context for the model
    const childProfileJSON = JSON.stringify(DEFAULT_PROFILE, null, 2);
    const timeContextJSON = JSON.stringify(timeContext, null, 2);
    
    // User prompt with the transcribed text and context
    const userPrompt = `
Child profile: ${childProfileJSON}

Time context: ${timeContextJSON}

The child says: "${transcribedText}"`;

    // Call OpenAI's chat completions API
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: APPU_SYSTEM_PROMPT
        },
        { 
          role: "user", 
          content: userPrompt 
        }
      ],
      max_tokens: 200,
    });
    
    const generatedText = response.choices[0].message.content || "";
    console.log(`Generated response: ${generatedText}`);
    
    return generatedText;
  } catch (error: any) {
    console.error('Error generating response:', error);
    
    // Check for rate limit errors (code 429)
    if (error.status === 429 || (error.error && error.error.type === 'insufficient_quota')) {
      throw new Error('rateLimit');
    }
    
    // Check for authentication errors (code 401)
    if (error.status === 401) {
      throw new Error('auth');
    }
    
    // Check for service unavailable errors (codes 500, 502, 503)
    if (error.status && [500, 502, 503].includes(error.status)) {
      throw new Error('serviceUnavailable');
    }
    
    // For network errors or other unclassified errors
    throw new Error('generic');
  }
}