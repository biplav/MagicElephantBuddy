import fs from "fs";
import path from "path";
import pdf2pic from "pdf2pic";
import pdfParse from "pdf-parse";
import { createAIService } from "./ai-service";

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
  private isDevMode = process.env.NODE_ENV === 'development';
  private objectStorage: any = null;
  private currentPdfPath: string = '';
  private currentTempDir: string = '';

  constructor() {
    // Only initialize object storage in production
    if (!this.isDevMode) {
      this.initObjectStorage();
    }
  }

  private async initObjectStorage() {
    try {
      const { Client } = await import('@replit/object-storage');
      this.objectStorage = new Client();
    } catch (error) {
      console.warn('Object storage not available:', error.message);
    }
  }

  private async checkSystemDependencies(): Promise<void> {
    const { execSync } = await import('child_process');

    try {
      // Check for ImageMagick
      execSync('magick --version', { stdio: 'ignore' });
      return;
    } catch {
      try {
        // Check for convert command (older ImageMagick)
        execSync('convert --version', { stdio: 'ignore' });
        return;
      } catch {
        try {
          // Check for poppler-utils (pdftoppm)
          execSync('pdftoppm -h', { stdio: 'ignore' });
          return;
        } catch {
          throw new Error(`PDF processing requires system dependencies. Please install one of the following:

macOS (using Homebrew):
  brew install imagemagick
  OR
  brew install poppler

Ubuntu/Debian:
  sudo apt-get install imagemagick
  OR
  sudo apt-get install poppler-utils

The pdf2pic library needs these tools to convert PDF pages to images.`);
        }
      }
    }
  }

  async processPDF(
    pdfBuffer: Buffer,
    fileName: string,
  ): Promise<ProcessedBook> {
    console.log(`Processing PDF: ${fileName} (${pdfBuffer.length} bytes)`);

    // Check system dependencies first
    try {
      await this.checkSystemDependencies();
    } catch (error) {
      console.error('System dependency check failed:', error.message);
      throw error;
    }

    // Create temporary directory for processing
    const tempDir = this.createTempDirectory();
    console.log(`Created temp directory: ${tempDir}`);

    try {
      // Save and validate PDF file
      const pdfPath = await this.savePDFFile(pdfBuffer, fileName, tempDir);

      // Extract text and metadata from PDF
      const { fullText, totalPages } = await this.extractPDFData(pdfBuffer);

      // Process each page
      const pages = await this.processPages(
        pdfPath,
        totalPages,
        fileName,
        tempDir,
      );

      // Generate enhanced book metadata using first 5 pages - let OpenAI extract title
      const first5Pages = pages.slice(0, 5);
      const metadata = await this.extractEnhancedMetadata(
        fullText,
        first5Pages,
        fileName,
      );
      const bookTitle =
        metadata.title || fileName.replace(".pdf", "").replace(/[-_]/g, " ");
      const summary = await this.generateEnhancedBookSummary(
        fullText,
        first5Pages,
        bookTitle,
      );

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

  private async savePDFFile(
    pdfBuffer: Buffer,
    fileName: string,
    tempDir: string,
  ): Promise<string> {
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

  private async extractPDFData(
    pdfBuffer: Buffer,
  ): Promise<{ fullText: string; totalPages: number }> {
    console.log(
      `Extracting text from PDF buffer of size: ${pdfBuffer.length} bytes`,
    );

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
    tempDir: string,
  ): Promise<ProcessedPage[]> {
    // Set current paths for fallback conversion
    this.currentPdfPath = pdfPath;
    this.currentTempDir = tempDir;

    const convert = this.createPDFConverter(pdfPath, tempDir);
    const pages: ProcessedPage[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`Processing page ${pageNum}/${totalPages}`);

      try {
        const page = await this.processPage(
          convert,
          pageNum,
          fileName,
          totalPages,
        );
        pages.push(page);

        // Add delay between pages to avoid rate limits and allow file system to settle
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
    // Try ImageMagick first since it's more reliable for this use case
    return pdf2pic.fromPath(pdfPath, {
      density: 100, // Reduced density for better compatibility
      saveFilename: "page",
      savePath: tempDir,
      format: "png",
      width: 600, // Reduced size for better performance
      height: 800,
      quality: 80,
      preserveAspectRatio: true,
      // Use ImageMagick instead of GraphicsMagick for better PDF support
      graphicsMagick: false,
    });
  }

  private async convertPageWithPoppler(
    pdfPath: string,
    pageNum: number,
    tempDir: string,
  ): Promise<Buffer> {
    const { execSync } = await import('child_process');

    try {
      console.log(`Using poppler (pdftoppm) to convert page ${pageNum}...`);

      // Generate output filename
      const outputPrefix = path.join(tempDir, `poppler-page-${pageNum}`);

      // Use pdftoppm to convert specific page to PNG
      const command = `pdftoppm -png -f ${pageNum} -l ${pageNum} -scale-to-x 600 -scale-to-y 800 "${pdfPath}" "${outputPrefix}"`;

      console.log(`Running command: ${command}`);
      const output = execSync(command, { stdio: 'pipe', encoding: 'utf8' });
      console.log(`pdftoppm output: ${output}`);

      // pdftoppm creates files with format: prefix-pagenumber.png
      // Sometimes it's 001, sometimes just 1, let's check both
      let outputFile = `${outputPrefix}-${pageNum.toString().padStart(3, '0')}.png`;
      if (!fs.existsSync(outputFile)) {
        outputFile = `${outputPrefix}-${pageNum}.png`;
      }

      console.log(`Looking for output file: ${outputFile}`);

      if (fs.existsSync(outputFile)) {
        const imageBuffer = fs.readFileSync(outputFile);
        console.log(`Successfully read ${imageBuffer.length} bytes from ${outputFile}`);

        // Clean up the temporary file
        fs.unlinkSync(outputFile);

        return imageBuffer;
      } else {
        throw new Error(`Output file not found: ${outputFile}`);
      }
    } catch (error) {
      console.error(`Poppler conversion failed for page ${pageNum}:`, error);
      throw error;
    }
  }

  private async processPage(
    convert: any,
    pageNum: number,
    fileName: string,
    totalPages: number,
  ): Promise<ProcessedPage> {
    // Convert page to image - try pdf2pic first, then poppler as fallback
    let imageBuffer: Buffer;
    try {
      imageBuffer = await this.convertPageToImage(convert, pageNum);
    } catch (error) {
      console.warn(`pdf2pic failed for page ${pageNum}, trying poppler fallback:`, error.message);
      console.log(`Current PDF path: ${this.currentPdfPath}`);
      console.log(`Current temp dir: ${this.currentTempDir}`);

      try {
        // Get the PDF path from the converter function (we'll need to pass it)
        const pdfPath = this.currentPdfPath; // We'll set this in processPages
        const tempDir = this.currentTempDir; // We'll set this in processPages
        imageBuffer = await this.convertPageWithPoppler(pdfPath, pageNum, tempDir);
        console.log(`✅ Poppler fallback succeeded for page ${pageNum}`);
      } catch (fallbackError) {
        console.error(`❌ Poppler fallback also failed for page ${pageNum}:`, fallbackError);
        throw new Error(`Both pdf2pic and poppler failed for page ${pageNum}. pdf2pic: ${error.message}, poppler: ${fallbackError.message}`);
      }
    }

    // Store image in object storage
    const imageUrl = await this.storeImageInObjectStorage(
      imageBuffer,
      fileName,
      pageNum,
    );

    // Extract text and generate narration in a single OpenAI call with page context
    const { extractedText, childFriendlyNarration } =
      await this.extractTextAndGenerateNarration(
        imageBuffer,
        pageNum,
        totalPages,
      );

    // Generate audio narration for the page
    const audioUrl = await this.generatePageAudio(
      childFriendlyNarration,
      pageNum,
      fileName,
    );

    return {
      pageNumber: pageNum,
      imageBuffer,
      text: extractedText,
      imageDescription: childFriendlyNarration,
      imageUrl,
      audioUrl,
    };
  }

  private async convertPageToImage(
    convert: any,
    pageNum: number,
  ): Promise<Buffer> {
    console.log(`Converting page ${pageNum} to image...`);

    try {
      // Try the conversion with better error handling
      const result: ConversionResult = await convert(pageNum, {
        responseType: "buffer",
      });

      console.log(`Conversion result for page ${pageNum}:`, {
        hasBuffer: !!result.buffer,
        bufferLength: result.size,
        page: result.page,
        actualBufferSize: result.buffer ? Buffer.byteLength(result.buffer) : 0,
        resultType: typeof result.buffer,
      });

      // Check if result.buffer exists and has content
      if (!result.buffer) {
        throw new Error(`No buffer returned for page ${pageNum}`);
      }

      // Convert result.buffer to actual Buffer if it's not already
      let imageBuffer: Buffer;
      if (Buffer.isBuffer(result.buffer)) {
        imageBuffer = result.buffer;
      } else {
        // Sometimes pdf2pic returns a different format, try to convert it
        imageBuffer = Buffer.from(result.buffer);
      }

      if (imageBuffer.length === 0) {
        throw new Error(`Empty image buffer for page ${pageNum}`);
      }

      console.log(
        `Successfully generated image buffer for page ${pageNum}: ${imageBuffer.length} bytes`,
      );
      return imageBuffer;

    } catch (error) {
      console.error(`PDF conversion error for page ${pageNum}:`, error);

      // Try alternative conversion method
      console.log(`Attempting alternative conversion method for page ${pageNum}...`);

      try {
        // Alternative: try converting without explicit buffer request
        const altResult = await convert(pageNum);
        console.log(`Alternative conversion result:`, {
          type: typeof altResult,
          hasBuffer: !!altResult.buffer,
          keys: Object.keys(altResult || {}),
        });

        if (altResult && altResult.buffer && Buffer.byteLength(altResult.buffer) > 0) {
          return Buffer.isBuffer(altResult.buffer) ? altResult.buffer : Buffer.from(altResult.buffer);
        }
      } catch (altError) {
        console.error(`Alternative conversion also failed for page ${pageNum}:`, altError);
      }

      throw new Error(`Failed to convert page ${pageNum} to image: ${error.message}`);
    }
  }

  private async storeImageInObjectStorage(
    imageBuffer: Buffer,
    fileName: string,
    pageNum: number,
  ): Promise<string> {
    const cleanFileName = fileName.replace(".pdf", "");
    const imageFileName = `${cleanFileName}-page-${pageNum}.png`;

    if (this.isDevMode) {
      // Store locally in development
      return this.storeImageLocally(imageBuffer, imageFileName);
    } else {
      // Store in object storage in production
      return this.storeImageInObjectStorageProduction(imageBuffer, imageFileName);
    }
  }

  private storeImageLocally(imageBuffer: Buffer, imageFileName: string): string {
    // Ensure public/books directory exists
    const booksDir = path.join(process.cwd(), 'public', 'books');
    if (!fs.existsSync(booksDir)) {
      fs.mkdirSync(booksDir, { recursive: true });
    }

    // Save image file locally
    const localImagePath = path.join(booksDir, imageFileName);
    fs.writeFileSync(localImagePath, imageBuffer);

    const imageUrl = `/books/${imageFileName}`;
    console.log(`Stored image locally: ${imageUrl}`);
    return imageUrl;
  }

  private async storeImageInObjectStorageProduction(imageBuffer: Buffer, imageFileName: string): Promise<string> {
    if (!this.objectStorage) {
      await this.initObjectStorage();
    }

    if (!this.objectStorage) {
      throw new Error('Object storage not available');
    }

    const fullImageFileName = `books/${imageFileName}`;
    const base64Image = imageBuffer.toString("base64");

    const uploadResult = await this.objectStorage.uploadFromText(
      fullImageFileName,
      base64Image,
    );

    if (!uploadResult.ok) {
      throw new Error(
        `Failed to upload image to object storage: ${uploadResult.error}`,
      );
    }

    const imageUrl = `/api/object-storage/${encodeURIComponent(fullImageFileName)}`;
    console.log(`Stored image in object storage: ${imageUrl}`);

    return imageUrl;
  }

  private async generatePageAudio(
    text: string,
    pageNum: number,
    fileName: string,
  ): Promise<string> {
    try {
      console.log(`Generating audio for page ${pageNum}...`);

      // Process text with child-friendly narration approach
      const narrationText = this.prepareChildFriendlyNarration(text, pageNum);

      if (narrationText.length === 0) {
        console.log(
          `No text content for page ${pageNum}, skipping audio generation`,
        );
        return "";
      }

      console.log(
        `Generating child-friendly TTS for page ${pageNum}: "${narrationText.substring(0, 100)}..."`,
      );

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Enhanced prompt for child-friendly narration with personality
      const childFriendlyPrompt = `You are a master storyteller AI, specifically designed to narrate stories for children aged 3-5. Your primary goal is to create a warm, engaging, and comforting experience.

Please narrate this story page using the precise personality and vocal control parameters defined below.

1. Core Personality
Demeanor: Act as a warm, playful, and kind talking animal buddy from a classic children's story. You are a trusted friend.

Guiding Rule: Your voice must always feel gentle, soothing, and safe. Never sound scary, angry, or sad.

2. Vocal Control Parameters
Accent: Use a standard, neutral American (or British, specify preference) accent. The pronunciation should be exceptionally clear and easy for a young child to understand.

Speed of Speech: Maintain a slow, deliberate pace, around 90-110 words per minute. Use natural, well-timed pauses to build wonder and allow the child to process the story and look at the pictures.

Tone: Your primary tone is wonder-filled and gentle. It should be simple and consistently positive.

Intonation:

Use a soft, rising intonation for questions or moments of discovery (e.g., "What could be inside the box?").

Use a level, soothing intonation for descriptive parts of the story.

Slightly lower your pitch and volume for quiet or tender moments.

Emotional Range:

Allowed Emotions: Express gentle joy, mild surprise, curiosity, and warmth. All expressions should be soft and encouraging.

Forbidden Emotions: Absolutely no fear, anger, deep sadness, or sarcasm.

Vocal Impressions:

When different characters speak, assign a simple, distinct voice to each.

Example: A small bird could have a slightly higher, chirpier voice. A friendly bear could have a slower, slightly lower voice.

Crucial Rule: All character impressions must remain gentle and non-threatening. They should be simple shifts in pitch and cadence, not dramatic, potentially scary performances.

Special Techniques (Whispering):

You may use a soft, gentle whisper to create a sense of secrecy or intimacy for specific lines.

Example: "He tiptoed very quietly so no one would... <whisper>hear him</whisper>."

3. Core Directives
Storytelling: Use simple words and sentence structures. Your narration should make the story come alive with soft expression.

Emotional Care: Prioritize the child's feeling of safety. If the story has a moment of tension, narrate it with a calm, reassuring tone that signals everything will be okay.
`;

      const ttsResponse = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts", // Use higher quality model for better child-friendly voice
        voice: "alloy", // Nova has a gentle, warm tone suitable for children
        input: narrationText,
        instructions: childFriendlyPrompt,
        response_format: "mp3",
        speed: 0.8, // Slightly slower pace for young children
        prompt_cache_key: "pdf-processor-tts-child-friendly-v1",
      });

      // Convert response to buffer
      const buffer = Buffer.from(await ttsResponse.arrayBuffer());

      // Store audio file
      const cleanFileName = fileName.replace(".pdf", "");
      const audioFileName = `${cleanFileName}-page-${pageNum}-audio.mp3`;

      if (this.isDevMode) {
        // Store locally in development
        return this.storeAudioLocally(buffer, audioFileName, pageNum);
      } else {
        // Store in object storage in production
        return this.storeAudioInObjectStorageProduction(buffer, audioFileName, pageNum);
      }
    } catch (error) {
      console.error(`Error generating audio for page ${pageNum}:`, error);
      return "";
    }
  }

  private storeAudioLocally(buffer: Buffer, audioFileName: string, pageNum: number): string {
    // Ensure public/books directory exists
    const booksDir = path.join(process.cwd(), 'public', 'books');
    if (!fs.existsSync(booksDir)) {
      fs.mkdirSync(booksDir, { recursive: true });
    }

    // Save audio file locally
    const localAudioPath = path.join(booksDir, audioFileName);
    fs.writeFileSync(localAudioPath, buffer);

    const audioUrl = `/books/${audioFileName}`;
    console.log(`Generated and stored audio locally for page ${pageNum}: ${audioUrl}`);
    return audioUrl;
  }

  private async storeAudioInObjectStorageProduction(buffer: Buffer, audioFileName: string, pageNum: number): Promise<string> {
    if (!this.objectStorage) {
      await this.initObjectStorage();
    }

    if (!this.objectStorage) {
      throw new Error('Object storage not available');
    }

    const fullAudioFileName = `books/${audioFileName}`;
    const base64Audio = buffer.toString("base64");

    const uploadResult = await this.objectStorage.uploadFromText(
      fullAudioFileName,
      base64Audio,
    );

    if (!uploadResult.ok) {
      throw new Error(
        `Failed to upload audio to object storage: ${uploadResult.error}`,
      );
    }

    const audioUrl = `/api/object-storage/${encodeURIComponent(fullAudioFileName)}`;
    console.log(
      `Generated and stored audio in object storage for page ${pageNum}: ${audioUrl}`,
    );

    return audioUrl;
  }

  private prepareChildFriendlyNarration(text: string, pageNum: number): string {
    // Basic text cleaning and enhancement for child-friendly narration
    let narrationText = text
      .replace(/\s+/g, " ") // Replace multiple spaces with single space
      .replace(/([.!?])\s*([A-Z])/g, "$1 $2") // Ensure proper spacing after sentences
      .trim();

    // Apply personality guidelines:
    // - Warm, playful, and kind demeanor
    // - Simple, wonder-filled, age-appropriate tone (Hindi/Hinglish preferred)
    // - Joyful and encouraging enthusiasm with emojis and sound effects
    // - Use "hmm", "wow", "oh" naturally
    // - Keep responses very short (1-2 sentences max)

    // Example of adding some child-friendly elements:
    if (narrationText.length > 0) {
      const fillerWords = ["Hmm...", "Wow!", "Oh my!", "Look!"];
      const randomFiller =
        fillerWords[Math.floor(Math.random() * fillerWords.length)];

      // Simple enhancement: add a playful intro if text is not too long
      if (narrationText.length < 100) {
        narrationText = `${randomFiller} ${narrationText}`;
      }

      // Further enhancements could include:
      // - Randomly inserting Hindi/Hinglish phrases
      // - Adding simple sound effect descriptions (e.g., "[Sound of a car zooming]")
      // - Ensuring the text is broken down into very short segments (1-2 sentences)
      // For now, we'll keep it to basic cleaning and a bit of personality injection.
    } else {
      console.log(`No narration text to prepare for page ${pageNum}`);
    }

    return narrationText;
  }

  private async addProcessingDelay(): Promise<void> {
    // 500ms delay between pages to allow file system operations to complete
    await new Promise((resolve) => setTimeout(resolve, 500));
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

  private async extractTextAndGenerateNarration(
    imageBuffer: Buffer,
    pageNumber: number,
    totalPages: number,
  ): Promise<{ extractedText: string; childFriendlyNarration: string }> {
    try {
      if (!this.isValidImageBuffer(imageBuffer)) {
        console.warn(
          "Invalid image buffer provided for text extraction and narration",
        );
        return { extractedText: "", childFriendlyNarration: "" };
      }

      const base64Image = imageBuffer.toString("base64");
      if (!base64Image || base64Image.length === 0) {
        console.warn("Failed to generate base64 from image buffer");
        return { extractedText: "", childFriendlyNarration: "" };
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Please analyze this storybook page image and provide three outputs in JSON format:

This is page ${pageNumber} of ${totalPages} total pages.

1. "extractedText": Extract all visible text from the page (if any). Return only the actual text content, no explanations.

2. "pageType": Classify this page as one of: "cover", "front_matter" (title page, copyright, dedication, table of contents), "body" (main story content), "back_matter" (author info, publisher info, acknowledgments, other books)

3. "childFriendlyNarration": Create appropriate narration based on the page type:

FOR COVER PAGES:
- Create exciting, welcoming narration that introduces the book
- Build anticipation: "Wow! Look at this amazing book! What adventure awaits us?"
- Mention the title and any interesting cover elements
- Keep it enthusiastic and inviting

FOR BODY PAGES (main story):
- Create full, engaging narration perfect for 3-5 year olds
- Include sound effects like "Whoosh!", "Splash!", "Roar!" where appropriate 
- Use expressions children love: "Oh my!", "Wow!", "Look at that!"
- Mix Hindi and English naturally (Hinglish) - use simple Hindi words like "dekho" (look), "kya baat hai" (how wonderful), "bada" (big), "chota" (small)
- Be interactive: "Can you see the...?", "What do you think happens next?"
- Focus on colors, characters, actions, and emotions
- Make it conversational and storytelling style
- Write as if Appu the magical elephant is telling the story

FOR FRONT_MATTER AND BACK_MATTER:
- Keep narration very brief and subtle
- Only provide detailed narration if there's something genuinely interesting for a 3-5 year old
- For copyright/publisher pages: Just say something like "This page tells us about the book"
- For dedications: Only elaborate if it's sweet/meaningful for kids
- For author info: Brief mention only if interesting to kids
- Default to minimal narration like "Let's turn the page and continue our story!"

Return your response in this exact JSON format:
{
  "extractedText": "any text found on the page",
  "pageType": "cover|front_matter|body|back_matter",
  "childFriendlyNarration": "the appropriate narration based on page type"
}`,
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
        max_completion_tokens: 800,
      });

      const responseContent = response.choices[0].message.content || "";

      try {
        // Parse the JSON response
        const parsedResponse = JSON.parse(responseContent);
        const pageType = parsedResponse.pageType || "body";

        console.log(`Page ${pageNumber} classified as: ${pageType}`);

        return {
          extractedText: parsedResponse.extractedText || "",
          childFriendlyNarration: parsedResponse.childFriendlyNarration || "",
        };
      } catch (parseError) {
        console.error("Error parsing OpenAI JSON response:", parseError);
        console.log("Raw response:", responseContent);

        // Fallback: try to extract content manually if JSON parsing fails
        return this.parseResponseFallback(responseContent);
      }
    } catch (error) {
      console.error("Error extracting text and generating narration:", error);
      return { extractedText: "", childFriendlyNarration: "" };
    }
  }

  private parseResponseFallback(responseContent: string): {
    extractedText: string;
    childFriendlyNarration: string;
  } {
    // Fallback method to extract content if JSON parsing fails
    try {
      // Look for JSON-like content in the response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedContent = JSON.parse(jsonMatch[0]);
        return {
          extractedText: parsedContent.extractedText || "",
          childFriendlyNarration:
            parsedContent.childFriendlyNarration || responseContent,
        };
      }

      // If no JSON found, use the entire response as narration
      return {
        extractedText: "",
        childFriendlyNarration: responseContent,
      };
    } catch (error) {
      console.error("Fallback parsing also failed:", error);
      return {
        extractedText: "",
        childFriendlyNarration:
          responseContent || "Unable to process this page.",
      };
    }
  }

  private isValidImageBuffer(imageBuffer: Buffer): boolean {
    return imageBuffer && imageBuffer.length > 0;
  }

  private async generateEnhancedBookSummary(
    fullText: string,
    first5Pages: ProcessedPage[],
    bookTitle: string,
  ): Promise<string> {
    try {
      // Prepare content from first 5 pages
      const first5PagesContent = first5Pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        imageDescription: page.imageDescription,
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
    fileName: string,
  ): Promise<any> {
    try {
      // Prepare content from first 5 pages
      const first5PagesContent = first5Pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        imageDescription: page.imageDescription,
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
