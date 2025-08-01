
import pdfParse from 'pdf-parse';
import fs from 'fs';
import { createRequire } from 'module';

// Create require function for importing package.json
const require = createRequire(import.meta.url);

// Test if pdf-parse works with a simple buffer
console.log('Testing pdf-parse library...');

// Create a minimal test
const testBuffer = Buffer.from('test');
try {
  console.log('pdf-parse library loaded successfully');
  console.log('Version:', require('pdf-parse/package.json').version);
} catch (error) {
  console.error('Error with pdf-parse:', error.message);
}

// Test with actual PDF if available
const testPdfPath = './public/test.pdf'; // We'll use a simple test file
if (fs.existsSync(testPdfPath)) {
  const pdfBuffer = fs.readFileSync(testPdfPath);
  pdfParse(pdfBuffer)
    .then(data => {
      console.log('✅ PDF processing test successful');
      console.log('Pages:', data.numpages);
      console.log('Text length:', data.text.length);
    })
    .catch(err => {
      console.error('❌ PDF processing test failed:', err.message);
    });
} else {
  console.log('No test PDF found at', testPdfPath);
}
