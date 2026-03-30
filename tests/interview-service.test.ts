import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadInterviewState } from "../src/infra/filesystem.js";
import { InterviewService } from "../src/interview/service.js";
import { FakeCodexRunner } from "./helpers/fake-runner.js";
import { cleanupTempDir, createTempDir, writeJsonFile } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

describe("InterviewService", () => {
  it("persists interview rounds and completes when ambiguity drops below threshold", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const runner = new FakeCodexRunner();
    runner.pushExecJson({
      targeting: "goal",
      rationale: "The goal still needs a sharper first user action.",
      question: "What should the user do first in the CLI?"
    });
    runner.pushExecJson({
      goal: { score: 0.95, justification: "Goal is explicit.", gap: "Clear" },
      constraints: { score: 0.9, justification: "Constraints are concrete.", gap: "Clear" },
      criteria: { score: 0.9, justification: "Criteria are testable.", gap: "Clear" },
      weakestDimension: "criteria",
      weakestDimensionRationale: "Only minor verification details remain."
    });

    const service = new InterviewService(runner);
    const state = await service.create("Build a local harness CLI", cwd);
    const question = await service.nextQuestion(state, cwd);
    const updated = await service.answer(state, question, "The user should run interview first.", cwd);

    expect(updated.status).toBe("completed");
    expect(updated.rounds).toHaveLength(1);
    expect(updated.currentAmbiguity).toBeLessThanOrEqual(0.2);

    const persisted = await loadInterviewState(cwd, updated.interviewId);
    expect(persisted.rounds[0]?.question).toBe(question.question);
  });

  it("detects brownfield context before asking questions", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);
    await writeJsonFile(join(cwd, "package.json"), {
      name: "fixture",
      scripts: { test: "echo ok" }
    });
    await readFile(join(cwd, "package.json"), "utf8");

    const runner = new FakeCodexRunner();
    const service = new InterviewService(runner);
    const state = await service.create("Extend the existing package", cwd);

    expect(state.projectType).toBe("brownfield");
    expect(state.brownfieldContext?.signals.some((signal) => signal.startsWith("manifest:"))).toBe(true);
  });
});
