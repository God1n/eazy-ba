import { expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyAnchor, anchorsAllVerify, anchorFilePart } from "../../src/core/ground.js";

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "ba-ground-core-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "export const x = 1;\n");
  writeFileSync(join(root, "package.json"), "{}\n");
  // A file outside the scope we'll declare.
  mkdirSync(join(root, "secrets"), { recursive: true });
  writeFileSync(join(root, "secrets", ".env"), "TOKEN=abc\n");
  return root;
}

test("anchorFilePart strips a #symbol suffix", () => {
  expect(anchorFilePart("src/app.ts#x")).toBe("src/app.ts");
  expect(anchorFilePart("src/app.ts")).toBe("src/app.ts");
  expect(anchorFilePart("src/app.ts#L1-L5")).toBe("src/app.ts");
});

test("verifyAnchor: resolving file inside scope is ok", () => {
  const root = project();
  const v = verifyAnchor("src/app.ts#x", root, ["src/**"]);
  expect(v.resolves).toBe(true);
  expect(v.inScope).toBe(true);
  expect(v.ok).toBe(true);
});

test("verifyAnchor: non-existent file does not resolve (ok=false)", () => {
  const root = project();
  const v = verifyAnchor("src/missing.ts", root, ["src/**"]);
  expect(v.resolves).toBe(false);
  expect(v.ok).toBe(false);
});

test("verifyAnchor: existing file OUTSIDE scope is not in scope (ok=false)", () => {
  const root = project();
  // .env exists but the declared scope is only src/**.
  const v = verifyAnchor("secrets/.env", root, ["src/**"]);
  expect(v.resolves).toBe(true);
  expect(v.inScope).toBe(false);
  expect(v.ok).toBe(false);
});

test("verifyAnchor: an exact-file scope entry matches that file", () => {
  const root = project();
  const v = verifyAnchor("package.json", root, ["package.json"]);
  expect(v.ok).toBe(true);
});

test("verifyAnchor: a sibling prefix does not falsely match (segment-aware)", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-ground-seg-"));
  mkdirSync(join(root, "src-other"), { recursive: true });
  writeFileSync(join(root, "src-other", "f.ts"), "x\n");
  // Scope "src" must NOT match "src-other".
  const v = verifyAnchor("src-other/f.ts", root, ["src"]);
  expect(v.inScope).toBe(false);
});

test("anchorsAllVerify: empty anchors or empty scope can never verify", () => {
  const root = project();
  expect(anchorsAllVerify([], root, ["src/**"])).toBe(false);
  expect(anchorsAllVerify(["src/app.ts"], root, [])).toBe(false);
});

test("anchorsAllVerify: every anchor must resolve + be in scope", () => {
  const root = project();
  expect(anchorsAllVerify(["src/app.ts"], root, ["src/**"])).toBe(true);
  // One good + one out-of-scope ⇒ overall false.
  expect(anchorsAllVerify(["src/app.ts", "secrets/.env"], root, ["src/**"])).toBe(false);
});

test("verifyAnchor (Unit 9): a symlink whose realpath escapes scope is rejected", () => {
  // A symlink that LIVES in src/ (so the logical prefix passes) but whose target
  // is the out-of-scope secrets/.env. Unit 8's logical-prefix check accepted this;
  // Unit 9 canonicalizes with realpath, so the escape is now caught (inScope=false).
  const root = project();
  const linkPath = join(root, "src", "link.ts");
  symlinkSync(join(root, "secrets", ".env"), linkPath);
  const v = verifyAnchor("src/link.ts", root, ["src/**"]);
  // The target resolves on disk, but its realpath is outside the declared scope.
  expect(v.resolves).toBe(true);
  expect(v.inScope).toBe(false);
  expect(v.ok).toBe(false);
});
