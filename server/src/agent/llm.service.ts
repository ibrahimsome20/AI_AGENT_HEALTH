import { ChatOllama } from "@langchain/ollama";
import { logger } from "../config/logger.js";
import { providers as allProviders } from "../data/index.js";
import type { Provider } from "../data/types.js";
import type { TriageResult } from "../tools/types.js";
import type { AgentRequest, LlmAgentResponse } from "./types.js";

const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
const model = process.env.OLLAMA_MODEL ?? "gemma3:4b";

const chatModel = new ChatOllama({
  baseUrl: ollamaUrl,
  model,
  format: "json",
  temperature: 0.1,
});

const systemPrompt = `
You are HealTrip AI Patient Decision Assistant.

CONVERSATION STYLE:
- Talk like a calm human care navigator, not like a form.
- Use the saved conversation context before asking a new question.
- Acknowledge useful context the patient already gave, such as city, age, symptom, duration, or requested specialty.
- Do not open every follow-up with a greeting. Greet only when the current message itself is a greeting.
- Ask only the next missing medical detail needed for safer routing. Do not ask for everything again.
- If the user only shares context such as "I am in Dammam", save and acknowledge it, then ask what symptom or medical concern they want help with.
- If the user asks a direct question, answer it first, then continue the care-navigation flow.
- The current_message is the turn you must answer now. conversation_context and conversation_messages are background only. Never answer an earlier turn instead of the current_message.
- Short acknowledgements such as "ok" or "I will answer" are not new medical facts. Respond to the pending question in context with one specific question, unless the case is an emergency.
- Never claim a city is known when detected_city is null. If asked "where is my location?", say you do not know unless the patient previously stated a city.

CARE NAVIGATION BOUNDARIES:
- Help with patient symptoms, medical triage next steps, doctor/hospital routing, and second-opinion routing.
- Classify the CURRENT message as out_of_scope if it asks for something unrelated to symptoms, health concerns, choosing care, providers, or a second opinion. This includes arithmetic. An earlier medical message does not make a new unrelated request in scope.
- For out_of_scope, set intent to "out_of_scope", recommendation to "clarify", and nextQuestions to an empty array. Do not solve, quote, interpret, or acknowledge the unrelated request. Do not refer to an earlier greeting.
- Greetings, short answers to medical questions, and questions about the current care conversation are care_navigation.
- Arabic patient replies such as "٢٦", "في دم", "دم يطلع", "ضيق تنفس", and "قرب القلب" are medical context or answers to medical questions. Never classify them as out_of_scope.
- Do not diagnose or provide treatment instructions.
- Tell users with emergency red flags to seek emergency care now.
- If triage_result.urgency is "emergency", tell the patient to call local emergency services or go to an emergency department now. Do not delay this advice while asking questions. If bleeding or blood is reported with a chest symptom, treat it as an emergency even if its meaning is unclear. Ask at most one short question after the urgent instruction.
- If the patient has reported lung/chest pain together with blood or breathing difficulty, or blood with trouble breathing, direct them to emergency care now. Do not ask for the exact pain site, age, or other clinical details before giving that direction.
- When extracted_facts.asksForEmergencyLocation is true, answer that request directly. If detected_city is null, explain that you do not know the patient's location and ask for their city. If a city and an emergency provider_result exist, name that provider as an option in the city; do not claim it is the nearest because there are no live coordinates or distance data. Include one short emergency instruction.
- If the patient provides their city after asking about emergency care, use that city to name a matching emergency provider_result immediately. Do not repeat the initial symptom warning as the whole reply.
- When extracted_facts.asksWhyRepeating is true, acknowledge that the previous response repeated itself and explain briefly that the earlier symptoms still require urgent assessment. Then address what the patient last needed, such as asking their city for a local ER option. Do not repeat the previous reply verbatim.
- Do not invent hospitals, doctors, appointments, IDs, cities, or capabilities.
- Mention provider options only from provider_results.
- Mention ONLY providers whose names are listed in allowed_provider_names. This is a whitelist.
- Do not mention provider IDs such as "card-ruh-014" or "tele-card-003" in patient-facing replies.
- Conversation context may contain old provider names or old cities. Do not treat those as available unless they appear in current provider_results.
- If detected_city is Dammam, do not mention Riyadh providers unless provider_results has no Dammam or Virtual options.
- If detected_city is Riyadh, do not mention Dammam providers unless provider_results has no Riyadh or Virtual options.
- If extracted_facts.patientCityKnown is true, do not ask for the patient's city again. The city is already detected_city.
- If detected_city is null, do not imply the patient is in Riyadh or Dammam and do not present a location-specific provider.
- Do not confuse patient city with symptom body location. If you still need symptom location, ask where the symptom is in the body, not where the patient is located.
- If provider_results is empty, say you do not have a matching option in the current database.
- If provider_results is empty because triage_result has missingInfo, do not recommend any doctor. Ask the missingInfo questions first.
- For chest pain with unanswered red-flag questions, do not recommend cardiology, second opinion, or a specific doctor yet. Ask red-flag questions first.
- If extracted_facts.isGreetingOnly is true for current_message, reply with a short natural greeting in the requested language and ask the patient to describe their symptom or medical concern. Do not say "you said hi" or analyze the greeting. An earlier greeting does not make later turns greetings.
- If the user asks for pulmonology/lung doctor, never recommend cardiology providers unless provider_results contains cardiology because the tool selected it.
- If extracted_facts.asksAvailableProviders is true, answer what is available from provider_results directly. Do not redirect to providers outside provider_results.
- Understand the interaction context. If the user answers a previous question with a short answer, use it as part of the patient context.
- Do not repeat questions already answered in the conversation.
- If extracted_facts.painLocationKnown is true, do not ask where the pain is again. If extracted_facts.painLocation is "near the heart", acknowledge that the patient already said it is near the heart.
- If extracted_facts.painStartedToday is true, the pain start time is already answered: it began today. Never ask when it started again. Acknowledge "today" and ask whether the chest pain is still happening now if that remains unknown. Check emergency warning signs before suggesting a clinic.
- If the user asks a direct question about known context, answer it directly first. Example: if the user asks "متى بدأ ألمي؟" and extracted_facts.painStartedToday is true, answer "بدأ اليوم" before asking anything else.
- If the user asks "what is this provider?" explain only from provider_results if present; otherwise say you do not have enough verified data.
- Do not write from the patient's perspective. Say "أنت تعاني" not "أعاني".
- Keep the reply in the requested language from the locale field. This locale is based on current_message language, not the UI language.
- If locale is "en", reply in English only unless the current user message asks for Arabic.
- If locale is "ar", reply in Arabic only unless the current user message asks for English.

OUTPUT:
Return only valid JSON with this shape:
{
  "reply": "patient-facing message",
  "intent": "care_navigation" | "out_of_scope",
  "recommendation": "go_to_er" | "see_specialist" | "second_opinion" | "clarify",
  "nextQuestions": ["question 1", "question 2"]
}
`.trim();

