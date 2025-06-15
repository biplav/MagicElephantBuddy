import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Clock, Lightbulb, Quote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProfileSuggestion {
  id: number;
  childId: number;
  type: string;
  category?: string;
  value: string | string[];
  confidence: number;
  evidence: string;
  action: string;
  status: string;
  parentResponse?: any;
  conversationId: number;
  createdAt: string;
}

interface ProfileSuggestionsProps {
  parentId: number;
}

export function ProfileSuggestions({ parentId }: ProfileSuggestionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [responseText, setResponseText] = useState<{ [key: number]: string }>({});

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['/api/parents', parentId, 'profile-suggestions'],
  });

  const updateSuggestionMutation = useMutation({
    mutationFn: async ({ suggestionId, status, parentResponse }: {
      suggestionId: number;
      status: string;
      parentResponse?: string;
    }) => {
      return apiRequest(`/api/profile-suggestions/${suggestionId}`, {
        method: 'PATCH',
        body: { status, parentResponse }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parents', parentId, 'profile-suggestions'] });
      toast({
        title: "Profile suggestion updated",
        description: "The suggestion has been processed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile suggestion.",
        variant: "destructive",
      });
    },
  });

  const handleAccept = (suggestionId: number) => {
    updateSuggestionMutation.mutate({
      suggestionId,
      status: 'accepted',
      parentResponse: responseText[suggestionId] || 'Accepted without comment'
    });
  };

  const handleReject = (suggestionId: number) => {
    updateSuggestionMutation.mutate({
      suggestionId,
      status: 'rejected',
      parentResponse: responseText[suggestionId] || 'Rejected without comment'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'add':
        return 'bg-blue-100 text-blue-800';
      case 'update':
        return 'bg-purple-100 text-purple-800';
      case 'remove':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatValue = (value: string | string[]) => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return value;
  };

  const formatType = (type: string, category?: string) => {
    if (category) {
      return `${type} (${category})`;
    }
    return type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Profile Suggestions
          </CardTitle>
          <CardDescription>
            Loading AI-generated suggestions for your child's profile...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingSuggestions = suggestions.filter((s: ProfileSuggestion) => s.status === 'pending');
  const processedSuggestions = suggestions.filter((s: ProfileSuggestion) => s.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Pending Suggestions */}
      {pendingSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-600" />
              New Profile Suggestions
            </CardTitle>
            <CardDescription>
              AI has analyzed recent conversations and suggests these updates to your child's profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingSuggestions.map((suggestion: ProfileSuggestion) => (
              <div key={suggestion.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getActionColor(suggestion.action)}>
                        {suggestion.action}
                      </Badge>
                      <Badge variant="outline">
                        {formatType(suggestion.type, suggestion.category)}
                      </Badge>
                      <Badge variant="secondary">
                        {suggestion.confidence}% confident
                      </Badge>
                    </div>
                    
                    <p className="font-medium text-gray-900 mb-2">
                      {suggestion.action === 'add' && 'Add: '}
                      {suggestion.action === 'update' && 'Update: '}
                      {suggestion.action === 'remove' && 'Remove: '}
                      {formatValue(suggestion.value)}
                    </p>
                    
                    <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded">
                      <Quote className="h-4 w-4 mt-0.5 text-gray-400" />
                      <span className="italic">"{suggestion.evidence}"</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Textarea
                    placeholder="Add your thoughts or comments (optional)..."
                    value={responseText[suggestion.id] || ''}
                    onChange={(e) => setResponseText(prev => ({
                      ...prev,
                      [suggestion.id]: e.target.value
                    }))}
                    className="min-h-[60px]"
                  />
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAccept(suggestion.id)}
                      disabled={updateSuggestionMutation.isPending}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      onClick={() => handleReject(suggestion.id)}
                      disabled={updateSuggestionMutation.isPending}
                      size="sm"
                      variant="destructive"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Processed Suggestions */}
      {processedSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-gray-600" />
              Previous Suggestions
            </CardTitle>
            <CardDescription>
              Your responses to earlier profile suggestions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {processedSuggestions.map((suggestion: ProfileSuggestion) => (
              <div key={suggestion.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(suggestion.status)}
                    <span className="text-sm font-medium">
                      {formatType(suggestion.type, suggestion.category)}
                    </span>
                    <Badge className={getStatusColor(suggestion.status)}>
                      {suggestion.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(suggestion.createdAt).toLocaleDateString()}
                  </span>
                </div>
                
                <p className="text-sm text-gray-700">
                  {suggestion.action === 'add' && 'Add: '}
                  {suggestion.action === 'update' && 'Update: '}
                  {suggestion.action === 'remove' && 'Remove: '}
                  {formatValue(suggestion.value)}
                </p>
                
                {suggestion.parentResponse && (
                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                    Your response: {suggestion.parentResponse}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No Suggestions */}
      {suggestions.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-gray-400" />
              Profile Suggestions
            </CardTitle>
            <CardDescription>
              No profile suggestions available yet. AI will analyze conversations and suggest profile updates as your child interacts with Appu.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}