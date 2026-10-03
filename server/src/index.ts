import "dotenv/config";
import { createApp } from "./app.js";
import { initializeConversationStore } from "./agent/conversation.store.js";
import { logger } from "./config/logger.js";

async function bootstrap() {
  await initializeConversationStore();
  logger.info(
    {
      llmProvider: "ollama",
      ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
      ollamaModel: process.env.OLLAMA_MODEL ?? "gemma3:4b",
    },
    "agent ready"
  );

  const app = createApp();
  const port = Number(process.env.PORT ?? 4000);

  app.listen(port, () => {
    logger.info({ port }, `HealTrip AI Express API listening on http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  logger.fatal({ error }, "failed to start HealTrip API");
  process.exit(1);
});
