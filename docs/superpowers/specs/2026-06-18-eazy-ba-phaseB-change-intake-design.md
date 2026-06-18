# eazy-ba Phase B (Change Intake & Impact) — Design Spec

**Date:** 2026-06-18
**Status:** Approved for planning
**Builds on:** Phase A interrogative loop (0.2.0, merged, unpublished)

## Summary

Phase B adds **Situation 2** to the interrogative loop: a client describes a
change mid-project, and the BA assesses its **impact** (blast radius),
**feasibility** (conflicts with committed work), and **consequences**
(confirm-before-commit), asks follow-up questions to fill the gaps the change
opens, records the change as a decision that **supersedes** the ones it
replaces, and updates the affected documents.

The loop shape is unchanged (assess → ask → record → apply); change mode just
enters it with an impact step in front. One new tool (`ba_impact`), one new
pure core module (`impact.ts`), and small additive extensions to existing
tools/modules.

This ships together with the (still-unpublished) Phase A work as **0.3.0**.

## Goals

- A `change` session mode that, given the artifacts/decisions a free-text change
  touches, computes a deterministic blast radius, flags feasibility conflicts,
  rates severity, and surfaces consequences for the client to confirm before
  anything is committed.
- Changes are recorded as first-class decisions that **supersede** the decisions
  they replace, preserving the audit trail (what changed, why, when).
- A changed artifact correctly re-surfaces as needing answers (its superseding
  decision obsoletes the old coverage) and the loop re-converges to stable.

## Non-Goals (Phase B)

- No probability/risk *score* — severity is a deterministic `low|medium|high`
  read from the blast radius, not a fabricated number.
- No automatic content rewriting — the agent authors the updated artifact
  content from the recorded change decision; `ba_apply`'s anti-assumption gate
  is unchanged.
- Lint, visualization, codebase grounding remain Phase C.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| "Probabilities" | Blast-radius severity + consequences-to-confirm (A+B), no score | A real BA shows consequences before committing; a number would be false precision |
| Superseded decisions | Supersede-with-link (new decision `supersedes`; old → `obsolete` + `superseded_by`) | Preserves the audit trail; makes "why did this change" reconstructable |
| Workflow | New `mode: "change"` + dedicated `ba_impact` tool; reuse record/apply | Explicit, testable analysis; slots into the existing loop |

## Tool Surface & Change Flow

Flow: `ba_session_start(mode: "change")` → agent locates the change's target
id(s) via existing `ba_get`/`ba_list` → `ba_impact(targets)` → agent presents
consequences and asks the follow-ups → `ba_record_answers(... supersedes)` →
`ba_apply` (op: update on affected artifacts) → `ba_assess`/`ba_status` to
confirm re-convergence.

- **`ba_session_start`** — add `mode: "change"`. New change session starts at
  `round: "change"`.
- **`ba_impact({ projectRoot, targets: string[] })`** — NEW. Targets are
  decision and/or artifact ids the agent identified from the client's free-text
  change. Returns (creates nothing):
  - `blastRadius`: deduped downstream artifacts + decisions affected, via the
    dependency graph.
  - `conflicts`: affected artifacts with `status` of `approved` or
    `implemented` (committed work reopened), plus the target decisions
    (contradicted).
  - `severity`: `high` if any `implemented` artifact is affected; `medium` if any
    `approved` artifact is affected or the radius is large (≥ 5 affected); else
    `low`.
  - `consequences`: human-readable summary for confirm-before-commit.
  - `questions`: follow-ups for gaps the change opens (`round: "change"`).
- **`ba_record_answers`** — items gain optional `supersedes: string[]`.
  Recording an item with `supersedes` records the new change decision
  (`asked_round: "change"`, `supersedes: [...]`) and marks each superseded
  decision `status: "obsolete"` + `superseded_by: <new id>`.
- **`ba_apply`** — unchanged mechanics. The agent issues `op: "update"` specs for
  affected artifacts, citing the new change decision in `derived_from`
  (additive, so lineage shows original + change). Re-version + changelog via the
  existing `baUpdateArtifact` path.

