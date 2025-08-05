
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
  audioUrl: string;
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
      
      // Generate enhanced book metadata using first 5 pages - let OpenAI extract title
      const first5Pages = pages.slice(0, 5);
      const metadata = await this.extractEnhancedMetadata(fullText, first5Pages, fileName);
      const bookTitle = metadata.title || fileName.replace(".pdf", "").replace(/[-_]/g, " ");
      const summary = await this.generateEnhancedBookSummary(fullText, first5Pages, bookTitle);

      return {
        title: bookTitle,
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
      this.generateChildFriendlyNarration(imageBuffer),
    ]);

    // Generate audio narration for the page
    const narrationText = imageDescription.status === 'fulfilled' ? imageDescription.value : '';
    const audioUrl = await this.generatePageAudio(narrationText, fileName, pageNum);

    return {
      pageNumber: pageNum,
      imageBuffer,
      text: pageText.status === 'fulfilled' ? pageText.value : '',
      imageDescription: narrationText,
      imageUrl,
      audioUrl,
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

  private async generatePageAudio(narrationText: string, fileName: string, pageNum: number): Promise<string> {
    try {
      if (!narrationText || narrationText.trim() === "") {
        console.warn(`No narration text provided for page ${pageNum}`);
        return "";
      }

      console.log(`Generating audio for page ${pageNum}...`);

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Generate speech using OpenAI TTS
      const mp3Response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova", // Child-friendly voice
        input: narrationText,
        speed: 0.9, // Slightly slower for children
      });

      // Convert response to buffer
      const buffer = Buffer.from(await mp3Response.arrayBuffer());

      // Store audio in object storage
      const audioFileName = `books/${fileName.replace(".pdf", "")}-page-${pageNum}-audio.mp3`;
      const base64Audio = buffer.toString("base64");
      
      const uploadResult = await this.objectStorage.uploadFromText(audioFileName, base64Audio);

      if (!uploadResult.ok) {
        throw new Error(`Failed to upload audio to object storage: ${uploadResult.error}`);
      }

      const audioUrl = `/api/object-storage/${encodeURIComponent(audioFileName)}`;
      console.log(`Generated and stored audio for page ${pageNum}: ${audioUrl}`);
      
      return audioUrl;

    } catch (error) {
      console.error(`Error generating audio for page ${pageNum}:`, error);
      return "";
    }
  }

  private async addProcessingDelay(): Promise<void> {
    // 200ms delay between pages to avoid rate limits (increased for audio generation)
    await new Promise((resolve) => setTimeout(resolve, 200));
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

  private async generateChildFriendlyNarration(imageBuffer: Buffer): Promise<string> {
    try {
      if (!this.isValidImageBuffer(imageBuffer)) {
        console.warn("Invalid image buffer provided for narration generation");
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
                text: `Create a child-friendly narration for this storybook page that would be perfect for reading aloud to a 3-5 year old child. The narration should be:

- Engaging and fun with simple, age-appropriate language
- Include sound effects like "Whoosh!", "Splash!", "Roar!" where appropriate 
- Use expressions that children love like "Oh my!", "Wow!", "Look at that!"
- Mix Hindi and English words naturally (Hinglish) - use simple Hindi words like "dekho" (look), "kya baat hai" (how wonderful), "bada" (big), "chota" (small)
- Be interactive and encouraging like "Can you see the...?", "What do you think happens next?"
- Focus on colors, characters, actions, and emotions in the scene
- Keep it conversational and storytelling style, not just descriptive
- Make it exciting and magical for young listeners

Write this as if Appu the magical elephant is telling the story directly to the child.`,
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
        max_tokens: 400,
        temperature: 0.8,
      });

      return response.choices[0].message.content || "";
    } catch (error) {
      console.error("Error generating child-friendly narration:", error);
      return "";
    }
  }

  private isValidImageBuffer(imageBuffer: Buffer): boolean {
    return imageBuffer && imageBuffer.length > 0;
  }

  private async generateEnhancedBookSummary(
    fullText: string, 
    first5Pages: ProcessedPage[], 
    bookTitle: string
  ): Promise<string> {
    try {
      // Prepare content from first 5 pages
      const first5PagesContent = first5Pages.map(page => ({
        pageNumber: page.pageNumber,
        text: page.text,
        imageDescription: page.imageDescription
      }));

      const prompt = `Generate a comprehensive summary of this children's book titled "${bookTitle}". 
Include the main characters, plot, themes, and educational value. Keep it engaging for parents choosing books for their children.

First 5 pages content:
${JSON.stringify(first5PagesContent, null, 2)}

Full book text (excerpt):
${fullText.substring(0, 3000)}...

Focus on what makes this book special and what children can learn from it.`;

      const summary = await this.aiService.generateResponse(prompt);
      return summary;
    } catch (error) {
      console.error("Error generating enhanced book summary:", error);
      return "Summary generation failed";
    }
  }

  private async extractEnhancedMetadata(
    fullText: string, 
    first5Pages: ProcessedPage[], 
    fileName: string
  ): Promise<any> {
    try {
      // Prepare content from first 5 pages
      const first5PagesContent = first5Pages.map(page => ({
        pageNumber: page.pageNumber,
        text: page.text,
        imageDescription: page.imageDescription
      }));

      const prompt = `Analyze this children's book and extract metadata in JSON format. Extract the actual title from the book content, not the filename:

{
  "title": "Extract the actual book title from the content",
  "genre": "adventure/educational/fantasy/etc",
  "ageRange": "3-5 years",
  "themes": ["friendship", "learning", "adventure"],
  "educationalValue": ["counting", "colors", "social skills"],
  "characters": ["character1", "character2"],
  "setting": "description of where the story takes place",
  "language": "English/bilingual/etc",
  "illustration_style": "cartoon/realistic/watercolor/etc",
  "keyElements": ["key story elements from images and text"],
  "readingLevel": "beginner/intermediate/advanced"
}

First 5 pages with text and image descriptions:
${JSON.stringify(first5PagesContent, null, 2)}

Full book text (excerpt):
${fullText.substring(0, 2000)}...

Please analyze both the text content and image descriptions to provide comprehensive metadata.`;

      const response = await this.aiService.generateResponse(prompt);

      // Try to parse JSON response
      try {
        const metadata = JSON.parse(response);
        // Ensure title exists, fallback to filename if not extracted
        if (!metadata.title) {
          metadata.title = fileName.replace(".pdf", "").replace(/[-_]/g, " ");
        }
        return metadata;
      } catch {
        // If JSON parsing fails, return a basic metadata object
        return this.createFallbackMetadata(fileName);
      }
    } catch (error) {
      console.error("Error extracting enhanced metadata:", error);
      return this.createFallbackMetadata(fileName);
    }
  }

  private createFallbackMetadata(fileName: string): any {
    const title = fileName.replace(".pdf", "").replace(/[-_]/g, " ");
    return {
      title: title,
      genre: "children's book",
      extractedFromFile: fileName,
      processingDate: new Date().toISOString(),
    };
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
