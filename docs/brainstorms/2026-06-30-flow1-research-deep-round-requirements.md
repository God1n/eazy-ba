---
date: 2026-06-30
topic: flow1-research-deep-round
---

# Flow 1 — Research + Adaptive Deep-Round Engine

## Problem Frame

eazy-ba's greenfield flow (discovery mode) is meant to behave like a real Business
Analyst: the user tells a surface story, answers a surface round, then the AI
**researches the domain** and runs a long, tailored Q&A covering every decision
before documents are finalized.

Today only the skeleton exists. The surface round is a **fixed question bank** that
ignores the told story (`surfaceQuestions()` in `src/core/questions.ts` takes no
input), and the "deep" round is a **static checklist × existing artifacts** cartesian
product (`domainQuestions`), which is neither research-driven nor tailored — and it
can only key off artifacts that already exist. There is no research step at all.

The goal: insert a genuine **research + adaptive deep round** that takes the story +
surface answers, lets the host agent research the domain openly, and generates a long
tailored MCQ round — while preserving the two things that make eazy-ba what it is: the
**anti-assumption gate** (only recorded answers materialize docs) and **"it knows when
to stop"** (deterministic, disk-recomputed stability).

## Key Architectural Constraint (load-bearing)

The eazy-ba **server never talks to the user and cannot browse**. "The AI researches
the domain" therefore means: the **host agent (Claude) researches and generates the
questions**; the server's job is to (a) frame what must be covered, (b) record the
agent's coverage plan and answers on disk, and (c) enforce the anti-assumption gate and
compute stability. This matches the existing "server scaffolds + persona instructions +
host agent talks" pattern.

**Enforceability boundary (load-bearing):** the server cannot verify that research
actually happened or was good — "research-driven" is a **best-effort persona contract**,
not a server-enforced invariant. The only thing the server can *hard*-guarantee is the
**floor**. Therefore the floor must be the real safety net, and "stable" must be
unreachable until the floor is answered — otherwise an agent that skips research and
declares an empty plan would converge instantly (today `computeAssessment` derives
stability from existing artifacts, so an empty project is *vacuously* stable).

## Requirements

**Research + Coverage Plan**
- R1. After the surface round's answers are recorded, `ba_assess` (discovery mode)
  emits a **research directive** — the server's *goal frame* telling the host agent to
  research the domain (open-ended — method is the agent's choice) and submit a coverage
  plan. The directive is a request; R2 is the agent's response. (The directive is
  advisory: see the Enforceability boundary — the server cannot force research.)
- R2. The host agent declares a **coverage plan**: a list of domain topics it intends
  to settle, derived from its research + the story + surface answers. The plan is
  **persisted on disk** as first-class **open coverage items** with an
  `open → answered` lifecycle, so it survives across calls and is recomputed from disk.
  Topic declaration is **idempotent** — re-declaring the same topic does not create a
  duplicate open item (mirrors `ba_record_answers` ref-dedup).
- R3. The coverage plan is **extensible but must converge**: the agent may add topics
  while the deep round is open, but appends must not prevent termination. Default rule
  (planning may refine): topics may be appended until the **first deep-round answer is
  recorded**; topics surfaced later seed the *next* round rather than blocking the
  current finalize. Existing items are never silently dropped, and the agent may
  explicitly **retire** a topic it deems irrelevant so stability is always reachable.
- R4. Coverage topics are **not assumptions** and never materialize a document on their
  own. They represent "questions still to ask." Only recorded *answers* drive `ba_apply`.

**Deep Round & Convergence ("floor + agent plan")**
- R5. The deep round's open questions = the union of: (a) the **floor** (R5a), (b) the
  **agent-declared coverage topics** (R2), and (c) **structural gaps** — restricted to
  those not yet answered. "Structural gaps" = the existing `detectGaps()` output
  (`fr-without-story`, `story-without-acceptance-criteria`, `untraced-artifact`,
  `dangling-link`); no new gap mechanism is introduced.
- R5a. The **floor** is a fixed baseline set of domain-dimension topics that are **open
  by construction at deep-round entry**, independent of whether any artifacts exist yet
  and independent of the agent's submission. This is the only server-enforced coverage
  guarantee; an empty or absent agent plan therefore cannot yield instant "done".
- R5b. The floor must be **rich and broad** — a genuine BA baseline (scope, users,
  data, states, error/edge handling, NFR dimensions, constraints, etc.), not a thin
  stub. A floor-only outcome (agent did little/no research) must still be a *legitimately
  acceptable* document set; agent-researched topics add depth on top. This removes the
  "is research mandatory" tension: research is bonus, the floor is sufficient.
