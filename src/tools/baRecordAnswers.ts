import { z } from "zod";
import { resolveConfig } from "../config.js";
import { recordDecision, listDecisions, getDecision, supersede } from "../core/decisions.js";
import { readSession, writeSession } from "../core/session.js";

export const baRecordAnswersSchema = z.object({
  projectRoot: z.string(),
  items: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    asked_round: z.enum(["surface", "domain", "gap", "change"]),
    topic: z.string(),
    ref: z.string().optional(),
    supersedes: z.array(z.string()).optional(),
  })).min(1),
});

export function baRecordAnswers(input: z.infer<typeof baRecordAnswersSchema>): { recorded: string[]; skipped: string[] } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");

  // Pre-flight validate all supersedes ids
  for (const item of input.items) {
    for (const old of item.supersedes ?? []) {
      if (!getDecision(old, docsRoot)) throw new Error(`Cannot supersede unknown decision: ${old}`);
    }
  }

  // Dedupe by question ref so retries are idempotent: an item whose ref already
  // has a recorded decision is skipped rather than recorded twice.
  const seenRefs = new Set(listDecisions(docsRoot).map(d => d.ref as string | undefined).filter(Boolean));
  const recorded: string[] = [];
  const skipped: string[] = [];
  for (const item of input.items) {
    if (item.ref && seenRefs.has(item.ref)) { skipped.push(item.ref); continue; }
    const newId = recordDecision(item, docsRoot);
    recorded.push(newId);
    if (item.ref) seenRefs.add(item.ref);
    for (const old of item.supersedes ?? []) supersede(old, newId, docsRoot);
  }

  // Clear answered open questions by ref when available, falling back to exact text.
  const answeredRefs = new Set(input.items.map(i => i.ref).filter(Boolean));
  const answeredTexts = new Set(input.items.map(i => i.question));
  const open_questions = session.open_questions.filter(
    q => !answeredRefs.has(q.ref) && !answeredTexts.has(q.text),
  );

  writeSession({
    ...session,
    open_questions,
    pending_apply: [...session.pending_apply, ...recorded],
    updated: new Date().toISOString().slice(0, 10),
  }, docsRoot);
  return { recorded, skipped };
}
