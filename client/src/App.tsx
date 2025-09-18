import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Provider as ReduxProvider } from "react-redux";
import { bookStore } from "./store/bookStore";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceManagerProvider } from "@/context/ServiceManagerContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import AudioTest from "@/pages/AudioTest";
import ParentDashboard from "@/pages/ParentDashboard";
import Settings from "@/pages/Settings";
import MemoriesConsole from "@/pages/MemoriesConsole";
import WorkflowVisualizer from "./pages/WorkflowVisualizer";
import FrameCaptureTest from "./components/FrameCaptureTest";
import SimpleCameraTest from "./components/SimpleCameraTest";
import AdminBookUpload from './pages/AdminBookUpload';
import BookReading from './pages/BookReading';

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/audio-test" component={AudioTest} />
      <Route path="/dashboard" component={ParentDashboard} />
      <Route path="/memories" component={MemoriesConsole} />
      <Route path="/settings" component={Settings} />
      <Route path="/workflow-visualizer" component={WorkflowVisualizer} />
      <Route path="/frame-test" component={FrameCaptureTest} />
      <Route path="/camera-test" component={SimpleCameraTest} />
      <Route path="/admin/upload-book" component={AdminBookUpload} />
      <Route path="/book-reading" component={BookReading} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ReduxProvider store={bookStore}>
      <QueryClientProvider client={queryClient}>
        <ServiceManagerProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ServiceManagerProvider>
      </QueryClientProvider>
    </ReduxProvider>
  );
}

export default App;