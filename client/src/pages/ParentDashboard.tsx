import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, Clock, MessageSquare, TrendingUp, User, Home, LogOut } from "lucide-react";
import { format } from "date-fns";

interface Parent {
  id: number;
  email: string;
  name: string;
}

interface Child {
  id: number;
  name: string;
  age: number;
  profile: any;
  isActive: boolean;
  createdAt: string;
}

interface Message {
  id: number;
  type: 'child_input' | 'appu_response';
  content: string;
  transcription?: string;
  timestamp: string;
}

interface Conversation {
  id: number;
  startTime: string;
  endTime?: string;
  duration?: number;
  totalMessages: number;
  child: Child;
  messages: Message[];
}

interface DashboardData {
  children: Child[];
  recentConversations: Conversation[];
  totalConversations: number;
  totalMessages: number;
}

export default function ParentDashboard() {
  const [currentParent, setCurrentParent] = useState<Parent | null>(() => {
    const stored = localStorage.getItem('currentParent');
    return stored ? JSON.parse(stored) : null;
  });

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: ['/api/parents', currentParent?.id, 'dashboard'],
    enabled: !!currentParent?.id,
  });

  const handleLogout = () => {
    localStorage.removeItem('currentParent');
    setCurrentParent(null);
    window.location.href = '/';
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "Ongoing";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (!currentParent) {
    return <ParentLogin onLogin={setCurrentParent} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Home className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Parent Dashboard</h1>
                <p className="text-sm text-gray-500">Welcome back, {currentParent.name}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout} className="flex items-center space-x-2">
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <User className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Children</p>
                  <p className="text-2xl font-bold text-gray-900">{dashboardData?.children.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <MessageSquare className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Conversations</p>
                  <p className="text-2xl font-bold text-gray-900">{dashboardData?.totalConversations || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Messages</p>
                  <p className="text-2xl font-bold text-gray-900">{dashboardData?.totalMessages || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">This Week</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboardData?.recentConversations.filter(conv => 
                      new Date(conv.startTime) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    ).length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="conversations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="conversations">Recent Conversations</TabsTrigger>
            <TabsTrigger value="children">Children Profiles</TabsTrigger>
            <TabsTrigger value="insights">Insights & Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="conversations" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Conversations List */}
              <Card className="h-[600px]">
                <CardHeader>
                  <CardTitle>Recent Conversations</CardTitle>
                  <CardDescription>Latest interactions between your children and Appu</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-4">
                      {dashboardData?.recentConversations.map((conversation) => (
                        <div
                          key={conversation.id}
                          className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                            selectedConversation?.id === conversation.id
                              ? 'bg-blue-50 border-blue-200'
                              : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                          }`}
                          onClick={() => setSelectedConversation(conversation)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>{conversation.child.name[0]}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{conversation.child.name}</p>
                                <p className="text-xs text-gray-500">Age {conversation.child.age}</p>
                              </div>
                            </div>
                            <Badge variant={conversation.endTime ? "secondary" : "default"}>
                              {conversation.endTime ? "Completed" : "Ongoing"}
                            </Badge>
                          </div>
                          
                          <div className="text-xs text-gray-600 space-y-1">
                            <div className="flex items-center space-x-2">
                              <Calendar className="h-3 w-3" />
                              <span>{format(new Date(conversation.startTime), 'MMM dd, yyyy')}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Clock className="h-3 w-3" />
                              <span>{format(new Date(conversation.startTime), 'HH:mm')}</span>
                              <span>• Duration: {formatDuration(conversation.duration)}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <MessageSquare className="h-3 w-3" />
                              <span>{conversation.totalMessages} messages</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Conversation Detail */}
              <Card className="h-[600px]">
                <CardHeader>
                  <CardTitle>
                    {selectedConversation ? `Conversation with ${selectedConversation.child.name}` : 'Select a Conversation'}
                  </CardTitle>
                  {selectedConversation && (
                    <CardDescription>
                      {format(new Date(selectedConversation.startTime), 'MMMM dd, yyyy at HH:mm')} • 
                      {formatDuration(selectedConversation.duration)}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {selectedConversation ? (
                    <ScrollArea className="h-[500px] pr-4">
                      <div className="space-y-4">
                        {selectedConversation.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`p-3 rounded-lg max-w-[80%] ${
                              message.type === 'child_input'
                                ? 'bg-blue-100 text-blue-900 ml-auto'
                                : 'bg-gray-100 text-gray-900'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium">
                                {message.type === 'child_input' ? selectedConversation.child.name : 'Appu'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {format(new Date(message.timestamp), 'HH:mm')}
                              </span>
                            </div>
                            <p className="text-sm">{message.content}</p>
                            {message.transcription && message.transcription !== message.content && (
                              <p className="text-xs text-gray-600 mt-1 italic">
                                Transcribed: {message.transcription}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center justify-center h-[500px] text-gray-500">
                      <div className="text-center">
                        <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>Select a conversation to view details</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="children">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {dashboardData?.children.map((child) => (
                <Card key={child.id}>
                  <CardHeader>
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="text-lg">{child.name[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle>{child.name}</CardTitle>
                        <CardDescription>Age {child.age}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Favorite Things:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {child.profile?.favoriteThings?.animals?.slice(0, 3).map((animal: string, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">{animal}</Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-gray-600">Learning Goals:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {child.profile?.learningGoals?.slice(0, 2).map((goal: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">{goal}</Badge>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <p className="text-xs text-gray-500">
                          Profile created: {format(new Date(child.createdAt), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="insights">
            <Card>
              <CardHeader>
                <CardTitle>Insights & Analytics</CardTitle>
                <CardDescription>Coming soon - detailed analytics about your child's interactions with Appu</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <TrendingUp className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <p>Advanced analytics and insights will be available soon!</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

interface ParentLoginProps {
  onLogin: (parent: Parent) => void;
}

function ParentLogin({ onLogin }: ParentLoginProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const endpoint = isLogin ? '/api/parents/login' : '/api/parents/register';
      const body = isLogin ? { email, password } : { email, password, name };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'An error occurred');
        return;
      }

      localStorage.setItem('currentParent', JSON.stringify(data.parent));
      onLogin(data.parent);
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{isLogin ? 'Parent Login' : 'Create Parent Account'}</CardTitle>
          <CardDescription>
            {isLogin ? 'Access your child\'s conversation history' : 'Set up your parent dashboard'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Please wait...' : (isLogin ? 'Login' : 'Create Account')}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {isLogin ? 'Need an account? Sign up' : 'Already have an account? Login'}
            </button>
          </div>

          <div className="mt-6 pt-4 border-t text-center">
            <Button variant="outline" onClick={() => window.location.href = '/'}>
              Back to Appu
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}