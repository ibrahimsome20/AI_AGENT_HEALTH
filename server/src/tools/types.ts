import type { Provider, Specialty } from "../data/types.js";

export type UrgencyLevel = "emergency" | "urgent" | "routine" | "needs_clarification";

export interface TriageInput {
  text: string;
  locale?: "en" | "ar";
  currentMessage?: string;
}

export interface TriageResult {
  urgency: UrgencyLevel;
  suspectedSpecialty: Specialty | "unknown";
  redFlags: string[];
  missingInfo: string[];
  rationale: string;
}

export interface ProviderSearchInput {
  specialty?: Specialty;
  city?: string;
  needsEmergency?: boolean;
  secondOpinion?: boolean;
  language?: "en" | "ar";
}

export interface ToolCallRecord {
  tool: "triage_symptoms" | "search_providers";
  input: TriageInput | ProviderSearchInput;
  output: TriageResult | Provider[];
}
