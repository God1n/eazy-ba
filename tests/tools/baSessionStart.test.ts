import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { readSession } from "../../src/core/session.js";

test("starts a fresh discovery session at the surface round", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const res = baSessionStart({ projectRoot: root, mode: "discovery" });
  expect(res.mode).toBe("discovery");
  expect(res.round).toBe("surface");
  expect(res.resumed).toBe(false);
  expect(res.next).toMatch(/ba_assess/);
  expect(readSession(join(root, "docs/ba"))!.mode).toBe("discovery");
});

test("resumes an existing session", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const res = baSessionStart({ projectRoot: root, mode: "stabilize" });
  expect(res.resumed).toBe(true);
  expect(res.mode).toBe("stabilize");
});
