import { expect, test } from "vitest";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { baStatus } from "../../src/tools/baStatus.js";

test("full discovery loop: no docs until answers are recorded and applied", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });

  // Assess emits surface questions; nothing is created yet.
  const surface = baAssess({ projectRoot: root });
  expect(surface.round).toBe("surface");
  expect(existsSync(join(docsRoot, "05-stories")) && readdirSync(join(docsRoot, "05-stories")).length).toBe(0);

  // Record answers, then apply a story derived from a decision.
  const rec = baRecordAnswers({ projectRoot: root, items: [
    { question: surface.questions[0].text, answer: "An internal tool for support agents", asked_round: "surface", topic: "scope" },
  ] });
  baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Agent logs in", body: "Given an agent When they sign in Then they reach the dashboard", derived_from: rec.recorded },
  ] });
  expect(readdirSync(join(docsRoot, "05-stories")).length).toBe(1);

  // Status reflects progress; the story is traced so no untraced-artifact gap for it.
  const status = baStatus({ projectRoot: root });
  expect(status.counts.story).toBe(1);
});

test("the loop cannot fabricate a document without a recorded decision", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Invented", body: "Given x When y Then z", derived_from: ["DEC-001"] },
  ] })).toThrow(/DEC-001/);
});
