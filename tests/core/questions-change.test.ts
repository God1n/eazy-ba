import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeQuestions } from "../../src/core/questions.js";
import { baInit } from "../../src/tools/baInit.js";
import { recordDecision, supersede } from "../../src/core/decisions.js";
import { computeAssessment } from "../../src/core/assessment.js";
import { baCreateArtifact } from "../../src/tools/baCreateArtifact.js";

test("changeQuestions emits one change-round question per affected artifact", () => {
  const qs = changeQuestions(["US-001", "FR-002"]);
  expect(qs).toHaveLength(2);
  expect(qs.every(q => q.round === "change")).toBe(true);
  expect(qs[0].ref).toBe("Q-c1");
  expect(qs[0].topic).toBe("US-001");
});

test("an obsolete decision no longer covers its domain dimension", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");
  baInit({ projectRoot: root });
  // a story exists; record a decision covering its dimension 0, then a second to keep decisions>0 after obsolete
  baCreateArtifact({ projectRoot: root, type: "story", title: "Login", body: "Given a When b Then c", updated: "2026-06-18" } as any);
  const keep = recordDecision({ question: "k", answer: "a", asked_round: "surface", topic: "scope", updated: "2026-06-18" }, docsRoot);
  const cover = recordDecision({ question: "actor?", answer: "agent", asked_round: "domain", topic: "US-001#0", updated: "2026-06-18" }, docsRoot);
  const before = computeAssessment(docsRoot, "stabilize").questions.filter(q => q.topic === "US-001#0");
  expect(before).toHaveLength(0); // covered
  supersede(cover, keep, docsRoot); // obsolete the covering decision
  const after = computeAssessment(docsRoot, "stabilize").questions.filter(q => q.topic === "US-001#0");
  expect(after.length).toBeGreaterThan(0); // re-surfaced
});
