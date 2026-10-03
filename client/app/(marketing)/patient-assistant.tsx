"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AgentResponse, AssistantCopy, Locale, Message, Provider } from "@/types/patient-assistant";

const CONVERSATION_STORAGE_KEY = "healtrip.conversationId";
const MAX_MESSAGE_LENGTH = 100;

const typeLabels: Record<string, Record<Locale, string>> = {
  hospital: { en: "hospital", ar: "مستشفى" },
  clinic: { en: "clinic", ar: "عيادة" },
  telehealth: { en: "telehealth", ar: "استشارة عن بعد" },
};

const cityLabels: Record<string, Record<Locale, string>> = {
  Riyadh: { en: "Riyadh", ar: "الرياض" },
  Dammam: { en: "Dammam", ar: "الدمام" },
  Virtual: { en: "Virtual", ar: "عن بعد" },
};

const providerNotesAr: Record<string, string> = {
  "er-ruh-001": "رعاية طارئة للألم الشديد، ألم الصدر، الإغماء، مشاكل التنفس، أو علامات الخطر الأخرى.",
  "card-ruh-014": "عيادة قلب متخصصة لأعراض الصدر المستقرة والرأي الطبي الثاني للقلب.",
  "onc-ruh-018": "عيادة أورام للمتابعة والرأي الطبي الثاني عندما لا تكون الأعراض طارئة.",
  "neuro-ruh-021": "رعاية أعصاب للصداع، التنميل، الدوخة، والرأي الطبي الثاني للحالات المستقرة.",
  "ortho-ruh-025": "عيادة عظام للحالات المستقرة المتعلقة بالعظام والمفاصل والظهر والإصابات الرياضية.",
  "im-ruh-032": "عيادة باطنية للأعراض العامة غير الطارئة ومراجعة الأمراض المزمنة.",
  "pulm-ruh-036": "عيادة رئة للحالات المستقرة مثل ضيق النفس، الربو، الكحة، ومشاكل الرئة.",
  "er-dmm-041": "قسم طوارئ للأعراض العاجلة في الدمام.",
  "card-dmm-029": "عيادة قلب متخصصة لأعراض الصدر المستقرة في الدمام.",
  "onc-dmm-044": "متابعة أورام ورأي طبي ثانٍ للحالات المستقرة المتعلقة بالسرطان.",
  "neuro-dmm-047": "عيادة أعصاب للصداع المستقر، ألم الأعصاب، الضعف، أو الدوخة.",
  "ortho-dmm-052": "عيادة عظام لألم المفاصل والعظام والظهر في الحالات المستقرة.",
  "im-dmm-056": "عيادة باطنية للأعراض العامة غير الطارئة ورعاية الأمراض المزمنة.",
  "pulm-dmm-061": "عيادة رئة للحالات المستقرة مثل ضيق النفس، الربو، الكحة، ومشاكل الرئة في الدمام.",
  "tele-card-003": "رأي طبي ثانٍ للقلب عن بعد للحالات المستقرة غير الطارئة فقط.",
  "tele-onc-004": "رأي طبي ثانٍ للأورام عن بعد للمرضى المستقرين الذين لديهم تقارير طبية.",
  "tele-pulm-005": "رأي طبي ثانٍ للرئة عن بعد للحالات المستقرة غير الطارئة.",
};

function providerMeta(provider: Provider, locale: Locale) {
  const type = typeLabels[provider.type]?.[locale] ?? provider.type;
  const city = provider.cityAr && locale === "ar" ? provider.cityAr : cityLabels[provider.city]?.[locale] ?? provider.city;
  const notes = locale === "ar" ? provider.notesAr ?? providerNotesAr[provider.id] ?? provider.notes : provider.notes;
  const nextAvailable = locale === "ar" ? provider.nextAvailableAr ?? provider.nextAvailable : provider.nextAvailable;

  return { type, city, notes, nextAvailable };
}

