import type { ErrorRequestHandler } from "express";
import { logger } from "../config/logger.js";

export const errorHandlerMiddleware: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof SyntaxError) {
    logger.warn({ error, path: request.path }, "invalid JSON body");
    response.status(400).json({ error: "invalid JSON body" });
    return;
  }

  logger.error({ error, path: request.path }, "unexpected server error");
  response.status(500).json({ error: "unexpected server error" });
};
