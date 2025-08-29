import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBookStateManager } from '@/hooks/useBookStateManager';

export function BookStateTest() {
  const { selectedBook, handleBookSearch, handleDisplayBookPage } = useBookStateManager();
  const [searchQuery, setSearchQuery] = useState('');
  const [pageRequest, setPageRequest] = useState('1');
  const [lastResult, setLastResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const testBookSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const result = await handleBookSearch('test-search', { query: searchQuery });
      setLastResult({ type: 'search', result });
      console.log('Book search result:', result);
    } catch (error) {
      setLastResult({ type: 'error', result: error.message });
      console.error('Book search error:', error);
    }
    setIsLoading(false);
  };

  const testDisplayPage = async () => {
    if (!selectedBook) {
      setLastResult({ type: 'error', result: 'No book selected. Search for a book first.' });
      return;
    }

    setIsLoading(true);
    try {
      const result = await handleDisplayBookPage('test-display', { pageRequest }, (pageData) => {
        console.log('Page displayed:', pageData);
        setLastResult({ type: 'page', result: pageData });
      });
      console.log('Display page result:', result);
    } catch (error) {
      setLastResult({ type: 'error', result: error.message });
      console.error('Display page error:', error);
    }
    setIsLoading(false);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Book State Manager Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current State Display */}
        <div className="bg-gray-100 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">Current Redux State:</h3>
          <div className="text-sm">
            <div>Selected Book: {selectedBook ? selectedBook.title : 'None'}</div>
            {selectedBook && (
              <>
                <div>Author: {selectedBook.author}</div>
                <div>Total Pages: {selectedBook.totalPages}</div>
                <div>ID: {selectedBook.id}</div>
              </>
            )}
          </div>
        </div>

        {/* Book Search Test */}
        <div className="space-y-2">
          <h3 className="font-semibold">Test Book Search:</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Enter search query (e.g., 'Hanuman')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && testBookSearch()}
            />
            <Button onClick={testBookSearch} disabled={isLoading}>
              Search Books
            </Button>
          </div>
        </div>

        {/* Page Display Test */}
        <div className="space-y-2">
          <h3 className="font-semibold">Test Page Display:</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Page request (1, first, next, etc.)"
              value={pageRequest}
              onChange={(e) => setPageRequest(e.target.value)}
            />
            <Button onClick={testDisplayPage} disabled={isLoading || !selectedBook}>
              Display Page
            </Button>
          </div>
          {!selectedBook && (
            <p className="text-sm text-gray-500">Search for a book first to enable page display</p>
          )}
        </div>

        {/* Results Display */}
        {lastResult && (
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Last Result ({lastResult.type}):</h3>
            <pre className="text-sm bg-white p-2 rounded border overflow-auto max-h-48">
              {JSON.stringify(lastResult.result, null, 2)}
            </pre>
          </div>
        )}

        {/* Quick Test Buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('Hanuman');
              setTimeout(testBookSearch, 100);
            }}
          >
            Quick Test: Search "Hanuman"
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPageRequest('first');
              setTimeout(testDisplayPage, 100);
            }}
            disabled={!selectedBook}
          >
            Quick Test: Show First Page
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}