import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: "healtrip-api",
  },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "body.message", "message"],
    remove: false,
  },
});
