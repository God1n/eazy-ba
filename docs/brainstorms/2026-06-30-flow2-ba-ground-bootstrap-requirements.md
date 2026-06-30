---
date: 2026-06-30
topic: flow2-ba-ground-bootstrap
---

# Flow 2 — ba_ground: Bootstrap a Running Project into As-Is Docs

## Problem Frame

eazy-ba today can only start from a blank slate (discovery) or operate on docs that
already exist (change / stabilize). It **cannot read a codebase**. But most real projects
the solo engineer brings to it are already half- or fully-built with *no* BA docs. They
need a way to point eazy-ba at an existing project, get an **"as-is" baseline** of
documentation reverse-engineered from the current code, and then evolve it — "here's what
you have; now what do you need next?"

This is the `ba_ground` capability — the **only tool permitted to read outside
`docs/ba/`** (verified: no such tool exists today; all current tools read/write only
within the BA doc tree).

The core challenge is identity: eazy-ba is **anti-assumption** — it never asserts what the
user didn't decide. But reverse-engineering docs from code means *inferring* requirements
and intent, which is assumption by another name. Flow 2 must reconcile "grasp the project
and write docs" with "never assume."

## The Reconciliation (load-bearing design principle)

Split everything `ba_ground` reads into two kinds, by a **verifiable-from-code line**:

- **Verifiable facts** — drawn from a **closed, mechanically-checkable set of claim
  classes** (e.g. `entity-exists`, `route-exists`, `dependency-present`,
  `middleware-present`). Each carries a code anchor the server can re-verify exists on
  disk. These are *checkable*, not assumptions — **auto-accepted** with provenance
  `code-verified`. **Fail-safe rule:** anything outside the closed set defaults to
  `inferred`, regardless of how the agent labels it. So a mislabel fails toward
  confirmation, never toward silent auto-accept. (The server can't read code, but it
  *can* confirm a cited anchor resolves and that the claim class is in the allowed set.)
- **Inferences** — interpretive claims the code cannot prove (what an FR *means*, *why* a
  feature exists, which persona it serves, the intended NFR target). These **are**
  assumptions and **must be confirmed** by the user before they back any artifact.

