import fs from 'fs';
import path from 'path';
import pdf2pic from 'pdf2pic';
import pdfParse from 'pdf-parse';
import { createAIService } from './ai-service';
import { Client } from '@replit/object-storage';

export interface ProcessedPage {
  pageNumber: number;
  imageBuffer: Buffer;
  text: string;
  imageDescription: string;
  imageUrl: string;
}

export interface ProcessedBook {
  title: string;
  author?: string;
  totalPages: number;
  pages: ProcessedPage[];
  summary: string;
  metadata: any;
}

export class PDFProcessor {
  private aiService = createAIService('standard');
  private objectStorage = new Client();

  async processPDF(pdfBuffer: Buffer, fileName: string): Promise<ProcessedBook> {
    console.log(`Processing PDF: ${fileName}`);

    // Create temporary directory for processing
    const tempDir = path.join(process.cwd(), 'temp', Date.now().toString());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      // Save PDF to temporary file
      const pdfPath = path.join(tempDir, fileName);
      fs.writeFileSync(pdfPath, pdfBuffer);

      // Extract text from PDF
      console.log(`Extracting text from PDF buffer of size: ${pdfBuffer.length} bytes`);
      const pdfData = await pdfParse(pdfBuffer, {
        // Ensure we're working with the buffer, not trying to read a file
        max: 0 // No page limit
      });
      const fullText = pdfData.text;
      console.log(`Extracted ${fullText.length} characters of text`);

      // Convert PDF pages to images
      const convert = pdf2pic.fromPath(pdfPath, {
        density: 100,
        saveFilename: "page",
        savePath: tempDir,
        format: "png",
        width: 800,
        height: 1000
      });

      // Get total pages
      const totalPages = pdfData.numpages;
      console.log(`PDF has ${totalPages} pages`);

      const pages: ProcessedPage[] = [];

      // Process each page
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        console.log(`Processing page ${pageNum}/${totalPages}`);

        // Convert page to image
        const result = await convert(pageNum, { responseType: "buffer" });
        const imageBuffer = result.buffer as Buffer;

        // Store image in object storage and provide fallback to local storage
        const imageFileName = `books/${fileName.replace('.pdf', '')}-page-${pageNum}.png`;
        let imageUrl: string;

        try {
          // Convert buffer to base64 for upload to object storage
          const base64Image = imageBuffer.toString('base64');
          const uploadResult = await this.objectStorage.uploadFromText(imageFileName, base64Image);

          if (uploadResult.ok) {
            // Use custom route to serve from object storage
            imageUrl = `/api/object-storage/${encodeURIComponent(imageFileName)}`;
            console.log(`Stored image in object storage: ${imageUrl}`);
          } else {
            throw new Error(`Upload failed: ${uploadResult.error}`);
          }
        } catch (storageError) {
          console.error('Object storage failed, using local fallback:', storageError);

          // Fallback to local storage
          const publicDir = path.join(process.cwd(), 'public', 'books');
          if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
          }

          const localImageFileName = `${fileName.replace('.pdf', '')}-page-${pageNum}.png`;
          const localImagePath = path.join(publicDir, localImageFileName);
          fs.writeFileSync(localImagePath, imageBuffer);
          imageUrl = `/books/${localImageFileName}`;
          console.log(`Saved image locally: ${imageUrl}`);
        }

        // Extract text for this specific page using OCR via OpenAI Vision
        const pageText = await this.extractTextFromImage(imageBuffer);

        // Generate image description using AI
        const imageDescription = await this.generateImageDescription(imageBuffer);

        pages.push({
          pageNumber: pageNum,
          imageBuffer,
          text: pageText,
          imageDescription,
          imageUrl
        });
      }

      // Generate book summary
      const summary = await this.generateBookSummary(fullText, fileName);

      // Extract metadata
      const metadata = await this.extractMetadata(fullText, fileName);

      // Clean up temporary files
      fs.rmSync(tempDir, { recursive: true, force: true });

      return {
        title: this.extractTitle(fileName, fullText),
        author: this.extractAuthor(fullText),
        totalPages,
        pages,
        summary,
        metadata
      };

    } catch (error) {
      // Clean up on error
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  private async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    try {
      const base64Image = imageBuffer.toString('base64');

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all text from this book page image. Return only the text content, no explanations."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      });

      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('Error extracting text from image:', error);
      return '';
    }
  }

  private async generateImageDescription(imageBuffer: Buffer): Promise<string> {
    try {
      const base64Image = imageBuffer.toString('base64');

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Provide a detailed description of this children's book page image. Focus on characters, objects, colors, actions, and scenes that would help a parent or child understand what's happening in the illustration. Keep it appropriate for young children."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 300
      });

      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('Error generating image description:', error);
      return '';
    }
  }

  private async generateBookSummary(fullText: string, fileName: string): Promise<string> {
    try {
      const prompt = `Generate a comprehensive summary of this children's book. Include the main characters, plot, themes, and educational value. Keep it engaging for parents choosing books for their children.

Book content:
${fullText.substring(0, 5000)}...`;

      const summary = await this.aiService.generateResponse(prompt);
      return summary;
    } catch (error) {
      console.error('Error generating book summary:', error);
      return '';
    }
  }

  private async extractMetadata(fullText: string, fileName: string): Promise<any> {
    try {
      const prompt = `Analyze this children's book and extract metadata in JSON format:

{
  "genre": "adventure/educational/fantasy/etc",
  "ageRange": "3-5 years",
  "themes": ["friendship", "learning", "adventure"],
  "educationalValue": ["counting", "colors", "social skills"],
  "characters": ["character1", "character2"],
  "setting": "description of where the story takes place",
  "language": "English/bilingual/etc",
  "illustration_style": "cartoon/realistic/watercolor/etc"
}

Book content:
${fullText.substring(0, 3000)}...`;

      const response = await this.aiService.generateResponse(prompt);

      // Try to parse JSON response
      try {
        return JSON.parse(response);
      } catch {
        // If JSON parsing fails, return a basic metadata object
        return {
          genre: "children's book",
          extractedFromFile: fileName,
          processingDate: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return {
        genre: "children's book",
        extractedFromFile: fileName,
        processingDate: new Date().toISOString()
      };
    }
  }

  private extractTitle(fileName: string, fullText: string): string {
    // Try to extract title from the first few lines of text
    const lines = fullText.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.length > 3 && firstLine.length < 100) {
        return firstLine;
      }
    }

    // Fallback to filename without extension
    return fileName.replace('.pdf', '').replace(/[-_]/g, ' ');
  }

  private extractAuthor(fullText: string): string | undefined {
    // Simple pattern matching for author
    const authorPatterns = [
      /by\s+([A-Za-z\s]+)/i,
      /author[:\s]+([A-Za-z\s]+)/i,
      /written by\s+([A-Za-z\s]+)/i
    ];

    for (const pattern of authorPatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
  }
}