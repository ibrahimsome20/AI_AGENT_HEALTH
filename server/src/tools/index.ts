import { providers } from "../data/index.js";
import type { Provider } from "../data/types.js";
import type { ProviderSearchInput, TriageInput, TriageResult } from "./types.js";
import { extractAge } from "./patient-text.js";

export type { ProviderSearchInput, ToolCallRecord, TriageInput, TriageResult, UrgencyLevel } from "./types.js";

const redFlagPatterns = [
  { label: "severe pain", re: /\b(severe|very bad|unbearable)\b|شديد|شديده|شديدة|جدا|جدًا|لا يحتمل/i },
  { label: "cancer history", re: /\b(cancer|chemotherapy|tumou?r)\b|سرطان|السرطان|كيماوي|ورم|اورام|أورام/i },
  { label: "severe chest pain", re: /\b(severe|crushing|pressure|tight|ضاغط|شديد)\b/i },
  { label: "shortness of breath", re: /\b(short(ness)? of breath|breathless)\b|ضيق\s*(?:في\s*)?(?:التنفس|تنفس|نفس)|صعوبة\s*(?:في\s*)?(?:التنفس|تنفس)/i },
  { label: "radiating pain", re: /\b(left arm|jaw|back|radiat|الذراع|الفك|الظهر)\b/i },
  { label: "fainting or sweating", re: /\b(faint|syncope|sweat|تعرق|إغماء)\b/i },
  { label: "heart attack concern", re: /\b(heart attack|نوبة قلبية|جلطة)\b/i },
  { label: "bleeding with chest symptoms", re: /\b(blood(?! pressure)|bleeding|hemoptysis)\b|(?:^|[^\p{L}])(?:الدم|دم)(?=$|[^\p{L}])|نزيف|ينزف/iu },
];

const questions = {
  painDuration: {
    en: "When did the pain start and how long has it lasted?",
    ar: "متى بدأ الألم وكم استمر؟",
  },
  painOngoing: {
    en: "Is the chest pain still happening now?",
    ar: "هل ألم الصدر مستمر الآن؟",
  },
  chestRedFlags: {
    en: "Any shortness of breath, sweating, fainting, nausea, or pain spreading to arm/jaw/back?",
    ar: "هل يوجد ضيق تنفس، تعرّق، إغماء، غثيان، أو ألم ينتشر إلى الذراع أو الفك أو الظهر؟",
  },
  ageRisk: {
    en: "What is the patient's age?",
    ar: "ما عمر المريض؟",
  },
  cardiacRisk: {
    en: "Any known cardiac risk factors such as smoking, diabetes, high blood pressure, or heart disease?",
    ar: "هل توجد عوامل خطورة قلبية مثل التدخين، السكري، ارتفاع الضغط، أو مرض سابق في القلب؟",
  },
  mainSymptom: {
    en: "Please describe the main symptom, where it is in the body, duration, severity, and any prior diagnosis.",
    ar: "صف العرض الأساسي، مكانه في الجسم، مدته، شدته، وأي تشخيص سابق إن وجد.",
  },
  painLocation: {
    en: "Where exactly is the severe pain, and did it start suddenly?",
    ar: "أين مكان الألم الشديد بالضبط؟ وهل بدأ فجأة؟",
  },
  feverCancer: {
    en: "Do you have fever, weakness, vomiting, bleeding, or are you currently receiving cancer treatment?",
    ar: "هل لديك حرارة، ضعف شديد، قيء، نزيف، أو هل تتلقى علاجًا للسرطان حاليًا؟",
  },
};

function hasChestPain(text: string) {
  return /\b(chest pain|chest)\b|صدر|الصدر|ألم\s*(في)?\s*الصدر|وجع\s*(في)?\s*الصدر/i.test(text);
}

function hasLungPain(text: string) {
  return /\b(lung pain|pain in (?:my|the) lungs?)\b|(?:ألم|الم|وجع)\s*(?:في\s*)?(?:الرئة|الرئه|رئة|رئه)|(?:في\s*)?(?:الرئة|الرئه)\s*(?:يوجع|توجع)/i.test(text);
}

function hasPainStart(text: string) {
  return /\b(today|yesterday|started|began|since)\b|اليوم|أمس|امس|بدأ|ابتد|منذ/i.test(text);
}

function hasPainDuration(text: string) {
  return /\b(\d+\s*(minute|minutes|hour|hours|day|days)|still hurting|ongoing|stopped|comes and goes)\b|\d+\s*(ساعة|ساعات|دقيقة|دقائق|يوم|أيام|ايام)|مستمر|ما زال|مازال|توقف|راح الألم|يجي ويروح/i.test(text);
}

function hasKnownRiskFactor(text: string) {
  return /\b(smoke|smoker|diabetes|hypertension|blood pressure)\b|ادخن|أدخن|يدخن|تدخين|مدخن|سكري|السكر|ضغط|الضغط/i.test(text);
}

function requestsPulmonology(text: string) {
  return /\b(pulmonology|pulmonologist|lung|asthma|cough)\b|طبيب\s*(رئة|رئه|صدر|صدرية)|دكتور\s*(رئة|رئه|صدر|صدرية)|رئة|رئه|صدرية|ربو|كحة|سعال|ضيق\s*نفس/i.test(text);
}

