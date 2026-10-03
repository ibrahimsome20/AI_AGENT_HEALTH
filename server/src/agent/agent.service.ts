import { searchProviders, triageSymptoms, type ProviderSearchInput, type ToolCallRecord } from "../tools/index.js";
import { extractAge } from "../tools/patient-text.js";
import { generateAgentResponseWithLlm } from "./llm.service.js";
import type { AgentRequest, AgentResponse } from "./types.js";

function detectLocale(message: string, requested?: "en" | "ar"): "en" | "ar" {
  const hasArabic = /[\u0600-\u06FF]/.test(message);
  const hasLatin = /[A-Za-z]/.test(message);

  if (hasArabic) return "ar";
  if (hasLatin) return "en";
  return requested ?? "en";
}

function buildContextText(request: AgentRequest) {
  const historyText =
    request.history
      ?.filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n") ?? "";

  return `${historyText}\n${request.message}`.trim();
}

function extractCity(text: string) {
  const matches = [...text.matchAll(/\b(dammam|riyadh)\b|الدمام|الرياض/gi)];
  const lastMatch = matches.at(-1)?.[0];
  if (!lastMatch) return null;
  if (/dammam|الدمام/i.test(lastMatch)) return "Dammam";
  return "Riyadh";
}

function hasExplicitCity(text: string) {
  return /\b(dammam|riyadh)\b|الدمام|الرياض/i.test(text);
}

function isGreetingOnly(message: string) {
  return /^(hi|hello|hey|السلام عليكم|وعليكم السلام|مرحبا|مرحبًا|اهلا|أهلا|هلا)[\s!.؟?،]*$/i.test(message.trim());
}

function isOutOfScope(message: string) {
  return /^\s*\d+(?:\s*[+*/-]\s*\d+)+(?:\s*[=?؟])?\s*$/.test(message);
}

function asksForEmergencyLocation(message: string) {
  return /\b(where|near|nearest|closest|find|locate)\b.*\b(er|emergency|hospital)\b|\b(er|emergency|hospital)\b.*\b(near|nearest|closest|where)\b|(?:أين|وين|فين|اقرب|أقرب|قريب|مكان).*(?:طوارئ|مستشفى)|(?:طوارئ|مستشفى).*(?:أين|وين|فين|اقرب|أقرب|قريب|مكان)/i.test(message);
}

