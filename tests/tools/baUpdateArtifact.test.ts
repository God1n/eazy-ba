import { expect, test } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baCreateArtifact } from "../../src/tools/baCreateArtifact.js";
import { baUpdateArtifact } from "../../src/tools/baUpdateArtifact.js";
import { listArtifacts } from "../../src/core/store.js";

test("updates status, bumps version, logs change, keeps body", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const c = baCreateArtifact({ projectRoot: root, type: "story", title: "Reset", updated: "2026-06-18" } as any);
  const u = baUpdateArtifact({ projectRoot: root, id: c.id, status: "approved", updated: "2026-06-19" });
  expect(u.version).toBe(2);
  const text = readFileSync(u.filePath, "utf8");
  expect(text).toContain("status: approved");
  expect(text).toContain("Acceptance Criteria"); // original body preserved
  const log = readFileSync(join(root, "docs/ba/07-changelog/CHANGELOG.md"), "utf8");
  expect(log).toContain(c.id);
});

test("throws on unknown id", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  expect(() => baUpdateArtifact({ projectRoot: root, id: "US-999" })).toThrow();
});

test("baCreateArtifact then baUpdateArtifact without baInit does not throw (changelog dir created on demand)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  // Deliberately skip baInit — changelog dir does not exist
  const c = baCreateArtifact({ projectRoot: root, type: "story", title: "Auto dir", updated: "2026-06-18" } as any);
  expect(() => baUpdateArtifact({ projectRoot: root, id: c.id, status: "approved", updated: "2026-06-19" })).not.toThrow();
});

test("renaming the title moves the file and removes the orphan", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  baInit({ projectRoot: root });
  const c = baCreateArtifact({ projectRoot: root, type: "story", title: "Reset", updated: "2026-06-18" } as any);
  const u = baUpdateArtifact({ projectRoot: root, id: c.id, title: "Reset Password", updated: "2026-06-19" });
  expect(u.filePath).not.toBe(c.filePath);
  expect(existsSync(c.filePath)).toBe(false);                  // old file removed
  expect(existsSync(u.filePath)).toBe(true);                   // new file present
  const stories = listArtifacts(join(root, "docs/ba")).filter(a => a.frontmatter.id === c.id);
  expect(stories).toHaveLength(1);                             // id still unique
});
