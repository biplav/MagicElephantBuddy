
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Upload, FileText, Image, BookOpen, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';

interface Book {
  id: number;
  title: string;
  author?: string;
  genre?: string;
  ageRange?: string;
  summary?: string;
  totalPages: number;
  createdAt: string;
}

interface Page {
  id: number;
  pageNumber: number;
  pageText: string;
  imageDescription?: string;
  imageUrl: string;
}

export default function AdminBookUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookPages, setSelectedBookPages] = useState<Page[]>([]);
  const [showPages, setShowPages] = useState<number | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      setError('Please select a PDF file');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const response = await fetch('/api/admin/upload-book', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      setUploadResult(result);

      // Refresh books list
      await fetchBooks();

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const fetchBooks = async () => {
    try {
      const response = await fetch('/api/admin/books');
      if (response.ok) {
        const booksData = await response.json();
        setBooks(booksData);
      }
    } catch (err) {
      console.error('Failed to fetch books:', err);
    }
  };

  const fetchBookPages = async (bookId: number) => {
    try {
      const response = await fetch(`/api/admin/books/${bookId}/pages`);
      if (response.ok) {
        const pages = await response.json();
        setSelectedBookPages(pages);
        setShowPages(bookId);
      }
    } catch (err) {
      console.error('Failed to fetch book pages:', err);
    }
  };

  const deleteBook = async (bookId: number) => {
    setDeletingBookId(bookId);
    try {
      const response = await fetch(`/api/admin/books/${bookId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove book from local state
        setBooks(books.filter(book => book.id !== bookId));
        
        // Close pages view if this book was being viewed
        if (showPages === bookId) {
          setShowPages(null);
          setSelectedBookPages([]);
        }
        
        setError(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete book');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete book');
    } finally {
      setDeletingBookId(null);
    }
  };

  React.useEffect(() => {
    fetchBooks();
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Book Upload Admin</h1>
        <p className="text-gray-600">Upload PDF books to process and add to the storybook collection</p>
      </div>

      {/* Upload Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload New Book
          </CardTitle>
          <CardDescription>
            Select a PDF file to process. The system will extract pages, text, and generate descriptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="pdf-upload">PDF File</Label>
              <Input
                id="pdf-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                disabled={isUploading}
                ref={fileInputRef}
                className="cursor-pointer"
              />
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing PDF...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
                <p className="text-sm text-gray-500">
                  This may take a few minutes depending on the PDF size
                </p>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {uploadResult && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{uploadResult.message}</strong>
                  <br />
                  Book: "{uploadResult.book.title}" with {uploadResult.book.totalPages} pages
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Books List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Uploaded Books ({books.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {books.length === 0 ? (
            <p className="text-gray-500">No books uploaded yet</p>
          ) : (
            <div className="space-y-4">
              {books.map((book) => (
                <div key={book.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-lg">{book.title}</h3>
                      {book.author && <p className="text-gray-600">by {book.author}</p>}
                    </div>
                    <div className="flex gap-2">
                      {book.genre && <Badge variant="secondary">{book.genre}</Badge>}
                      {book.ageRange && <Badge variant="outline">{book.ageRange}</Badge>}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                    <span className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      {book.totalPages} pages
                    </span>
                    <span>Added {new Date(book.createdAt).toLocaleDateString()}</span>
                  </div>

                  {book.summary && (
                    <p className="text-sm text-gray-700 mb-3 line-clamp-2">{book.summary}</p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchBookPages(book.id)}
                      disabled={showPages === book.id}
                    >
                      <Image className="h-4 w-4 mr-1" />
                      {showPages === book.id ? 'Loading...' : 'View Pages'}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingBookId === book.id}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          {deletingBookId === book.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Book</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{book.title}"? This will permanently remove the book and all its pages from both the database and object storage. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteBook(book.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Book
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pages Modal/View */}
      {showPages && selectedBookPages.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Book Pages</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPages(null)}
              className="w-fit"
            >
              Close
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedBookPages.map((page) => (
                <div key={page.id} className="border rounded-lg p-4">
                  <div className="mb-2">
                    <Badge variant="outline">Page {page.pageNumber}</Badge>
                  </div>
                  
                  <img
                    src={page.imageUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="w-full h-48 object-contain border rounded mb-2"
                  />
                  
                  {page.imageDescription && (
                    <div className="mb-2">
                      <Label className="text-xs text-gray-500">Image Description:</Label>
                      <p className="text-sm text-gray-700">{page.imageDescription}</p>
                    </div>
                  )}
                  
                  {page.pageText && (
                    <div>
                      <Label className="text-xs text-gray-500">Text Content:</Label>
                      <p className="text-sm text-gray-700 max-h-20 overflow-y-auto">
                        {page.pageText}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
