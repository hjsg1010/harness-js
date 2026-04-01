import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadInterviewState } from "../src/infra/filesystem.js";
import { InterviewService } from "../src/interview/service.js";
import { cleanupTempDir, createTempDir, writeJsonFile } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

describe("InterviewService", () => {
  it("persists interview rounds and completes when ambiguity drops below threshold", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const service = new InterviewService();
    const state = await service.create("Build a local harness CLI", cwd);
    const updated = await service.applyRound(
      state,
      {
        targeting: "goal",
        rationale: "The goal still needs a sharper first user action.",
        question: "What should the user do first in the CLI?",
        answer: "The user should run interview first.",
        breakdown: {
          goal: { score: 0.95, justification: "Goal is explicit.", gap: "Clear" },
          constraints: { score: 0.9, justification: "Constraints are concrete.", gap: "Clear" },
          criteria: { score: 0.9, justification: "Criteria are testable.", gap: "Clear" }
        },
        weakestDimension: "criteria",
        weakestDimensionRationale: "Only minor verification details remain."
      },
      cwd
    );

    expect(updated.status).toBe("completed");
    expect(updated.rounds).toHaveLength(1);
    expect(updated.currentAmbiguity).toBeLessThanOrEqual(0.2);
    expect(service.createQuestionPrompt(updated)).toContain("Previous Rounds");

    const persisted = await loadInterviewState(cwd, updated.interviewId);
    expect(persisted.rounds[0]?.question).toBe("What should the user do first in the CLI?");
  });

  it("detects brownfield context before asking questions", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);
    await writeJsonFile(join(cwd, "package.json"), {
      name: "fixture",
      scripts: { test: "echo ok" }
    });
    await readFile(join(cwd, "package.json"), "utf8");

    const service = new InterviewService();
    const state = await service.create("Extend the existing package", cwd);

    expect(state.projectType).toBe("brownfield");
    expect(state.brownfieldContext?.signals.some((signal) => signal.startsWith("manifest:"))).toBe(true);
  });
});
