import { ARCHITECT_WEIGHTS, INTERVIEW_THRESHOLD } from "../core/constants.js";
import type {
  ArchitectInterviewState,
  ArchitectQuestionDraft,
  ArchitectRoundInput
} from "../core/types.js";
import { createId, nowIso } from "../core/utils.js";
import {
  loadArchitectInterviewState,
  loadRepoProfile,
  saveArchitectInterviewState,
  saveRepoProfile
} from "../infra/filesystem.js";
import {
  computeWeightedAmbiguity,
  createQuestionSchema,
  createScoreSchema,
  formatAdaptiveProgress
} from "../interview/adaptive.js";
import { scanRepoProfile } from "./repo-profile.js";

const ARCHITECT_DIMENSIONS = [
  "domain_scope",
  "work_units",
  "team_topology",
  "verification_strategy",
  "user_operating_style"
] as const;

const QUESTION_SCHEMA = createQuestionSchema(ARCHITECT_DIMENSIONS);
const SCORE_SCHEMA = createScoreSchema(ARCHITECT_DIMENSIONS);

export class ArchitectService {
  async create(initialIdea: string, cwd: string): Promise<ArchitectInterviewState> {
    const repoProfile = await scanRepoProfile(cwd);
    await saveRepoProfile(cwd, repoProfile);

    const state: ArchitectInterviewState = {
      interviewId: createId("architect"),
      lane: "architect",
      status: "in_progress",
      initialIdea,
      threshold: INTERVIEW_THRESHOLD,
      currentAmbiguity: 1,
      dimensions: [...ARCHITECT_DIMENSIONS],
      weights: { ...ARCHITECT_WEIGHTS },
      repoProfileId: repoProfile.profileId,
      repoProfileSummary: repoProfile.summary,
      rounds: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await saveArchitectInterviewState(cwd, state);
    return state;
  }

  async resume(interviewId: string, cwd: string): Promise<ArchitectInterviewState> {
    return loadArchitectInterviewState(cwd, interviewId);
  }

  async createQuestionPrompt(cwd: string, state: ArchitectInterviewState): Promise<string> {
    return this.buildQuestionPrompt(cwd, state);
  }

  createQuestionSchema() {
    return QUESTION_SCHEMA;
  }

  async applyRound(
    state: ArchitectInterviewState,
    input: ArchitectRoundInput,
    cwd: string
  ): Promise<ArchitectInterviewState> {
    const ambiguity = computeWeightedAmbiguity(input.breakdown, ARCHITECT_WEIGHTS);

    const updated: ArchitectInterviewState = {
      ...state,
      status: ambiguity <= state.threshold ? "completed" : "in_progress",
      currentAmbiguity: ambiguity,
      rounds: [
        ...state.rounds,
        {
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
        }
      ],
      updatedAt: nowIso()
    };

    await saveArchitectInterviewState(cwd, updated);
    return updated;
  }

  async createScorePrompt(
    cwd: string,
    state: ArchitectInterviewState,
    draft: ArchitectQuestionDraft,
    answer: string
  ): Promise<string> {
    return this.buildScorePrompt(cwd, state, draft, answer);
  }

  createScoreSchema() {
    return SCORE_SCHEMA;
  }

  formatProgress(state: ArchitectInterviewState): string {
    return formatAdaptiveProgress(
      state.rounds[state.rounds.length - 1],
      {
        domain_scope: "Domain Scope",
        work_units: "Work Units",
        team_topology: "Team Topology",
        verification_strategy: "Verification Strategy",
        user_operating_style: "User Operating Style"
      },
      `Architect interview ${state.interviewId} created. Ambiguity: 100%.`
    );
  }

  private async buildQuestionPrompt(cwd: string, state: ArchitectInterviewState): Promise<string> {
    const repoProfile = await loadRepoProfile(cwd, state.repoProfileId);
    const transcript = state.rounds
      .map(
        (round) =>
          `Round ${round.roundNumber}\nQ: ${round.question}\nA: ${round.answer}\nWeakest: ${round.weakestDimension}`
      )
      .join("\n\n");

    return `You are the architect interview planner for a repo-specific harness generator.

Goal:
${state.initialIdea}

Repo Profile:
${repoProfile.summary}

Repo Details:
- Stack: ${repoProfile.stack.join(", ") || "unknown"}
- Package manager: ${repoProfile.packageManager}
- Top-level directories: ${repoProfile.topLevelDirectories.join(", ") || "none"}
- Likely boundaries: ${repoProfile.likelyBoundaries.join(", ") || "none"}
- Risk surfaces: ${repoProfile.riskSurfaces.join(", ") || "none"}

Previous Rounds:
${transcript || "None"}

Rules:
- Ask exactly one question.
- Target the weakest missing architect dimension.
- Use repo evidence instead of asking the user to rediscover the repository.
- Keep the question under 35 words.
`;
  }

  private async buildScorePrompt(
    cwd: string,
    state: ArchitectInterviewState,
    draft: ArchitectQuestionDraft,
    answer: string
  ): Promise<string> {
    const repoProfile = await loadRepoProfile(cwd, state.repoProfileId);
    const transcript = state.rounds
      .map((round) => `Round ${round.roundNumber}\nQ: ${round.question}\nA: ${round.answer}`)
      .join("\n\n");

    return `Score clarity for this repo-specific harness architect interview.

Goal:
${state.initialIdea}

Repo Profile:
${repoProfile.summary}

Transcript:
${transcript || "No previous rounds"}

New Round:
Q: ${draft.question}
A: ${answer}

Return scores from 0.0 to 1.0 for:
- domain_scope
- work_units
- team_topology
- verification_strategy
- user_operating_style

For each dimension provide score, justification, and gap.
Also return weakestDimension and weakestDimensionRationale.
`;
  }
}
