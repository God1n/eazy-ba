import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

// Anchor re-verification for the ground flow (Flow 2 R4). The server cannot parse
// code, so it can only re-verify ONE thing about an observation: that the anchor
// path actually resolves on disk AND sits inside the user-declared read scope.
// That existence check is the sole basis on which an existence-class fact
// (entity-exists / dependency-present) may auto-accept — anchor-resolves proves
// existence, not arbitrary claim truth.
//
// Unit 9 HARDENS this: realpath canonicalization (defeat `../`/symlink escape) and
// a secret/CI deny-list. For Unit 8 this is a deliberately BASIC check —
// existsSync + logical path-prefix-within-scope — and is the single chokepoint the
// tool calls, so Unit 9 can tighten it in one place without changing callers.

// An anchor is a structural reference: a file path, optionally with a `#symbol`
// (or `#Lstart-Lend`) suffix. Only the file part is checkable on disk; the symbol
// part is the agent's claim and is not (and cannot be) server-verified here.
export function anchorFilePart(anchor: string): string {
  const hash = anchor.indexOf("#");
  return hash === -1 ? anchor : anchor.slice(0, hash);
}

// Resolve a scope entry (path or glob, relative to projectRoot) to an absolute
// prefix. For a basic check we treat a glob as its longest leading literal segment
// — everything up to the first wildcard — so `src/**` scopes the `src` subtree.
function scopePrefix(entry: string, projectRoot: string): string {
  const wildcard = entry.search(/[*?[]/);
  const literal = wildcard === -1 ? entry : entry.slice(0, wildcard);
  const base = isAbsolute(literal) ? literal : join(projectRoot, literal);
  return resolve(base);
}

// True iff `target` is `prefix` itself or lives underneath it. Compares on path
// segments (via the `sep`-terminated prefix) so `src` does not match `src-other`.
function isWithin(target: string, prefix: string): boolean {
  if (target === prefix) return true;
  const rel = relative(prefix, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export interface AnchorVerification {
  anchor: string;
  resolves: boolean;
  inScope: boolean;
  ok: boolean; // resolves AND inScope
}

// Verify a single anchor against disk + the session scope. `ok` is the auto-accept
// signal: the file exists and is inside at least one declared scope entry.
export function verifyAnchor(
  anchor: string,
  projectRoot: string,
  scope: readonly string[],
): AnchorVerification {
  const filePart = anchorFilePart(anchor).trim();
  const abs = isAbsolute(filePart) ? filePart : join(projectRoot, filePart);
  const resolved = resolve(abs);

  const prefixes = scope.map(s => scopePrefix(s, projectRoot));
  const inScope = prefixes.some(p => isWithin(resolved, p));
  const resolves = existsSync(resolved);

  return { anchor, resolves, inScope, ok: resolves && inScope };
}

// An observation's anchors all re-verify (resolve + in scope). An observation with
// no anchors can never auto-accept — there is nothing to re-verify, so it fails
// safe to confirmation.
export function anchorsAllVerify(
  anchors: readonly string[],
  projectRoot: string,
  scope: readonly string[],
): boolean {
  if (anchors.length === 0) return false;
  if (scope.length === 0) return false; // no declared scope ⇒ nothing is in scope
  return anchors.every(a => verifyAnchor(a, projectRoot, scope).ok);
}
