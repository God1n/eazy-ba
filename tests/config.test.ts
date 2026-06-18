import { expect, test } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "../src/config.js";

test("defaults to docs/ba when no config", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const cfg = resolveConfig(root);
  expect(cfg.docsRoot).toBe(join(root, "docs/ba"));
  expect(cfg.idStart).toBe(1);
});

test("reads _config.yml overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  mkdirSync(join(root, "docs/ba"), { recursive: true });
  writeFileSync(join(root, "docs/ba/_config.yml"), "docsRoot: specs/ba\nidStart: 100\n");
  const cfg = resolveConfig(root);
  expect(cfg.docsRoot).toBe(join(root, "specs/ba"));
  expect(cfg.idStart).toBe(100);
});

test("absolute docsRoot in _config.yml is used as-is (not joined to projectRoot)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-"));
  const absoluteDocsRoot = mkdtempSync(join(tmpdir(), "ba-abs-"));
  mkdirSync(join(root, "docs/ba"), { recursive: true });
  writeFileSync(join(root, "docs/ba/_config.yml"), `docsRoot: ${absoluteDocsRoot}\n`);
  const cfg = resolveConfig(root);
  expect(cfg.docsRoot).toBe(absoluteDocsRoot);
});
