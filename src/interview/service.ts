import { INTERVIEW_THRESHOLD, BROWNFIELD_WEIGHTS, GREENFIELD_WEIGHTS } from "../core/constants.js";
import type {
  AmbiguityBreakdown,
  CodexRunner,
  InterviewState,
  QuestionDraft,
  ScoreDraft
} from "../core/types.js";
import { clampScore, createId, nowIso } from "../core/utils.js";
import { loadInterviewState, saveInterviewState } from "../infra/filesystem.js";
import { scanBrownfieldContext } from "./brownfield.js";

const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["targeting", "rationale", "question"],
  properties: {
    targeting: { type: "string", enum: ["goal", "constraints", "criteria", "context"] },
    rationale: { type: "string" },
    question: { type: "string" }
  }
} satisfies Record<string, unknown>;

const SCORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "goal",
    "constraints",
    "criteria",
    "weakestDimension",
    "weakestDimensionRationale"
  ],
  properties: {
    goal: assessmentSchema(),
    constraints: assessmentSchema(),
    criteria: assessmentSchema(),
    context: assessmentSchema(),
    weakestDimension: { type: "string", enum: ["goal", "constraints", "criteria", "context"] },
    weakestDimensionRationale: { type: "string" }
  }
} satisfies Record<string, unknown>;

export class InterviewService {
  constructor(private readonly runner: CodexRunner) {}

  async create(initialIdea: string, cwd: string): Promise<InterviewState> {
    const brownfieldContext = await scanBrownfieldContext(cwd);
    const state: InterviewState = {
      interviewId: createId("interview"),
      status: "in_progress",
      initialIdea,
      projectType: brownfieldContext.projectType,
      threshold: INTERVIEW_THRESHOLD,
      currentAmbiguity: 1,
      brownfieldContext,
      rounds: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await saveInterviewState(cwd, state);
    return state;
  }

  async resume(interviewId: string, cwd: string): Promise<InterviewState> {
    return loadInterviewState(cwd, interviewId);
  }

  async nextQuestion(state: InterviewState, cwd: string): Promise<QuestionDraft> {
    return this.runner.execJson<QuestionDraft>(this.buildQuestionPrompt(state), QUESTION_SCHEMA, {
      cwd,
      sandbox: "read-only"
    });
  }

  async answer(
    state: InterviewState,
    draft: QuestionDraft,
    answer: string,
    cwd: string
  ): Promise<InterviewState> {
    const scored = await this.runner.execJson<ScoreDraft>(
      this.buildScorePrompt(state, draft, answer),
      SCORE_SCHEMA,
      {
        cwd,
        sandbox: "read-only"
      }
    );

    const breakdown: AmbiguityBreakdown = {
      goal: scored.goal,
      constraints: scored.constraints,
      criteria: scored.criteria,
      context: scored.context
    };

    const ambiguity = this.computeAmbiguity(state, breakdown);
    const round = {
      roundNumber: state.rounds.length + 1,
      targeting: draft.targeting,
      rationale: draft.rationale,
      question: draft.question,
      answer,
      askedAt: nowIso(),
      answeredAt: nowIso(),
      ambiguity,
      breakdown,
      weakestDimension: scored.weakestDimension,
      weakestDimensionRationale: scored.weakestDimensionRationale
    };

    const updated: InterviewState = {
      ...state,
      status: ambiguity <= state.threshold ? "completed" : "in_progress",
      currentAmbiguity: ambiguity,
      rounds: [...state.rounds, round],
      updatedAt: nowIso()
    };

    await saveInterviewState(cwd, updated);
    return updated;
  }

  formatProgress(state: InterviewState): string {
    const latest = state.rounds[state.rounds.length - 1];
    if (!latest) {
      return `Interview ${state.interviewId} created. Ambiguity: 100%.`;
    }

    const rows = [
      ["Goal", latest.breakdown.goal.score, latest.breakdown.goal.gap],
      ["Constraints", latest.breakdown.constraints.score, latest.breakdown.constraints.gap],
      ["Criteria", latest.breakdown.criteria.score, latest.breakdown.criteria.gap]
    ];
    if (latest.breakdown.context) {
      rows.push(["Context", latest.breakdown.context.score, latest.breakdown.context.gap]);
    }

    const formattedRows = rows
      .map(([name, score, gap]) => `- ${name}: ${(Number(score) * 100).toFixed(0)}% | ${gap}`)
      .join("\n");

    return `Round ${latest.roundNumber} complete.\n${formattedRows}\n- Ambiguity: ${(
      latest.ambiguity * 100
    ).toFixed(0)}%\n- Next target: ${latest.weakestDimension} | ${
      latest.weakestDimensionRationale
    }`;
  }

  private computeAmbiguity(state: InterviewState, breakdown: AmbiguityBreakdown): number {
    if (state.projectType === "brownfield") {
      const clarity =
        breakdown.goal.score * BROWNFIELD_WEIGHTS.goal +
        breakdown.constraints.score * BROWNFIELD_WEIGHTS.constraints +
        breakdown.criteria.score * BROWNFIELD_WEIGHTS.criteria +
        (breakdown.context?.score ?? 0) * BROWNFIELD_WEIGHTS.context;
      return clampScore(1 - clarity);
    }

    const clarity =
      breakdown.goal.score * GREENFIELD_WEIGHTS.goal +
      breakdown.constraints.score * GREENFIELD_WEIGHTS.constraints +
      breakdown.criteria.score * GREENFIELD_WEIGHTS.criteria;
    return clampScore(1 - clarity);
  }

  private buildQuestionPrompt(state: InterviewState): string {
    const transcript = state.rounds
      .map(
        (round) =>
          `Round ${round.roundNumber}\nQ: ${round.question}\nA: ${round.answer}\nWeakest: ${round.weakestDimension}`
      )
      .join("\n\n");

    return `You are the interview planner for a specification-first development harness.

Generate exactly one question that reduces ambiguity for the idea below.

Idea:
${state.initialIdea}

Project Type: ${state.projectType}
Threshold: ${state.threshold}
Current Ambiguity: ${state.currentAmbiguity}
Brownfield Context:
${state.brownfieldContext?.summary ?? "None"}

Previous Rounds:
${transcript || "None"}

Rules:
- Ask one question only.
- Target the weakest missing dimension.
- Prefer assumptions and success criteria over feature listing.
- If brownfield, use discovered repo context instead of asking the user to rediscover it.
- Keep the question under 30 words.
`;
  }

  private buildScorePrompt(state: InterviewState, draft: QuestionDraft, answer: string): string {
    const transcript = state.rounds
      .map((round) => `Round ${round.roundNumber}\nQ: ${round.question}\nA: ${round.answer}`)
      .join("\n\n");

    return `Score clarity for this interview transcript.

Idea:
${state.initialIdea}

Project Type: ${state.projectType}
Brownfield Context:
${state.brownfieldContext?.summary ?? "None"}

Transcript:
${transcript || "No previous rounds"}

New Round:
Q: ${draft.question}
A: ${answer}

Return scores from 0.0 to 1.0 for:
- goal
- constraints
- criteria
${state.projectType === "brownfield" ? "- context" : ""}

For each dimension provide score, justification, and gap.
Also return weakestDimension and weakestDimensionRationale.
`;
  }
}

function assessmentSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["score", "justification", "gap"],
    properties: {
      score: { type: "number" },
      justification: { type: "string" },
      gap: { type: "string" }
    }
  };
}