## Data Model Changes (additive)

Decision frontmatter (carried via the existing index signature):

```yaml
asked_round: change          # surface | domain | gap | change
supersedes: [DEC-014]        # on the new change decision
superseded_by: DEC-031       # stamped onto the superseded decision
status: obsolete             # superseded decision flipped from "approved"
```

- No new artifact type, no new folders. Superseded decisions stay on disk
  (obsolete, linked) for the audit trail.
- Artifacts: no schema change; `op: update` extends `derived_from` to the change
  decision and bumps version through the existing path.

## Impact Computation (`src/core/impact.ts`)

Pure module over parsed artifacts + decisions (mirrors `gaps.ts`):

- `interface Impact { blastRadius: { artifacts: string[]; decisions: string[] }; conflicts: { reopened: string[]; contradicted: string[] }; severity: "low" | "medium" | "high" }`
- `function buildImpact(targets: string[], artifacts: Artifact[], decisions: Frontmatter[]): Impact`
- **Blast radius:** transitive closure from each target. A decision target seeds
  its `informs` artifacts; an artifact target seeds itself. Walk reverse
  `derived_from` (decision→artifacts) and `implements`/`satisfies`/`refines`
  edges to collect dependents. Dedup; exclude `obsolete` decisions.
- **Conflicts:** `reopened` = affected artifacts with `status` `approved` or
  `implemented`; `contradicted` = target ids that are decisions.
- **Severity:** `high` if any reopened artifact is `implemented`; `medium` if any
  reopened is `approved` or total affected ≥ 5; else `low`.

## Convergence Interaction

Because `ba_assess` keys domain coverage on decision `topic`, and a change
supersedes (obsoletes) a decision, **`obsolete` decisions must NOT count as
coverage**. `gaps.ts`, `questions.ts` (`domainQuestions`), and
`assessment.ts` will filter decisions to non-obsolete when computing answered
coverage. This makes a changed artifact correctly re-surface as needing answers
until its change decision is recorded, and lets the loop re-converge to stable.

## Architecture

- New: `src/core/impact.ts` (pure), `src/tools/baImpact.ts`.
- Extend: `src/tools/baSessionStart.ts` (`change` mode), `src/tools/baRecordAnswers.ts`
  (`supersedes`), `src/core/decisions.ts` (`supersede(oldId, newId, docsRoot)`
  helper: sets `status: obsolete` + `superseded_by`), `src/core/assessment.ts` +
  `src/core/questions.ts` + `src/core/gaps.ts` (exclude obsolete decisions from
  coverage), `src/index.ts` (register `ba_impact`), `src/instructions.ts`
  (describe change mode), version → `0.3.0`.
- Each new/changed unit stays pure where possible and independently testable,
  consistent with Phases 1 and A.

## Error Handling

- zod validation on every tool input; `ba_impact` errors clearly if a target id
  does not exist.
- `ba_record_answers` errors if a `supersedes` id is not an existing decision.
- Recording with `supersedes` is idempotent with the existing `ref` dedup.
- Tolerant reads / safe writes carry over.

## Testing Strategy

- Vitest, TDD throughout.
- Unit: `impact.ts` (blast radius across the graph; each severity tier;
  conflict detection for approved/implemented); `decisions.supersede` (obsolete
  + `superseded_by` set, audit link both directions); coverage exclusion of
  obsolete decisions in `assessment`/`questions`/`gaps`.
- Integration: discover a small project → `change` session → `ba_impact` returns
  the correct blast radius + severity + conflicts → record a superseding change
  answer → `ba_apply` updates the affected artifact and the old decision becomes
  `obsolete` with `superseded_by` → `ba_assess` re-surfaces the changed artifact,
  then converges to stable after the change is applied.

## Release

Ships Phase A + Phase B together as **eazy-ba 0.3.0** (Phase A was merged but
never published). After merge: `npm publish` (user OTP) + deprecate `<0.3.0` if
any older versions exist (0.1.0/0.1.1 are published; deprecate them).
