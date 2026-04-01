import { INTERVIEW_THRESHOLD, BROWNFIELD_WEIGHTS, GREENFIELD_WEIGHTS } from "../core/constants.js";
import type {
  AmbiguityBreakdown,
  FeatureRoundInput,
  InterviewState,
  QuestionDraft
} from "../core/types.js";
import { clampScore, createId, nowIso } from "../core/utils.js";
import {
  loadInterviewState,
  saveInterviewState,
  tryLoadActiveHarness
} from "../infra/filesystem.js";
import {
  createQuestionSchema,
  createScoreSchema,
  formatAdaptiveProgress,
  renderHarnessPromptBlock
} from "./adaptive.js";
import { scanBrownfieldContext } from "./brownfield.js";

const GREENFIELD_DIMENSIONS = ["goal", "constraints", "criteria"] as const;
const BROWNFIELD_DIMENSIONS = ["goal", "constraints", "criteria", "context"] as const;

export class InterviewService {
  async create(initialIdea: string, cwd: string): Promise<InterviewState> {
    const brownfieldContext = await scanBrownfieldContext(cwd);
    const activeHarness = await tryLoadActiveHarness(cwd);
    const state: InterviewState = {
      interviewId: createId("interview"),
      lane: "feature",
      status: "in_progress",
      initialIdea,
      projectType: brownfieldContext.projectType,
      threshold: INTERVIEW_THRESHOLD,
      currentAmbiguity: 1,
      dimensions:
        brownfieldContext.projectType === "brownfield"
          ? [...BROWNFIELD_DIMENSIONS]
          : [...GREENFIELD_DIMENSIONS],
      weights:
        brownfieldContext.projectType === "brownfield"
          ? { ...BROWNFIELD_WEIGHTS }
          : { ...GREENFIELD_WEIGHTS },
      brownfieldContext,
      activeHarness,
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

  createQuestionPrompt(state: InterviewState): string {
    return this.buildQuestionPrompt(state);
  }

  createQuestionSchema(state: InterviewState) {
    return this.getQuestionSchema(state);
  }

  async applyRound(
    state: InterviewState,
    input: FeatureRoundInput,
    cwd: string
  ): Promise<InterviewState> {
    const ambiguity = this.computeAmbiguity(state, input.breakdown);
    const round = {
      roundNumber: state.rounds.length + 1,
      targeting: input.targeting,
      rationale: input.rationale,
      question: input.question,
      answer: input.answer,
      askedAt: nowIso(),
      answeredAt: nowIso(),
      ambiguity,
      breakdown: input.breakdown,
      weakestDimension: input.weakestDimension,
      weakestDimensionRationale: input.weakestDimensionRationale
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

  createScorePrompt(state: InterviewState, draft: QuestionDraft, answer: string): string {
    return this.buildScorePrompt(state, draft, answer);
  }

  createScoreSchema(state: InterviewState) {
    return this.getScoreSchema(state);
  }

  formatProgress(state: InterviewState): string {
    return formatAdaptiveProgress(
      state.rounds[state.rounds.length - 1],
      {
        goal: "Goal",
        constraints: "Constraints",
        criteria: "Criteria",
        context: "Context"
      },
      `Interview ${state.interviewId} created. Ambiguity: 100%.`
    );
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
${renderHarnessPromptBlock(state.activeHarness)}

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
${renderHarnessPromptBlock(state.activeHarness)}

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

  private getQuestionSchema(state: InterviewState) {
    return createQuestionSchema(
      state.projectType === "brownfield" ? BROWNFIELD_DIMENSIONS : GREENFIELD_DIMENSIONS
    );
  }

  private getScoreSchema(state: InterviewState) {
    return createScoreSchema(
      state.projectType === "brownfield" ? BROWNFIELD_DIMENSIONS : GREENFIELD_DIMENSIONS
    );
  }
}