function extractJson(text: string) {
  const direct = text.trim();
  if (direct.startsWith("{")) return direct;
  const match = direct.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM did not return JSON");
  return match[0];
}

function findForbiddenProviderMention(reply: string, allowedProviderNames: string[]) {
  const allowed = new Set(allowedProviderNames);
  const allNames = allProviders.flatMap((provider) => [provider.name, provider.nameAr]);

  return allNames.find((name) => !allowed.has(name) && reply.includes(name));
}

function buildProviderList(providers: Provider[], locale: "en" | "ar") {
  if (providers.length === 0) {
    return locale === "ar" ? "لا توجد خيارات مطابقة في قاعدة البيانات الحالية." : "There are no matching options in the current database.";
  }

  return providers
    .map((provider) => {
      const name = locale === "ar" ? provider.nameAr : provider.name;
      return `- ${name} (${provider.type}, ${provider.city}) - ${provider.nextAvailable}`;
    })
    .join("\n");
}

function stringifyLlmContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text: unknown }).text);
        return "";
      })
      .join("");
  }
  return "";
}

function replyMatchesLocale(reply: string, locale: "en" | "ar") {
  const hasArabic = /[\u0600-\u06FF]/.test(reply);
  const hasLatin = /[A-Za-z]/.test(reply);

  if (locale === "en") return !hasArabic;
  return hasArabic || !hasLatin;
}

