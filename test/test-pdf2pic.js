
import pdf2pic from 'pdf2pic';
import fs from 'fs';
import path from 'path';

console.log('Testing pdf2pic library...');

// Check if test PDF exists
const testPdfPath = './public/books/wise-brown-moon-page-30.pdf';
if (!fs.existsSync(testPdfPath)) {
  console.error('Test PDF not found at:', testPdfPath);
  process.exit(1);
}

const tempDir = path.join(process.cwd(), 'temp', 'test-pdf2pic');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

try {
  console.log('Setting up pdf2pic converter...');
  const convert = pdf2pic.fromPath(testPdfPath, {
    density: 150,
    saveFilename: "test-page",
    savePath: tempDir,
    format: "png",
    width: 800,
    height: 1000
  });

  console.log('Converting first page...');
  const result = await convert(1, { responseType: "buffer" });
  
  console.log('Conversion result:', {
    hasBuffer: !!result.buffer,
    bufferLength: result.buffer ? result.buffer.length : 0,
    resultKeys: Object.keys(result),
    bufferType: result.buffer ? typeof result.buffer : 'undefined'
  });

  if (result.buffer && result.buffer.length > 0) {
    console.log('✅ pdf2pic is working correctly');
    // Save test image
    const testImagePath = path.join(tempDir, 'test-output.png');
    fs.writeFileSync(testImagePath, result.buffer);
    console.log(`Test image saved to: ${testImagePath}`);
  } else {
    console.log('❌ pdf2pic returned empty buffer');
    
    // Check if file was created instead
    const expectedFile = path.join(tempDir, 'test-page.1.png');
    if (fs.existsSync(expectedFile)) {
      const fileBuffer = fs.readFileSync(expectedFile);
      console.log(`Found generated file: ${expectedFile} (${fileBuffer.length} bytes)`);
    }
  }

} catch (error) {
  console.error('❌ pdf2pic test failed:', error.message);
} finally {
  // Cleanup
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
