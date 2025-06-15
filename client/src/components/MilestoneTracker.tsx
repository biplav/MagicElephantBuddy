import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Target, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface LearningMilestone {
  id: number;
  childId: number;
  milestoneType: string;
  milestoneDescription: string;
  targetValue: number;
  currentProgress: number;
  isCompleted: boolean;
  completedAt?: string;
  createdAt: string;
}

interface MilestoneTrackerProps {
  childId: number;
  childName: string;
}

export default function MilestoneTracker({ childId, childName }: MilestoneTrackerProps) {
  const { data: milestones = [], isLoading } = useQuery<LearningMilestone[]>({
    queryKey: ['/api/children', childId, 'milestones'],
    queryFn: () => apiRequest(`/api/children/${childId}/milestones`),
  });

  const getMilestoneTypeColor = (type: string) => {
    switch (type) {
      case 'counting': return 'bg-blue-100 text-blue-800';
      case 'alphabet': return 'bg-green-100 text-green-800';
      case 'colors': return 'bg-purple-100 text-purple-800';
      case 'shapes': return 'bg-orange-100 text-orange-800';
      case 'vocabulary': return 'bg-pink-100 text-pink-800';
      case 'social_skills': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getMilestoneTypeIcon = (type: string) => {
    switch (type) {
      case 'counting': return '🔢';
      case 'alphabet': return '🔤';
      case 'colors': return '🎨';
      case 'shapes': return '🔷';
      case 'vocabulary': return '📚';
      case 'social_skills': return '🤝';
      default: return '🎯';
    }
  };

  const completedMilestones = milestones.filter(m => m.isCompleted);
  const inProgressMilestones = milestones.filter(m => !m.isCompleted && m.currentProgress > 0);
  const upcomingMilestones = milestones.filter(m => !m.isCompleted && m.currentProgress === 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Learning Milestones - {childName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading milestones...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Learning Milestones - {childName}
        </CardTitle>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-600" />
            {completedMilestones.length} Completed
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            {inProgressMilestones.length} In Progress
          </div>
          <div className="flex items-center gap-1">
            <Target className="h-4 w-4 text-gray-600" />
            {upcomingMilestones.length} Upcoming
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {completedMilestones.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-green-700 mb-3 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed Milestones
            </h4>
            <div className="grid gap-3">
              {completedMilestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{getMilestoneTypeIcon(milestone.milestoneType)}</span>
                    <div>
                      <p className="font-medium text-sm">{milestone.milestoneDescription}</p>
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${getMilestoneTypeColor(milestone.milestoneType)}`}
                      >
                        {milestone.milestoneType.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-sm text-green-700 font-medium">
                      {milestone.currentProgress}/{milestone.targetValue}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {inProgressMilestones.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-blue-700 mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              In Progress
            </h4>
            <div className="grid gap-3">
              {inProgressMilestones.map((milestone) => {
                const progressPercentage = (milestone.currentProgress / milestone.targetValue) * 100;
                return (
                  <div
                    key={milestone.id}
                    className="p-3 border border-blue-200 rounded-lg bg-blue-50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getMilestoneTypeIcon(milestone.milestoneType)}</span>
                        <div>
                          <p className="font-medium text-sm">{milestone.milestoneDescription}</p>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${getMilestoneTypeColor(milestone.milestoneType)}`}
                          >
                            {milestone.milestoneType.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-sm text-blue-700 font-medium">
                        {milestone.currentProgress}/{milestone.targetValue}
                      </span>
                    </div>
                    <Progress value={progressPercentage} className="h-2" />
                    <p className="text-xs text-blue-600 mt-1">
                      {Math.round(progressPercentage)}% complete
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {upcomingMilestones.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Upcoming Goals
            </h4>
            <div className="grid gap-3">
              {upcomingMilestones.slice(0, 3).map((milestone) => (
                <div
                  key={milestone.id}
                  className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg opacity-60">{getMilestoneTypeIcon(milestone.milestoneType)}</span>
                    <div>
                      <p className="font-medium text-sm text-gray-700">{milestone.milestoneDescription}</p>
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${getMilestoneTypeColor(milestone.milestoneType)}`}
                      >
                        {milestone.milestoneType.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm text-gray-500">
                    Target: {milestone.targetValue}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {milestones.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No learning milestones set up yet.</p>
            <p className="text-xs mt-1">Milestones will be created automatically when your child starts conversations.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}