import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import AudioTest from "@/pages/AudioTest";
import ParentDashboard from "@/pages/ParentDashboard";
import Settings from "@/pages/Settings";
import MemoriesConsole from "@/pages/MemoriesConsole";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/audio-test" component={AudioTest} />
      <Route path="/dashboard" component={ParentDashboard} />
      <Route path="/memories" component={MemoriesConsole} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
