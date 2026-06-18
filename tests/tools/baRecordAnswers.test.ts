import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { readSession } from "../../src/core/session.js";
import { listDecisions } from "../../src/core/decisions.js";

test("records answers as decisions, queues them for apply, and clears open questions", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const assessed = baAssess({ projectRoot: root });
  const q = assessed.questions[0];

  const res = baRecordAnswers({ projectRoot: root, items: [
    { question: q.text, answer: "MVP only — internal tool", asked_round: "surface", topic: q.topic },
  ] });
  expect(res.recorded).toEqual(["DEC-001"]);

  const docsRoot = join(root, "docs/ba");
  expect(listDecisions(docsRoot)).toHaveLength(1);
  const session = readSession(docsRoot)!;
  expect(session.pending_apply).toContain("DEC-001");
  expect(session.open_questions.some(oq => oq.text === q.text)).toBe(false);
});

test("recording the same ref twice is idempotent (no duplicate decision)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const docsRoot = join(root, "docs/ba");
  const item = { question: "Scope?", answer: "MVP", asked_round: "surface" as const, topic: "scope", ref: "Q-s1" };

  const first = baRecordAnswers({ projectRoot: root, items: [item] });
  expect(first.recorded).toEqual(["DEC-001"]);

  const second = baRecordAnswers({ projectRoot: root, items: [item] });
  expect(second.recorded).toEqual([]);
  expect(second.skipped).toEqual(["Q-s1"]);
  expect(listDecisions(docsRoot)).toHaveLength(1); // not duplicated
});

test("clears open questions by ref even when the question text was reformatted", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const docsRoot = join(root, "docs/ba");
  const assessed = baAssess({ projectRoot: root }); // populates open_questions with refs
  const q = assessed.questions[0];

  baRecordAnswers({ projectRoot: root, items: [
    { question: "(host reworded the question)", answer: "a", asked_round: "surface", topic: q.topic, ref: q.ref },
  ] });
  // matched by ref, not text
  expect(readSession(docsRoot)!.open_questions.some(oq => oq.ref === q.ref)).toBe(false);
});