**Critical distinction — fact ≠ requirement.** A verifiable fact ("route `POST /orders`
exists") is a fact *about code*, not a requirement. Auto-accepted facts may back only
**descriptive** artifacts (glossary, entity, tech-surface — restating what exists).
**Normative** artifacts (FR/NFR/persona/use-case — which assert *intent* or *targets*
the code can't prove) require at least one **confirmed user decision** in `derived_from`,
even when a fact anchors them. Materializing "route exists" directly as "the system SHALL
allow order creation" is itself an inference and is not auto-accepted.

This yields **two legitimate provenances** for a document: `user-decided` (the existing
decision ledger) and `code-verified` (auto-accepted facts, descriptive artifacts only).
An **inferred-but-unconfirmed** statement is neither and may never back a finalized
artifact. The anti-assumption gate is thus preserved, not bypassed — `ba_apply` gains a
second valid backing source (verifiable observations, scoped to descriptive artifacts)
but still rejects anything resting on an unconfirmed inference.

> **Identity note:** the guarantee now means *"never silently asserts an inference."*
> Auto-accepted facts are unreviewed but remain visibly labeled and cheaply vetoable;
> the user can glance at and reject any `code-verified` content. This is a deliberate,
> owned narrowing of "never asserts anything unreviewed."

## Requirements

**Observation Layer (ba_ground extraction & persistence)**
- R1. `ba_ground` is a new tool — the only one allowed to read outside `docs/ba/`. It is
  **read-only on the codebase**, **opt-in**, and **scoped** (the user points it at the
  project / paths to read). It never writes outside `docs/ba/`. Because the *host agent*
  performs the actual reads, "read-only + scoped" is enforced at the boundary the server
  *does* control (see R11): the server only records observations whose anchors fall inside
  the declared scope and never persists raw secret values.
- R2. Extraction is **agent-decided per project**: the host agent grounds whatever the
  specific codebase supports and stays silent where it can't (no fixed target artifact
  list). Ungroundable areas (personas, intent, *why*) become questions, not guesses.
- R3. `ba_ground` emits **observations** — code-derived statements, each carrying:
  provenance `code-verified`, a kind from the closed verifiable-fact set or `inferred`,
  and **code anchors** (file/symbol references the observation came from). Observations
  are persisted on disk with an `open → confirmed | corrected | rejected` lifecycle, with
  a **stable identity keyed on (anchor + claim)** so re-runs upsert rather than duplicate.
  (Code anchors are justified by **traceability** — letting the user jump from an
  observation to its source — independent of any future drift use.)
- R4. **Verifiable facts** (R3 closed set, anchor re-verified by the server) are
  **auto-accepted** and may immediately back **descriptive** artifacts only (per the
  fact≠requirement rule). **Inferred observations stay `open`** and cannot back any
  artifact until confirmed/corrected — at which point they become recorded `user-decided`
  decisions. **Gate invariant:** `ba_apply` admits an observation id as backing only if
  its kind is a verifiable-fact OR its status is `confirmed`/`corrected`; an
  `inferred`+`open` observation is rejected by the same path as an unrecorded decision,
  and this status is read from disk (not from agent-supplied metadata).

**Security & Trust Boundary**
- R11. The server **structurally enforces** what it can on the boundary it owns: (a)
  every code anchor is canonicalized with `realpath` and must remain inside the declared
  scope (defeats `../` traversal and symlink escape); (b) a default **deny-list** of
  sensitive patterns (dotfiles, `*.env`, `*.pem`, `*.key`, `*secret*`, `*credential*`,
  `.git/`) excludes those paths from anchors; (c) observation bodies **must not contain
  raw secret values** (keys, tokens, passwords, connection strings) — anchors and
  structural descriptions only; (d) scope is **re-supplied and re-validated per
  invocation** (no implicit persisted broad permission), and `ba_ground` returns a
  manifest of what was read for audit. Pre-existing gap to fix alongside: `resolveConfig`
  must assert `docsRoot` stays within `projectRoot`.

**Confirmation Round (confidence auto-accept)**
- R5. Auto-accepting facts sharply cuts confirmation volume. The remaining **inferred**
  observations are surfaced for confirmation using the existing MCQ questioning model
  (3–5 options + "describe your own"), routed through the **same deep-round engine and
  soft off-ramp as Flow 1** — so confirmation is not a separate death-march and the user
  can stop once the essentials are confirmed.
- R6. A user's response to an inferred observation (confirm / correct / reject) is
  recorded verbatim as a decision, superseding the inference. Corrections and rejections
  are first-class — the user is never forced to accept the AI's reading.
- R13. **Passive-assent guard:** a deliberate, single confirmation is recorded as a full
  `user-decided` decision. A confirmation that is **uncorrected AND bulk/rapid** is tagged
  with a weaker provenance (e.g. `confirmed-as-inferred`) so the audit trail and downstream
  tools (`ba_impact`, finalize) can distinguish active intent from rubber-stamping, and the
  user can revisit the soft ones later. (What counts as "bulk/rapid" — e.g. a batch-confirm
  action, or N confirms with no edits in a row — is a planning detail.)

**As-Is Docs & Handoff**
- R7. As-is documents are materialized as `draft` (reusing Flow 1's draft lifecycle),
  visibly labeled with provenance so the user can tell `code-verified` from
  `user-decided` content at a glance.
- R8. After the baseline exists, the flow hands off to **"what do you need now?"** — this
  **reuses existing machinery, not new behavior**: forward-looking additions run through
  Flow 1's deep-round / coverage-plan engine (seeded by the as-is gaps), and modifications
  to observed behavior run through Phase B change mode (supersede + `ba_impact`).
- R9. `ba_ground` enters via a new `ba_session_start` mode (e.g. `ground` / `bootstrap`),
  slotting into the existing one-engine loop (assess → record → apply → re-assess) rather
  than forking it.

**Re-run & Resume**
- R10. `ba_ground` is **idempotent across runs**: re-emitting an already-confirmed
  observation is a no-op; an emitted observation that conflicts with a confirmed decision
  routes to **change mode** (supersede), not a new open observation; a rejected
  observation is not silently resurrected. On resume after a mid-confirmation stop (R5's
  off-ramp), confirmed/auto-accepted observations are skipped, not re-surfaced.

**Drift (do not build; do not foreclose)**
- R12. Drift detection / living code↔doc sync is **out of scope** for this iteration. The
  observation layer is *not* shaped to a drift-specific schema; the anchors + provenance it
  already carries for traceability (R3) happen to be what a future drift feature would
  need, so the door stays open **without** any drift-specific commitment now.

## Success Criteria
- Pointing `ba_ground` at an existing project with no BA docs produces a labeled as-is
  baseline of **descriptive** observations (entities/glossary, a feature/route map, a
  tech surface — whatever the code supports) without the user answering anything first.
  Normative FR/NFR requirements are *not* auto-generated; they come from confirmation.
- Verifiable facts (closed set, anchor re-verified) appear auto-accepted; no factual
  observation demands confirmation. Anything outside the closed set defaults to inferred.
- No finalized artifact rests on an unconfirmed inference, and no **normative** artifact
  is backed solely by `code-verified` provenance (anti-assumption gate holds).
- Server-enforced boundary holds: no anchor escapes the declared scope (traversal /
  symlink), deny-listed paths are excluded, and no raw secret value is persisted.
- A user can go from "existing project, no docs" → confirmed as-is baseline → "what I need
  now" in one continuous loop, reusing Flow 1 + Phase B rather than a parallel flow.

## Scope Boundaries
- **Drift detection / living code↔doc sync is out of scope** (R12 keeps the door open
  without a drift-specific schema commitment).
- Not building language-specific deep static analysis into the server — grounding is the
  host agent's job (it reads the code); the server records observations and gates them.
- No fixed extraction template / guaranteed artifact types — extraction is agent-decided
  (R2).
- `ba_ground` does not modify the codebase, ever (read-only outside `docs/ba/`).
- The Flow 1 research + deep-round engine is a **dependency**, not re-specced here.
- Code-verified backing is scoped to **descriptive** artifacts only; normative
  requirements always require a confirmed decision.

## Alternatives Considered
- **Code as context only (all backing stays user-decided)** — point Flow 1 discovery at
  the project; the agent *reads* code to ask sharper questions but no code-derived fact
  ever backs a doc. Rejected as the *default* because it forces the user to re-answer
  everything the code already proves (high confirmation volume). But its spirit is kept:
  code-verified backing is deliberately confined to descriptive artifacts, so the riskiest
  surface (normative requirements from inference) still flows through user decisions.
- **Code as ground truth (no confirmation)** — rejected earlier; violates anti-assumption.

## Key Decisions
- **As-is docs = observations to confirm**, not ground truth: preserves anti-assumption
  identity; the user reacts to a baseline instead of being asked everything from zero.
- **Verifiable-from-code line**: facts auto-accepted (`code-verified` provenance),
  inferences must be confirmed. This is what lets code-derived docs coexist with the
  anti-assumption gate.
- **Agent-decided extraction**: ground whatever the codebase supports; ungroundable →
  questions. Consistent with Flow 1's open-ended, agent-driven philosophy.
- **One-shot bootstrap now**: ship focused; the traceability anchors already make it
  drift-ready (R12) with no drift-specific commitment.
- **Confidence auto-accept** for confirmation UX: cut volume by auto-accepting facts; route
  remaining inferred confirmations through Flow 1's deep-round + soft off-ramp.
- **Fact ≠ requirement**: auto-accepted facts back descriptive artifacts only; normative
  FR/NFR/persona need a confirmed decision. Closes the "facts-laundered-as-requirements"
  hole the adversarial review found.
- **Fail-safe classification**: a closed, server-re-verifiable set defines `verifiable-fact`;
  anything else defaults to `inferred`. A mislabel fails toward confirmation, not auto-accept.
- **Passive-assent guard** (R13): bulk/uncorrected confirmations are tagged weaker than
  deliberate decisions, so low-friction confirmation can't silently launder assumptions
  into the ledger as if they were considered intent.
- **Reuse over rebuild**: the "what I need now" round is Flow 1 + Phase B seeded by the
  baseline — Flow 2's genuinely new surface is `ba_ground` + the observation layer + the
  security boundary.

## Dependencies / Assumptions
- **Depends on Flow 1** (`docs/brainstorms/2026-06-30-flow1-research-deep-round-requirements.md`)
  for the deep-round engine, coverage plan, draft/finalize lifecycle, and soft off-ramp.
  **Note:** those Flow 1 surfaces are themselves *unbuilt* (all deferred to planning), so
  Flow 2 cannot be planned or built independently — plan the shared spine once for both.
- Builds on Phase A loop/ledger and Phase B change intake (shipped, v0.3.0).
- Assumes the host agent (Claude) reads the codebase and classifies fact vs inference —
  the server cannot read code, so it gates on what it *can* check (anchor resolves +
  claim-class in the closed set + scope/secret rules), not on semantic correctness.

## Outstanding Questions

### Resolve Before Planning
- [Affects R3 / Flow 1 R2][Architecture] **Are observations a specialization of Flow 1's
  coverage items, or a distinct abstraction?** Both are persisted, lifecycle-managed,
  disk-gating units. Decide before planning — it determines whether there is one disk
  schema / gate path / state machine or two. Recommendation: **one shared "open item"
  primitive** with a `kind` discriminator (coverage-topic vs observation) and per-kind
  lifecycle, since the doubling cost was already flagged in Flow 1's Key Decisions.
- [Affects R3/R4][Decision, was "Needs research"] **Define the closed verifiable-fact
  set** (e.g. `entity-exists`, `route-exists`, `dependency-present`, `middleware-present`).
  This is the load-bearing safety boundary, not a tunable — it must be an explicit,
  server-checkable enumeration so "no finalized artifact rests on an inference" is
  testable. Validate the set against a real codebase, but pick it before building the gate.

### Deferred to Planning
- [Affects R3][Technical] Concrete on-disk representation of the shared open-item primitive
  (new artifact type vs ledger entry vs sibling store). Caveat: `computeAssessment` reads
  only `listArtifacts` + `listDecisions` (`assessment.ts`); a representation invisible to it
  cannot gate stability — reuse those stores or extend its inputs.
- [Affects R4/the gate][Technical] `ba_apply`'s gate is **two coupled checks**: the
  ledger-membership throw (`baApply.ts`) *and* `markApplied()` per `derived_from` id
  (`decisions.ts`), which requires a `decision` artifact. `derived_from` is also
  `min(1)`. Admitting code-verified backing must: give observations an id-space, decide
  what a descriptive artifact cites so `min(1)` + membership pass, and handle/bypass
  `markApplied` for observation ids — not only relax the membership check.
- [Affects R6/R10][Technical] Confirming/correcting an observation into a `user-decided`
  decision must use Phase B append-only `supersede()` semantics when it conflicts with a
  prior confirmation — not mint a fresh open observation.
- [Affects R8/R9][Technical] New `ground`/`bootstrap` mode extends the mode union in
  `baSessionStart.ts`, `session.ts` (`SessionState.mode`), and `assessment.ts`; a ground
  session would be **vacuously stable** in `computeAssessment`'s else branch (same trap as
  Flow 1's empty plan) unless open observations gate stability. Define the
  ground → confirm → "what now" sequencing without forking the loop.
- [Affects R8 / Flow 1 R5a][Technical] How the Flow 1 **floor** interacts with the as-is
  baseline in the "what now" round — do confirmed observations satisfy/retire floor topics,
  or does `floor ∪ observations ∪ coverage` become an over-long round defeating the off-ramp?
- [Affects R11][Security] Produce a brief **threat model** before implementation
  enumerating the attack surface (scope param, observation bodies, anchors, `_config.yml`
  `docsRoot` override) and the mitigation for each; confirm the MCP process's file
  permissions bound the blast radius.

## Next Steps
-> Two Resolve-Before-Planning items remain (both architectural: observation/coverage
unification, and the closed verifiable-fact set). Recommend resolving them at the **top of
`/ce:plan`** for the shared spine rather than re-opening the brainstorm — they are
design decisions best made with implementation context. Both Flow 1 and Flow 2 are
otherwise specced. `-> /ce:plan` the shared spine (open-item layer, provenance-extended
gate, mode/round taxonomy, security boundary) once for both flows.
