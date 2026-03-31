import type { DimensionAssessment, HarnessSnapshot } from "../core/types.js";
import { clampScore } from "../core/utils.js";

export function createQuestionSchema<TDimension extends string>(dimensions: readonly TDimension[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["targeting", "rationale", "question"],
    properties: {
      targeting: { type: "string", enum: [...dimensions] },
      rationale: { type: "string" },
      question: { type: "string" }
    }
  } satisfies Record<string, unknown>;
}

export function createScoreSchema<TDimension extends string>(dimensions: readonly TDimension[]) {
  const properties: Record<string, unknown> = {
    weakestDimension: { type: "string", enum: [...dimensions] },
    weakestDimensionRationale: { type: "string" }
  };

  for (const dimension of dimensions) {
    properties[dimension] = assessmentSchema();
  }

  return {
    type: "object",
    additionalProperties: false,
    required: [...dimensions, "weakestDimension", "weakestDimensionRationale"],
    properties
  } satisfies Record<string, unknown>;
}

export function computeWeightedAmbiguity<TDimension extends string>(
  breakdown: Partial<Record<TDimension, DimensionAssessment>>,
  weights: Partial<Record<TDimension, number>>
): number {
  let clarity = 0;
  for (const [dimension, assessment] of Object.entries(breakdown) as Array<
    [TDimension, DimensionAssessment | undefined]
  >) {
    if (!assessment) {
      continue;
    }
    clarity += assessment.score * (weights[dimension] ?? 0);
  }
  return clampScore(1 - clarity);
}

export function formatAdaptiveProgress<TDimension extends string>(
  round:
    | {
        roundNumber: number;
        ambiguity: number;
        weakestDimension: TDimension;
        weakestDimensionRationale: string;
        breakdown: Partial<Record<TDimension, DimensionAssessment>>;
      }
    | undefined,
  labels: Partial<Record<TDimension, string>>,
  createdMessage: string
): string {
  if (!round) {
    return createdMessage;
  }

  const rows = (Object.entries(round.breakdown) as Array<[TDimension, DimensionAssessment | undefined]>)
    .filter(([, assessment]) => Boolean(assessment))
    .map(([dimension, assessment]) => {
      const resolved = assessment as DimensionAssessment;
      return `- ${labels[dimension] ?? dimension}: ${(resolved.score * 100).toFixed(0)}% | ${resolved.gap}`;
    })
    .join("\n");

  return `Round ${round.roundNumber} complete.\n${rows}\n- Ambiguity: ${(
    round.ambiguity * 100
  ).toFixed(0)}%\n- Next target: ${round.weakestDimension} | ${round.weakestDimensionRationale}`;
}

export function renderHarnessPromptBlock(harness: HarnessSnapshot | null | undefined): string {
  if (!harness) {
    return "Active Harness:\nNone";
  }

  return `Active Harness:
- Slug: ${harness.slug}
- Goal: ${harness.harnessGoal}
- Work Units: ${harness.workUnits.join(", ") || "None"}
- Team Topology: ${harness.teamTopology.join(", ") || "None"}
- Verification Emphasis: ${harness.verificationEmphasis.join(", ") || "None"}`;
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