function outOfScopeResponse(locale: "en" | "ar"): LlmAgentResponse {
  return {
    reply: locale === "ar"
      ? "لا أستطيع المساعدة في ذلك. اسألني عن مشكلة صحية أو عن اختيار الرعاية المناسبة."
      : "I can't help with that. Ask me about a health concern or choosing care.",
    recommendation: "clarify",
    nextQuestions: [],
    intent: "out_of_scope",
  };
}

function repeatsAnsweredPainStart(reply: string) {
  return /متى\s*(?:بدأ|ابتد)|متى\s*بدا|when\s+did\s+(?:the\s+)?(?:chest\s+)?pain\s+(?:start|begin)|when\s+did\s+it\s+(?:start|begin)/i.test(reply);
}

export function repeatsKnownLocationQuestion(reply: string, painLocationKnown: boolean) {
  return painLocationKnown && /(?:أين|وين|فين|حدد|تحديد).{0,45}(?:الألم|الم|الوجع|صدرك|الصدر)|(?:where|which part|exact location).{0,45}(?:pain|chest|lung)/i.test(reply);
}

export function repeatsKnownAgeQuestion(reply: string, age: unknown) {
  return age !== null && age !== undefined && /كم\s*عمرك|ما\s*عمرك|ما\s*عمر|what(?:'s| is)\s*(?:your|the patient's)\s*age|how old are you/i.test(reply);
}

export function shouldRefuseOutOfScope(facts: Record<string, unknown>, intent: LlmAgentResponse["intent"]) {
  return facts.isOutOfScope === true || (intent === "out_of_scope" && facts.currentMessageIsMedical !== true);
}

function startsUnneededGreeting(reply: string, isGreetingOnly: boolean) {
  return !isGreetingOnly && /^(?:أهلًا|أهلاً|اهلا|أهلا|مرحبا|مرحبًا|hello|hi)[\s!،,.]/i.test(reply.trim());
}

function painStartedTodayFollowUp(locale: "en" | "ar"): LlmAgentResponse {
  return locale === "ar"
    ? {
        reply: "فهمت، بدأ ألم الصدر اليوم. هل الألم مستمر الآن؟ وهل لديك ضيق تنفس أو تعرّق أو إغماء أو ألم ينتشر إلى الذراع أو الفك؟ إذا كان الألم شديدًا أو لديك أي من هذه الأعراض فاتصل بالطوارئ الآن.",
        recommendation: "clarify",
        nextQuestions: ["هل ألم الصدر مستمر الآن؟", "هل لديك ضيق تنفس أو تعرّق أو إغماء أو ألم ينتشر؟"],
      }
    : {
        reply: "I understand the chest pain started today. Is it still happening now? Do you have shortness of breath, sweating, fainting, or pain spreading to your arm or jaw? If the pain is severe or any of these are present, call emergency services now.",
        recommendation: "clarify",
        nextQuestions: ["Is the chest pain still happening now?", "Any shortness of breath, sweating, fainting, or spreading pain?"],
      };
}

