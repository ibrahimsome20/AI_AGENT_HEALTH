import cors from "cors";
import express from "express";
import { agentRouter } from "./agent/index.js";
import { errorHandlerMiddleware } from "./middlewares/error-handler.middleware.js";
import { notFoundMiddleware } from "./middlewares/not-found.middleware.js";
import { requestLoggerMiddleware } from "./middlewares/request-logger.middleware.js";
import { providersRouter } from "./providers/providers.routes.js";

export function createApp() {
  const app = express();
  const allowedOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:3001";

  app.use(requestLoggerMiddleware);
  app.use(
    cors({
      origin: allowedOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["content-type"],
    })
  );
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "healtrip-ai-patient-decision-assistant" });
  });

  app.use("/api/providers", providersRouter);
  app.use("/api/agent", agentRouter);

  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
