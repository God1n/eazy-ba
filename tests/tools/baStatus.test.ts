import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baStatus } from "../../src/tools/baStatus.js";

test("reports stable on an empty, sessioned project with no gaps and no open questions", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  const res = baStatus({ projectRoot: root });
  expect(res.mode).toBe("discovery");
  expect(res.openQuestions).toBe(0);
  expect(res.gaps).toBe(0);
  expect(res.stable).toBe(true);
});
