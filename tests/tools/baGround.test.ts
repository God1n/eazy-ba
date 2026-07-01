import { expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baInit } from "../../src/tools/baInit.js";
import { baSessionStart } from "../../src/tools/baSessionStart.js";
import { baAssess } from "../../src/tools/baAssess.js";
import { baGround } from "../../src/tools/baGround.js";
import { listOpenItems } from "../../src/core/openItems.js";
import { listArtifacts, writeArtifact } from "../../src/core/store.js";

// A small on-disk project plus a ground session scoped to src/**.
function setupGround(scope: string[] = ["src/**", "package.json"]): { root: string; docsRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "ba-ground-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "export class App {}\n");
  writeFileSync(join(root, "src", "routes.ts"), "// routes\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { express: "^4" } }) + "\n");
  // Outside the declared scope.
  mkdirSync(join(root, "secrets"), { recursive: true });
  writeFileSync(join(root, "secrets", "keys.ts"), "export const KEY = 'x';\n");

  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "ground", readScope: scope });
  return { root, docsRoot: join(root, "docs/ba") };
}

function observations(docsRoot: string) {
  return listOpenItems(docsRoot).filter(i => i.kind === "observation");
}

// ---------------------------------------------------------------------------
// Happy: entity-exists with a resolving, in-scope anchor → auto-accepted
// (confirmed + code-verified, NOT an open confirm-question).
// ---------------------------------------------------------------------------
test("entity-exists with a resolving in-scope anchor is auto-accepted (confirmed, code-verified)", () => {
  const { root, docsRoot } = setupGround();
  const res = baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "entity-exists", claim: "App class exists", anchors: ["src/app.ts#App"] },
    ],
  });

  expect(res.autoAccepted).toBe(1);
  expect(res.inferred).toBe(0);
  const r = res.recorded[0];
  expect(r.autoAccepted).toBe(true);
  expect(r.item_state).toBe("confirmed");
  expect(r.provenance).toBe("code-verified");
  expect(r.fact_kind).toBe("entity-exists");

  // On disk: confirmed observation, not open.
  const obs = observations(docsRoot);
  expect(obs.length).toBe(1);
  expect(obs[0].item_state).toBe("confirmed");
  expect(obs[0].provenance).toBe("code-verified");

  // It does NOT surface as an open confirm-question and does not gate stability.
  const a = baAssess({ projectRoot: root });
  expect(a.questions.some(q => q.round === "confirm")).toBe(false);
});

// ---------------------------------------------------------------------------
// Happy: dependency-present (closed set) with a resolving manifest anchor → auto.
// ---------------------------------------------------------------------------
test("dependency-present with a resolving in-scope anchor is auto-accepted", () => {
  const { root, docsRoot } = setupGround();
  baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "dependency-present", claim: "express is a dependency", anchors: ["package.json"] },
    ],
  });
  const obs = observations(docsRoot);
  expect(obs[0].item_state).toBe("confirmed");
  expect(obs[0].provenance).toBe("code-verified");
});

// ---------------------------------------------------------------------------
// Fix 14: a fact_kind read back from a stored open-item is validated against
// [...CLOSED_FACT_KINDS, "inferred"]; a corrupted on-disk value is treated as
// "inferred" (the fail-safe) rather than surfaced verbatim as an auto-accepted
// closed fact.
// ---------------------------------------------------------------------------
test("a corrupted stored fact_kind is coerced to 'inferred' when read back", () => {
  const { root, docsRoot } = setupGround();
  // Ground a route-exists → recorded inferred + open (not auto-accepted).
  const claim = "GET /users route exists";
  baGround({
    projectRoot: root,
    observations: [{ fact_kind: "route-exists", claim, anchors: ["src/routes.ts"] }],
  });

  // Corrupt the stored open-item's fact_kind to a value outside the valid set.
  const art = listArtifacts(docsRoot).find(
    a => a.frontmatter.type === "open-item" && a.frontmatter.kind === "observation",
  )!;
  writeArtifact(
    { frontmatter: { ...art.frontmatter, fact_kind: "totally-bogus-kind" as never }, body: art.body },
    docsRoot,
  );

  // Re-ground the SAME observation (idempotent upsert returns the existing id and
  // reads the stored — now corrupted — item back). Fix 14 must coerce to "inferred".
  const res = baGround({
    projectRoot: root,
    observations: [{ fact_kind: "route-exists", claim, anchors: ["src/routes.ts"] }],
  });
  expect(res.recorded[0].fact_kind).toBe("inferred");
  expect(res.recorded[0].autoAccepted).toBe(false);
});

