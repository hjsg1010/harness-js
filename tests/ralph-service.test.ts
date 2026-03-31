import { afterEach, describe, expect, it } from "vitest";

import type { LoopState, PrdDocument } from "../src/core/types.js";
import { RalphService } from "../src/ralph/service.js";
import { FakeCodexRunner } from "./helpers/fake-runner.js";
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
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:00.000Z",
    repeatedFailures: {},
    reopenHistory: []
  };
  return { prd, loopState, progress: "# Ralph Progress\n", verification: [] };
}

describe("RalphService", () => {
  it("blocks after the same failure signature repeats three times", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const runner = new FakeCodexRunner();
    runner.pushExecText("attempt 1");
    runner.pushExecJson({
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "REJECT",
      summary: "Reviewer found the same issue",
      failureSignature: "same-issue",
      findings: ["Issue remains"]
    });

    runner.pushExecText("attempt 2");
    runner.pushExecJson({
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "REJECT",
      summary: "Reviewer found the same issue",
      failureSignature: "same-issue",
      findings: ["Issue remains"]
    });

    runner.pushExecText("attempt 3");
    runner.pushExecJson({
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "REJECT",
      summary: "Reviewer found the same issue",
      failureSignature: "same-issue",
      findings: ["Issue remains"]
    });

    const service = new RalphService(runner);
    const result = await service.execute(cwd, "run_fixed", buildBaseArtifacts());

    expect(result.loopState.status).toBe("blocked");
    expect(result.prd.stories[0]?.attempts).toBe(3);
    expect(result.prd.stories[0]?.lastReviewerVerdict).toBe("blocked");
  });

  it("adds follow-up stories when the final critic rejects completion", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const runner = new FakeCodexRunner();
    runner.pushExecText("story 1 impl");
    runner.pushExecJson({
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "APPROVE",
      summary: "Reviewer approved story 1",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "REJECT",
      summary: "Need one more follow-up story",
      failureSignature: "final-gap",
      findings: ["Add one more regression proof"],
      followUpStories: [
        {
          title: "Add regression proof",
          acceptanceCriteria: ["Add one more regression proof"],
          verificationCommands: []
        }
      ]
    });
    runner.pushExecText("story 2 impl");
    runner.pushExecJson({
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "APPROVE",
      summary: "Reviewer approved story 2",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "APPROVE",
      summary: "Final critic approved",
      failureSignature: null,
      findings: []
    });

    const service = new RalphService(runner);
    const result = await service.execute(cwd, "run_fixed", buildBaseArtifacts());

    expect(result.loopState.status).toBe("completed");
    expect(result.prd.stories).toHaveLength(2);
    expect(result.prd.stories[1]?.title).toBe("Add regression proof");
    expect(result.prd.stories.every((story) => story.passes)).toBe(true);
  });

  it("returns reopen_required with a synthetic feature reopen state when the critic reports requirement ambiguity", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const runner = new FakeCodexRunner();
    runner.pushExecText("story 1 impl");
    runner.pushExecJson({
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "APPROVE",
      summary: "Reviewer approved story 1",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "REJECT",
      summary: "The output format is still ambiguous.",
      failureSignature: "ambiguous-output-format",
      rejectionCategory: "requirement_ambiguity",
      findings: ["Clarify the output format."]
    });

    const service = new RalphService(runner);
    const result = await service.execute(cwd, "run_fixed", buildBaseArtifacts());

    expect(result.loopState.status).toBe("reopen_required");
    expect(result.loopState.reopenTarget).toBe("feature");
    expect(result.loopState.suggestedNextCommand).toMatch(/harness interview --resume/);
    expect(result.loopState.reopenStateId).toBeTruthy();
    expect(result.loopState.reopenHistory).toHaveLength(1);
    expect(result.loopState.reopenHistory[0]?.reason).toBe("requirement_ambiguity");
  });

  it("falls back to requirement ambiguity when the critic asks for clarification without a category", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const runner = new FakeCodexRunner();
    runner.pushExecText("story 1 impl");
    runner.pushExecJson({
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "APPROVE",
      summary: "Reviewer approved story 1",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "REJECT",
      summary: "Clarify whether the final output must be markdown or JSON.",
      failureSignature: "ambiguous-output-format",
      findings: ["The output format is ambiguous and needs clarification."]
    });

    const service = new RalphService(runner);
    const result = await service.execute(cwd, "run_fixed", buildBaseArtifacts());

    expect(result.loopState.status).toBe("reopen_required");
    expect(result.loopState.reopenTarget).toBe("feature");
    expect(result.loopState.reopenReason).toBe("requirement_ambiguity");
  });

  it("falls back to a harness reopen when the critic reports a harness design gap without a category", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const runner = new FakeCodexRunner();
    runner.pushExecText("story 1 impl");
    runner.pushExecJson({
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "APPROVE",
      summary: "Reviewer approved story 1",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "REJECT",
      summary: "The harness verification strategy is missing CLI path validation.",
      failureSignature: "harness-verification-gap",
      findings: ["The harness needs a stronger verification strategy for generated paths."]
    });

    const service = new RalphService(runner);
    const result = await service.execute(cwd, "run_fixed", buildBaseArtifacts());

    expect(result.loopState.status).toBe("reopen_required");
    expect(result.loopState.reopenTarget).toBe("harness");
    expect(result.loopState.reopenReason).toBe("harness_design_gap");
  });
});