- R6. The floor must be **anchored to domain-dimension / decision topics**, not to
  artifacts, because the deep round runs before artifacts solidify. Re-anchoring **must
  not re-open already-answered decisions** from existing v0.3.0 projects: floor topic
  keys must be namespaced disjoint from change-mode's `topic === artifactId` convention,
  with a stated migration/dual-keying strategy. (R6 is plan-critical — it gates R5.)
- R7. The deep round is **"done" only when all of** the floor, the agent's *current*
  declared plan, and structural gaps are answered/closed. Stability is **recomputed from
  disk after each plan declaration** (extend `computeAssessment`), and `computeAssessment`
  must read the persisted coverage plan + floor, not only artifacts/decisions.
- R8. Questions render as MCQ (3–5 options + "describe your own"), one-at-a-time and
  adaptive — unchanged from the current questioning model. The user's pick is stored
  verbatim; options remain presentation-only.

**Coverage Plan Visibility & Round Budget**
- R11. The coverage plan is **surfaced to the user** (relayed by the host agent): the
  user can see the topics the AI intends to settle — i.e. what "done" is gated on — and
  may **add or retire topics** themselves. Convergence is a visible, user-steerable
  trust feature, not a hidden dependency. (The user's added/retired topics flow through
  the same record→gate path; nothing materializes without recorded answers.)
- R12. The deep round has a **soft "good enough" off-ramp**: once the floor (R5a/R5b) is
  fully answered, `ba_status` / `ba_assess` offer the user the choice to **finalize now
  or keep going** through remaining agent/research topics. A large domain never becomes a
  forced endless interrogation; rigor is available but not mandatory past the baseline.

**Document Lifecycle (draft incrementally, finalize at end)**
- R9. As deep-round answers are recorded, `ba_apply` materializes/refines documents
  **incrementally using the existing `draft` status** via repeated `ba_apply` calls —
  no new lifecycle state is needed. Because `ba_apply` validates every artifact against
  recorded decisions on *each* call, the anti-assumption gate applies to drafts too: a
  draft can only contain content traceable to recorded answers.
- R10. When the deep round reaches "done" (R7), a **finalize step** promotes the draft
  set to review-ready status — the clean "here are your documents, review them" moment.
  Finalize is **idempotent and repeatable**: after the Phase B change loop re-opens
  artifacts, the deep round re-converges and finalize promotes again. (Implementation —
  new tool vs. status transition vs. status-driven promotion — is deferred; prefer the
  path touching the fewest existing mechanisms.)

## Success Criteria
- Running discovery on a product the static checklist never anticipated still produces
  domain-specific questions when the agent researches (evidence the round *can* be
  research-driven, not only bank-driven). Note: this is a best-effort outcome, not a
  server-enforced invariant — see the Enforceability boundary.
- The surface story and surface answers demonstrably influence the deep-round questions
  (bounded by surface-answer quality — see Scope Boundaries).
- `ba_status` reports "stable" only after floor + agent plan + structural gaps are all
  satisfied — and never reports stable with an open coverage topic outstanding, and
  never before the floor is answered (even with an empty agent plan).
- Every finalized document still traces to recorded decisions (anti-assumption gate
  holds on every `ba_apply`, drafts included; no artifact cites an unrecorded decision).
- A user can reach a finalized, review-ready document set in one continuous loop without
  the agent inventing answers.

## Scope Boundaries
- **Flow 2 (bootstrap a running project → as-is docs / `ba_ground`)** is the *next*
  brainstorm in sequence, not part of this one.
- No change to the change/stabilize modes beyond what convergence (R7) requires.
- Not building market/competitor data sources into the server — research is the host
  agent's responsibility, not a server capability.
- No new client-side UI; everything flows through tool I/O + persona instructions.
- Tailoring the *surface* round to the story is out of scope here (deep round is the
  prize); may be revisited later. **Known limiter:** deep-round quality is bounded by
  surface-answer quality, and surface answers still come from the untailored, story-
  agnostic bank — accepted as good-enough to seed research in this phase.