// ---------------------------------------------------------------------------
// Edge: route-exists is NOT auto-accepted (its claim isn't anchor-existence,
// server can't parse routes) → inferred + open, even with a resolving anchor.
// ---------------------------------------------------------------------------
test("route-exists is not auto-accepted; enters inferred + open", () => {
  const { root, docsRoot } = setupGround();
  const res = baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "route-exists", claim: "GET /users route exists", anchors: ["src/routes.ts"] },
    ],
  });
  expect(res.autoAccepted).toBe(0);
  const r = res.recorded[0];
  expect(r.autoAccepted).toBe(false);
  expect(r.fact_kind).toBe("inferred");
  expect(r.item_state).toBe("open");

  const obs = observations(docsRoot);
  expect(obs[0].fact_kind).toBe("inferred");
  expect(obs[0].item_state).toBe("open");

  // It surfaces as a confirm-question and gates stability.
  const a = baAssess({ projectRoot: root });
  expect(a.questions.some(q => q.round === "confirm")).toBe(true);
  expect(a.stable).toBe(false);
});

// ---------------------------------------------------------------------------
// Edge (fail-safe): entity-exists whose anchor does NOT resolve → downgraded to
// inferred + open (mislabel fails toward confirmation).
// ---------------------------------------------------------------------------
test("entity-exists with a non-resolving anchor is downgraded to inferred + open", () => {
  const { root, docsRoot } = setupGround();
  const res = baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "entity-exists", claim: "Ghost class exists", anchors: ["src/ghost.ts#Ghost"] },
    ],
  });
  expect(res.autoAccepted).toBe(0);
  expect(res.recorded[0].fact_kind).toBe("inferred");
  expect(observations(docsRoot)[0].item_state).toBe("open");
});

// ---------------------------------------------------------------------------
// Edge (fail-safe): entity-exists whose anchor resolves but is OUT OF SCOPE →
// downgraded to inferred + open.
// ---------------------------------------------------------------------------
test("entity-exists with a resolving but out-of-scope anchor is downgraded to inferred", () => {
  const { root, docsRoot } = setupGround(["src/**"]); // secrets/ is NOT in scope
  const res = baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "entity-exists", claim: "KEY exists", anchors: ["secrets/keys.ts#KEY"] },
    ],
  });
  expect(res.autoAccepted).toBe(0);
  expect(res.recorded[0].fact_kind).toBe("inferred");
  expect(observations(docsRoot)[0].item_state).toBe("open");
});

// ---------------------------------------------------------------------------
// Edge: a fact_kind outside the auto-acceptable set is inferred regardless of
// label — even with a perfectly resolving in-scope anchor.
// ---------------------------------------------------------------------------
test("a non-closed fact_kind (middleware-present) is inferred regardless of a good anchor", () => {
  const { root, docsRoot } = setupGround();
  const res = baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "middleware-present", claim: "auth middleware is wired", anchors: ["src/app.ts"] },
    ],
  });
  expect(res.autoAccepted).toBe(0);
  expect(res.recorded[0].fact_kind).toBe("inferred");
  expect(observations(docsRoot)[0].item_state).toBe("open");
});

// ---------------------------------------------------------------------------
// Edge: idempotent re-run with the same (anchors+claim) → no duplicate.
// ---------------------------------------------------------------------------
test("re-running with the same anchors+claim does not duplicate", () => {
  const { root, docsRoot } = setupGround();
  const obs = { fact_kind: "entity-exists" as const, claim: "App class exists", anchors: ["src/app.ts#App"] };
  const first = baGround({ projectRoot: root, observations: [obs] });
  const second = baGround({ projectRoot: root, observations: [obs] });
  expect(first.recorded[0].id).toBe(second.recorded[0].id);
  expect(observations(docsRoot).length).toBe(1);
});

// ---------------------------------------------------------------------------
// Edge: an inferred observation re-run after the file appears stays the SAME
// item (identity is anchors+claim, idempotent upsert never resurrects/reclassifies).
// ---------------------------------------------------------------------------
test("idempotent upsert returns the existing item on re-run (no reclassification churn)", () => {
  const { root, docsRoot } = setupGround();
  const obs = { fact_kind: "route-exists" as const, claim: "GET /x", anchors: ["src/routes.ts"] };
  const a = baGround({ projectRoot: root, observations: [obs] });
  const b = baGround({ projectRoot: root, observations: [obs] });
  expect(a.recorded[0].id).toBe(b.recorded[0].id);
  expect(observations(docsRoot).length).toBe(1);
  expect(observations(docsRoot)[0].item_state).toBe("open");
});

