import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Brain, Database, Trash2, Eye } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface Memory {
  id: string;
  memory: string;
  user_id: string;
  hash: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface SearchResult extends Memory {
  score: number;
}

export default function MemoriesConsole() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('child_1');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const queryClient = useQueryClient();

  // Get all memories for selected user
  const { data: allMemories = [], isLoading } = useQuery<Memory[]>({
    queryKey: ['/api/memories', selectedUserId],
    queryFn: async () => {
      const response = await fetch(`/api/memories/${selectedUserId}`);
      return response.json();
    },
    enabled: !!selectedUserId
  });

  // Search memories mutation
  const searchMutation = useMutation({
    mutationFn: async ({ query, userId }: { query: string; userId: string }): Promise<SearchResult[]> => {
      const response = await fetch('/api/memories/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, userId, limit: 20 })
      });
      return response.json();
    },
    onSuccess: (results: SearchResult[]) => {
      setSearchResults(results);
    }
  });

  // Delete memory mutation
  const deleteMutation = useMutation({
    mutationFn: async (memoryId: string): Promise<{ success: boolean }> => {
      const response = await fetch(`/api/memories/${memoryId}`, {
        method: 'DELETE'
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/memories'] });
      setSearchResults([]);
    }
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchMutation.mutate({ query: searchQuery, userId: selectedUserId });
    } else {
      setSearchResults([]);
    }
  };

  const handleDeleteMemory = (memoryId: string) => {
    if (confirm('Are you sure you want to delete this memory?')) {
      deleteMutation.mutate(memoryId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getMetadataBadges = (metadata: Record<string, any>) => {
    const badges = [];
    if (metadata.emotion) badges.push({ key: 'emotion', value: metadata.emotion, color: 'bg-blue-100 text-blue-800' });
    if (metadata.category) badges.push({ key: 'category', value: metadata.category, color: 'bg-green-100 text-green-800' });
    if (metadata.learning_context) badges.push({ key: 'context', value: metadata.learning_context, color: 'bg-purple-100 text-purple-800' });
    if (metadata.source) badges.push({ key: 'source', value: metadata.source, color: 'bg-gray-100 text-gray-800' });
    return badges;
  };

  const displayMemories = searchResults.length > 0 ? searchResults : allMemories;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Memory Console</h1>
          <Badge variant="secondary" className="ml-auto">
            Open Source Mem0
          </Badge>
        </div>
        <p className="text-gray-600">
          View and manage memories stored in the local CockroachDB vector database
        </p>
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search memories by content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="w-40">
              <select
                className="w-full p-2 border rounded-md"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="child_1">Child 1</option>
                <option value="child_2">Child 2</option>
                <option value="child_3">Child 3</option>
              </select>
            </div>
            <Button onClick={handleSearch} disabled={searchMutation.isPending}>
              {searchMutation.isPending ? 'Searching...' : 'Search'}
            </Button>
            {searchResults.length > 0 && (
              <Button variant="outline" onClick={() => setSearchResults([])}>
                Show All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Total Memories</p>
                <p className="text-2xl font-bold">{allMemories.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Search className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Search Results</p>
                <p className="text-2xl font-bold">{searchResults.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Selected User</p>
                <p className="text-lg font-semibold">{selectedUserId}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Memory List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p>Loading memories...</p>
            </CardContent>
          </Card>
        ) : displayMemories.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-500">
                {searchQuery ? 'No memories found for your search.' : 'No memories stored yet.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          displayMemories.map((memory: Memory | SearchResult) => (
            <Card key={memory.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">
                      {memory.memory}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-4 text-sm">
                      <span>ID: {memory.id}</span>
                      <span>User: {memory.user_id}</span>
                      <span>Created: {formatDate(memory.created_at)}</span>
                      {'score' in memory && (
                        <Badge variant="secondary">
                          Similarity: {(memory.score * 100).toFixed(1)}%
                        </Badge>
                      )}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteMemory(memory.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {getMetadataBadges(memory.metadata).map((badge) => (
                    <Badge key={badge.key} className={badge.color}>
                      {badge.key}: {badge.value}
                    </Badge>
                  ))}
                  <Badge variant="outline">
                    Hash: {memory.hash}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}