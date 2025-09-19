import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { jobScheduler } from "./job-scheduler";
import { logger, log, createServiceLogger } from "./logger";

// Create service-specific logger
const serverLogger = createServiceLogger('server');

// Set timezone to IST (Indian Standard Time)
process.env.TZ = 'Asia/Kolkata';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from public directory (for uploaded books, images, etc.)
app.use('/public', express.static('public'));
app.use('/books', express.static('public/books'));

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
      const logData = {
        method: req.method,
        path,
        statusCode: res.statusCode,
        duration,
        response: capturedJsonResponse
      };

      if (res.statusCode >= 400) {
        serverLogger.error(`API Error: ${req.method} ${path}`, logData);
      } else {
        serverLogger.info(`API Request: ${req.method} ${path}`, logData);
      }
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    serverLogger.error('Express error handler:', {
      error: message,
      status,
      stack: err.stack,
      url: _req.url,
      method: _req.method
    });

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
      serverLogger.error(`Port ${port} is already in use. Attempting to find available port...`);
      // Try to find an available port starting from 5001
      let altPort = port + 1;
      const tryPort = () => {
        server.listen({
          port: altPort,
          host: "0.0.0.0",
        }, () => {
          serverLogger.info(`serving on port ${altPort} (port ${port} was in use)`);
        }).on('error', (altErr: any) => {
          if (altErr.code === 'EADDRINUSE' && altPort < port + 10) {
            altPort++;
            tryPort();
          } else {
            serverLogger.error('Failed to find available port:', altErr);
            process.exit(1);
          }
        });
      };
      tryPort();
    } else {
      serverLogger.error('Server error:', err);
      process.exit(1);
    }
  });

  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    serverLogger.info(`serving on port ${port}`);

    // Configure server timeouts
    server.keepAliveTimeout = 120000; // 2 minutes
    server.headersTimeout = 120000; // 2 minutes
    server.timeout = 300000; // 5 minutes for long-running requests

    // Start the hourly job scheduler for conversation analysis
    jobScheduler.start();
    serverLogger.info('Hourly job scheduler started for conversation analysis');
  });
})();
import { setupGeminiLiveWebSocket } from './gemini/gemini-live-service';