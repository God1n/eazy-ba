import type { Question } from "./session.js";
import type { Gap } from "./gaps.js";
import { listArtifacts } from "./store.js";
import { listDecisions } from "./decisions.js";
import { listOpenItems } from "./openItems.js";
import { detectGaps } from "./gaps.js";
import {
  surfaceQuestions, gapQuestions, domainQuestions, changeQuestions,
  coverageQuestions, observationQuestions,
} from "./questions.js";
import type { Mode, Round } from "./taxonomy.js";
import { isPlanTopic } from "./taxonomy.js";
import type { ArtifactType } from "./types.js";
import { NON_TRACEABLE_TYPES } from "./types.js";

// Artifact types that are NOT normative as-is documents and must be excluded from
// every artifact-list consumer (detectGaps, domainQuestions, change-reval). They
// gate stability via their own question paths (open-items) or carry no normative
// authority at all (tech-surface/glossary are descriptive as-is docs). Derived from
// the shared NON_TRACEABLE_TYPES plus "decision" (the ledger), which this consumer
// additionally excludes from `artifacts`.
const NON_ARTIFACT_CONSUMER_TYPES = new Set<ArtifactType>([
  "decision", ...NON_TRACEABLE_TYPES,
]);

export interface PlanTopic { topic: string; item_state: string }

export interface Assessment {
  round: Round;
  questions: Question[];
  gaps: Gap[];
  stable: boolean;
  // The OPEN agent/user coverage plan (non-floor coverage-topics), surfaced for
  // visibility (Flow 1 R11) so the user can see what "done" is gated on.
  coveragePlan?: PlanTopic[];
  // Advisory research directive (Flow 1 R1): present only in a discovery session
  // that has passed surface but not yet declared any plan topics. Tells the host
  // agent to research the domain and call ba_plan. Never spammed once a plan exists.
  researchDirective?: string;
  // Ground directive (Flow 2 R1/R2): present only in a ground session that has not
  // yet recorded any observation. Tells the host agent to read the in-scope code
  // and call ba_ground. Disappears once observations exist (which then surface as
  // confirm-questions via Unit 3). Never makes a ground session vacuously stable.
  groundDirective?: string;
}

const RESEARCH_DIRECTIVE =
  "Deep round open: research the domain for this project, then call ba_plan to " +
  "declare the coverage topics worth eliciting beyond the floor. The plan is " +
  "visible to the user, who can add or retire topics. This is advisory — the " +
  "floor alone is a legitimately complete result if no further depth is needed.";

const GROUND_DIRECTIVE =
  "Ground session: read the code in the user-declared scope and call ba_ground " +
  "with what you find — each observation is { fact_kind, claim, anchors }. The " +
  "server auto-accepts only existence facts it can re-verify (entity-exists / " +
  "dependency-present with resolving, in-scope anchors); everything else becomes " +
  "an inferred observation the user must confirm. Do not put literal secret " +
  "values in claims — anchors are path references only.";

