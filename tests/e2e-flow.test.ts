import { afterEach, describe, expect, it } from "vitest";

import { InterviewService } from "../src/interview/service.js";
import { PrdService } from "../src/prd/service.js";
import { RalphService } from "../src/ralph/service.js";
import { SeedService } from "../src/seed/service.js";
import { FakeCodexRunner } from "./helpers/fake-runner.js";
import { cleanupTempDir, createTempDir } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

describe("idea -> interview -> seed -> ralph", () => {
  it("supports an end-to-end greenfield flow with fake Codex transport", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const runner = new FakeCodexRunner();
    runner.pushExecJson({
      targeting: "goal",
      rationale: "Clarify the first user-visible action.",
      question: "What is the first successful user action?"
    });
    runner.pushExecJson({
      goal: { score: 0.95, justification: "Clear", gap: "Clear" },
      constraints: { score: 0.9, justification: "Clear", gap: "Clear" },
      criteria: { score: 0.9, justification: "Clear", gap: "Clear" },
      weakestDimension: "criteria",
      weakestDimensionRationale: "Only verification detail remains."
    });
    runner.pushExecJson({
      title: "Hybrid Harness CLI",
      goal: "Build a local CLI that can interview and emit a seed.",
      constraints: ["Local filesystem only"],
      nonGoals: ["No GUI"],
      acceptanceCriteria: ["The CLI can create a seed file"],
      transcriptSummary: ["The first action is the interview command"],
      technicalContext: ["Greenfield flow"],
      ontology: [
        {
          name: "Interview",
          type: "core domain",
          fields: ["id"],
          relationships: ["Interview produces Seed"]
        }
      ]
    });
    runner.pushExecText("implemented");
    runner.pushExecJson({
      verdict: "APPROVE",
      summary: "QA passed",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "APPROVE",
      summary: "Story approved",
      failureSignature: null,
      findings: []
    });
    runner.pushReviewJson({
      verdict: "APPROVE",
      summary: "Final critic approved",
      failureSignature: null,
      findings: []
    });

    const interviewService = new InterviewService(runner);
    const seedService = new SeedService(runner);
    const prdService = new PrdService(seedService);
    const ralphService = new RalphService(runner);

    const interview = await interviewService.create("Build a local harness CLI", cwd);
    const question = await interviewService.nextQuestion(interview, cwd);
    const completed = await interviewService.answer(
      interview,
      question,
      "The first action is to run an interview command.",
      cwd
    );
    const seedArtifacts = await seedService.generateFromInterview(cwd, completed.interviewId);
    const { runId, prd, loopState } = await prdService.createRunFromSource(cwd, seedArtifacts.seedPath);
    const result = await ralphService.execute(cwd, runId, {
      prd,
      loopState,
      progress: "# Ralph Progress\n",
      verification: []
    });

    expect(completed.status).toBe("completed");
    expect(seedArtifacts.seed.acceptance_criteria).toHaveLength(1);
    expect(result.loopState.status).toBe("completed");
  });
});
