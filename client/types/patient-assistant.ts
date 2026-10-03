export type Locale = "en" | "ar";
export type Role = "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface Provider {
  id: string;
  name: string;
  nameAr: string;
  type: string;
  city: string;
  cityAr?: string;
  nextAvailable: string;
  nextAvailableAr?: string;
  notes: string;
  notesAr?: string;
}

export interface ToolCall {
  tool: string;
  input: unknown;
  output: unknown;
}

export interface AgentResponse {
  conversationId: string;
  reply: string;
  recommendation: "go_to_er" | "see_specialist" | "second_opinion" | "clarify";
  nextQuestions: string[];
  toolCalls: ToolCall[];
  safety: string;
}

export interface AssistantCopy {
  title: string;
  subtitle: string;
  placeholder: string;
  initialAssistant: string;
  send: string;
  example: string;
  questions: string;
  providers: string;
  nextStep: string;
  emptyProviders: string;
  emptyQuestions: string;
  error: string;
  thinking: string;
  exampleButton: string;
}
