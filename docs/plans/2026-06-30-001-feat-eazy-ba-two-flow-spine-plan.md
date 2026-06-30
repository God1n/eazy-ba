---
title: "feat: eazy-ba two-flow shared spine (research deep-round + ba_ground bootstrap)"
type: feat
status: active
date: 2026-06-30
origin: docs/brainstorms/2026-06-30-flow1-research-deep-round-requirements.md
deepened: 2026-06-30
---

# feat: eazy-ba Two-Flow Shared Spine

## Overview

Implement the shared infrastructure and both user flows for eazy-ba:

- **Flow 1** — research + adaptive deep-round engine: surface answers → agent researches →
  agent-declared coverage plan (atop a rich floor) → long tailored MCQ round → draft → finalize.
- **Flow 2** — `ba_ground` bootstrap: read an existing codebase → emit code-derived
  *observations* → auto-accept verifiable facts / confirm inferences → as-is docs → "what now".

Both flows ride one spine: a unified **open-item** primitive, a **provenance-extended
`ba_apply` gate**, an extended **mode/round taxonomy**, and the **draft→finalize** lifecycle.
Flow 2 adds `ba_ground` and a server-enforced security boundary on top.

## Problem Frame

eazy-ba (v0.3.0) can start blank (discovery) or operate on existing docs (change/stabilize),
but its deep round is a static checklist × existing artifacts, and it cannot read code. The two
brainstorms define the target: a research-driven deep round that "knows when to stop", and a
bootstrap path that reverse-engineers an as-is baseline without violating the anti-assumption
identity. See origins:
- Flow 1: `docs/brainstorms/2026-06-30-flow1-research-deep-round-requirements.md`
- Flow 2: `docs/brainstorms/2026-06-30-flow2-ba-ground-bootstrap-requirements.md`

## Requirements Trace

**Flow 1** (origin F1): R1 research directive · R2 coverage plan (idempotent) · R3 plan
converges · R4 topics≠assumptions · R5/R5a/R5b floor (rich, artifact-independent) ∪ plan ∪ gaps ·
R6 floor re-anchored to topic keys + back-compat · R7 stability reads plan+floor · R8 MCQ ·
R9 incremental draft via existing status · R10 idempotent/repeatable finalize · R11 user-visible
steerable plan · R12 soft off-ramp.

**Flow 2** (origin F2): R1 `ba_ground` only tool outside docs/ba · R2 agent-decided extraction ·
R3 observations (provenance, closed-set kind, anchors, stable identity) · R4 auto-accept facts /
gate invariant / fact≠requirement · R5 confirmation via Flow 1 engine · R6 confirm/correct/reject →
decisions · R10 idempotent re-run/resume · R11 security boundary · R12 drift deferred · R13
passive-assent guard.

## Scope Boundaries

- Drift detection / living code↔doc sync is **out** (Flow 2 R12). Anchors are kept for
  traceability, not a drift schema.
