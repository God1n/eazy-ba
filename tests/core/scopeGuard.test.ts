import { expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  guardAnchor,
  isDenied,
  scanForSecrets,
  type ScopeGuardOptions,
} from "../../src/core/scopeGuard.js";
import { verifyAnchor, anchorsAllVerify } from "../../src/core/ground.js";

// A small on-disk project. `src/` is the in-scope subtree; `secrets/` and the
// deny-listed files sit outside (or are deny-listed) so we can prove rejection.
function project(): string {
  const root = mkdtempSync(join(tmpdir(), "ba-scopeguard-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "export const x = 1;\n");
  writeFileSync(join(root, "package.json"), "{}\n");
  mkdirSync(join(root, "secrets"), { recursive: true });
  writeFileSync(join(root, "secrets", "target.ts"), "export const s = 1;\n");
  // Deny-listed files (live INSIDE src so scope alone would not exclude them).
  writeFileSync(join(root, "src", ".env"), "TOKEN=abc\n");
  writeFileSync(join(root, "src", "id_rsa"), "-----BEGIN KEY-----\n");
  writeFileSync(join(root, "src", "creds.pem"), "pem\n");
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", "ci.yml"), "on: push\n");
  return root;
}

// ---------------------------------------------------------------------------
// CORE-LAYER ENFORCEMENT — call guardAnchor directly, not via the tool.
// ---------------------------------------------------------------------------

test("guardAnchor: in-scope, non-deny-listed file is accepted", () => {
  const root = project();
  const r = guardAnchor("src/app.ts#x", root, ["src/**"]);
  expect(r.ok).toBe(true);
  expect(r.resolves).toBe(true);
  expect(r.inScope).toBe(true);
  expect(r.denied).toBe(false);
});

test("guardAnchor: a `../` anchor escaping the session scope is rejected", () => {
  const root = project();
  // Logical path is under src/ but `..` walks out to secrets/ — realpath catches it.
  const r = guardAnchor("src/../secrets/target.ts", root, ["src/**"]);
  expect(r.inScope).toBe(false);
  expect(r.ok).toBe(false);
});

test("guardAnchor: a symlink whose realpath target escapes scope is rejected", () => {
  const root = project();
  // A symlink that LIVES in src/ (logical prefix passes) but POINTS at secrets/.
  // Unit 8's logical-prefix check accepted this; Unit 9's realpath rejects it.
  symlinkSync(join(root, "secrets", "target.ts"), join(root, "src", "link.ts"));
  const r = guardAnchor("src/link.ts", root, ["src/**"]);
  expect(r.resolves).toBe(true);
  expect(r.inScope).toBe(false); // realpath escapes scope
  expect(r.ok).toBe(false);
});

test("guardAnchor: deny-listed paths (.env, id_rsa, .pem, ci workflow) are never anchored", () => {
  const root = project();
  for (const a of ["src/.env", "src/id_rsa", "src/creds.pem", ".github/workflows/ci.yml"]) {
    const r = guardAnchor(a, root, ["src/**", ".github/**"]);
    expect(r.denied, `${a} should be denied`).toBe(true);
    expect(r.ok, `${a} should not be ok`).toBe(false);
  }
});

test("isDenied: built-in patterns match secret/CI-adjacent names", () => {
  expect(isDenied("config/app.env")).toBe(true);
  expect(isDenied("certs/server.key")).toBe(true);
  expect(isDenied("infra/main.tfstate")).toBe(true);
  expect(isDenied("docker-compose.prod.yml")).toBe(true);
  expect(isDenied("Makefile")).toBe(true);
  expect(isDenied("config/secret-values.ts")).toBe(true);
  expect(isDenied("lib/credentials.json")).toBe(true);
  expect(isDenied(".git/config")).toBe(true);
  // ordinary source is NOT denied
  expect(isDenied("src/app.ts")).toBe(false);
  expect(isDenied("package.json")).toBe(false);
});

test("guardAnchor: a user-added deny entry is honored", () => {
  const root = project();
  writeFileSync(join(root, "src", "tenants.json"), "{}\n");
  const opts: ScopeGuardOptions = { extraDeny: ["**/tenants.json"] };
  // Without the custom entry it would be a fine in-scope file.
  expect(guardAnchor("src/tenants.json", root, ["src/**"]).ok).toBe(true);
  // With the user-added deny entry it is excluded.
  const r = guardAnchor("src/tenants.json", root, ["src/**"], opts);
  expect(r.denied).toBe(true);
  expect(r.ok).toBe(false);
});

// ---------------------------------------------------------------------------
// ground.ts now routes through scopeGuard — verifyAnchor/anchorsAllVerify shift.
// ---------------------------------------------------------------------------

test("verifyAnchor (ground): symlink escape is now rejected (realpath-backed)", () => {
  const root = project();
  symlinkSync(join(root, "secrets", "target.ts"), join(root, "src", "link.ts"));
  const v = verifyAnchor("src/link.ts", root, ["src/**"]);
  expect(v.inScope).toBe(false);
  expect(v.ok).toBe(false);
});

test("anchorsAllVerify (ground): a deny-listed anchor fails the whole observation", () => {
  const root = project();
  expect(anchorsAllVerify(["src/app.ts"], root, ["src/**"])).toBe(true);
  expect(anchorsAllVerify(["src/app.ts", "src/.env"], root, ["src/**"])).toBe(false);
});

// ---------------------------------------------------------------------------
// docsRoot (#3 decision): an absolute / symlinked docsRoot OUTSIDE projectRoot
// is INTENTIONALLY still resolved (documented absolute-docsRoot feature). The
// real read boundary is scopeGuard (code-read scope), NOT docsRoot, so we do not
// reject it. A symlinked docsRoot still points the server's own doc store, and
// crucially does NOT widen what code the agent may anchor (that is read_scope +
// deny-list). This test pins the chosen behavior.
// ---------------------------------------------------------------------------
test("docsRoot: a symlinked-outside docsRoot is still resolved (scopeGuard is the boundary, not docsRoot)", async () => {
  const { resolveConfig } = await import("../../src/config.js");
  const root = mkdtempSync(join(tmpdir(), "ba-docsroot-proj-"));
  const realTarget = mkdtempSync(join(tmpdir(), "ba-docsroot-target-"));
  mkdirSync(join(root, "docs", "ba"), { recursive: true });
  // A symlink inside the project that points OUTSIDE it; _config.yml redirects there.
  const linkDir = join(root, "linked-docs");
  symlinkSync(realTarget, linkDir);
  writeFileSync(join(root, "docs", "ba", "_config.yml"), `docsRoot: ${linkDir}\n`);
  const cfg = resolveConfig(root);
  // Resolved as-is (absolute) — NOT rejected. Boundary lives in scopeGuard.
  expect(cfg.docsRoot).toBe(linkDir);
});

// ---------------------------------------------------------------------------
// Best-effort secret-scan — defense-in-depth, NOT a guarantee.
// ---------------------------------------------------------------------------

test("scanForSecrets: flags obvious tokens/keys/passwords (best-effort)", () => {
  expect(scanForSecrets("the api_key is sk-1234567890abcdef1234567890").length).toBeGreaterThan(0);
  expect(scanForSecrets("password=hunter2supersecret").length).toBeGreaterThan(0);
  expect(scanForSecrets("AKIAIOSFODNN7EXAMPLE is the access key").length).toBeGreaterThan(0);
  expect(
    scanForSecrets("postgres://user:p4ssw0rd@db.example.com:5432/app").length,
  ).toBeGreaterThan(0);
  // a -----BEGIN PRIVATE KEY----- block
  expect(scanForSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIE...").length).toBeGreaterThan(0);
});

test("scanForSecrets: ordinary prose / structural claims are not flagged", () => {
  expect(scanForSecrets("The App class lives in src/app.ts and exports x.")).toEqual([]);
  expect(scanForSecrets("GET /users route exists in routes.ts")).toEqual([]);
  expect(scanForSecrets("express is declared as a dependency")).toEqual([]);
});
