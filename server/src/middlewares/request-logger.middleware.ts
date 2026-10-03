import type { Request, Response } from "express";
import { pinoHttp } from "pino-http";
import { logger } from "../config/logger.js";

export const requestLoggerMiddleware = pinoHttp({
  logger,
  customProps: (request: Request) => ({
    requestId: request.id,
  }),
  customSuccessMessage: (request: Request, response: Response) => `${request.method} ${request.url} completed with ${response.statusCode}`,
  customErrorMessage: (request: Request, response: Response) => `${request.method} ${request.url} failed with ${response.statusCode}`,
});
