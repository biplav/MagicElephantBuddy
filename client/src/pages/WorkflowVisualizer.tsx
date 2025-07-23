
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { RefreshCw, Eye, ArrowRight } from 'lucide-react';

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
}

interface WorkflowEdge {
  source: string;
  target: string;
  label: string;
}

interface WorkflowData {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entryPoint: string;
}

interface WorkflowGraphData {
  workflows: {
    conversationWorkflow: WorkflowData;
    videoAnalysisWorkflow: WorkflowData;
  };
}

const WorkflowVisualizer: React.FC = () => {
  const [workflowData, setWorkflowData] = useState<WorkflowGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflowGraph = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/admin/workflow-graph');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch workflow graph`);
      }
      
      const data = await response.json();
      
      // Validate the data structure
      if (!data || !data.workflows || !data.workflows.conversationWorkflow) {
        throw new Error('Invalid workflow data structure received');
      }
      
      // Add missing videoAnalysisWorkflow if not present
      if (!data.workflows.videoAnalysisWorkflow) {
        data.workflows.videoAnalysisWorkflow = {
          nodes: [
            { id: '__start__', type: 'start', label: 'Start' },
            { id: 'receiveVideoFrame', type: 'process', label: 'Receive Video Frame' },
            { id: 'analyzeFrame', type: 'process', label: 'Analyze Frame with OpenAI Vision' },
            { id: 'returnAnalysis', type: 'process', label: 'Return Analysis' },
            { id: '__end__', type: 'end', label: 'End' }
          ],
          edges: [
            { source: '__start__', target: 'receiveVideoFrame', label: 'start' },
            { source: 'receiveVideoFrame', target: 'analyzeFrame', label: 'frame received' },
            { source: 'analyzeFrame', target: 'returnAnalysis', label: 'analysis complete' },
            { source: 'returnAnalysis', target: '__end__', label: 'complete' }
          ],
          entryPoint: '__start__'
        };
      }
      
      setWorkflowData(data);
    } catch (err) {
      console.error('Error fetching workflow graph:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflowGraph();
  }, []);

  const renderWorkflowDiagram = (workflow: WorkflowData, title: string) => {
    if (!workflow || !workflow.nodes || !workflow.edges) {
      return (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Eye className="w-5 h-5" />
              {title} - Data Error
            </CardTitle>
            <CardDescription>
              Invalid workflow data structure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Unable to render workflow due to missing or invalid data.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            {title}
          </CardTitle>
          <CardDescription>
            {workflow.nodes?.length || 0} nodes, {workflow.edges?.length || 0} connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Entry Point */}
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary">Entry Point</Badge>
              <span className="font-mono text-sm">{workflow.entryPoint}</span>
            </div>

            {/* Workflow Flow */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Workflow Flow:</h4>
              <div className="flex flex-wrap items-center gap-2">
                {(workflow.nodes || [])
                  .filter(node => node && node.id && node.id !== '__start__' && node.id !== '__end__')
                  .map((node, index, filteredNodes) => (
                    <React.Fragment key={node.id}>
                      <div className="flex flex-col items-center">
                        <Badge 
                          variant="outline" 
                          className="px-3 py-1 text-xs font-mono"
                        >
                          {node.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground mt-1">
                          {node.type}
                        </span>
                      </div>
                      {index < filteredNodes.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </React.Fragment>
                  ))}
              </div>
            </div>

            {/* Detailed Node Information */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Node Details:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(workflow.nodes || [])
                  .filter(node => node && node.id && node.id !== '__start__' && node.id !== '__end__')
                  .map(node => (
                    <div key={node.id} className="p-3 border rounded-lg bg-muted/20">
                      <div className="font-mono text-sm font-semibold">{node.label}</div>
                      <div className="text-xs text-muted-foreground">{node.type}</div>
                      <div className="text-xs mt-1">
                        ID: <span className="font-mono">{node.id}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Connection Details */}
            {(workflow.edges || []).length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Connections:</h4>
                <div className="space-y-2">
                  {(workflow.edges || []).map((edge, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm font-mono">
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded text-xs">
                        {edge.source}
                      </span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900 rounded text-xs">
                        {edge.target}
                      </span>
                      {edge.label && (
                        <Badge variant="secondary" className="text-xs">
                          {edge.label}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <span className="ml-2">Loading workflow graphs...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Workflows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <h4 className="font-semibold text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                  Troubleshooting Tips:
                </h4>
                <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                  <li>• Check if the server is running and responding</li>
                  <li>• Verify the LangGraph workflow is properly configured</li>
                  <li>• Check browser console for additional error details</li>
                </ul>
              </div>
              <Button onClick={fetchWorkflowGraph} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Loading
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">LangGraph Workflow Visualizer</h1>
        <p className="text-muted-foreground mt-2">
          Visualize the structure and flow of your LangGraph workflows
        </p>
        <Button onClick={fetchWorkflowGraph} variant="outline" className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Graphs
        </Button>
      </div>

      {workflowData && (
        <div className="space-y-6">
          {renderWorkflowDiagram(
            workflowData.workflows.conversationWorkflow,
            "Conversation Workflow"
          )}
          
          {renderWorkflowDiagram(
            workflowData.workflows.videoAnalysisWorkflow,
            "Video Analysis Workflow"
          )}

          {/* Summary Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Workflow Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {workflowData.workflows.conversationWorkflow?.nodes?.length || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Conversation Nodes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {workflowData.workflows.conversationWorkflow?.edges?.length || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Conversation Edges</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {workflowData.workflows.videoAnalysisWorkflow?.nodes?.length || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Video Nodes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {workflowData.workflows.videoAnalysisWorkflow?.edges?.length || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Video Edges</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default WorkflowVisualizer;