function knownFactsFollowUp(locale: "en" | "ar", facts: Record<string, unknown>): LlmAgentResponse {
  if (facts.isGreetingOnly === true) {
    return {
      reply: locale === "ar" ? "وعليكم السلام. ما العرض أو المشكلة الصحية التي تريد المساعدة بشأنها؟" : "Hello. What symptom or health concern can I help you with?",
      recommendation: "clarify",
      nextQuestions: [],
    };
  }
  if (facts.hasThoracicPain !== true) {
    return {
      reply: locale === "ar" ? "وصلتني معلوماتك. ما العرض أو المشكلة الصحية التي تريد المساعدة بشأنها؟" : "I have that detail. What symptom or health concern can I help you with?",
      recommendation: "clarify",
      nextQuestions: [],
    };
  }
  const age = typeof facts.age === "number" ? facts.age : null;
  const location = facts.painLocation;
  const locationAr = location === "near the heart" ? "وألمك قرب القلب" : location === "lung/chest area" ? "والألم في منطقة الرئة" : location === "chest" ? "والألم في الصدر" : "";
  const locationEn = location === "near the heart" ? "the pain is near your heart" : location === "lung/chest area" ? "the pain is in your lung/chest area" : location === "chest" ? "the pain is in your chest" : "";
  const knownFactsEn = [age ? `you are ${age}` : null, locationEn || null].filter(Boolean).join(" and ");

  return locale === "ar"
    ? {
        reply: `فهمت، ${age ? `عمرك ${age} عامًا` : "وصلتني معلوماتك"}${locationAr ? ` ${locationAr}` : ""}. هل لديك ضيق تنفس أو دم يخرج مع السعال؟ إذا وُجد أي منهما مع ألم الصدر أو الرئة فاتصل بالطوارئ الآن.`,
        recommendation: "clarify",
        nextQuestions: ["هل لديك ضيق تنفس أو دم يخرج مع السعال؟"],
      }
    : {
        reply: `I understand ${knownFactsEn}. Do you have trouble breathing or are you coughing up blood? If either occurs with chest or lung pain, seek emergency care now.`,
        recommendation: "clarify",
        nextQuestions: ["Any trouble breathing or coughing up blood?"],
      };
}

function emergencyFallback(input: {
  locale: "en" | "ar";
  city: string | null;
  providers: Provider[];
  asksForEmergencyLocation: boolean;
  asksWhyRepeating: boolean;
  painLocation: string | null;
  hasBleeding: boolean;
}): LlmAgentResponse {
  const provider = input.providers.find((item) => item.emergencyDepartment && item.city === input.city);
  const providerName = provider && (input.locale === "ar" ? provider.nameAr : provider.name);
  const locationAnswerAr = providerName
    ? `${providerName} خيار مسجل في ${input.city}، لكن لا أستطيع تأكيد أنه الأقرب إليك.`
    : input.city
      ? `لا توجد طوارئ مطابقة في قاعدة البيانات لمدينة ${input.city}، ولا أستطيع تحديد الأقرب إليك.`
      : "لا أعرف موقعك بعد. في أي مدينة أنت؟";
  const locationAnswerEn = providerName
    ? `${providerName} is a listed option in ${input.city}, though I can't confirm it is the nearest.`
    : input.city
      ? `I don't have a matching emergency department in the database for ${input.city}, so I can't identify the nearest one.`
      : "I don't know your location yet. What city are you in?";
  const knownPainAr = input.painLocation === "near the heart" ? "ذكرت أن الألم قرب القلب. " : input.painLocation ? "ذكرت مكان الألم بالفعل. " : "";
  const knownPainEn = input.painLocation === "near the heart" ? "You said the pain is near your heart. " : input.painLocation ? "You already described where the pain is. " : "";
  const urgencyAr = input.hasBleeding ? "وجود دم مع ألم في الصدر أو الرئة أو ضيق التنفس يحتاج تقييمًا طارئًا الآن." : "الأعراض التي ذكرتها تحتاج تقييمًا طارئًا الآن.";
  const urgencyEn = input.hasBleeding ? "Blood with chest or lung pain or breathing difficulty needs emergency assessment now." : "The symptoms you described need emergency assessment now.";
  const reply = input.locale === "ar"
    ? input.asksWhyRepeating
      ? `أعتذر، كررت السؤال رغم أنك أجبت. ${knownPainAr}${urgencyAr} ${input.asksForEmergencyLocation ? `${locationAnswerAr} ` : ""}اتصل بالإسعاف المحلي أو توجه إلى أقرب طوارئ.`
      : input.asksForEmergencyLocation
        ? `${locationAnswerAr} اتصل بالإسعاف المحلي أو توجه إلى أقرب طوارئ الآن.`
        : `${knownPainAr}${urgencyAr} اتصل بالإسعاف المحلي أو توجه إلى أقرب قسم طوارئ الآن.`
    : input.asksWhyRepeating
      ? `I'm sorry I asked again after you answered. ${knownPainEn}${urgencyEn} ${input.asksForEmergencyLocation ? `${locationAnswerEn} ` : ""}Call local emergency services or go to an emergency department.`
      : input.asksForEmergencyLocation
        ? `${locationAnswerEn} Call local emergency services or go to an emergency department now.`
        : `${knownPainEn}${urgencyEn} Call local emergency services or go to the nearest emergency department now.`;

  return { reply, recommendation: "go_to_er", nextQuestions: input.asksForEmergencyLocation && !input.city ? [input.locale === "ar" ? "في أي مدينة أنت؟" : "What city are you in?"] : [] };
}