function asksWhyRepeating(message: string) {
  return /\b(why|you (?:do not|don't|not) understand|repeating|repeat yourself)\b|ليش|لماذا|ليه|ما فهمت|لا تفهم|تكرر|تكرار|مرة\s*(?:اخرى|أخرى)|نفس\s*السؤال|نفس\s*السوال/i.test(message);
}

export function extractFacts(text: string, currentMessage: string) {
  const latestUserQuestion = text.split("\n").at(-1) ?? text;
  const painNearHeart = /(?:قرب|بالقرب من|جنب|بجانب)\s*القلب|near (?:my|the) heart/i.test(text);
  const lungPain = /(?:ألم|الم|وجع)\s*(?:في\s*)?(?:الرئة|الرئه|رئة|رئه)|\b(lung pain|pain in (?:my|the) lungs?)\b/i.test(text);
  const chestPain = /\b(chest pain|chest)\b|صدر|الصدر|ألم\s*(في)?\s*الصدر|وجع\s*(في)?\s*الصدر/i.test(text);

  return {
    city: extractCity(text),
    patientCityKnown: hasExplicitCity(text),
    hasChestPain: chestPain,
    hasThoracicPain: chestPain || lungPain,
    painLocationKnown: painNearHeart || lungPain || chestPain,
    painLocation: painNearHeart ? "near the heart" : lungPain ? "lung/chest area" : chestPain ? "chest" : null,
    painStartedToday: /\b(today)\b|اليوم|ابتد[اأ]|بدأ/i.test(text),
    asksWhenPainStarted: /متى.*(بدأ|ابتد|الم|الألم)|when.*pain.*start/i.test(text),
    asksProviderMeaning: /ما\s*(هذا|هاذا)|ماذا يعني|what is this|what.*provider/i.test(text),
    asksAvailableProviders: /ماف|ما في|هل يوجد|موجود|متوفر|where|available|clinic|مستوصف|عيادة/i.test(latestUserQuestion),
    latestUserQuestion,
    smoking: /\b(smoke|smoker)\b|ادخن|أدخن|يدخن|تدخين|مدخن/i.test(text),
    cancerHistory: /\b(cancer|chemotherapy|tumou?r)\b|سرطان|السرطان|كيماوي|ورم|اورام|أورام/i.test(text),
    age: extractAge(text),
    isGreetingOnly: isGreetingOnly(currentMessage),
    isOutOfScope: isOutOfScope(currentMessage),
    asksForEmergencyLocation: asksForEmergencyLocation(currentMessage),
    asksWhyRepeating: asksWhyRepeating(currentMessage),
    currentMessageSharesCity: hasExplicitCity(currentMessage),
    currentMessageIsMedical: extractAge(currentMessage) !== null || hasExplicitCity(currentMessage) || isGreetingOnly(currentMessage) || /ألم|الم|وجع|رئة|رئه|صدر|قلب|دم|نزيف|ضيق|تنفس|سعال|كحة|جانبي|جانب|بالقرب|قرب|مستشفى|طوارئ|طبيب|\b(pain|lung|chest|heart|blood|bleed|breath|cough|hospital|doctor|emergency)\b/i.test(currentMessage) ||
      ((chestPain || lungPain) && /^(?:ايوا|ايوه|نعم|لا|تمام|yes|no|ok)[\s.!؟،]*$/i.test(currentMessage.trim())),
  };
}

export async function runPatientDecisionAgent(request: AgentRequest): Promise<AgentResponse> {
  const conversationId = request.conversationId ?? "local";
  const locale = detectLocale(request.message, request.locale);
  const contextText = buildContextText(request);
  const city = extractCity(contextText);
  const extractedFacts = extractFacts(contextText, request.message);
  const toolCalls: ToolCallRecord[] = [];

  const triage = triageSymptoms({ text: contextText, locale, currentMessage: request.message });
  toolCalls.push({ tool: "triage_symptoms", input: { text: contextText, locale, currentMessage: request.message }, output: triage });

  const wantsSecondOpinion = /\b(second opinion|رأي ثاني|رأي آخر)\b/i.test(contextText);
  const chestPainNeedsClarification =
    extractedFacts.hasThoracicPain &&
    triage.urgency !== "emergency" &&
    triage.missingInfo.some((question) => /ضيق تنفس|تعرّق|إغماء|غثيان|ينتشر|shortness|sweating|fainting|nausea|spreading|متى بدأ|When did/i.test(question));
  const providerSearch: ProviderSearchInput = {
    language: locale,
  };
  if (city) providerSearch.city = city;

  if (triage.suspectedSpecialty !== "unknown") providerSearch.specialty = triage.suspectedSpecialty;
  if (triage.urgency === "emergency") providerSearch.needsEmergency = true;
  if (wantsSecondOpinion && triage.urgency !== "needs_clarification") providerSearch.secondOpinion = true;

  const shouldSearchProviders = Boolean(city) && !chestPainNeedsClarification && (triage.suspectedSpecialty !== "unknown" || wantsSecondOpinion);
  const providers = shouldSearchProviders ? searchProviders(providerSearch) : [];

  if (shouldSearchProviders) {
    toolCalls.push({ tool: "search_providers", input: providerSearch, output: providers });
  }

  const safety =
    locale === "ar"
      ? "هذا النموذج لا يقدم تشخيصًا طبيًا. إذا كانت الأعراض شديدة أو متفاقمة فاتصل بالطوارئ فورًا."
      : "This prototype does not provide a diagnosis. If symptoms are severe or worsening, contact emergency services immediately.";

  const llmResponse = await generateAgentResponseWithLlm({
    request,
    locale,
    contextText,
    city,
    extractedFacts,
    triage,
    providers,
    safety,
  });

  return {
    ...llmResponse,
    toolCalls,
    safety,
    conversationId,
  };
}
