import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { recordDecision, listDecisions, getDecision, markApplied } from "../../src/core/decisions.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  return join(root, "docs/ba");
}

test("records decisions with incrementing ids and reads them back", () => {
  const docsRoot = setup();
  const id1 = recordDecision({ question: "Scope?", answer: "MVP only", asked_round: "surface", topic: "scope", updated: "2026-06-18" }, docsRoot);
  const id2 = recordDecision({ question: "Auth?", answer: "email+password", asked_round: "domain", topic: "auth", updated: "2026-06-18" }, docsRoot);
  expect(id1).toBe("DEC-001");
  expect(id2).toBe("DEC-002");
  const all = listDecisions(docsRoot);
  expect(all.map(d => d.id).sort()).toEqual(["DEC-001", "DEC-002"]);
  const d1 = getDecision("DEC-001", docsRoot)!;
  expect(d1.answer).toBe("MVP only");
  expect(d1.applied).toBe(false);
});

test("markApplied sets applied and merges informs", () => {
  const docsRoot = setup();
  const id = recordDecision({ question: "Q", answer: "A", asked_round: "surface", topic: "t", updated: "2026-06-18" }, docsRoot);
  markApplied(id, ["US-001"], docsRoot);
  markApplied(id, ["US-001", "FR-002"], docsRoot);
  const d = getDecision(id, docsRoot)!;
  expect(d.applied).toBe(true);
  expect((d.informs as string[]).sort()).toEqual(["FR-002", "US-001"]);
});