- Ranking/ordering the merged question set is out of scope for this pass; accept any
  deterministic order (e.g. floor first, then coverage topics in insertion order).
  Ranked question budget is deferred to a later iteration (ideation idea #6).

## Key Decisions
- **Research is open-ended and agent-driven**: give the agent the goal (cover the whole
  domain), not a prescribed method. Rationale: user wants maximal BA intelligence; the
  server can't research anyway.
- **Convergence = floor + agent plan (both)**: static checklist guarantees a baseline
  even if research is thin; agent plan adds tailored depth; "done" requires both.
  Rationale: keeps coverage strong *and* deterministic; preserves "knows when to stop."
- **Rich floor, research = bonus** (resolves "is research mandatory?"): invest in a broad
  baseline so floor-only is a legitimate result; research adds depth, not a pass/fail
  gate. Rationale: keeps the "real BA" promise honest without making it unenforceable.
- **Coverage plan is user-visible & steerable** (R11): the user sees and can edit the
  topic set that gates convergence. Rationale: trust — "done" shouldn't be gated on a
  plan the user can't see.
- **Soft "good enough" off-ramp** (R12): past the floor, finalizing is the user's call.
  Rationale: a solo user's time is the budget; avoid forced endless interrogation.
- **Coverage plan is recorded on disk**, not session-memory: required for the
  deterministic, disk-recomputed stability check to gate on it.
- **Draft incrementally, finalize at end**: fits the existing `status` lifecycle
  (`draft → approved`), preserves context during rounds, and still gives a clean review
  moment. Rationale: best of incremental + batch.
- **Rejected — saturation detection** (let coverage emerge, stop when no new topics
  surface): less auditable and non-deterministic; conflicts with the "floor + plan"
  choice.
- **Standing cost acknowledged**: the coverage plan is a new persisted abstraction that
  must stay consistent with the change loop, finalize, and disk-recompute *forever*.
  Accepted deliberately because the floor-only baseline (existing `domainQuestions`) is
  too weak to deliver the "real BA" outcome; the form (new type vs. ledger entry vs.
  session state) is deferred, but the carrying cost is taken on knowingly.

## Dependencies / Assumptions
- Builds on Phase A's loop + decision ledger and Phase B's change intake (both shipped,
  v0.3.0). Feedback after finalize re-enters through the existing change loop.
- Assumes the MCQ questioning model (3–5 options + escape, one-at-a-time) from the MCQ
  design spec is the intended rendering for the deep round.

## Outstanding Questions

### Resolve Before Planning
- *(none — core product decisions are resolved above.)*

### Deferred to Planning
- [Affects R2][Technical] How are open coverage items represented on disk — a new
  artifact type (e.g. `coverage-topic`), an extension to session state, or a new entry
  kind in the decisions ledger? Must be recomputable from disk and gate stability.
  Note: `computeAssessment` today reads only `listArtifacts` + `listDecisions`; whatever
  representation is chosen must be visible to it (session-only state would be invisible).
- [Affects R1/R7][Technical] What disk state distinguishes the new phases so resume is
  deterministic — "surface answered, research directive issued, awaiting plan" vs "deep
  round in progress" vs "finalized"? Today the only round trigger is
  `decisions.length === 0`, so the first recorded surface answer permanently exits the
  surface round; a crash between directive and plan submission must not re-emit surface.
- [Affects R2/R3][Technical] Introducing research/coverage phases extends the round
  taxonomy (`"surface" | "domain" | "gap" | "change"`), which is duplicated across
  `session.ts`, `assessment.ts`, `decisions.ts`, and the zod `asked_round` enums in
  `baRecordAnswers.ts` / `baApply.ts`. Decide whether coverage answers reuse
  `asked_round: "domain"` or get a new value; all enums must agree.
- [Affects R1/R2][Technical] What tool surface captures the agent's coverage plan — a
  new tool (e.g. `ba_plan`), an extension to `ba_record_answers`, or a field on
  `ba_assess`'s response/return path? (Server never initiates; agent must submit.)
- [Affects R6][Technical] How to re-anchor the baseline checklist from
  `artifactId#dimIndex` to domain-dimension/topic keys without breaking the existing
  domain-question coverage logic and change-mode re-validation.
- [Affects R10][Technical] What exactly does "finalize" do — a new `ba_finalize` tool, a
  status transition in `ba_apply`, or a `ba_status`-driven promotion? How does it
  interact with the existing `draft/approved/implemented` statuses.
- [Affects R5][Needs research] Ordering/ranking of the merged open-question set (floor ∪
  plan ∪ gaps) so the long round isn't a flat firehose — relates to ideation idea #6
  (ranked question budget).

## Next Steps
-> Resolve-Before-Planning is empty. `-> /ce:plan` for structured implementation
planning of the Flow 1 research + deep-round engine, then proceed to the Flow 2
(`ba_ground`) brainstorm as agreed.
