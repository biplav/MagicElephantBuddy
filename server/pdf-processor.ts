
import fs from "fs";
import path from "path";
import pdf2pic from "pdf2pic";
import pdfParse from "pdf-parse";
import { createAIService } from "./ai-service";
import { Client } from "@replit/object-storage";

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

interface ConversionResult {
  buffer: Buffer;
  size: string;
  page: number;
}

export class PDFProcessor {
  private aiService = createAIService("standard");
  private objectStorage = new Client();

  async processPDF(pdfBuffer: Buffer, fileName: string): Promise<ProcessedBook> {
    console.log(`Processing PDF: ${fileName} (${pdfBuffer.length} bytes)`);

    // Create temporary directory for processing
    const tempDir = this.createTempDirectory();
    console.log(`Created temp directory: ${tempDir}`);

    try {
      // Save and validate PDF file
      const pdfPath = await this.savePDFFile(pdfBuffer, fileName, tempDir);
      
      // Extract text and metadata from PDF
      const { fullText, totalPages } = await this.extractPDFData(pdfBuffer);
      
      // Process each page
      const pages = await this.processPages(pdfPath, totalPages, fileName, tempDir);
      
      // Generate book metadata
      const summary = await this.generateBookSummary(fullText, fileName);
      const metadata = await this.extractMetadata(fullText, fileName);

      return {
        title: this.extractTitle(fileName, fullText),
        author: this.extractAuthor(fullText),
        totalPages,
        pages,
        summary,
        metadata,
      };
    } catch (error) {
      console.error(`Error processing PDF ${fileName}:`, error);
      throw error;
    } finally {
      // Always clean up temporary files
      this.cleanupTempDirectory(tempDir);
    }
  }

  private createTempDirectory(): string {
    const tempDir = path.join(process.cwd(), "temp", Date.now().toString());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
  }

  private async savePDFFile(pdfBuffer: Buffer, fileName: string, tempDir: string): Promise<string> {
    const pdfPath = path.join(tempDir, fileName);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Validate the saved PDF file
    const savedFileSize = fs.statSync(pdfPath).size;
    console.log(`Saved PDF to: ${pdfPath} (${savedFileSize} bytes)`);

    if (savedFileSize !== pdfBuffer.length) {
      throw new Error(
        `File size mismatch: expected ${pdfBuffer.length}, got ${savedFileSize}`,
      );
    }

    return pdfPath;
  }

  private async extractPDFData(pdfBuffer: Buffer): Promise<{ fullText: string; totalPages: number }> {
    console.log(`Extracting text from PDF buffer of size: ${pdfBuffer.length} bytes`);
    
    const pdfData = await pdfParse(pdfBuffer, {
      max: 0, // No page limit
    });
    
    const fullText = pdfData.text;
    const totalPages = pdfData.numpages;
    
    console.log(`Extracted ${fullText.length} characters of text`);
    console.log(`PDF has ${totalPages} pages`);
    
    return { fullText, totalPages };
  }

  private async processPages(
    pdfPath: string, 
    totalPages: number, 
    fileName: string, 
    tempDir: string
  ): Promise<ProcessedPage[]> {
    const convert = this.createPDFConverter(pdfPath, tempDir);
    const pages: ProcessedPage[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`Processing page ${pageNum}/${totalPages}`);

      try {
        const page = await this.processPage(convert, pageNum, fileName);
        pages.push(page);

        // Add delay between pages to avoid rate limits
        if (pageNum < totalPages) {
          await this.addProcessingDelay();
        }
      } catch (error) {
        console.error(`Failed to process page ${pageNum}:`, error);
        // Continue processing other pages instead of failing completely
        continue;
      }
    }

