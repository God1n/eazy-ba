import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { readSession } from "../../src/core/session.js";

test("starts a change-mode session at the change round", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const res = baSessionStart({ projectRoot: root, mode: "change" });
  expect(res.mode).toBe("change");
  expect(res.round).toBe("change");
  expect(readSession(join(root, "docs/ba"))!.mode).toBe("change");
});