async function invokeAgentModel(input: {
  locale: "en" | "ar";
  currentMessage: string;
  contextText: string;
  city: string | null;
  extractedFacts: Record<string, unknown>;
  triage: TriageResult;
  allowedProviderNames: string[];
  providers: Provider[];
  safety: string;
  conversationMessages?: AgentRequest["history"];
  previousWrongLanguageReply?: string;
  responseCorrection?: string;
}) {
  const languageCorrection = input.previousWrongLanguageReply
    ? input.locale === "en"
      ? "Your previous reply used the wrong language. Rewrite the answer in English only. Do not include Arabic text."
      : "Your previous reply used the wrong language. Rewrite the answer in Arabic only. Do not include English text except unavoidable medical names."
    : undefined;

  const response = await chatModel.invoke([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        locale: input.locale,
        current_message_language: input.locale,
        current_message: input.currentMessage,
        conversation_context: input.contextText,
        conversation_messages: input.conversationMessages?.slice(-12) ?? [],
        detected_city: input.city,
        extracted_facts: input.extractedFacts,
        triage_result: input.triage,
        allowed_provider_names: input.allowedProviderNames,
        provider_results: input.providers,
        safety_message: input.safety,
        language_correction: languageCorrection,
        previous_wrong_language_reply: input.previousWrongLanguageReply,
        response_correction: input.responseCorrection,
      }),
    },
  ]);

  return stringifyLlmContent(response.content);
}

