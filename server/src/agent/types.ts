import type { ConversationMessage } from "../data/types.js";
import type { ToolCallRecord } from "../tools/types.js";

export interface AgentRequest {
  conversationId?: string;
  message: string;
  locale?: "en" | "ar";
  history?: ConversationMessage[];
}

export interface AgentResponse {
  reply: string;
  recommendation: "go_to_er" | "see_specialist" | "second_opinion" | "clarify";
  nextQuestions: string[];
  toolCalls: ToolCallRecord[];
  safety: string;
  conversationId: string;
}

export interface LlmAgentResponse {
  reply: string;
  recommendation: AgentResponse["recommendation"];
  nextQuestions: string[];
  intent?: "care_navigation" | "out_of_scope";
}
