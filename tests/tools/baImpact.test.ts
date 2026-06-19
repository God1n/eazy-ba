import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baImpact } from "../../src/tools/baImpact.js";

function seedStory(root: string): string {
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  baRecordAnswers({ projectRoot: root, items: [{ question: "scope?", answer: "x", asked_round: "surface", topic: "scope" }] });
  const res = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Login", body: "Given a When b Then c", derived_from: ["DEC-001"] },
  ] });
  const usId = res.applied[0].id;
  baApply({ projectRoot: root, artifacts: [
    { op: "update", id: usId, status: "implemented", derived_from: ["DEC-001"] },
  ] });
  return usId;
}

test("ba_impact reports blast radius, severity, consequences, and change questions", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const usId = seedStory(root);
  const res = baImpact({ projectRoot: root, targets: [usId] });
  expect(res.blastRadius.artifacts).toContain(usId);
  expect(res.severity).toBe("high"); // implemented story
  expect(res.questions.every(q => q.round === "change")).toBe(true);
  expect(res.consequences).toMatch(/severity/i);
});

test("ba_impact throws on an unknown target", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedStory(root);
  expect(() => baImpact({ projectRoot: root, targets: ["US-404"] })).toThrow(/US-404/);
});
