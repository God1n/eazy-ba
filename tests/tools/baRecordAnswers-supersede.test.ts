import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { getDecision } from "../../src/core/decisions.js";

function docs(root: string) { return join(root, "docs/ba"); }

test("recording a change answer supersedes the cited decision", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  baRecordAnswers({ projectRoot: root, items: [{ question: "Auth?", answer: "password", asked_round: "surface", topic: "auth" }] }); // DEC-001
  const res = baRecordAnswers({ projectRoot: root, items: [
    { question: "Change auth?", answer: "OAuth", asked_round: "change", topic: "auth", supersedes: ["DEC-001"] },
  ] }); // DEC-002
  const newId = res.recorded[0];
  expect((getDecision(newId, docs(root))!.supersedes as string[])).toEqual(["DEC-001"]);
  const old = getDecision("DEC-001", docs(root))!;
  expect(old.status).toBe("obsolete");
  expect(old.superseded_by).toBe(newId);
});

test("supersedes referencing a non-existent decision throws", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "change" });
  expect(() => baRecordAnswers({ projectRoot: root, items: [
    { question: "q", answer: "a", asked_round: "change", topic: "t", supersedes: ["DEC-999"] },
  ] })).toThrow(/DEC-999/);
});
