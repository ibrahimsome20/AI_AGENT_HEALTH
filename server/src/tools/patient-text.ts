export function normalizeDigits(text: string) {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x6f0 ? code - 0x6f0 : code - 0x660);
  });
}

export function extractAge(text: string): number | null {
  const normalized = normalizeDigits(text);
  const lines = normalized.split("\n").map((line) => line.trim());

  for (const line of lines.reverse()) {
    const match = line.match(/^(?:(?:عمري|عمرى|عمري هو|العمر|age(?: is)?|i am|i'm)\s*)?(\d{1,3})(?:\s*(?:سنه|سنة|سنوات|عام|years? old|y\/o|yo))?$/i);
    if (match) {
      const age = Number(match[1]);
      if (age > 0 && age <= 120) return age;
    }
  }

  const stated = normalized.match(/(?:عمري|عمرى|العمر|age(?: is)?|years? old)\s*(\d{1,3})/i);
  if (!stated) return null;
  const age = Number(stated[1]);
  return age > 0 && age <= 120 ? age : null;
}