export function computeAssessment(docsRoot: string, mode: Mode): Assessment {
  // Two opposite memberships of one list:
  //  - `artifacts` (normative real docs) feed detectGaps, domainQuestions, change-reval.
  //  - open-items feed coverage/observation questions, and gate stability via those.
  // Decisions, open-items, tech-surface, and glossary are excluded from `artifacts`.
  const allArtifacts = listArtifacts(docsRoot);
  const artifacts = allArtifacts.filter(
    a => !NON_ARTIFACT_CONSUMER_TYPES.has(a.frontmatter.type),
  );
  const allDecisions = listDecisions(docsRoot);
  const decisions = allDecisions.filter(d => d.status !== "obsolete");
  const openItems = listOpenItems(docsRoot);
  const gaps = detectGaps(artifacts);

  // PURE READ: open-items are read, never seeded/written here. ba_status shares
  // this path and must not create artifacts as a side effect of a status read.
  // Floor seeding happens in the ba_assess write path (a later unit), not here.
  const coverage = coverageQuestions(openItems);
  const observations = observationQuestions(openItems);
  const openItemQuestions = [...coverage, ...observations];

  // Ground directive (Flow 2 R1/R2): a ground session that has recorded no
  // observation yet. Computed up-front because it makes a fresh ground session
  // NEVER vacuously stable (see the `stable` computation below).
  const anyObservationEver = openItems.some(oi => oi.kind === "observation");
  const groundDirective =
    mode === "ground" && !anyObservationEver ? GROUND_DIRECTIVE : undefined;

  let round: Assessment["round"];
  let questions: Question[];

  if (mode === "ground") {
    // A ground session ONLY confirms code observations. It must never synthesize
    // domain/change/gap questions from decisions/artifacts that happen to be on
    // disk (e.g. left by a prior discovery/change session). Its questions are the
    // open-item confirm/coverage questions and nothing else; the groundDirective
    // carries a fresh (observation-less) session until ba_ground records some.
    questions = [...openItemQuestions];
    round = observations.length > 0 ? "confirm" : coverage.length > 0 ? "research" : "gap";
  } else if (mode === "discovery" && decisions.length === 0) {
    // Early discovery/ground: the surface round and open-item (floor/coverage/
    // observation) questions coexist. Including open-item questions here is what
    // closes the vacuous-stability trap — without it, an open coverage-topic or
    // observation on disk would never surface and `stable` would be vacuously true.
    round = "surface";
    questions = [...surfaceQuestions(), ...openItemQuestions];
  } else {
    // Change re-validation: artifacts whose derived_from cites a superseded
    // (obsolete) decision and which do not yet have a change-round decision
    // (topic === artifact id) resolving them.
    const obsoleteIds = new Set(allDecisions.filter(d => d.status === "obsolete").map(d => d.id));
    const changeAnswered = new Set(
      allDecisions.filter(d => d.asked_round === "change" && d.status !== "obsolete").map(d => d.topic as string),
    );
    const affectedUnresolved = artifacts
      .filter(a => {
        const df = (a.frontmatter.derived_from as string[] | undefined) ?? [];
        return df.some(id => obsoleteIds.has(id)) && !changeAnswered.has(a.frontmatter.id);
      })
      .map(a => a.frontmatter.id);
    const changeReval = changeQuestions(affectedUnresolved);
    const domain = domainQuestions(artifacts, decisions);
    const gapq = gapQuestions(gaps);
    questions = [...changeReval, ...domain, ...gapq, ...openItemQuestions];
    round =
      changeReval.length > 0 ? "change"
      : domain.length > 0 ? "domain"
      : observations.length > 0 ? "confirm"
      : coverage.length > 0 ? "research"
      : "gap";
  }

  // Visibility (R11): the OPEN agent/user coverage plan — non-floor coverage-topics.
  const coveragePlan = openItems
    .filter(
      oi => oi.kind === "coverage-topic" && oi.item_state === "open" &&
        isPlanTopic(oi.topic),
    )
    .map(oi => ({ topic: oi.topic as string, item_state: oi.item_state as string }));

  // Research directive (R1): only for a discovery session that has passed surface
  // (decisions exist) but not yet declared any plan topic. Advisory, not spammed —
  // it disappears as soon as the agent or user has declared a plan.
  const anyPlanTopicEver = openItems.some(
    oi => oi.kind === "coverage-topic" && isPlanTopic(oi.topic),
  );
  const researchDirective =
    mode === "discovery" && decisions.length > 0 && !anyPlanTopicEver
      ? RESEARCH_DIRECTIVE
      : undefined;

  return {
    round,
    questions,
    gaps,
    // A pending groundDirective means the ground session still has work to do
    // (read code, call ba_ground) — it is therefore NEVER vacuously stable.
    stable: questions.length === 0 && gaps.length === 0 && !groundDirective,
    coveragePlan,
    ...(researchDirective ? { researchDirective } : {}),
    ...(groundDirective ? { groundDirective } : {}),
  };
}
