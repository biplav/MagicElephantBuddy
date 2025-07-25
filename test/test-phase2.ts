import { memoryService } from '../server/memory-service';
import { storage } from '../server/storage';

// Example test case
describe('Example Test', () => {
  it('should pass', () => {
    expect(memoryService).toBeDefined();
    expect(storage).toBeDefined();
  });
});