    return pages;
  }

  private createPDFConverter(pdfPath: string, tempDir: string) {
    return pdf2pic.fromPath(pdfPath, {
      density: 150,
      saveFilename: "page",
      savePath: tempDir,
      format: "png",
      width: 800,
      height: 1000,
      quality: 85,
      preserveAspectRatio: true,
    });
  }

  private async processPage(
    convert: any, 
    pageNum: number, 
    fileName: string
  ): Promise<ProcessedPage> {
    // Convert page to image
    const imageBuffer = await this.convertPageToImage(convert, pageNum);
    
    // Store image in object storage
    const imageUrl = await this.storeImageInObjectStorage(imageBuffer, fileName, pageNum);
    
    // Extract text and generate description in parallel for better performance
    const [pageText, imageDescription] = await Promise.allSettled([
      this.extractTextFromImage(imageBuffer),
      this.generateImageDescription(imageBuffer),
    ]);

    return {
      pageNumber: pageNum,
      imageBuffer,
      text: pageText.status === 'fulfilled' ? pageText.value : '',
      imageDescription: imageDescription.status === 'fulfilled' ? imageDescription.value : '',
      imageUrl,
    };
  }

  private async convertPageToImage(convert: any, pageNum: number): Promise<Buffer> {
    console.log(`Converting page ${pageNum} to image...`);
    
    const result: ConversionResult = await convert(pageNum, { responseType: "buffer" });

    console.log(`Conversion result for page ${pageNum}:`, {
      hasBuffer: !!result.buffer,
      bufferLength: result.size,
      page: result.page,
      size: result.buffer ? Buffer.byteLength(result.buffer) : 0,
    });

    if (!result.buffer || Buffer.byteLength(result.buffer) === 0) {
      throw new Error(`Empty image buffer for page ${pageNum}`);
    }

    console.log(`Successfully generated image buffer for page ${pageNum}: ${result.buffer.length} bytes`);
    return result.buffer;
  }

  private async storeImageInObjectStorage(
    imageBuffer: Buffer, 
    fileName: string, 
    pageNum: number
  ): Promise<string> {
    const imageFileName = `books/${fileName.replace(".pdf", "")}-page-${pageNum}.png`;
    const base64Image = imageBuffer.toString("base64");
    
    const uploadResult = await this.objectStorage.uploadFromText(imageFileName, base64Image);

    if (!uploadResult.ok) {
      throw new Error(`Failed to upload image to object storage: ${uploadResult.error}`);
    }

    const imageUrl = `/api/object-storage/${encodeURIComponent(imageFileName)}`;
    console.log(`Stored image in object storage: ${imageUrl}`);
    
    return imageUrl;
  }

  private async addProcessingDelay(): Promise<void> {
    // 100ms delay between pages to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  private cleanupTempDirectory(tempDir: string): void {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`Cleaned up temp directory: ${tempDir}`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup temp directory ${tempDir}:`, error);
    }
  }

  private async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    try {
      if (!this.isValidImageBuffer(imageBuffer)) {
        console.warn("Invalid image buffer provided for text extraction");
        return "";
      }

      const base64Image = imageBuffer.toString("base64");
      if (!base64Image || base64Image.length === 0) {
        console.warn("Failed to generate base64 from image buffer");
        return "";
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all text from this book page image. Return only the text content, no explanations.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      });

      return response.choices[0].message.content || "";
    } catch (error) {
      console.error("Error extracting text from image:", error);
      return "";
    }
  }

  private async generateImageDescription(imageBuffer: Buffer): Promise<string> {
    try {
      if (!this.isValidImageBuffer(imageBuffer)) {
        console.warn("Invalid image buffer provided for description generation");
        return "";
      }

      const base64Image = imageBuffer.toString("base64");
      if (!base64Image || base64Image.length === 0) {
        console.warn("Failed to generate base64 from image buffer");
        return "";
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Provide a detailed description of this children's book page image. Focus on characters, objects, colors, actions, and scenes that would help a parent or child understand what's happening in the illustration. Keep it appropriate for young children.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      return response.choices[0].message.content || "";
    } catch (error) {
      console.error("Error generating image description:", error);
      return "";
    }
  }

  private isValidImageBuffer(imageBuffer: Buffer): boolean {
    return imageBuffer && imageBuffer.length > 0;
  }

  private async generateBookSummary(fullText: string, fileName: string): Promise<string> {
    try {
      const prompt = `Generate a comprehensive summary of this children's book. Include the main characters, plot, themes, and educational value. Keep it engaging for parents choosing books for their children.

Book content:
${fullText.substring(0, 5000)}...`;

      const summary = await this.aiService.generateResponse(prompt);
      return summary;
    } catch (error) {
      console.error("Error generating book summary:", error);
      return "Summary generation failed";
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
        return this.createFallbackMetadata(fileName);
      }
    } catch (error) {
      console.error("Error extracting metadata:", error);
      return this.createFallbackMetadata(fileName);
    }
  }

  private createFallbackMetadata(fileName: string): any {
    return {
      genre: "children's book",
      extractedFromFile: fileName,
      processingDate: new Date().toISOString(),
    };
  }

  private extractTitle(fileName: string, fullText: string): string {
    // Try to extract title from the first few lines of text
    const lines = fullText.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.length > 3 && firstLine.length < 100) {
        return firstLine;
      }
    }

    // Fallback to filename without extension
    return fileName.replace(".pdf", "").replace(/[-_]/g, " ");
  }

  private extractAuthor(fullText: string): string | undefined {
    // Simple pattern matching for author
    const authorPatterns = [
      /by\s+([A-Za-z\s]+)/i,
      /author[:\s]+([A-Za-z\s]+)/i,
      /written by\s+([A-Za-z\s]+)/i,
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
