import { z } from "zod";
import { resolveConfig } from "../config.js";
import { recordDecision } from "../core/decisions.js";
import { readSession, writeSession, clearAnsweredQuestions } from "../core/session.js";

export const baRecordAnswersSchema = z.object({
  projectRoot: z.string(),
  items: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    asked_round: z.enum(["surface", "domain", "gap"]),
    topic: z.string(),
  })).min(1),
});

export function baRecordAnswers(input: z.infer<typeof baRecordAnswersSchema>): { recorded: string[] } {
  const { docsRoot } = resolveConfig(input.projectRoot);
  const session = readSession(docsRoot);
  if (!session) throw new Error("No active session. Call ba_session_start first.");

  const recorded: string[] = [];
  for (const item of input.items) {
    recorded.push(recordDecision(item, docsRoot));
  }

  let next = clearAnsweredQuestions(session, input.items.map(i => i.question));
  next = { ...next, pending_apply: [...next.pending_apply, ...recorded], updated: new Date().toISOString().slice(0, 10) };
  writeSession(next, docsRoot);
  return { recorded };
}