- No language-specific static analysis in the server — the host agent reads code (Flow 2 R2).
- No new client UI; everything is tool I/O + persona instructions.
- Surface-round story-tailoring is out (Flow 1 scope).
- Question ranking/budget beyond the floor off-ramp is out (Flow 1 scope; ideation idea #6).

### Deferred to Separate Tasks

- Publishing to npm (deprecate `eazy-ba@<0.2.0`, ship 0.4.0) — separate release task, needs OTP.

## Context & Research

### Relevant Code and Patterns (verified 2026-06-30)

- `src/core/assessment.ts:10` `computeAssessment(docsRoot, mode)` — reads **only**
  `listArtifacts` (filtered `type!=="decision"`) + `listDecisions` + `detectGaps`; `stable =
  questions.length===0 && gaps.length===0`; discovery branch keys on `decisions.length===0`.
- `src/core/questions.ts` — `domainQuestions` keys `topic` as `` `${artifactId}#${idx}` ``;
  `answered = Set(decisions.map(d=>d.topic))`; `changeQuestions` keys `topic` = artifact id.
- `src/core/decisions.ts` — `recordDecision` mints via `nextId`, `status:"approved"`;
  `markApplied(id,…)` **throws unless `id` is a `type:"decision"` artifact** (decisions.ts:52-53);
  `supersede` is append-only (throws on conflicting `superseded_by`).
- `src/tools/baApply.ts` — schema `type` enum = `persona|fr|nfr|use-case|story`;
  `derived_from: z.array().min(1)`; gate = `ledger.has(dec)` per id (baApply.ts:54-56) **and**
  `markApplied(dec,…)` per id (baApply.ts:80-81); batch-atomic; create forces `status:"draft"`
  via `baCreateArtifact.ts:26`.
- Mode/round unions hardcoded in `session.ts:13-14`, `assessment.ts:8,10`, `decisions.ts:8`,
  `baSessionStart.ts:8`, `baRecordAnswers.ts:11`, `baStatus.ts:16` — **no shared constant**.
- `src/core/types.ts` — `ArtifactType`, `ID_PREFIX`, `Status` (`draft|reviewed|approved|
  implemented|obsolete`), `FILE_BACKED_TYPES` = `persona|fr|nfr|use-case|story|decision`;
  `Frontmatter` has `[k:string]:unknown` escape hatch.
- `src/config.ts:10` `resolveConfig` — `docsRoot` may be absolute; **no containment check**; no
  tool currently reads outside `docsRoot`.
- `src/core/gaps.ts` — `detectGaps(artifacts)` emits `story-without-acceptance-criteria`,
  `fr-without-story`, `untraced-artifact`, `dangling-link`; `TRACED_TYPES` excludes new types.

### Institutional Learnings

- No `docs/solutions/` knowledge base exists yet. The load-bearing prior lessons: stability must
  be **recomputed from disk** (never cached in session); obsolete decisions must not count as
  coverage; supersede is **append-only**; the whole-branch review catches cross-call loop bugs
  that per-task review misses (see origin specs). Carry all forward.

### External References

- None — internal architecture on a well-patterned TypeScript/ESM/zod/vitest codebase.

## Key Technical Decisions

- **One `open-item` artifact type, kind-discriminated** (resolves RBP-1). New file-backed type
  `open-item` with frontmatter: `kind` (`coverage-topic` | `observation`), `item_state`
  (`open|answered|confirmed|corrected|rejected|retired`), and kind-specific fields. Chosen
  because `computeAssessment` only sees `listArtifacts`/`listDecisions`; an artifact type is the
  one representation that gates stability with zero new read-path. `item_state` is a **separate
  field** from `Status` (which stays `draft…obsolete` for real docs).
- **Closed verifiable-fact set** (resolves RBP-2). Split by what the server can actually
  re-verify (the server cannot parse code — Flow 2 R2):
  - **Auto-acceptable** (claim truth == anchor existence, server-checkable): `entity-exists`
    (file/symbol path resolves), `dependency-present` (declared in a manifest the server can read,
    e.g. `package.json`). These auto-accept after the server confirms the anchor.
  - **Inferred-by-construction** (claim needs code semantics the server can't verify):
    `route-exists`, `middleware-present`, `config-key-exists` — these are **not auto-accepted**;
    they enter as `inferred` and require confirmation. (The route/feature map is still produced,
    just confirmed rather than auto-stamped.)
  - **Fail-safe:** anything outside the auto-acceptable set defaults to `inferred`, regardless of
    the agent's label. `CLOSED_FACT_KINDS` (auto-acceptable) is a single exported constant.
- **Provenance on backing, not a second store.** Add `provenance` to decisions/open-items
  (`user-decided` | `code-verified` | `confirmed-as-inferred`). The gate accepts an `open-item`
  id of `kind:observation` as `derived_from` backing iff (`fact_kind` ∈ closed set) **or**
  (`item_state ∈ {confirmed,corrected}`); `inferred`+`open` is rejected by the same throw as an
  unrecorded decision.
- **`markApplied` generalized** to mark either a decision **or** an applied open-item, so
  observation-backed artifacts don't hit the decisions.ts:52 throw.
- **fact ≠ requirement** (type-level boundary): code-verified backing is allowed only for
  **descriptive** artifact types; **normative** types (`fr|nfr|persona|use-case|story`) require ≥1
  **deliberate** `user-decided` or `corrected` backing. The gate is type-level (it does not inspect
  body content), so to keep it airtight: **descriptive artifacts carry no normative authority** —
  they may not be cited in a normative artifact's `derived_from`, and there is no promote/convert
  path from descriptive to normative. Add descriptive types `glossary` (exists in `ArtifactType`,
  make file-backed) and a new `tech-surface` for the route/feature/dependency map.
- **`confirmed-as-inferred` does not satisfy the normative gate** (closes the passive-assent hole):
  the normative ≥1-backing check accepts only `user-decided` or `corrected` provenance, **not**
  `confirmed-as-inferred`. So a bulk/rapidly-confirmed inference cannot back an FR/NFR without a
  deliberate re-confirm. The weaker tag is thus load-bearing, not cosmetic.
- **Read scope is a user-turn parameter**: `ba_ground`'s scope is supplied at `ba_session_start`
  (the user points it at the project), not freely per-call by the agent — so a prompt-injected
  agent can't unilaterally widen scope. The deny-list is the defense-in-depth backstop.
- **Centralize the taxonomy**: a single `src/core/taxonomy.ts` exporting `Mode`, `Round`,
  `ItemKind`, `Provenance`, `FactKind` unions + zod enums, replacing the 7 duplicated literals.
- **Floor re-anchored to topic keys** namespaced `floor:<dimension>` — disjoint from
  `artifactId#idx` (domain) and `artifactId` (change), so existing answered decisions never
  re-open (Flow 1 R6).

## Open Questions

### Resolved During Planning

- RBP-1 (unify coverage-items/observations) → one `open-item` type, kind-discriminated.
- RBP-2 (verifiable-fact set) → the 5-member closed set above.
- Where do open-items gate stability? → emitted as `Question`s for `item_state:open`, counted in
  `computeAssessment.questions`. **Resolved with conditions** (Unit 3): requires restructuring the
  `decisions.length===0` short-circuit AND excluding open-items from every artifact consumer
  (detectGaps, domainQuestions, change-reval) — two opposite memberships of the same list.
- What backs a descriptive as-is artifact so `derived_from.min(1)` passes? → the observation's own
  open-item id (kind:observation), admitted by the extended gate after the gate resolves the id
  against `listOpenItems` (not only the decision ledger).
- Auto-accept scope → only existence-class facts the server can re-verify (entity/dependency);
  route/middleware/config-key are inferred (server can't parse code).

### Deferred to Implementation

- Exact "bulk/rapid" heuristic for the passive-assent guard (R13) — pick during impl (e.g. a
  `batch:true` flag on the confirm call, or N-uncorrected-in-a-row). Behavior is specified; the
  threshold is a tuning detail.
- Precise anchor format (`file#Lstart-Lend` vs `file#symbol`) — choose when wiring re-verification;
  must be stable enough for idempotent identity.
- Whether `tech-surface` is one aggregate artifact or one per area — decide when materializing.

## High-Level Technical Design

> *Directional guidance for review, not implementation specification. Treat as context.*

Unified open-item gating both flows, and the extended gate:

```
ba_assess(mode) ─► computeAssessment(docsRoot, mode)
    reads: listArtifacts(real) + listOpenItems() + listDecisions() + detectGaps
    questions = surface? ∪ floor(open) ∪ coveragePlan(open) ∪ observations(inferred,open) ∪ domain ∪ gaps ∪ changeReval
    stable = questions==0 && gaps==0          // open-items emit questions → they gate stability

open-item (artifact type)
  kind: coverage-topic            kind: observation
  item_state: open→answered       item_state: open→confirmed|corrected|rejected
  topic: floor:<dim> | <plan>     fact_kind: <closed-set>|inferred ; anchors:[..] ; claim:..

ba_apply gate (extended):
  ledger = listDecisions(); openItems = listOpenItems()        // resolve dec against BOTH
  for dec in derived_from:
    rec = ledger[dec] or openItems[dec] or throw "Unknown or unrecorded decision"
    backable = isDecision(rec)
            or (rec.kind==observation and (rec.fact_kind∈CLOSED_FACT_KINDS or rec.item_state∈{confirmed,corrected}))
    if not backable: throw "Unknown or unrecorded decision"
  if artifactType ∈ NORMATIVE:                                 // fact≠requirement, content-blind
    require ≥1 dec with provenance ∈ {user-decided, corrected} // NOT code-verified, NOT confirmed-as-inferred
  for dec: markApplied(dec)        // marks decision OR open-item; applied open-item stops gating (item_state→applied)
```

## Output Structure

    src/core/
      taxonomy.ts        (new) shared Mode/Round/ItemKind/Provenance/FactKind + zod enums + CLOSED_FACT_KINDS
      openItems.ts       (new) open-item CRUD, idempotent identity, state transitions
      ground.ts          (new) observation extraction-record + fact re-verification + security guards
      assessment.ts      (mod) read open-items; new rounds; floor; vacuous-stability fix
      questions.ts       (mod) floorQuestions, coverageQuestions, observationQuestions; topic namespacing
      decisions.ts       (mod) provenance field; markApplied generalized
      gaps.ts            (mod) exclude open-item/new types from artifact gap checks
      types.ts           (mod) add open-item/tech-surface types, prefixes, file-backed, descriptive/normative sets
    src/tools/
      baGround.ts        (new) ba_ground tool (Flow 2)
      baPlan.ts          (new) ba_plan tool — declare/extend/retire coverage topics (Flow 1)
      baFinalize.ts      (new) ba_finalize tool — promote drafts (both flows)
      baApply.ts         (mod) provenance-extended gate; descriptive vs normative; open-item backing
      baSessionStart.ts  (mod) add "ground" mode
      baRecordAnswers.ts (mod) provenance/passive-assent; observation confirm→decision
      baAssess.ts        (mod) emit research/ground directives
    src/config.ts        (mod) docsRoot containment assertion
    src/instructions.ts  (mod) persona guidance for research, grounding, fact-vs-inference, off-ramp

## Implementation Units

### Phase 1 — Shared Spine

- [x] **Unit 1: Centralized taxonomy + new artifact/provenance types**

**Goal:** One source of truth for the mode/round/kind/provenance unions; register the new
artifact types and the closed fact set.
**Requirements:** F1-R6 (topic keys), F2-R3/R4 (kinds, provenance); enables all later units.
**Dependencies:** None.
**Files:**
- Create: `src/core/taxonomy.ts`
- Modify: `src/core/types.ts`, `src/core/store.ts` (the `FOLDER: Record<ArtifactType,string>` map —
  adding ArtifactType members makes this exhaustive Record a compile error until extended),
  `src/core/session.ts` (**both** the `SessionState` mode/round at :13-14 **and** `Question.round`
  at :9), `src/core/questions.ts` (the per-function `round` literals), `src/core/assessment.ts`,
  `src/core/decisions.ts`, `src/tools/baSessionStart.ts`, `src/tools/baRecordAnswers.ts`,
  `src/tools/baStatus.ts`
- Test: `tests/core/taxonomy.test.ts`
**Approach:**
- `taxonomy.ts` exports `Mode` (+`ground`), `Round` (+`research`,`confirm`), `ItemKind`,
  `Provenance` (`user-decided|code-verified|corrected|confirmed-as-inferred`), `FactKind`,
  `CLOSED_FACT_KINDS` (auto-acceptable subset only), plus zod enums; replace **every** duplicated
  literal site (grep `"surface"`/`"discovery"` to find them all, incl. `session.ts:9`, `questions.ts`).
- `types.ts`: add `open-item` and `tech-surface` to `ArtifactType`, `ID_PREFIX` (`OPI`,`TSF`),
  add `glossary`+`tech-surface`+`open-item` to `FILE_BACKED_TYPES` **and** `store.ts` `FOLDER`;
  export `DESCRIPTIVE_TYPES` and `NORMATIVE_TYPES` sets.
**Patterns to follow:** existing `ID_PREFIX`/`FILE_BACKED_TYPES`/`FOLDER` exhaustive-Record shape;
zod enum style in `baSessionStart.ts`.
**Test scenarios:**
- Happy: every previously-hardcoded union import resolves to the shared type; a recorded answer with
  `asked_round` in `{research, confirm}` round-trips through `recordDecision` and recomputes.
- Edge: `ID_PREFIX`, `FILE_BACKED_TYPES`, and `store.ts` `FOLDER` contain entries for every
  `ArtifactType` (exhaustive-map test — catches a missing new type, incl. the `FOLDER` Record).
- Edge: `glossary` becoming file-backed does not change behavior for any code that assumed it wasn't.
**Verification:** `tsc` passes; grep finds the mode/round/`Question.round` literals only in
`taxonomy.ts`; existing tests green.

- [x] **Unit 2: open-item store + idempotent identity**

**Goal:** CRUD and lifecycle for the unified open-item primitive.
**Requirements:** F1-R2/R3 (coverage topics, idempotent), F2-R3/R10 (observations, stable identity, upsert).
**Dependencies:** Unit 1.
**Files:**
- Create: `src/core/openItems.ts`
- Test: `tests/core/openItems.test.ts`
**Approach:**
- `createOrUpsertOpenItem`, `listOpenItems`, `transitionOpenItem` (open→answered/confirmed/
  corrected/rejected/retired). Identity key: coverage-topic = `topic`; observation = hash of
  `(anchor + claim)`. Re-declaring an existing key is a no-op (mirrors `baRecordAnswers` ref-dedup).
- Persist as `type:"open-item"` artifacts via existing `writeArtifact`; lean on the
  `[k:string]:unknown` frontmatter hatch for `kind`/`item_state`/`fact_kind`/`anchors`/`claim`/
  `provenance`.
**Patterns to follow:** `recordDecision`/`writeArtifact`/`nextId` in `decisions.ts`+`store.ts`+`ids.ts`.
**Test scenarios:**
- Happy: create a coverage-topic and an observation; `listOpenItems` returns both with correct kind.
- Edge: re-upsert same `(anchor+claim)` → no duplicate; retire an item → excluded from "open".
- Edge: a rejected observation re-emitted by a later run is **not** resurrected (stays rejected).
- Error: transition from a terminal state (rejected→open) is refused.
**Verification:** open-items round-trip to disk and recompute identically from disk.

- [x] **Unit 3: computeAssessment reads open-items + stability/vacuity fix**

**Goal:** Open-items gate stability; new modes don't fall into vacuous-stable.
**Requirements:** F1-R5/R5a/R7/R12, F2-R4 (gate visibility), fixes the vacuous-stability trap.
**Dependencies:** Units 1-2.
**Files:**
- Modify: `src/core/assessment.ts`, `src/core/questions.ts`, `src/core/gaps.ts`
- Test: `tests/core/assessment.test.ts` (extend), `tests/core/questions.test.ts`
**Approach:**
- **Restructure the `mode==="discovery" && decisions.length===0` short-circuit** (assessment.ts:19-21):
  it currently returns *only* `surfaceQuestions()`, so open-items would never surface during early
  discovery/ground. The branch must include open-item questions before computing `stable` (the
  surface round and floor/coverage/observation questions can coexist).
- **Partition consumers exhaustively**: every current consumer of the unfiltered `listArtifacts`
  result — `detectGaps(artifacts)`, `domainQuestions(artifacts)`, and the change-reval scan — must
  exclude `open-item`/`tech-surface`/`glossary`, the same way `type!=="decision"` is filtered today.
  Open-items are counted **in** `questions` but **out** of the artifact consumers (two opposite
  memberships in one function — make it explicit).
- Emit `Question`s for `item_state:open` open-items (floor + coverage + inferred observations,
  using the new `research`/`confirm` rounds) so `stable = questions===0 && gaps===0` holds.
- `floorQuestions()` (artifact-independent, topic `floor:<dim>`), `coverageQuestions(openItems)`,
  `observationQuestions(openItems)` — the latter owns surfacing **ground-mode** inferred observations
  as questions (so Unit 8's "open observations gate stability" depends on Unit 3, not Unit 6);
  `domainQuestions` keeps `artifactId#idx`.
- **Seeding is a write, `computeAssessment` is a pure read shared with `ba_status`.** Floor open-items
  must be seeded in the `ba_assess` write path (where session round is already written), never inside
  `computeAssessment` — `ba_status` must not create artifacts as a side effect of a status read.
**Execution note:** test-first — assert non-convergence and vacuity cases before wiring (this is the
class of bug the origin specs flag as only catchable across calls).
**Patterns to follow:** current round-selection + `answered`-set logic in `assessment.ts`/`questions.ts`.
**Test scenarios:**
- Happy: floor open-items present → `stable=false`; answer all floor + no plan → `stable=true`.
- Edge (vacuity): a `ground` session with zero real artifacts and open observations → `stable=false`
  (not vacuously true).
- Edge: an `open` coverage-topic keeps `stable=false`; retiring/answering it flips to true.
- Edge: floor topics keyed `floor:*` do **not** collide with existing `artifactId#idx` answers
  (back-compat: a previously-stable project stays stable).
- Integration: `ba_assess` and `ba_status` (both call `computeAssessment`) report identical stability.
**Verification:** convergence reachable; no open-item state leaves `stable` reported true.

- [ ] **Unit 4: provenance-extended ba_apply gate (fact≠requirement)**

**Goal:** Admit code-verified observation backing safely; preserve anti-assumption.
**Requirements:** F2-R4 (gate invariant, fact≠requirement), F1-R9 (drafts gated per-apply).
**Dependencies:** Units 1-2.
**Files:**
- Modify: `src/tools/baApply.ts`, `src/tools/baCreateArtifact.ts` (its **own** zod `type` enum at
  :9 must also gain `glossary`/`tech-surface` — `op:create` routes through it), `src/core/decisions.ts`
- Test: `tests/tools/baApply.test.ts` (extend)
**Approach:**
- Add `provenance` to recorded decisions/open-items. The gate must **resolve each `derived_from` id
  against both** the decision ledger (`listDecisions`) **and** open-items (`listOpenItems`) — today
  `ledger` only holds `type:"decision"` ids, so open-item ids are invisible. Accept `dec` if it is a
  ledger decision **or** an open-item `kind:observation` with (`fact_kind∈CLOSED_FACT_KINDS` or
  `item_state∈{confirmed,corrected}`). Reject `inferred`+`open`.
- Enforce **fact≠requirement**: if `type∈NORMATIVE_TYPES`, require ≥1 backing with provenance
  `user-decided` or `corrected` (NOT `code-verified`, NOT `confirmed-as-inferred`). Descriptive
  types may be backed by `code-verified`.
- Generalize `markApplied` (decisions.ts:52) to mark a decision **or** an open-item; **specify the
  lifecycle**: marking an open-item applied transitions its `item_state` so it **stops gating
  stability** (a CLOSED fact backing a descriptive artifact must not stay `open` forever).
- Add `glossary`/`tech-surface` to the `baApply` `type` enum and the `baCreateArtifact` enum.
**Execution note:** test-first on the gate invariant — it is the core safety property.
**Patterns to follow:** batch-atomic pre-flight validation already in `baApply.ts`.
**Test scenarios:**
- Happy: a `glossary` backed by an auto-acceptable fact observation applies (code-verified).
- Error: an `fr` backed only by a code-verified observation is **rejected** (fact≠requirement).
- Error: an `fr` backed only by a `confirmed-as-inferred` decision is **rejected** (needs deliberate).
- Error: any artifact backed by an `inferred`+`open` observation is rejected (same throw as
  unrecorded decision).
- Happy: an `fr` backed by a `corrected` (deliberate) decision applies.
- Edge: `derived_from.min(1)` still enforced; `markApplied` marks the open-item applied and flips it
  out of `open` so a re-`computeAssessment` no longer counts it.
- Integration (cross-call): assess→ground→apply→assess re-converges with the applied open-item no
  longer gating (the class of loop bug the origin specs warn about).
- Integration: batch atomicity — one bad backing rejects the whole batch (no partial writes).
**Verification:** no normative artifact reaches disk on code-verified-/confirmed-as-inferred-only
backing; descriptive ones do; applied open-items stop gating.

### Phase 2 — Flow 1 (Research + Deep Round)

- [ ] **Unit 5: the floor (rich, artifact-independent, topic-keyed)**

**Goal:** A broad baseline of floor open-items seeded at deep-round entry.
**Requirements:** F1-R5a/R5b/R6.
**Dependencies:** Units 1-3.
**Files:**
- Modify: `src/core/questions.ts` (floor source), `src/knowledge/` checklist (re-anchor to
  dimensions), `src/core/assessment.ts` (seed floor on entry)
- Test: `tests/core/floor.test.ts`
**Approach:**
- Re-anchor the domain checklist into **dimension** topics (`floor:scope`, `floor:users`,
  `floor:data`, `floor:states`, `floor:errors`, `floor:nfr`, `floor:constraints`, …) independent
  of artifacts; seed them as `open` coverage-topic open-items when the deep round opens.
- Floor-only is a legitimately complete result (R5b) — no agent plan required to finalize.
**Patterns to follow:** existing checklist loading (`loadDomainChecklist`) in `questions.ts`.
**Test scenarios:**
- Happy: entering the deep round with no agent plan seeds the full floor as open items.
- Edge: floor topics are artifact-independent (present even with zero artifacts).
- Edge: answering the whole floor with no plan → `stable=true` (floor-only is done).
- Edge: floor keys never match existing `artifactId#idx`/`artifactId` topics (back-compat).
**Verification:** floor-only discovery converges; floor survives an empty project.

- [ ] **Unit 6: ba_plan tool + research directive + deep-round assembly**

**Goal:** Agent declares/extends/retires a visible coverage plan; ba_assess emits the directive;
deep round = floor ∪ plan ∪ gaps.
**Requirements:** F1-R1/R2/R3/R4/R11.
**Dependencies:** Units 1-3, 5.
**Files:**
- Create: `src/tools/baPlan.ts`
- Modify: `src/tools/baAssess.ts` (research directive), `src/instructions.ts` (persona),
  `src/index.ts` (register tool)
- Test: `tests/tools/baPlan.test.ts`, `tests/tools/baAssess.test.ts` (extend)
**Approach:**
- `ba_plan` accepts a list of topics to declare (idempotent), extend, or retire → coverage-topic
  open-items (`open`). Plan is surfaced in `ba_assess`/`ba_status` output (R11 visibility) and the
  user can add/retire (server records either way).
- Convergence rule (R3): topics may be appended until the first deep-round answer; later topics
  seed the next round (do not block current finalize). Encode via item creation timing /
  `item_state`, not a blocking gate.
- **Termination backstop:** because an agent could keep seeding one new topic per round, the
  guaranteed convergence path is the floor-only off-ramp — **finalize is always reachable from
  floor-only** (R5b), regardless of plan state. Coverage topics only *gate* stability while open;
  the off-ramp (Unit 7) lets the user finalize past the floor even if the agent keeps appending.
  This is the monotonic guarantee: the floor is finite and answerable; the plan is optional depth.
- `ba_assess` (discovery, after surface answers, before plan declared) emits a **research
  directive** string; persona instructions tell the agent to research then call `ba_plan`.
**Patterns to follow:** tool-registration in `index.ts`; directive-as-tool-output (server never
talks to the user) per `instructions.ts`.
**Test scenarios:**
- Happy: declare 3 topics → 3 open coverage-items; `ba_assess` lists them; answering all + floor → stable.
- Edge: re-declare an existing topic → idempotent (no duplicate).
- Edge: retire a topic → removed from open set; user-added topic recorded same as agent-added.
- Edge: appending a topic after the first answer seeds next round, doesn't block finalize.
- Integration: surface→research transition — after surface answers recorded, `ba_assess` emits the
  research directive (not the domain round) and is not vacuously stable.
**Verification:** the deep round is the union set; plan is visible and steerable; converges.

- [ ] **Unit 7: ba_finalize + soft off-ramp**

**Goal:** Promote drafts to review-ready; offer "good enough" stop past the floor.
**Requirements:** F1-R9/R10/R12.
**Dependencies:** Units 3-6.
**Files:**
- Create: `src/tools/baFinalize.ts`
- Modify: `src/tools/baStatus.ts` (off-ramp signal), `src/index.ts`
- Test: `tests/tools/baFinalize.test.ts`
**Approach:**
- `ba_finalize` batch-promotes `draft` non-decision artifacts to `reviewed` (existing Status value;
  fewest-mechanisms path). Idempotent and repeatable after the Phase B change loop re-opens work.
- `ba_status` surfaces an off-ramp once the floor is fully answered ("essentials covered — finalize
  or continue?"), driven deterministically from open-item state.
**Patterns to follow:** `baUpdateArtifact` status promotion; `baStatus` computed output.
**Test scenarios:**
- Happy: with floor+plan answered, finalize promotes all drafts to `reviewed`.
- Edge: off-ramp appears only after the floor is answered, not before.
- Edge: finalize is idempotent (second call is a no-op); re-runs after a change-loop re-open.
- Error: finalize while an `inferred`+`open` observation or open floor topic remains is refused
  (or clearly reports not-yet-stable).
**Verification:** a clean "here are your docs" promotion; repeatable across change cycles.

### Phase 3 — Flow 2 (ba_ground Bootstrap)

- [ ] **Unit 8: ba_ground tool + observation extraction + fact re-verification**

**Goal:** New `ground` mode; record agent-supplied observations; auto-accept verifiable facts,
route inferences to confirmation.
**Requirements:** F2-R1/R2/R3/R4/R10.
**Dependencies:** Units 1-4.
**Files:**
- Create: `src/tools/baGround.ts`, `src/core/ground.ts`
- Modify: `src/tools/baSessionStart.ts` (`ground` mode **and** a user-supplied read-scope param
  persisted to session), `src/core/session.ts` (session carries the scope), `src/core/assessment.ts`
  (ground→confirm→what-now sequencing), `src/instructions.ts`, `src/index.ts`
- Test: `tests/tools/baGround.test.ts`, `tests/core/ground.test.ts`
**Approach:**
- `ba_ground` records observations the host agent supplies (server cannot read code). For each:
  classify by `fact_kind`; **auto-accept only if `fact_kind∈CLOSED_FACT_KINDS`** (the
  server-checkable subset — `entity-exists`, `dependency-present`) **and the server re-verifies the
  anchor resolves + is in scope.** Route/middleware/config-key claims and everything else →
  `inferred` + `open` (fail-safe). Note: anchor-resolves proves existence, not arbitrary claim truth
  — that's why only existence-class facts auto-accept.
- **Scope comes from `ba_session_start` (user turn)**, not a free per-call agent argument, so the
  agent can't widen it (see Unit 9). `ba_ground` reads the session scope.
- Idempotent upsert by `(anchor+claim)` (Unit 2). When an observation conflicts with an
  already-confirmed point, it routes to **change mode** — and because `supersede()` requires a
  `type:"decision"` artifact (decisions.ts:63), the confirmed point must already be a recorded
  decision before supersede is called. Resume skips confirmed/auto-accepted observations.
**Execution note:** test-first on the fail-safe classification + re-verification (safety boundary).
**Patterns to follow:** tool I/O + `resolveConfig` rooting; Unit 2 upsert.
**Test scenarios:**
- Happy: an `entity-exists` observation with a resolving anchor is auto-accepted; an `inferred` one
  stays `open`.
- Edge: a `route-exists` observation is **not** auto-accepted (enters `inferred`+`open`) — its claim
  isn't anchor-existence and the server can't parse routes.
- Edge (fail-safe): an observation labeled `entity-exists` whose anchor does **not** resolve is
  downgraded to `inferred` (mislabel fails toward confirmation).
- Edge: a claim class outside the auto-acceptable set is treated as inferred regardless of agent label.
- Edge: re-run after code change upserts (no duplicate); a confirmed-then-conflicting observation
  routes to change mode (the confirmed point exists as a decision so `supersede` doesn't throw).
- Integration: `ground` session is not vacuously stable; open inferred observations gate stability.
**Verification:** facts auto-accept only for existence-class, server-re-verified claims; everything
else requires confirmation.

- [ ] **Unit 9: server-enforced security boundary**

**Goal:** Make the read boundary structural where the server can, on the boundary it owns.
**Requirements:** F2-R1/R11; threat-model items.
**Dependencies:** Unit 8.
**Files:**
- Create: `src/core/scopeGuard.ts`
- Modify: `src/core/ground.ts` (apply guards **at the core layer** — see below), `src/config.ts`
  (docsRoot containment via realpath), `src/instructions.ts` (persona: pre-read deny-list +
  never put literal secret values in observation bodies), `src/tools/baInit.ts` (gitignore the
  open-item store)
- Test: `tests/core/scopeGuard.test.ts`
**What the server can vs can't enforce (load-bearing framing):** the *host agent* performs the
actual file reads, so the server **cannot prevent a secret from being read** — by the time it sees
an anchor, the file is already in the agent's context. The server's guards are **persistence and
boundary** controls, not read controls. The pre-read boundary is (a) the host agent's tool
permissions / MCP process file permissions, and (b) persona instructions telling the agent not to
read deny-listed paths. State this honestly; do not over-claim "prevents exfiltration".
**Approach:**
- **Core-layer enforcement** (`scopeGuard.ts`, called inside `ground.ts`, not only the tool) so no
  future caller can bypass it: every observation anchor is `realpath`-canonicalized and must stay
  inside the **session-declared** scope (defeats `../` and symlink escape — realpath, not logical
  prefix). Scope comes from `ba_session_start` (Unit 8), not a per-call agent arg.
- Default **deny-list** excludes paths from anchors — broaden beyond dotfiles to CI/secret-adjacent
  files: `*.env`, `*.pem`, `*.key`, `*secret*`, `*credential*`, `.git/`, `.github/workflows/`,
  `Makefile`, `docker-compose*.yml`, `*.tfstate`. Make it **user-extensible** (project-specific
  secret paths). Deny-list is the **primary** defense; persona instructions mirror it pre-read.
- **Best-effort** body secret-regex as defense-in-depth — explicitly *not* a guarantee (high
  false-negative rate); the load-bearing guarantee is the path deny-list + realpath scope.
- `resolveConfig`: assert the **realpath** of `docsRoot` stays within `projectRoot` (defeats a
  symlinked or `_config.yml`-overridden docsRoot pointing at `~/.ssh`). Note `_config.yml` is
  written by the server's own tools (trust perimeter) but the agent can write it via `ba_apply`/
  `ba_init`, so this guards the server against being redirected.
- `ba_init` adds the open-item store path to `.gitignore` (or document it as intentionally tracked
  and that the regex must be maintained) so a missed secret isn't committed.
- Anchors are **structural path references** (path + line/symbol), never content snapshots — so a
  later secret rotation doesn't leave a value in git (only a path).
**Threat model (resolved here, was a deferred brainstorm item):** top exploits — (1) prompt-injection
in source content directs the agent to `ba_ground` a broad scope and pack secrets into observation
bodies → mitigated by user-supplied scope + deny-list + best-effort regex (residual: agent context
still saw it); (2) `../`/symlink anchor escape → realpath scope check; (3) `_config.yml` docsRoot
override → realpath containment. Confirm the MCP process's file permissions bound the blast radius.
**Execution note:** test-first; security-critical.
**Patterns to follow:** `realpathSync` already used in `src/index.ts:2`.
**Test scenarios:**
- Error: an anchor with `../` escaping the session scope is rejected (tested by calling `scopeGuard`/
  `ground` directly, not only via the tool — proves core-layer enforcement can't be bypassed).
- Error: a symlink whose realpath escapes scope is rejected (realpath, not logical path).
- Error: a deny-listed path (`.env`, `id_rsa`, `.github/workflows/ci.yml`) is excluded from anchors.
- Edge: a user-added deny-list entry (e.g. `config/credentials.yml`) is honored.
- Error: a `docsRoot` whose realpath is outside `projectRoot` (absolute or symlinked) is rejected.
- Happy: an in-scope, non-deny-listed source path is accepted and appears in the read manifest.
**Verification:** no anchor escapes scope; deny-listed paths never anchored; docsRoot realpath
contained; the body-regex is documented as best-effort, not a guarantee.

- [ ] **Unit 10: confirmation round + passive-assent guard + as-is materialization**

**Goal:** Confirm inferences via the Flow 1 engine; tag passive assent; materialize descriptive
as-is drafts.
**Requirements:** F2-R5/R6/R7/R13.
**Dependencies:** Units 3-4, 6, 8.
**Files:**
- Modify: `src/tools/baRecordAnswers.ts` (confirm/correct/reject → decision; provenance +
  passive-assent), `src/tools/baApply.ts` (descriptive as-is from observations), `src/instructions.ts`
- Test: `tests/tools/baRecordAnswers.test.ts` (extend), `tests/integration/flow2.test.ts`
**Approach:**
- Inferred observations surface as MCQ via the deep-round engine (Unit 3 `observationQuestions` +
  Unit 6 round assembly) with the soft off-ramp. Confirm/correct/reject **records a decision**
  (so Phase B `supersede`, which needs a `type:"decision"` artifact, can mark the inference
  obsolete). Correct/reject are first-class.
- Passive-assent guard (R13): a deliberate single confirm → provenance `user-decided`; an
  uncorrected **bulk/rapid** confirm → `confirmed-as-inferred`. **This provenance is load-bearing**:
  per Unit 4, `confirmed-as-inferred` does **not** satisfy the normative ≥1-backing requirement, so
  a bulk-confirmed inference cannot back an FR/NFR without a deliberate re-confirm. (The exact
  bulk/rapid heuristic — a `batch:true` flag or N-uncorrected-in-a-row — is a tuning detail; the
  *consequence* above is the specified safety property.)
- Descriptive as-is docs (`glossary`/`tech-surface`) materialize as `draft` backed by auto-accepted
  fact observations (Unit 4 gate).
**Patterns to follow:** existing `baRecordAnswers` ref-dedup + record path; Phase B `supersede`.
**Test scenarios:**
- Happy: deliberately confirm an inferred observation → `user-decided` decision; an FR derived from
  it can finalize.
- Happy: correct an inference → corrected text recorded verbatim (`corrected` provenance), supersedes
  the inference (which is a recorded decision, so supersede doesn't throw).
- Edge: bulk-confirm N uncorrected inferences → each `confirmed-as-inferred`; an FR backed only by
  one is **rejected** by `ba_apply` (the guard actually bites).
- Edge: reject an inference → no artifact backed by it; not resurrected on re-run.
- Integration (full Flow 2): `ba_ground` → auto-accept entity/dependency facts → confirm inferred
  routes/middleware → finalize → `ba_status` stable; no normative artifact rests on
  code-verified-/confirmed-as-inferred-only backing.
**Verification:** end-to-end Flow 2 produces a confirmed as-is baseline that converges and finalizes;
the passive-assent tag demonstrably blocks a bulk-confirmed inference from backing a requirement.

## System-Wide Impact

- **Interaction graph:** `computeAssessment` is shared by `ba_assess` and `ba_status` — Unit 3
  changes both at once (intended). New tools register in `src/index.ts`.
- **Error propagation:** the gate (Unit 4) throws batch-atomically; security guards (Unit 9)
  reject before any persistence.
- **State lifecycle risks:** open-item state must recompute from disk (never cache in session);
  obsolete/rejected items must not count as coverage; supersede stays append-only.
- **API surface parity:** the mode/round taxonomy change (Unit 1) touches every enum site — the
  exhaustive-map test guards against a missed one.
- **Unchanged invariants:** the anti-assumption gate still rejects unrecorded backing; `Status`
  values unchanged; Phase A/B discovery/change/stabilize behavior preserved (new modes are additive).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Mode/round union change misses a site (incl. `Question.round`, `store.ts` `FOLDER`) → compile/runtime reject | Centralize in `taxonomy.ts` (Unit 1) + exhaustive-map test over `ArtifactType` |
| Open-items pollute artifact gap/question logic | Partition them out of **every** `listArtifacts` consumer (detectGaps, domainQuestions, change-reval) — Unit 3; exhaustive test |
| Agent mislabels inference as fact → assumption smuggled in | Auto-accept only existence-class facts the server can re-verify (entity/dependency); route/middleware/config-key → inferred; fail-safe default (Units 4, 8) |
| Code-verified or bulk-confirmed backing laundered into a normative requirement | Normative gate accepts only deliberate `user-decided`/`corrected`; `code-verified` + `confirmed-as-inferred` excluded; descriptive types carry no normative authority (Unit 4) |
| Agent reads a secret before the server sees the anchor | Server guards are **persistence/boundary only** — pre-read boundary is host tool-permissions + persona deny-list; documented honestly, not over-claimed (Unit 9) |
| Prompt-injected scope expansion / `_config.yml` docsRoot override | User-supplied scope (not agent per-call) + realpath scope check + realpath docsRoot containment + broadened, user-extensible deny-list (Units 8, 9) |
| New mode vacuously stable (the origin's known trap) | Restructure the `decisions.length===0` short-circuit; floor + open observations gate stability; explicit vacuity tests (Units 3, 8) |
| Re-anchoring floor re-opens existing answered projects | `floor:*` namespace disjoint from existing topic keys; back-compat test (Units 3, 5) |
| Coverage plan never converges (agent keeps seeding) | Floor-only finalize is always reachable (termination backstop, Units 6, 7) |
| Applied open-item keeps gating stability forever | `markApplied` transitions item out of `open`; cross-call re-convergence test (Unit 4) |
| `ba_status` (pure read) accidentally seeds/writes | Floor seeding lives in the `ba_assess` write path only (Unit 3) |
| Flow 2 depends on unbuilt Flow 1 surfaces | Sequenced: Phase 1 spine → Phase 2 Flow 1 → Phase 3 Flow 2 |

## Documentation / Operational Notes

- Update `src/instructions.ts` persona for: research directive + `ba_plan`, the off-ramp, ground
  mode, fact-vs-inference classification, and confirm/correct/reject.
- Update `README.md` tool list (adds `ba_ground`, `ba_plan`, `ba_finalize`) and bump to 0.4.0.
- Publishing (deprecate old versions, ship 0.4.0) is a separate task needing the user's npm OTP.

## Sources & References

- **Origin (Flow 1):** [flow1 requirements](docs/brainstorms/2026-06-30-flow1-research-deep-round-requirements.md)
- **Origin (Flow 2):** [flow2 requirements](docs/brainstorms/2026-06-30-flow2-ba-ground-bootstrap-requirements.md)
- **Ideation:** [two-flow ideation](docs/ideation/2026-06-30-two-flow-outcome-ideation.md)
- Code surfaces: `src/core/{assessment,questions,decisions,gaps,session,store,types,ids}.ts`,
  `src/tools/{baApply,baSessionStart,baRecordAnswers,baStatus}.ts`, `src/config.ts`, `src/index.ts`.