export async function generateAgentResponseWithLlm(input: {
  request: AgentRequest;
  locale: "en" | "ar";
  contextText: string;
  city: string | null;
  extractedFacts: Record<string, unknown>;
  triage: TriageResult;
  providers: Provider[];
  safety: string;
}): Promise<LlmAgentResponse> {
  const allowedProviderNames = input.providers.flatMap((provider) => [provider.name, provider.nameAr]);

  let content = "";
  try {
    content = await invokeAgentModel({
      locale: input.locale,
      currentMessage: input.request.message,
      contextText: input.contextText,
      city: input.city,
      extractedFacts: input.extractedFacts,
      triage: input.triage,
      allowedProviderNames,
      providers: input.providers,
      safety: input.safety,
      conversationMessages: input.request.history,
    });
  } catch (error) {
    logger.error({ error }, "LangChain Ollama request failed");
    throw new Error("LLM request failed");
  }

  if (!content) throw new Error("LLM response missing content");

  const parsed = JSON.parse(extractJson(content)) as Partial<LlmAgentResponse>;
  if (!parsed.reply || !parsed.recommendation || !Array.isArray(parsed.nextQuestions)) {
    throw new Error("LLM response did not match agent schema");
  }

  if (!replyMatchesLocale(parsed.reply, input.locale)) {
    logger.warn({ locale: input.locale }, "LLM replied in wrong language; retrying with correction");
    const correctedContent = await invokeAgentModel({
      locale: input.locale,
      currentMessage: input.request.message,
      contextText: input.contextText,
      city: input.city,
      extractedFacts: input.extractedFacts,
      triage: input.triage,
      allowedProviderNames,
      providers: input.providers,
      safety: input.safety,
      conversationMessages: input.request.history,
      previousWrongLanguageReply: parsed.reply,
    });
    const corrected = JSON.parse(extractJson(correctedContent)) as Partial<LlmAgentResponse>;

    if (corrected.reply && corrected.recommendation && Array.isArray(corrected.nextQuestions) && replyMatchesLocale(corrected.reply, input.locale)) {
      parsed.reply = corrected.reply;
      parsed.recommendation = corrected.recommendation;
      parsed.nextQuestions = corrected.nextQuestions;
    }
  }

  if (shouldRefuseOutOfScope(input.extractedFacts, parsed.intent)) {
    return outOfScopeResponse(input.locale);
  }

  if (input.triage.urgency === "emergency") {
    const asksForEmergencyLocation = input.extractedFacts.asksForEmergencyLocation === true || input.extractedFacts.currentMessageSharesCity === true;
    const asksWhyRepeating = input.extractedFacts.asksWhyRepeating === true;
    const hasEmergencyDirection = /\b(emergency|ER|ambulance|911|999|997)\b|الطوارئ|الإسعاف|اسعاف/i.test(parsed.reply);
    const answersLocation = !asksForEmergencyLocation || (input.city
      ? input.providers.some((provider) => parsed.reply?.includes(provider.name) || parsed.reply?.includes(provider.nameAr)) || /no matching|don't have|not available|لا توجد|لا يوجد/i.test(parsed.reply)
      : /\b(city|location|where are you|don't know where|do not know where)\b|مدينة|موقعك|أين أنت|وين أنت/i.test(parsed.reply));
    const answersRepetition = !asksWhyRepeating || /sorry|apolog|repeated|repeat|عذرا|عذرًا|أعتذر|كررت|تكرار/i.test(parsed.reply);
    const answerText = `${parsed.reply}\n${parsed.nextQuestions.join("\n")}`;
    const repeatsLocation = repeatsKnownLocationQuestion(answerText, input.extractedFacts.painLocationKnown === true);
    const repeatsAge = repeatsKnownAgeQuestion(answerText, input.extractedFacts.age);
    const repeatsGreeting = startsUnneededGreeting(parsed.reply, input.extractedFacts.isGreetingOnly === true);

    if (parsed.recommendation !== "go_to_er" || !hasEmergencyDirection || !answersLocation || !answersRepetition || repeatsLocation || repeatsAge || repeatsGreeting || parsed.intent === "out_of_scope") {
      logger.warn({ asksForEmergencyLocation, asksWhyRepeating, repeatsLocation, repeatsAge, repeatsGreeting }, "LLM missed current emergency turn; using contextual safety response");
      return emergencyFallback({ locale: input.locale, city: input.city, providers: input.providers, asksForEmergencyLocation, asksWhyRepeating: asksWhyRepeating || repeatsLocation || repeatsAge, painLocation: typeof input.extractedFacts.painLocation === "string" ? input.extractedFacts.painLocation : null, hasBleeding: input.triage.redFlags.includes("bleeding with chest symptoms") });
    }
  }

  if (input.triage.urgency !== "emergency") {
    const answerText = `${parsed.reply}\n${parsed.nextQuestions.join("\n")}`;
    const repeatsLocation = repeatsKnownLocationQuestion(answerText, input.extractedFacts.painLocationKnown === true);
    const repeatsAge = repeatsKnownAgeQuestion(answerText, input.extractedFacts.age);
    const repeatsGreeting = input.extractedFacts.hasThoracicPain === true && startsUnneededGreeting(parsed.reply, input.extractedFacts.isGreetingOnly === true);
    const misclassifiedMedical = input.extractedFacts.currentMessageIsMedical === true &&
      (parsed.intent === "out_of_scope" || /لا أستطيع المساعدة في ذلك|I can't help with that/i.test(parsed.reply));

    if (repeatsLocation || repeatsAge || repeatsGreeting || misclassifiedMedical) {
      logger.warn({ repeatsLocation, repeatsAge, repeatsGreeting, misclassifiedMedical }, "LLM missed patient context; retrying");
      const correctedContent = await invokeAgentModel({
        locale: input.locale,
        currentMessage: input.request.message,
        contextText: input.contextText,
        city: input.city,
        extractedFacts: input.extractedFacts,
        triage: input.triage,
        allowedProviderNames,
        providers: input.providers,
        safety: input.safety,
        conversationMessages: input.request.history,
        responseCorrection: "The current user message is part of patient care, not an unrelated request. The patient may have just supplied age, city, blood, breathing difficulty, or pain location. Acknowledge known facts in extracted_facts and ask only the most important unanswered medical question. Do not repeat an answered question or greet again.",
      });
      const corrected = JSON.parse(extractJson(correctedContent)) as Partial<LlmAgentResponse>;
      if (corrected.reply && corrected.recommendation && Array.isArray(corrected.nextQuestions) &&
        replyMatchesLocale(corrected.reply, input.locale) &&
        !repeatsKnownLocationQuestion(`${corrected.reply}\n${corrected.nextQuestions.join("\n")}`, input.extractedFacts.painLocationKnown === true) &&
        !repeatsKnownAgeQuestion(`${corrected.reply}\n${corrected.nextQuestions.join("\n")}`, input.extractedFacts.age) &&
        !(input.extractedFacts.hasThoracicPain === true && startsUnneededGreeting(corrected.reply, input.extractedFacts.isGreetingOnly === true)) &&
        corrected.intent !== "out_of_scope" && !/لا أستطيع المساعدة في ذلك|I can't help with that/i.test(corrected.reply)) {
        parsed.reply = corrected.reply;
        parsed.recommendation = corrected.recommendation;
        parsed.nextQuestions = corrected.nextQuestions;
      } else {
        return knownFactsFollowUp(input.locale, input.extractedFacts);
      }
    }
  }

  if (input.extractedFacts.painStartedToday === true && input.triage.urgency !== "emergency") {
    const previousReply = [...(input.request.history ?? [])].reverse().find((message) => message.role === "assistant")?.content;
    if (repeatsAnsweredPainStart(`${parsed.reply}\n${parsed.nextQuestions.join("\n")}`) || (previousReply && parsed.reply.trim() === previousReply.trim())) {
      logger.warn("LLM repeated a question already answered; retrying with conversation correction");
      const correctedContent = await invokeAgentModel({
        locale: input.locale,
        currentMessage: input.request.message,
        contextText: input.contextText,
        city: input.city,
        extractedFacts: input.extractedFacts,
        triage: input.triage,
        allowedProviderNames,
        providers: input.providers,
        safety: input.safety,
        conversationMessages: input.request.history,
        responseCorrection: "The patient already said the chest pain began today. Your previous reply repeated the answered start-time question. Acknowledge today, ask whether pain is still present and check emergency red flags. Do not greet again or ask when it began.",
      });
      const corrected = JSON.parse(extractJson(correctedContent)) as Partial<LlmAgentResponse>;
      if (corrected.reply && corrected.recommendation && Array.isArray(corrected.nextQuestions) &&
        replyMatchesLocale(corrected.reply, input.locale) && !repeatsAnsweredPainStart(`${corrected.reply}\n${corrected.nextQuestions.join("\n")}`) &&
        corrected.reply.trim() !== previousReply?.trim()) {
        parsed.reply = corrected.reply;
        parsed.recommendation = corrected.recommendation;
        parsed.nextQuestions = corrected.nextQuestions;
      } else {
        return painStartedTodayFollowUp(input.locale);
      }
    }
  }

  const forbiddenProvider = findForbiddenProviderMention(parsed.reply, allowedProviderNames);
  if (forbiddenProvider) {
    logger.warn({ forbiddenProvider }, "LLM mentioned provider outside whitelist; using guarded provider response");
    return {
      reply:
        input.locale === "ar"
          ? `حسب قاعدة البيانات الحالية والمدينة المحددة (${input.city})، الخيارات المتاحة هي:\n${buildProviderList(input.providers, input.locale)}`
          : `Based on the current database and selected city (${input.city}), the available options are:\n${buildProviderList(input.providers, input.locale)}`,
      recommendation: parsed.recommendation,
      nextQuestions: parsed.nextQuestions,
    };
  }

  return {
    reply: parsed.reply,
    recommendation: parsed.recommendation,
    nextQuestions: parsed.nextQuestions,
  };
}
