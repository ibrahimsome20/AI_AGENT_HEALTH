import { Router } from "express";
import { logger } from "../config/logger.js";
import { runPatientDecisionAgent } from "./agent.service.js";
import { loadConversation, saveConversation } from "./conversation.store.js";
import { chatRequestSchema } from "./agent.schema.js";

export const agentRouter = Router();

agentRouter.post("/chat", async (request, response) => {
  const parsed = chatRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid chat request", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { message, locale, conversationId } = parsed.data;
  const conversation = await loadConversation(conversationId ?? undefined);
  const history = conversation.messages;
  let result;
  try {
    result = await runPatientDecisionAgent({
      ...(locale ? { locale } : {}),
      conversationId: conversation.conversationId,
      history,
      message,
    });
  } catch (error) {
    logger.error({ error }, "agent LLM response failed");
    response.status(503).json({ error: "AI model is unavailable. Start Ollama or configure OLLAMA_URL/OLLAMA_MODEL." });
    return;
  }

  await saveConversation(conversation.conversationId, [
    ...history,
    { role: "user", content: message },
    { role: "assistant", content: result.reply },
  ]);

  response.json(result);
});