// ---------------------------------------------------------------------------
// Guard: ba_ground requires an active ground session.
// ---------------------------------------------------------------------------
test("ba_ground throws outside a ground session", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-ground-mode-"));
  baInit({ projectRoot: root });
  baSessionStart({ projectRoot: root, mode: "discovery" });
  expect(() =>
    baGround({
      projectRoot: root,
      observations: [{ fact_kind: "entity-exists", claim: "x", anchors: ["src/app.ts"] }],
    }),
  ).toThrow(/ground/i);
});

// ---------------------------------------------------------------------------
// Integration: a ground session with an open inferred observation is NOT
// vacuously stable; ba_assess emits the ground directive when no observations yet.
// ---------------------------------------------------------------------------
test("ground session: directive before any observation; not vacuously stable with an open inferred one", () => {
  const { root } = setupGround();

  // Fresh ground session, no observations: ba_assess emits the ground directive.
  const before = baAssess({ projectRoot: root });
  expect(before.groundDirective).toBeDefined();
  expect(before.groundDirective).toMatch(/ba_ground/);

  // Record an inferred (route) observation → it gates stability.
  baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "route-exists", claim: "GET /users", anchors: ["src/routes.ts"] },
    ],
  });
  const after = baAssess({ projectRoot: root });
  // Directive gone once observations exist.
  expect(after.groundDirective).toBeUndefined();
  // Open inferred observation gates stability — not vacuously stable.
  expect(after.stable).toBe(false);
  expect(after.questions.some(q => q.round === "confirm")).toBe(true);
});

// ---------------------------------------------------------------------------
// Scope wiring: readScope is persisted at session start and bounds auto-accept.
// ---------------------------------------------------------------------------
test("session start persists readScope and ba_ground reads it", () => {
  const { root } = setupGround(["src/**"]);
  const res = baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "entity-exists", claim: "App", anchors: ["src/app.ts#App"] },
    ],
  });
  expect(res.scope).toEqual(["src/**"]);
  expect(res.autoAccepted).toBe(1);
});

// ---------------------------------------------------------------------------
// Unit 9 — secret-scan (best-effort): an observation whose body contains a raw
// secret is rejected by ba_ground and never persisted.
// ---------------------------------------------------------------------------
test("ba_ground rejects an observation whose claim contains a raw secret", () => {
  const { root, docsRoot } = setupGround();
  expect(() =>
    baGround({
      projectRoot: root,
      observations: [
        {
          fact_kind: "entity-exists",
          claim: "config holds api_key sk-1234567890abcdef1234567890",
          anchors: ["src/app.ts#App"],
        },
      ],
    }),
  ).toThrow(/secret/i);
  // Nothing was written — the whole batch is rejected before any upsert.
  expect(observations(docsRoot).length).toBe(0);
});

// ---------------------------------------------------------------------------
// Unit 9 — deny-list: an observation anchoring a deny-listed path cannot
// auto-accept; it fails safe to inferred + open (anchor not verifiable).
// ---------------------------------------------------------------------------
test("ba_ground will not auto-accept an observation anchored at a deny-listed path", () => {
  const { root, docsRoot } = setupGround();
  writeFileSync(join(root, "src", ".env"), "TOKEN=abc\n");
  const res = baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "entity-exists", claim: "env file present", anchors: ["src/.env"] },
    ],
  });
  expect(res.autoAccepted).toBe(0);
  expect(res.recorded[0].fact_kind).toBe("inferred");
  expect(observations(docsRoot)[0].item_state).toBe("open");
});

// ---------------------------------------------------------------------------
// Unit 9 — gitignore: ba_init writes a .gitignore that excludes the open-item
// store so a missed secret in an observation body is not committed.
// ---------------------------------------------------------------------------
test("ba_init gitignores the open-item store", () => {
  const root = mkdtempSync(join(tmpdir(), "ba-ground-gitignore-"));
  const res = baInit({ projectRoot: root });
  const gi = readFileSync(join(res.docsRoot, ".gitignore"), "utf8");
  expect(gi).toMatch(/09-open-items/);
});

// ---------------------------------------------------------------------------
// Unit 9 — anchors are structural references, never content snapshots: the
// stored observation holds path references only, no file contents.
// ---------------------------------------------------------------------------
test("ba_ground stores only structural anchor references, never file contents", () => {
  const { root, docsRoot } = setupGround();
  baGround({
    projectRoot: root,
    observations: [
      { fact_kind: "entity-exists", claim: "App class exists", anchors: ["src/app.ts#App"] },
    ],
  });
  const obs = observations(docsRoot)[0];
  expect(obs.anchors).toEqual(["src/app.ts#App"]);
  // The on-disk file content ("export class App {}") is never copied into the item.
  const serialized = JSON.stringify(obs);
  expect(serialized).not.toMatch(/export class App/);
});
