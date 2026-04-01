import { afterEach, describe, expect, it } from "vitest";

import type { LoopState, PrdDocument, StoryResultInput } from "../src/core/types.js";
import { RalphService } from "../src/ralph/service.js";
import { cleanupTempDir, createTempDir } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

function buildBaseArtifacts() {
  const prd: PrdDocument = {
    sourceSeedId: "seed_fixed",
    sourceSpecPath: "/tmp/spec.md",
    sourceSeedPath: "/tmp/seed.yaml",
    goal: "Build a report-producing CLI",
    status: "pending",
    stories: [
      {
        id: "story_001",
        title: "Implement the first story",
        acceptanceCriteria: ["Implement the first story"],
        verificationCommands: [],
        passes: false,
        attempts: 0,
        lastReviewerVerdict: "pending"
      }
    ]
  };
  const loopState: LoopState = {
    runId: "run_fixed",
    status: "pending",
    currentStoryId: null,
    reopenTarget: null,
    reopenStateId: null,
    suggestedNextCommand: null,
    reopenReason: null,
    suggestedQuestionFocus: null,
    suggestedRepairFocus: null,
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:00.000Z",
    repeatedFailures: {},
    reopenHistory: []
  };
  return { prd, loopState, progress: "# Ralph Progress\n", verification: [] };
}

function rejectingStoryResult(signature = "same-issue"): StoryResultInput {
  return {
    storyId: "story_001",
    implementerOutput: "attempt",
    changedFiles: ["src/example.ts"],
    qaVerdict: {
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    },
    reviewerVerdict: {
      verdict: "REJECT",
      summary: "Reviewer found the same issue",
      failureSignature: signature,
      findings: ["Issue remains"]
    },
    commandResults: []
  };
}

describe("RalphService", () => {
  it("blocks after the same failure signature repeats three times", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const service = new RalphService();
    let artifacts = buildBaseArtifacts();
    artifacts = await service.applyStoryResult(cwd, "run_fixed", artifacts, rejectingStoryResult("same-issue"));
    artifacts = await service.applyStoryResult(cwd, "run_fixed", artifacts, rejectingStoryResult("same-issue"));
    artifacts = await service.applyStoryResult(cwd, "run_fixed", artifacts, rejectingStoryResult("same-issue"));

    expect(artifacts.loopState.status).toBe("blocked");
    expect(artifacts.prd.stories[0]?.attempts).toBe(3);
    expect(artifacts.prd.stories[0]?.lastReviewerVerdict).toBe("blocked");
  });

  it("adds follow-up stories when the final critic rejects completion", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const service = new RalphService();
    const result = await service.applyStoryResult(cwd, "run_fixed", buildBaseArtifacts(), {
      storyId: "story_001",
      implementerOutput: "story 1 impl",
      changedFiles: ["src/report.ts"],
      qaVerdict: {
        verdict: "APPROVE",
        summary: "QA passed",
        failureSignature: null,
        findings: []
      },
      reviewerVerdict: {
        verdict: "APPROVE",
        summary: "Reviewer approved story 1",
        failureSignature: null,
        findings: []
      },
      commandResults: [],
      finalCritic: {
        verdict: "REJECT",
        summary: "Need one more follow-up story",
        failureSignature: "final-gap",
        rejectionCategory: "implementation_gap",
        findings: ["Add one more regression proof"],
        followUpStories: [
          {
            title: "Add regression proof",
            acceptanceCriteria: ["Add one more regression proof"],
            verificationCommands: []
          }
        ]
      }
    });

    expect(result.loopState.status).toBe("running");
    expect(result.prd.stories).toHaveLength(2);
    expect(result.prd.stories[1]?.title).toBe("Add regression proof");
    expect(result.loopState.currentStoryId).toBe("story_followup_002");
  });

  it("returns reopen_required with a synthetic feature reopen state when the critic reports requirement ambiguity", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const service = new RalphService();
    const result = await service.applyStoryResult(cwd, "run_fixed", buildBaseArtifacts(), {
      storyId: "story_001",
      implementerOutput: "story 1 impl",
      changedFiles: ["src/report.ts"],
      qaVerdict: {
        verdict: "APPROVE",
        summary: "QA passed",
        failureSignature: null,
        findings: []
      },
      reviewerVerdict: {
        verdict: "APPROVE",
        summary: "Reviewer approved story 1",
        failureSignature: null,
        findings: []
      },
      commandResults: [],
      finalCritic: {
        verdict: "REJECT",
        summary: "The output format is still ambiguous.",
        failureSignature: "ambiguous-output-format",
        rejectionCategory: "requirement_ambiguity",
        findings: ["Clarify the output format."]
      }
    });

    expect(result.loopState.status).toBe("reopen_required");
    expect(result.loopState.reopenTarget).toBe("feature");
    expect(result.loopState.suggestedNextCommand).toMatch(/harness internal feature-init --resume/);
    expect(result.loopState.reopenStateId).toBeTruthy();
    expect(result.loopState.reopenHistory).toHaveLength(1);
    expect(result.loopState.reopenHistory[0]?.reason).toBe("requirement_ambiguity");
    expect(result.loopState.suggestedQuestionFocus?.[0]).toContain("output format");
  });

  it("falls back to requirement ambiguity when the critic asks for clarification without a category", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const service = new RalphService();
    const result = await service.applyStoryResult(cwd, "run_fixed", buildBaseArtifacts(), {
      storyId: "story_001",
      implementerOutput: "story 1 impl",
      changedFiles: ["src/report.ts"],
      qaVerdict: {
        verdict: "APPROVE",
        summary: "QA passed",
        failureSignature: null,
        findings: []
      },
      reviewerVerdict: {
        verdict: "APPROVE",
        summary: "Reviewer approved story 1",
        failureSignature: null,
        findings: []
      },
      commandResults: [],
      finalCritic: {
        verdict: "REJECT",
        summary: "Clarify whether the final output must be markdown or JSON.",
        failureSignature: "ambiguous-output-format",
        findings: ["The output format is ambiguous and needs clarification."]
      }
    });

    expect(result.loopState.status).toBe("reopen_required");
    expect(result.loopState.reopenTarget).toBe("feature");
    expect(result.loopState.reopenReason).toBe("requirement_ambiguity");
    expect(result.loopState.suggestedQuestionFocus?.[0]).toContain("Clarify");
  });

  it("falls back to a harness reopen when the critic reports a harness design gap without a category", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const service = new RalphService();
    const result = await service.applyStoryResult(cwd, "run_fixed", buildBaseArtifacts(), {
      storyId: "story_001",
      implementerOutput: "story 1 impl",
      changedFiles: ["src/report.ts"],
      qaVerdict: {
        verdict: "APPROVE",
        summary: "QA passed",
        failureSignature: null,
        findings: []
      },
      reviewerVerdict: {
        verdict: "APPROVE",
        summary: "Reviewer approved story 1",
        failureSignature: null,
        findings: []
      },
      commandResults: [],
      finalCritic: {
        verdict: "REJECT",
        summary: "The harness verification strategy is missing CLI path validation.",
        failureSignature: "harness-verification-gap",
        findings: ["The harness needs a stronger verification strategy for generated paths."]
      }
    });

    expect(result.loopState.status).toBe("reopen_required");
    expect(result.loopState.reopenTarget).toBe("harness");
    expect(result.loopState.reopenReason).toBe("harness_design_gap");
    expect(result.loopState.suggestedRepairFocus?.some((item) => item.includes("verification strategy"))).toBe(true);
  });
});
