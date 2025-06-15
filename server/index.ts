import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { jobScheduler } from "./job-scheduler";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.  
  // It is the only port that is not firewalled.
  const port = 5000;
  
  // Handle port conflicts gracefully
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Attempting to find available port...`);
      // Try to find an available port starting from 5001
      let altPort = port + 1;
      const tryPort = () => {
        server.listen({
          port: altPort,
          host: "0.0.0.0",
        }, () => {
          log(`serving on port ${altPort} (port ${port} was in use)`);
        }).on('error', (altErr: any) => {
          if (altErr.code === 'EADDRINUSE' && altPort < port + 10) {
            altPort++;
            tryPort();
          } else {
            console.error('Failed to find available port:', altErr);
            process.exit(1);
          }
        });
      };
      tryPort();
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
  
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
    
    // Start the hourly job scheduler for conversation analysis
    jobScheduler.start();
    log('Hourly job scheduler started for conversation analysis');
  });
})();
