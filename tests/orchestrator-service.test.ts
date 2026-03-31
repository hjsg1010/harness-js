import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { InterviewService } from "../src/interview/service.js";
import { OrchestratorService } from "../src/orchestrator/service.js";
import { PrdService } from "../src/prd/service.js";
import { RalphService } from "../src/ralph/service.js";
import { SeedService } from "../src/seed/service.js";
import { FakeCodexRunner } from "./helpers/fake-runner.js";
import { cleanupTempDir, createTempDir } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

describe("OrchestratorService", () => {
  it("auto-reopens the feature lane when the final critic reports requirement ambiguity", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "fixture", scripts: {} }, null, 2),
      "utf8"
    );

    const runner = new FakeCodexRunner();

    runner.pushExecJson({
      targeting: "goal",
      rationale: "Clarify the first action.",
      question: "What is the first user-visible action?"
    });
    runner.pushExecJson({
      goal: { score: 0.95, justification: "Clear", gap: "Clear" },
      constraints: { score: 0.9, justification: "Clear", gap: "Clear" },
      criteria: { score: 0.88, justification: "Mostly clear", gap: "Clarify reporting format" },
      context: { score: 0.92, justification: "Repo context is known.", gap: "Clear" },
      weakestDimension: "criteria",
      weakestDimensionRationale: "Need report format details."
    });
    runner.pushExecJson({
      title: "Research Assistant",
      goal: "Build a CLI that collects evidence and writes a report.",
      constraints: ["Local files only"],
      nonGoals: ["No web UI"],
      acceptanceCriteria: ["The CLI writes a research report file"],
      transcriptSummary: ["Need a report-focused CLI"],
      technicalContext: ["Brownfield TypeScript repo"],
      ontology: [{ name: "Report", type: "artifact", fields: ["path"], relationships: ["Report validates completion"] }]
    });

    runner.pushExecText("implemented story 1");
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
      verdict: "REJECT",
      summary: "The required report format is still ambiguous.",
      failureSignature: "ambiguous-report-format",
      rejectionCategory: "requirement_ambiguity",
      findings: ["Clarify whether the report is markdown or JSON."]
    });

    runner.pushExecJson({
      targeting: "criteria",
      rationale: "Clarify the report format for verification.",
      question: "Should the report be markdown or JSON?"
    });
    runner.pushExecJson({
      goal: { score: 0.95, justification: "Clear", gap: "Clear" },
      constraints: { score: 0.95, justification: "Clear", gap: "Clear" },
      criteria: { score: 0.96, justification: "Clear", gap: "Clear" },
      context: { score: 0.95, justification: "Repo context is known.", gap: "Clear" },
      weakestDimension: "criteria",
      weakestDimensionRationale: "No major gap remains."
    });
    runner.pushExecJson({
      title: "Research Assistant",
      goal: "Build a CLI that collects evidence and writes a markdown report.",
      constraints: ["Local files only"],
      nonGoals: ["No web UI"],
      acceptanceCriteria: ["The CLI writes a markdown research report file"],
      transcriptSummary: ["The report format is markdown"],
      technicalContext: ["Brownfield TypeScript repo"],
      ontology: [{ name: "Report", type: "artifact", fields: ["path"], relationships: ["Report validates completion"] }]
    });

    runner.pushExecText("implemented story 2");
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
    const orchestrator = new OrchestratorService(interviewService, seedService, prdService, ralphService);

    const result = await orchestrator.runIdea(
      cwd,
      "Build a research assistant",
      [
        "The CLI should ask for the target topic and then write a report.",
        "The report should be markdown."
      ]
    );

    expect(result.loopState.status).toBe("completed");
    expect(result.reopenHistory).toHaveLength(1);
    expect(result.reopenHistory[0]?.target).toBe("feature");
    expect(result.loopState.reopenHistory).toHaveLength(1);
    expect(result.loopState.reopenHistory[0]?.reason).toBe("requirement_ambiguity");
    expect(runner.execJsonPrompts.some((prompt) => prompt.includes("Active Harness"))).toBe(true);
    expect(runner.execJsonPrompts.some((prompt) => prompt.includes("research-harness"))).toBe(false);

    const progress = await readFile(join(cwd, ".harness/runs", result.runId, "progress.md"), "utf8");
    expect(progress).toContain("Final Critic");
  });
});
