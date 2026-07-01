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

// Fix 3: a readScope entry that escapes projectRoot (absolute /etc or ../ escape)
// is rejected by the schema — the agent/user cannot point the BA outside the project.
test("rejects a readScope entry that escapes projectRoot", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() =>
    baSessionStart({ projectRoot: root, mode: "ground", readScope: ["/etc"] }),
  ).toThrow(/readScope/i);
  expect(() =>
    baSessionStart({ projectRoot: root, mode: "ground", readScope: ["../../secrets"] }),
  ).toThrow(/readScope/i);
});

test("resumes an existing session", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const res = baSessionStart({ projectRoot: root, mode: "stabilize" });
  expect(res.resumed).toBe(true);
  expect(res.mode).toBe("stabilize");
});