const copy: Record<Locale, AssistantCopy> = {
  en: {
    title: "HealTrip AI Patient Decision Assistant",
    subtitle: "A prototype chat that triages symptoms, asks clarifying questions, and searches only trusted provider data.",
    placeholder: "Describe symptoms, concern, city, or request for second opinion...",
    initialAssistant:
      "Hi, tell me what you are feeling and I will help you choose a safer next step. If symptoms feel severe or life-threatening, call emergency services now.",
    send: "Send",
    example: "I have chest pain. Should I go to the ER or see a cardiologist?",
    questions: "Clarifying Questions",
    providers: "Recommended Care Options",
    nextStep: "Suggested Next Step",
    emptyProviders: "Care options will appear after the assistant understands the case.",
    emptyQuestions: "Answer a few details to help the assistant route the case safely.",
    error: "I’m having trouble reaching the assistant right now. Please try again in a moment.",
    thinking: "Reviewing your message...",
    exampleButton: "Example",
  },
  ar: {
    title: "مساعد هيل ترب الذكي لقرار المريض",
    subtitle: "نموذج محادثة يفرز الأعراض، يطرح أسئلة توضيحية، ويبحث فقط في بيانات مزودين موثوقة.",
    placeholder: "اكتب الأعراض أو المدينة أو طلب رأي طبي ثان...",
    initialAssistant: "أهلًا، أخبرني بما تشعر به وسأساعدك في اختيار الخطوة الأكثر أمانًا. إذا كانت الأعراض شديدة أو تهدد الحياة فاتصل بالطوارئ فورًا.",
    send: "إرسال",
    example: "لدي ألم في الصدر ولا أعرف هل أذهب للطوارئ أم لطبيب قلب أم أطلب رأيًا ثانيًا.",
    questions: "أسئلة توضيحية",
    providers: "خيارات الرعاية المقترحة",
    nextStep: "الخطوة المقترحة",
    emptyProviders: "ستظهر خيارات الرعاية بعد أن يفهم المساعد الحالة.",
    emptyQuestions: "أجب عن بعض التفاصيل لمساعدة المساعد على توجيه الحالة بأمان.",
    error: "أواجه مشكلة في الوصول إلى المساعد الآن. حاول مرة أخرى بعد لحظات.",
    thinking: "أراجع رسالتك...",
    exampleButton: "مثال",
  },
};

function getInitialAssistant(locale: Locale): Message {
  return {
    role: "assistant",
    content: copy[locale].initialAssistant,
  };
}

function getStoredConversationId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
}

function detectMessageLocale(message: string, fallback: Locale): Locale {
  if (/[\u0600-\u06FF]/.test(message)) return "ar";
  if (/[A-Za-z]/.test(message)) return "en";
  return fallback;
}