export function triageSymptoms(input: TriageInput): TriageResult {
  const locale = input.locale ?? "en";
  const text = input.text.toLowerCase();
  const currentMessage = input.currentMessage?.trim() ?? "";
  const currentMessageIsAgeAnswer = /^\d{1,3}$/.test(currentMessage);
  const isChestPain = hasChestPain(input.text);
  const hasThoracicPain = isChestPain || hasLungPain(input.text);
  const wantsPulmonology = requestsPulmonology(input.text);
  const secondOpinion = /\b(second opinion|رأي ثاني|رأي آخر)\b/i.test(input.text);
  const hasSeverePain = /\b(severe|very bad|unbearable)\b|شديد|شديده|شديدة|جدا|جدًا|لا يحتمل/i.test(input.text);
  const hasCancerHistory = /\b(cancer|chemotherapy|tumou?r)\b|سرطان|السرطان|كيماوي|ورم|اورام|أورام/i.test(input.text);
  const redFlags = redFlagPatterns
    .filter((pattern) => pattern.re.test(input.text))
    .map((pattern) => pattern.label);
  const chestBleeding = isChestPain && redFlags.includes("bleeding with chest symptoms");
  const bleedingWithBreathingSymptoms = redFlags.includes("bleeding with chest symptoms") &&
    (hasThoracicPain || redFlags.includes("shortness of breath"));
  const thoracicPainWithBreathingDifficulty = hasThoracicPain && redFlags.includes("shortness of breath");

  const missingInfo: string[] = [];
  if (hasThoracicPain && !hasPainStart(input.text)) {
    missingInfo.push(questions.painDuration[locale]);
  } else if (hasThoracicPain && !hasPainDuration(input.text)) {
    missingInfo.push(questions.painOngoing[locale]);
  }
  if (hasThoracicPain && redFlags.length === 0) {
    missingInfo.push(questions.chestRedFlags[locale]);
  }
  if (extractAge(input.text) === null && !currentMessageIsAgeAnswer) {
    missingInfo.push(questions.ageRisk[locale]);
  }
  if (isChestPain && !hasKnownRiskFactor(input.text)) {
    missingInfo.push(questions.cardiacRisk[locale]);
  }
  if (!isChestPain && hasSeverePain) {
    missingInfo.unshift(questions.painLocation[locale]);
  }
  if (hasCancerHistory) {
    missingInfo.push(questions.feverCancer[locale]);
  }

  if (chestBleeding || bleedingWithBreathingSymptoms || thoracicPainWithBreathingDifficulty) {
    return {
      urgency: "emergency",
      suspectedSpecialty: "emergency_medicine",
      redFlags,
      missingInfo: [],
      rationale: "Lung/chest pain with blood or breathing difficulty needs immediate emergency assessment; do not wait for more answers.",
    };
  }

  if (wantsPulmonology && redFlags.length === 0) {
    return {
      urgency: "urgent",
      suspectedSpecialty: "pulmonology",
      redFlags,
      missingInfo,
      rationale: "Patient is asking for lung/chest specialist care and no emergency red flags were detected.",
    };
  }

  if (hasSeverePain && hasCancerHistory) {
    return {
      urgency: "emergency",
      suspectedSpecialty: "emergency_medicine",
      redFlags,
      missingInfo,
      rationale: "Severe pain with a cancer history can indicate a serious complication and needs urgent assessment.",
    };
  }

  if (hasCancerHistory) {
    return {
      urgency: "urgent",
      suspectedSpecialty: "oncology",
      redFlags,
      missingInfo,
      rationale: "Cancer history with new symptoms should be reviewed by oncology unless emergency red flags are present.",
    };
  }

  if (isChestPain && redFlags.length > 0) {
    return {
      urgency: "emergency",
      suspectedSpecialty: "emergency_medicine",
      redFlags,
      missingInfo,
      rationale: "Chest pain with possible cardiac red flags should be assessed by emergency care first.",
    };
  }

  if (isChestPain && secondOpinion) {
    return {
      urgency: "needs_clarification",
      suspectedSpecialty: "cardiology",
      redFlags,
      missingInfo,
      rationale: "Stable chest pain or an existing diagnosis can be routed to cardiology, but emergency symptoms must be excluded first.",
    };
  }

  if (isChestPain) {
    return {
      urgency: "urgent",
      suspectedSpecialty: "cardiology",
      redFlags,
      missingInfo,
      rationale: "Chest pain usually needs prompt medical review even when clear emergency red flags are not provided.",
    };
  }

  return {
    urgency: text.includes("second opinion") ? "routine" : "needs_clarification",
    suspectedSpecialty: "unknown",
    redFlags,
    missingInfo: [questions.mainSymptom[locale]],
    rationale: "The message does not contain enough clinical detail to recommend a specific provider safely.",
  };
}

export function searchProviders(input: ProviderSearchInput): Provider[] {
  return providers
    .filter((provider) => !input.city || provider.city === input.city || provider.city === "Virtual")
    .filter((provider) => !input.specialty || provider.specialties.includes(input.specialty))
    .filter((provider) => input.needsEmergency === undefined || provider.emergencyDepartment === input.needsEmergency)
    .filter((provider) => input.secondOpinion === undefined || provider.acceptsSecondOpinions === input.secondOpinion)
    .filter((provider) => !input.language || provider.languages.includes(input.language))
    .sort((first, second) => {
      if (!input.city) return 0;
      if (first.city === input.city && second.city !== input.city) return -1;
      if (first.city !== input.city && second.city === input.city) return 1;
      return 0;
    })
    .slice(0, 3);
}
