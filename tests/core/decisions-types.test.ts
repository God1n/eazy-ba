import { expect, test } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ID_PREFIX, FILE_BACKED_TYPES } from "../../src/core/types.js";
import { folderFor } from "../../src/core/store.js";
import { baInit } from "../../src/tools/baInit.js";

test("decision is a file-backed type mapped to 08-decisions", () => {
  expect(ID_PREFIX.decision).toBe("DEC");
  expect(FILE_BACKED_TYPES).toContain("decision");
  expect(folderFor("decision", "/d")).toBe("/d/08-decisions");
});

test("ba_init scaffolds the decisions folder", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const res = baInit({ projectRoot: root });
  expect(existsSync(join(res.docsRoot, "08-decisions"))).toBe(true);
});
