import { expect, test } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baRecordAnswers } from "../../src/tools/baRecordAnswers.js";
import { baApply } from "../../src/tools/baApply.js";
import { getDecision, recordDecision } from "../../src/core/decisions.js";
import { createOrUpsertOpenItem, listOpenItems, getOpenItem } from "../../src/core/openItems.js";
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

test("pre-flight atomicity: a later spec missing title writes no files", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  seedDecision(root); // creates DEC-001
  const storiesDir = join(root, "docs/ba", "05-stories");
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "story", title: "Good", body: "Given a When b Then c", derived_from: ["DEC-001"] },
    { op: "create", type: "story", body: "Given x When y Then z", derived_from: ["DEC-001"] }, // no title
  ] })).toThrow(/create requires type and title/);
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

// ── Unit 4: provenance-extended gate (fact≠requirement) ───────────────────────

function setupSession(root: string) {
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  return join(root, "docs/ba");
}

test("gate happy: a descriptive glossary backed by a CLOSED-fact observation applies", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = setupSession(root);
  // entity-exists is in CLOSED_FACT_KINDS; an open observation with that fact_kind is backable.
  const obsId = createOrUpsertOpenItem({
    kind: "observation", title: "User entity exists",
    fact_kind: "entity-exists", provenance: "code-verified",
    anchors: ["src/user.ts#User"], claim: "User class exists",
  }, docsRoot);
  const res = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "glossary", title: "User", body: "A registered account holder.", derived_from: [obsId] },
  ] });
  expect(res.applied[0].op).toBe("create");
});

test("gate error: an fr backed ONLY by a code-verified observation is rejected (fact≠requirement)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = setupSession(root);
  const obsId = createOrUpsertOpenItem({
    kind: "observation", title: "Auth route exists",
    fact_kind: "entity-exists", provenance: "code-verified",
    anchors: ["src/auth.ts#login"], claim: "login symbol exists",
  }, docsRoot);
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "fr", title: "Users can log in", body: "The system shall allow login.", derived_from: [obsId] },
  ] })).toThrow(/deliberate decision|fact.?requirement/i);
});

test("gate error: an fr backed ONLY by a confirmed-as-inferred decision is rejected (needs deliberate)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = setupSession(root);
  const decId = recordDecision({
    question: "Is there OAuth?", answer: "yes (assumed)", asked_round: "confirm", topic: "auth",
    provenance: "confirmed-as-inferred", updated: "2026-06-30",
  }, docsRoot);
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "fr", title: "Users authenticate via OAuth", body: "The system shall use OAuth.", derived_from: [decId] },
  ] })).toThrow(/deliberate decision|fact.?requirement/i);
});

test("gate happy: an fr backed by a user-decided decision applies", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = setupSession(root);
  // recordDecision defaults to user-decided
  const decId = recordDecision({
    question: "Auth?", answer: "OAuth", asked_round: "domain", topic: "auth", updated: "2026-06-30",
  }, docsRoot);
  const res = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "fr", title: "Login via OAuth", body: "The system shall use OAuth.", derived_from: [decId] },
  ] });
  expect(res.applied[0].op).toBe("create");
});

test("gate happy: an fr backed by a corrected decision applies", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = setupSession(root);
  const decId = recordDecision({
    question: "Auth?", answer: "SSO (corrected)", asked_round: "confirm", topic: "auth",
    provenance: "corrected", updated: "2026-06-30",
  }, docsRoot);
  const res = baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "fr", title: "Login via SSO", body: "The system shall use SSO.", derived_from: [decId] },
  ] });
  expect(res.applied[0].op).toBe("create");
});

test("gate error: any artifact backed by an inferred+open observation is rejected (same as unrecorded)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = setupSession(root);
  // route-exists is NOT in CLOSED_FACT_KINDS; open + inferred → not backable.
  const obsId = createOrUpsertOpenItem({
    kind: "observation", title: "Inferred route",
    fact_kind: "route-exists", provenance: "code-verified",
    anchors: ["src/server.ts#L10"], claim: "GET /health route inferred",
  }, docsRoot);
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "glossary", title: "Health", body: "A health endpoint.", derived_from: [obsId] },
  ] })).toThrow(/Unknown or unrecorded decision/);
});

test("gate edge: derived_from.min(1) still enforced", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  setupSession(root);
  expect(() => baApply({ projectRoot: root, artifacts: [
    // @ts-expect-error — deliberately omit derived_from to assert min(1) holds
    { op: "create", type: "glossary", title: "Empty", body: "x" },
  ] })).toThrow();
});

test("gate edge: markApplied on a backing open-item flips it out of 'open' (cross-call re-read)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = setupSession(root);
  const obsId = createOrUpsertOpenItem({
    kind: "observation", title: "Pkg present",
    fact_kind: "dependency-present", provenance: "code-verified",
    anchors: ["package.json#zod"], claim: "zod is a dependency",
  }, docsRoot);
  // before apply: the observation is open
  expect(getOpenItem(obsId, docsRoot)!.item_state).toBe("open");
  baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "tech-surface", title: "Dependencies", body: "zod", derived_from: [obsId] },
  ] });
  // after apply (cross-call re-read from disk): no longer open → stopped gating
  const reread = listOpenItems(docsRoot).find(i => i.id === obsId)!;
  expect(reread.item_state).toBe("applied");
  expect(reread.item_state).not.toBe("open");
});

test("gate integration: batch atomicity — one bad backing rejects the whole batch (no partial writes)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = setupSession(root);
  const goodObs = createOrUpsertOpenItem({
    kind: "observation", title: "Good fact",
    fact_kind: "entity-exists", provenance: "code-verified",
    anchors: ["src/a.ts#A"], claim: "A exists",
  }, docsRoot);
  // a normative artifact backed only by code-verified is the bad spec
  const glossaryDir = join(docsRoot, "01-vision");
  const before = readdirSync(glossaryDir).sort();
  expect(() => baApply({ projectRoot: root, artifacts: [
    { op: "create", type: "glossary", title: "Good term", body: "ok", derived_from: [goodObs] },
    { op: "create", type: "fr", title: "Bad normative", body: "shall x", derived_from: [goodObs] },
  ] })).toThrow();
  // pre-flight should have prevented any writes — the good glossary spec never lands
  expect(readdirSync(glossaryDir).sort()).toEqual(before);
});
