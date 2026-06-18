import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { recordDecision } from "../../src/core/decisions.js";

test("fresh discovery assess returns surface questions and is not stable", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const res = baAssess({ projectRoot: root });
  expect(res.round).toBe("surface");
  expect(res.questions.length).toBeGreaterThanOrEqual(5);
  expect(res.stable).toBe(false);
});

test("after a decision exists, assess moves past surface", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  recordDecision({ question: "Scope?", answer: "MVP", asked_round: "surface", topic: "scope", updated: "2026-06-18" }, join(root, "docs/ba"));
  const res = baAssess({ projectRoot: root });
  expect(res.round).not.toBe("surface");
});

test("throws when no session started", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() => baAssess({ projectRoot: root })).toThrow();
});
