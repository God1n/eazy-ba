import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { recordDecision, getDecision, supersede } from "../../src/core/decisions.js";

function docs(root: string) { return join(root, "docs/ba"); }

test("records a decision carrying supersedes", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const id = recordDecision({ question: "New auth?", answer: "OAuth", asked_round: "change", topic: "auth", supersedes: ["DEC-001"], updated: "2026-06-18" }, docs(root));
  expect((getDecision(id, docs(root))!.supersedes as string[])).toEqual(["DEC-001"]);
});

test("supersede marks the old decision obsolete with a back-link", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const oldId = recordDecision({ question: "Auth?", answer: "password", asked_round: "surface", topic: "auth", updated: "2026-06-18" }, docs(root));
  const newId = recordDecision({ question: "New auth?", answer: "OAuth", asked_round: "change", topic: "auth", supersedes: [oldId], updated: "2026-06-19" }, docs(root));
  supersede(oldId, newId, docs(root));
  const old = getDecision(oldId, docs(root))!;
  expect(old.status).toBe("obsolete");
  expect(old.superseded_by).toBe(newId);
});

test("supersede throws on a non-existent decision", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() => supersede("DEC-999", "DEC-001", docs(root))).toThrow(/DEC-999/);
});

test("supersede is append-only: refuses to re-supersede an already-obsolete decision", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const oldId = recordDecision({ question: "Auth?", answer: "password", asked_round: "surface", topic: "auth", updated: "2026-06-18" }, docs(root));
  const first = recordDecision({ question: "v2?", answer: "OAuth", asked_round: "change", topic: "auth", updated: "2026-06-19" }, docs(root));
  const second = recordDecision({ question: "v3?", answer: "SSO", asked_round: "change", topic: "auth", updated: "2026-06-20" }, docs(root));
  supersede(oldId, first, docs(root));
  // re-superseding the same (now obsolete) decision must not overwrite the original link
  expect(() => supersede(oldId, second, docs(root))).toThrow(new RegExp(`already superseded by ${first}`));
  expect(getDecision(oldId, docs(root))!.superseded_by).toBe(first);
});

test("supersede is idempotent when the link already points at the same successor", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const oldId = recordDecision({ question: "Auth?", answer: "password", asked_round: "surface", topic: "auth", updated: "2026-06-18" }, docs(root));
  const newId = recordDecision({ question: "v2?", answer: "OAuth", asked_round: "change", topic: "auth", updated: "2026-06-19" }, docs(root));
  supersede(oldId, newId, docs(root));
  expect(() => supersede(oldId, newId, docs(root))).not.toThrow();
  expect(getDecision(oldId, docs(root))!.superseded_by).toBe(newId);
});
