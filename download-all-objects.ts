
import { Client } from '@replit/object-storage';
import fs from 'fs';
import path from 'path';

async function downloadAllObjects() {
  try {
    const objectStorage = new Client();
    
    // Create public/books directory if it doesn't exist for local development
    const downloadDir = path.join(process.cwd(), 'public', 'books');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    console.log('🔍 Listing all objects in storage...');
    
    // List all objects in the bucket
    const listResult = await objectStorage.list();
    
    if (!listResult.ok) {
      console.error('❌ Failed to list objects:', listResult.error);
      return;
    }

    const objects = listResult.value;
    console.log(`📁 Found ${objects.length} objects to download`);

    if (objects.length === 0) {
      console.log('ℹ️ No objects found in storage');
      return;
    }

    // Download each object
    for (const obj of objects) {
      console.log(`⬇️ Downloading: ${obj.key}`);
      
      try {
        // Download the object
        const downloadResult = await objectStorage.downloadAsBytes(obj.key);
        
        if (!downloadResult.ok) {
          console.error(`❌ Failed to download ${obj.key}:`, downloadResult.error);
          continue;
        }

        // Create subdirectories if the key contains slashes
        const filePath = path.join(downloadDir, obj.key);
        const fileDir = path.dirname(filePath);
        
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        // Write the file
        fs.writeFileSync(filePath, downloadResult.value);
        console.log(`✅ Downloaded: ${obj.key} (${downloadResult.value.length} bytes)`);
        
      } catch (error) {
        console.error(`❌ Error downloading ${obj.key}:`, error);
      }
    }

    console.log(`🎉 Download complete! Files saved to: ${downloadDir}`);
    
  } catch (error) {
    console.error('❌ Error during download process:', error);
  }
}

// Run the download
downloadAllObjects();

