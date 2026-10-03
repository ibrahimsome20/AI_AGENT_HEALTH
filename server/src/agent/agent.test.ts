import assert from "node:assert/strict";
import test from "node:test";
import { triageSymptoms } from "../tools/index.js";
import { extractAge } from "../tools/patient-text.js";
import { extractFacts } from "./agent.service.js";
import { repeatsKnownAgeQuestion, repeatsKnownLocationQuestion, shouldRefuseOutOfScope } from "./llm.service.js";

test("Arabic digits are retained as patient age across turns", () => {
  assert.equal(extractAge("عندي الم في الرئه\n٢٦"), 26);
  assert.equal(extractAge("٢٦ سنه"), 26);
  assert.equal(extractAge("۲۶"), 26);

  const result = triageSymptoms({ text: "عندي الم في الرئه\n٢٦", locale: "ar" });
  assert.equal(result.suspectedSpecialty, "pulmonology");
  assert.ok(!result.missingInfo.includes("ما عمر المريض؟"));
});

test("lung pain with blood or difficulty breathing is routed to emergency care", () => {
  for (const followUp of ["ايوا في دم", "اقول في دم يطلع", "ايوا ضيق تنفس"]) {
    const result = triageSymptoms({ text: `عندي الم في الرئه\n٢٦\n${followUp}`, locale: "ar", currentMessage: followUp });
    assert.equal(result.urgency, "emergency", followUp);
    assert.equal(result.suspectedSpecialty, "emergency_medicine", followUp);
    assert.deepEqual(result.missingInfo, [], followUp);
  }

  const breathing = triageSymptoms({ text: "عندي الم في الرئه\nايوا ضيق تنفس", locale: "ar" });
  assert.ok(breathing.redFlags.includes("shortness of breath"));
  const bloodAndBreathing = triageSymptoms({ text: "عندي الم في الرئه\nايوا في دم\nايوا ضيق تنفس", locale: "ar" });
  assert.ok(bloodAndBreathing.redFlags.includes("shortness of breath"));
  assert.ok(bloodAndBreathing.redFlags.includes("bleeding with chest symptoms"));
});

test("Dammam does not trigger the Arabic blood flag", () => {
  const result = triageSymptoms({ text: "عندي الم في الرئه\nانا في الدمام", locale: "ar" });
  assert.ok(!result.redFlags.includes("bleeding with chest symptoms"));
});

test("short Arabic medical corrections stay in care navigation", () => {
  const history = "عندي الم في الرئه\n٢٦\nايوا في دم\nفي الجانب قرب القلب";
  const bloodFacts = extractFacts(`${history}\nاقول في دم يطلع`, "اقول في دم يطلع");
  assert.equal(bloodFacts.age, 26);
  assert.equal(bloodFacts.painLocation, "near the heart");
  assert.equal(shouldRefuseOutOfScope(bloodFacts, "out_of_scope"), false);

  const ageFacts = extractFacts("عندي الم في الرئه\n٢٦", "٢٦");
  assert.equal(shouldRefuseOutOfScope(ageFacts, "out_of_scope"), false);
  assert.equal(shouldRefuseOutOfScope(extractFacts("السلام عليكم", "السلام عليكم"), "out_of_scope"), false);
  assert.equal(shouldRefuseOutOfScope(extractFacts("أنا في الدمام", "أنا في الدمام"), "out_of_scope"), false);
  const mathFacts = extractFacts("1+1", "1+1");
  assert.equal(shouldRefuseOutOfScope(mathFacts, "out_of_scope"), true);
});

test("answered age and body location are not requested again", () => {
  assert.equal(repeatsKnownAgeQuestion("ما عمرك؟", 26), true);
  assert.equal(repeatsKnownLocationQuestion("هل يمكنك تحديد مكان الألم بالضبط في صدرك؟", true), true);
  assert.equal(repeatsKnownLocationQuestion("ذكرت مكان الألم بالفعل.", true), false);
});
