import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: number;
  parentId: number;
  childId?: number;
  milestoneId?: number;
  type: 'milestone_achieved' | 'progress_update' | 'encouragement' | 'daily_summary';
  title: string;
  message: string;
  isRead: boolean;
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
}

interface NotificationPreferences {
  id: number;
  parentId: number;
  milestoneNotifications: boolean;
  progressUpdates: boolean;
  dailySummaries: boolean;
  encouragementMessages: boolean;
  notificationFrequency: 'immediate' | 'daily' | 'weekly';
  quietHoursStart: string;
  quietHoursEnd: string;
}

interface NotificationCenterProps {
  parentId: number;
}

export default function NotificationCenter({ parentId }: NotificationCenterProps) {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['/api/parents', parentId, 'notifications'],
    queryFn: () => apiRequest(`/api/parents/${parentId}/notifications${showUnreadOnly ? '?unreadOnly=true' : ''}`),
  });

  const { data: preferences } = useQuery<NotificationPreferences>({
    queryKey: ['/api/parents', parentId, 'notification-preferences'],
    queryFn: () => apiRequest(`/api/parents/${parentId}/notification-preferences`),
  });

  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: number) => 
      apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parents', parentId, 'notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => 
      apiRequest(`/api/parents/${parentId}/notifications/read-all`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parents', parentId, 'notifications'] });
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (updates: Partial<NotificationPreferences>) =>
      apiRequest(`/api/parents/${parentId}/notification-preferences`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parents', parentId, 'notification-preferences'] });
    },
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'normal': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'milestone_achieved': return '🎉';
      case 'progress_update': return '📈';
      case 'encouragement': return '💪';
      case 'daily_summary': return '📊';
      default: return '📢';
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Notifications
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUnreadOnly(!showUnreadOnly)}
              >
                {showUnreadOnly ? 'Show All' : 'Unread Only'}
              </Button>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsReadMutation.mutate()}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Mark All Read
                </Button>
              )}
              <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Notification Preferences</DialogTitle>
                  </DialogHeader>
                  {preferences && (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="milestone-notifications">Milestone Achievements</Label>
                          <Switch
                            id="milestone-notifications"
                            checked={preferences.milestoneNotifications}
                            onCheckedChange={(checked) =>
                              updatePreferencesMutation.mutate({ milestoneNotifications: checked })
                            }
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Label htmlFor="progress-updates">Progress Updates</Label>
                          <Switch
                            id="progress-updates"
                            checked={preferences.progressUpdates}
                            onCheckedChange={(checked) =>
                              updatePreferencesMutation.mutate({ progressUpdates: checked })
                            }
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Label htmlFor="daily-summaries">Daily Summaries</Label>
                          <Switch
                            id="daily-summaries"
                            checked={preferences.dailySummaries}
                            onCheckedChange={(checked) =>
                              updatePreferencesMutation.mutate({ dailySummaries: checked })
                            }
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Label htmlFor="encouragement">Encouragement Messages</Label>
                          <Switch
                            id="encouragement"
                            checked={preferences.encouragementMessages}
                            onCheckedChange={(checked) =>
                              updatePreferencesMutation.mutate({ encouragementMessages: checked })
                            }
                          />
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-3">
                        <div>
                          <Label htmlFor="frequency">Notification Frequency</Label>
                          <Select
                            value={preferences.notificationFrequency}
                            onValueChange={(value) =>
                              updatePreferencesMutation.mutate({ notificationFrequency: value as any })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="immediate">Immediate</SelectItem>
                              <SelectItem value="daily">Daily Digest</SelectItem>
                              <SelectItem value="weekly">Weekly Digest</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="quiet-start">Quiet Hours Start</Label>
                            <Input
                              id="quiet-start"
                              type="time"
                              value={preferences.quietHoursStart || ''}
                              onChange={(e) =>
                                updatePreferencesMutation.mutate({ quietHoursStart: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor="quiet-end">Quiet Hours End</Label>
                            <Input
                              id="quiet-end"
                              type="time"
                              value={preferences.quietHoursEnd || ''}
                              onChange={(e) =>
                                updatePreferencesMutation.mutate({ quietHoursEnd: e.target.value })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading notifications...</div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">
                {showUnreadOnly ? 'No unread notifications' : 'No notifications yet'}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card 
                  key={notification.id} 
                  className={`transition-all ${
                    notification.isRead ? 'opacity-60' : ''
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getTypeIcon(notification.type)}</span>
                        <CardTitle className="text-sm">{notification.title}</CardTitle>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getPriorityColor(notification.priority)}`}
                        >
                          {notification.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </span>
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsReadMutation.mutate(notification.id)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">{notification.message}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}