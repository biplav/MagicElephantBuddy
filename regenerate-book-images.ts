import fs from 'fs';
import path from 'path';
import pdf2pic from 'pdf2pic';

async function regenerateBookImages() {
  try {
    // Use any available PDF to generate sample book images
    const tempDirs = fs.readdirSync(path.join(process.cwd(), 'temp')).filter(dir =>
      fs.statSync(path.join(process.cwd(), 'temp', dir)).isDirectory()
    );

    let pdfPath: string | null = null;
    let pdfName = '';

    // Try to find any PDF in temp directories
    for (const dir of tempDirs) {
      const files = fs.readdirSync(path.join(process.cwd(), 'temp', dir));
      const pdfFile = files.find(file => file.endsWith('.pdf'));
      if (pdfFile) {
        pdfPath = path.join(process.cwd(), 'temp', dir, pdfFile);
        pdfName = pdfFile.replace('.pdf', '');
        console.log(`📚 Found PDF: ${pdfFile}`);
        break;
      }
    }

    if (!pdfPath) {
      console.error('❌ No PDF files found in temp directories');
      return;
    }

    // Create public/books directory if it doesn't exist
    const booksDir = path.join(process.cwd(), 'public', 'books');
    if (!fs.existsSync(booksDir)) {
      fs.mkdirSync(booksDir, { recursive: true });
    }

    console.log(`🖼️ Converting PDF to images: ${pdfPath}`);

    // Convert PDF to images
    const convert = pdf2pic.fromPath(pdfPath, {
      density: 100,
      saveFilename: "page",
      savePath: booksDir,
      format: "png",
      width: 800,
      height: 1000
    });

    // Convert first few pages
    for (let pageNum = 1; pageNum <= 4; pageNum++) {
      try {
        console.log(`📄 Converting page ${pageNum}...`);
        const result = await convert(pageNum, { responseType: "buffer" });

        if (result && result.buffer) {
          // Create filename in the format expected by the book system
          const fileName = `Bal_Hanuman_And_Orange-page-${pageNum}.png`;
          const filePath = path.join(booksDir, fileName);

          fs.writeFileSync(filePath, result.buffer);
          console.log(`✅ Created: ${fileName}`);
        }
      } catch (error) {
        console.log(`⚠️ Could not convert page ${pageNum}, might not exist`);
        break;
      }
    }

    console.log('🎉 Book images regenerated successfully!');
    console.log(`📁 Images saved to: ${booksDir}`);

  } catch (error) {
    console.error('❌ Error regenerating book images:', error);
  }
}

// Run the regeneration
regenerateBookImages();