export default function PatientAssistant() {
  const [locale, setLocale] = useState<Locale>("en");
  const [input, setInput] = useState(copy.en.example);
  const [messages, setMessages] = useState<Message[]>([getInitialAssistant("en")]);
  const [lastResponse, setLastResponse] = useState<AgentResponse | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(() => getStoredConversationId());
  const [loading, setLoading] = useState(false);
  const t = copy[locale];

  const providerMatches = useMemo(() => {
    const searchCall = lastResponse?.toolCalls.find((call) => call.tool === "search_providers");
    return Array.isArray(searchCall?.output) ? (searchCall.output as Provider[]) : [];
  }, [lastResponse]);

  const recommendationLabel = useMemo(() => {
    if (!lastResponse) return locale === "ar" ? "بانتظار وصف الحالة" : "Waiting for symptoms";
    const labels: Record<AgentResponse["recommendation"], Record<Locale, string>> = {
      go_to_er: { en: "Go to the ER now", ar: "اذهب للطوارئ الآن" },
      see_specialist: { en: "Book a specialist visit", ar: "احجز زيارة مع مختص" },
      second_opinion: { en: "Request a second opinion", ar: "اطلب رأيًا طبيًا ثانيًا" },
      clarify: { en: "Answer clarifying questions", ar: "أجب عن الأسئلة التوضيحية" },
    };
    return labels[lastResponse.recommendation][locale];
  }, [lastResponse, locale]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || message.length > MAX_MESSAGE_LENGTH || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: message }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const messageLocale = detectMessageLocale(message, locale);
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, message, locale: messageLocale }),
      });

      if (!response.ok) throw new Error(`API failed with ${response.status}`);
      const data = (await response.json()) as AgentResponse;
      setConversationId(data.conversationId);
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId);
      setLastResponse(data);
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages([...nextMessages, { role: "assistant", content: t.error }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <Badge>HealTrip</Badge>
            <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">{t.title}</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{t.subtitle}</p>
          </div>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm font-medium">
            {(["en", "ar"] as Locale[]).map((item) => (
              <Button
                key={item}
                className="h-9 min-w-12 px-3"
                onClick={() => {
                  setLocale(item);
                  setInput(copy[item].example);
                  setMessages((currentMessages) => (currentMessages.length === 1 ? [getInitialAssistant(item)] : currentMessages));
                }}
                disabled={loading}
                type="button"
                variant={locale === item ? "default" : "ghost"}
              >
                {item.toUpperCase()}
              </Button>
            ))}
          </div>
          </div>
          <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
            <Metric label={locale === "ar" ? "فرز أولي" : "Triage"} value={locale === "ar" ? "آمن" : "Safety first"} />
            <Metric label={locale === "ar" ? "اللغة" : "Language"} value={locale === "ar" ? "عربي / إنجليزي" : "Arabic / English"} />
            <Metric label={locale === "ar" ? "المصادر" : "Sources"} value={locale === "ar" ? "بيانات موثوقة" : "Verified data"} />
          </div>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <Card className="flex min-h-[650px] flex-col overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{locale === "ar" ? "المحادثة" : "Patient Chat"}</CardTitle>
                  <p className="mt-2 text-sm text-slate-500">
                    {locale === "ar" ? "صف الأعراض وسيقترح المساعد الخطوة التالية." : "Describe symptoms and the assistant will suggest the next step."}
                  </p>
                </div>
                <Badge>{recommendationLabel}</Badge>
              </div>
            </CardHeader>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4 md:p-6" dir="ltr">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    dir={locale === "ar" ? "rtl" : "ltr"}
                    className={cn(
                      "max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
                      message.role === "user" ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {loading ? (
                <div className="flex justify-start">
                  <div
                    dir={locale === "ar" ? "rtl" : "ltr"}
                    className="max-w-[82%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-500 shadow-sm"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                      {t.thinking}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <form className="border-t border-slate-100 bg-white p-4" onSubmit={submit}>
              <Textarea disabled={loading} maxLength={MAX_MESSAGE_LENGTH} onChange={(event) => setInput(event.target.value)} placeholder={t.placeholder} value={input} />
              <div className="mt-3 flex items-center justify-between gap-3">
                <Button disabled={loading} onClick={() => setInput(t.example)} type="button" variant="outline">
                  {t.exampleButton}
                </Button>
                <span className="ms-auto text-xs tabular-nums text-slate-500">{input.length}/{MAX_MESSAGE_LENGTH}</span>
                <Button disabled={loading || !input.trim() || input.trim().length > MAX_MESSAGE_LENGTH} type="submit">
                  {loading ? "..." : t.send}
                </Button>
              </div>
            </form>
          </Card>

          <aside className="space-y-5">
            <Panel title={t.nextStep}>
              <div className="space-y-3">
                <Badge>{recommendationLabel}</Badge>
                <p className="text-sm leading-6 text-slate-600">
                  {lastResponse?.safety ??
                    (locale === "ar"
                      ? "هذا المساعد لا يقدم تشخيصًا. في الحالات الشديدة أو المتفاقمة اتصل بالطوارئ فورًا."
                      : "This assistant does not provide a diagnosis. For severe or worsening symptoms, contact emergency services immediately.")}
                </p>
              </div>
            </Panel>

            <Panel title={t.questions}>
              {lastResponse?.nextQuestions.length ? (
                <ul className="space-y-2 text-sm leading-6 text-slate-700">
                  {lastResponse.nextQuestions.map((question) => (
                    <li className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2" key={question}>
                      {question}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-6 text-slate-500">{t.emptyQuestions}</p>
              )}
            </Panel>

            <Panel title={t.providers}>
              <div className="space-y-3">
                {providerMatches.length ? (
                  providerMatches.map((provider) => (
                    <ProviderCard key={provider.id} locale={locale} provider={provider} />
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-500">{t.emptyProviders}</p>
                )}
              </div>
            </Panel>
          </aside>
        </section>
      </div>
    </main>
  );
}

function ProviderCard({ locale, provider }: { locale: Locale; provider: Provider }) {
  const meta = providerMeta(provider, locale);

  return (
    <Card className="border-blue-100 bg-blue-50/40 p-4 shadow-none">
      <p className="text-sm font-semibold text-slate-950">{locale === "ar" ? provider.nameAr : provider.name}</p>
      <Badge className="mt-2">
        {meta.type} / {meta.city}
      </Badge>
      <p className="mt-2 text-xs font-medium text-blue-700">{meta.nextAvailable}</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{meta.notes}</p>
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="border-b-0 pb-0">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
