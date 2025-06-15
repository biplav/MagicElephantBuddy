// Legacy OpenAI service - refactored to use abstracted AI service
import { createAIService, createCustomAIService, AI_CONFIGS } from './ai-service';
import fs from "fs";
import path from "path";
import os from "os";
import ffmpeg from "fluent-ffmpeg";

// Create a temporary directory to store audio files
const tempDir = path.join(os.tmpdir(), 'appu-audio');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Create AI service instances for different use cases
const standardAI = createAIService('standard');
const fastAI = createAIService('fast');
const creativeAI = createAIService('creative');

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
 * Transcribe audio to text using the abstracted AI service with audio preprocessing
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
    
    // Check minimum file size for valid audio (at least 2KB)
    const minSize = 2048; // 2KB minimum for valid audio
    if (audioBuffer.length < minSize) {
      console.warn(`Audio file too small: ${audioBuffer.length} bytes (minimum: ${minSize} bytes)`);
      throw new Error('audioTooSmall');
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
    
    // Read the converted audio file as buffer for the AI service
    const convertedBuffer = fs.readFileSync(convertedFilePath);
    
    // Use the abstracted AI service for transcription
    const transcriptionText = await standardAI.transcribeAudio(convertedBuffer, `${baseName}.wav`);
    
    console.log(`Transcription result: ${transcriptionText}`);
    
    return transcriptionText;
  } catch (error: any) {
    console.error('Error transcribing audio:', error);
    
    // Pass through the error handling from the AI service
    throw error;
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
 * Generate a response using the abstracted AI service
 */
export async function generateResponse(transcribedText: string, useCreative: boolean = false, customPrompt?: string): Promise<string> {
  try {
    const aiService = useCreative ? creativeAI : standardAI;
    
    // If a custom prompt is provided, use it; otherwise use the default AI service prompt
    let generatedText: string;
    if (customPrompt) {
      // Use the custom prompt for this specific request
      const customAIService = createAIService(useCreative ? 'creative' : 'standard');
      generatedText = await customAIService.generateResponse(`${customPrompt}\n\nChild's message: ${transcribedText}`);
    } else {
      generatedText = await aiService.generateResponse(transcribedText);
    }
    
    console.log(`Generated response: ${generatedText}`);
    return generatedText;
  } catch (error: any) {
    console.error('Error generating response:', error);
    throw error;
  }
}

/**
 * Generate speech audio from text using the abstracted AI service
 */
export async function generateSpeech(text: string, useCreativeVoice: boolean = false): Promise<Buffer> {
  try {
    console.log(`Generating speech for text: ${text.substring(0, 50)}...`);
    
    const aiService = useCreativeVoice ? creativeAI : standardAI;
    const audioBuffer = await aiService.generateSpeech(text);
    
    console.log(`Generated speech audio: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (error: any) {
    console.error('Error generating speech:', error);
    throw error;
  }
}

// Export AI service instances and factory functions for direct use
export { 
  standardAI, 
  fastAI, 
  creativeAI, 
  createAIService, 
  createCustomAIService, 
  AI_CONFIGS 
};