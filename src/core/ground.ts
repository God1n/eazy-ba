import { guardAnchor, anchorFilePart, type ScopeGuardOptions } from "./scopeGuard.js";

// Anchor re-verification for the ground flow (Flow 2 R4). The server cannot parse
// code, so it can only re-verify ONE thing about an observation: that the anchor
// path actually resolves on disk AND sits inside the user-declared read scope.
// That existence check is the sole basis on which an existence-class fact
// (entity-exists / dependency-present) may auto-accept — anchor-resolves proves
// existence, not arbitrary claim truth.
//
// Unit 9: this now routes through the CORE-LAYER scopeGuard (src/core/scopeGuard.ts),
// which hardens the Unit 8 basic check in three ways: (1) realpath canonicalization
// so a `../` or symlink whose REAL target escapes scope is rejected (the logical
// prefix check Unit 8 used was insufficient); (2) a secret/CI deny-list so a denied
// path is never anchored; (3) it is the single chokepoint, so callers cannot bypass
// it. See scopeGuard.ts for the full threat model and the honest framing of what the
// server can vs cannot enforce (the host agent does the reads — these are
// persistence/boundary controls, not read controls).

// Re-export the structural anchor helper (file part of a `path#symbol` anchor)
// so existing importers of ground.ts keep working.
export { anchorFilePart };

// Module-private: the return shape of verifyAnchor. verifyAnchor stays exported
// (tests import it) but nothing imports this type name, so it need not be public.
interface AnchorVerification {
  anchor: string;
  resolves: boolean;
  inScope: boolean;
  denied: boolean;
  ok: boolean; // resolves AND inScope AND NOT denied
}

// Verify a single anchor against disk + the session scope + the deny-list,
// realpath-backed (via scopeGuard). `ok` is the auto-accept signal: the file
// exists, its realpath is inside a declared scope entry, and it is not denied.
export function verifyAnchor(
  anchor: string,
  projectRoot: string,
  scope: readonly string[],
  opts: ScopeGuardOptions = {},
): AnchorVerification {
  const g = guardAnchor(anchor, projectRoot, scope, opts);
  return { anchor: g.anchor, resolves: g.resolves, inScope: g.inScope, denied: g.denied, ok: g.ok };
}

// An observation's anchors all re-verify (resolve + in scope + not denied). An
// observation with no anchors can never auto-accept — there is nothing to
// re-verify, so it fails safe to confirmation. A denied anchor fails the whole
// observation, so it cannot auto-accept either.
export function anchorsAllVerify(
  anchors: readonly string[],
  projectRoot: string,
  scope: readonly string[],
  opts: ScopeGuardOptions = {},
): boolean {
  if (anchors.length === 0) return false;
  if (scope.length === 0) return false; // no declared scope ⇒ nothing is in scope
  return anchors.every(a => verifyAnchor(a, projectRoot, scope, opts).ok);
}
