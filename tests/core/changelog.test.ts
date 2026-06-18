import { expect, test } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendChangelog } from "../../src/core/changelog.js";

test("appendChangelog creates directory and file if they do not exist", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");
  // 07-changelog/ has NOT been created yet
  expect(() => appendChangelog(docsRoot, "initial entry")).not.toThrow();
  const changelogPath = join(docsRoot, "07-changelog/CHANGELOG.md");
  expect(existsSync(changelogPath)).toBe(true);
  const content = readFileSync(changelogPath, "utf8");
  expect(content).toContain("- initial entry");
});

test("appendChangelog appends subsequent lines", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const docsRoot = join(root, "docs/ba");
  appendChangelog(docsRoot, "line one");
  appendChangelog(docsRoot, "line two");
  const content = readFileSync(join(docsRoot, "07-changelog/CHANGELOG.md"), "utf8");
  expect(content).toContain("- line one");
  expect(content).toContain("- line two");
});
