import { expect, test } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";

test("scaffolds the docs tree and is idempotent", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const res = baInit({ projectRoot: root });
  expect(existsSync(join(res.docsRoot, "05-stories"))).toBe(true);
  expect(existsSync(join(res.docsRoot, "_config.yml"))).toBe(true);
  expect(existsSync(join(res.docsRoot, "07-changelog/CHANGELOG.md"))).toBe(true);

  // hand-edit a file, re-run, ensure it is not clobbered
  const vision = join(res.docsRoot, "01-vision/vision.md");
  writeFileSync(vision, "MY EDITS");
  baInit({ projectRoot: root });
  expect(readFileSync(vision, "utf8")).toBe("MY EDITS");
});
