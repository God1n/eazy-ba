import { expect, test } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { getDecision } from "../../src/core/decisions.js";
import { readSession } from "../../src/core/session.js";

function seedDecision(root: string) {
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  baRecordAnswers({ projectRoot: root, items: [
    { question: "What story?", answer: "User resets password", asked_round: "surface", topic: "auth" },
  ] });
}

test("creates an artifact only when backed by a recorded decision, with bidirectional traceability", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedDecision(root); // creates DEC-001
  const res = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Reset password", body: "Given a user When they request reset Then email is sent", derived_from: ["DEC-001"] },
  ] });
  expect(res.applied[0].op).toBe("create");
  const docsRoot = join(root, "docs/ba");
  const usId = res.applied[0].id;
  expect(readFileSync(join(docsRoot, "05-stories", `${usId}-reset-password.md`), "utf8")).toContain("derived_from");
  expect((getDecision("DEC-001", docsRoot)!.informs as string[])).toContain(usId);
  expect(getDecision("DEC-001", docsRoot)!.applied).toBe(true);
  expect(readSession(docsRoot)!.pending_apply).not.toContain("DEC-001");
});

test("rejects an artifact citing a decision that is not in the ledger", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedDecision(root);
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Bogus", body: "Given x When y Then z", derived_from: ["DEC-999"] },
  ] })).toThrow(/DEC-999/);
});

test("pre-flight atomicity: mixed batch with one bad decision writes no files", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedDecision(root); // creates DEC-001
  const docsRoot = join(root, "docs/ba");
  const storiesDir = join(docsRoot, "05-stories");
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Good", body: "Given a When b Then c", derived_from: ["DEC-001"] },
    { op: "create", type: "story", title: "Bad", body: "Given x When y Then z", derived_from: ["DEC-999"] },
  ] })).toThrow(/DEC-999/);
  // pre-flight should have prevented any writes
  expect(readdirSync(storiesDir)).toHaveLength(0);
});

test("update op patches status and body, preserving derived_from", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedDecision(root); // creates DEC-001
  const docsRoot = join(root, "docs/ba");
  // First create the story
  const res = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Login flow", body: "Given a user When they log in Then session starts", derived_from: ["DEC-001"] },
  ] });
  const storyId = res.applied[0].id;
  // Now update it
  const updated = baApply({ projectRoot: root, artifacts: [
    { op: "update", id: storyId, status: "approved", body: "Given x When y Then z", derived_from: ["DEC-001"] },
  ] });
  expect(updated.applied[0].id).toBe(storyId);
  expect(updated.applied[0].op).toBe("update");
  const files = readdirSync(join(docsRoot, "05-stories"));
  const storyFile = files.find(f => f.includes(storyId))!;
  const content = readFileSync(join(docsRoot, "05-stories", storyFile), "utf8");
  expect(content).toContain("status: approved");
  expect(content).toContain("derived_from");
});

test("update with link fields throws a clear error", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedDecision(root); // creates DEC-001
  // Create a story first
  const res = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Auth story", body: "Given a When b Then c", derived_from: ["DEC-001"] },
  ] });
  const storyId = res.applied[0].id;
  // Attempt update with implements — should throw
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "update", id: storyId, implements: ["FR-001"], derived_from: ["DEC-001"] },
  ] })).toThrow(/ba_apply update does not support changing implements\/satisfies\/refines/);
});
