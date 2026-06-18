import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSession, writeSession, clearAnsweredQuestions } from "../../src/core/session.js";
import type { SessionState } from "../../src/core/session.js";

function base(): SessionState {
  return { mode: "discovery", round: "surface", open_questions: [], pending_apply: [], updated: "2026-06-18" };
}

test("returns null when no session file exists", () => {
  const docsRoot = mkdtempSync(join(tmpdir(), "ba-"));
  expect(readSession(docsRoot)).toBeNull();
});

test("round-trips session state", () => {
  const docsRoot = mkdtempSync(join(tmpdir(), "ba-"));
  const s = { ...base(), open_questions: [{ ref: "Q-1", text: "Scope?", topic: "scope", round: "surface" as const }], pending_apply: ["DEC-001"] };
  writeSession(s, docsRoot);
  const back = readSession(docsRoot)!;
  expect(back.mode).toBe("discovery");
  expect(back.open_questions[0].text).toBe("Scope?");
  expect(back.pending_apply).toEqual(["DEC-001"]);
});

test("clearAnsweredQuestions removes matching open questions", () => {
  const s = { ...base(), open_questions: [
    { ref: "Q-1", text: "Scope?", topic: "scope", round: "surface" as const },
    { ref: "Q-2", text: "Users?", topic: "users", round: "surface" as const },
  ] };
  const next = clearAnsweredQuestions(s, ["Scope?"]);
  expect(next.open_questions.map(q => q.text)).toEqual(["Users?"]);
});
