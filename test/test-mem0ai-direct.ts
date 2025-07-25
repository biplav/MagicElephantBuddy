// Test direct access to mem0ai functionality
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

async function testMem0aiAccess() {
  try {
    console.log('🔍 Testing direct mem0ai access...');
    
    // Try to access mem0ai from nested dependency
    const path = require('path');
    const mem0aiPath = path.join(process.cwd(), 'node_modules/@mastra/mem0/node_modules/mem0ai');
    
    // Alternative approach: require from nested path
    const mem0 = require(mem0aiPath);
    console.log('✅ mem0ai loaded successfully');
    console.log('Available exports:', Object.keys(mem0));
    
    // Check if MemoryClient is available
    if (mem0.MemoryClient) {
      console.log('✅ MemoryClient class found');
      
      // Try to create a client (without API key for now)
      try {
        const client = new mem0.MemoryClient();
        console.log('✅ MemoryClient instantiated');
        console.log('Client methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
      } catch (clientError: any) {
        console.log('⚠️ MemoryClient instantiation requires configuration:', clientError.message);
      }
    }
    
    // Check for other exports
    console.log('\n📋 Full mem0ai exports:');
    Object.keys(mem0).forEach(key => {
      console.log(`  - ${key}: ${typeof mem0[key]}`);
    });
    
  } catch (error: any) {
    console.error('❌ Error accessing mem0ai:', error.message);
    
    // Fallback: try to require from nested node_modules
    try {
      const fs = require('fs');
      const path = require('path');
      const nestedPath = path.join(process.cwd(), 'node_modules/@mastra/mem0/node_modules/mem0ai');
      
      if (fs.existsSync(nestedPath)) {
        console.log('✅ mem0ai package exists at nested path');
        const packageJson = JSON.parse(fs.readFileSync(path.join(nestedPath, 'package.json'), 'utf8'));
        console.log('Package version:', packageJson.version);
        console.log('Main entry:', packageJson.main);
      }
    } catch (nestedError: any) {
      console.error('❌ Nested access also failed:', nestedError.message);
    }
  }
}

testMem0aiAccess();