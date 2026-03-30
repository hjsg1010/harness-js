import { spawn } from "node:child_process";
import { appendFile } from "node:fs/promises";

import { MAX_REPEATED_FAILURES } from "../core/constants.js";
import type {
  CodexRunner,
  CommandResult,
  LoopState,
  PrdDocument,
  QaVerdict,
  ReviewVerdict,
  UserStory,
  VerificationEntry
} from "../core/types.js";
import { nowIso } from "../core/utils.js";
import {
  diffSnapshots,
  persistRunArtifacts,
  resolveRunPaths,
  snapshotProject
} from "../infra/filesystem.js";

const QA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "failureSignature", "findings"],
  properties: {
    verdict: { type: "string", enum: ["APPROVE", "REJECT"] },
    summary: { type: "string" },
    failureSignature: { type: ["string", "null"] },
    findings: { type: "array", items: { type: "string" } },
    suggestedVerificationCommands: { type: "array", items: { type: "string" } }
  }
} satisfies Record<string, unknown>;

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "failureSignature", "findings"],
  properties: {
    verdict: { type: "string", enum: ["APPROVE", "REJECT"] },
    summary: { type: "string" },
    failureSignature: { type: ["string", "null"] },
    findings: { type: "array", items: { type: "string" } },
    followUpStories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "acceptanceCriteria"],
        properties: {
          title: { type: "string" },
          acceptanceCriteria: { type: "array", items: { type: "string" } },
          verificationCommands: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
} satisfies Record<string, unknown>;

export class RalphService {
  constructor(private readonly runner: CodexRunner) {}

  async execute(
    cwd: string,
    runId: string,
    artifacts: {
      prd: PrdDocument;
      loopState: LoopState;
      progress: string;
      verification: VerificationEntry[];
    }
  ): Promise<{
    prd: PrdDocument;
    loopState: LoopState;
    progress: string;
    verification: VerificationEntry[];
  }> {
    const runPaths = resolveRunPaths(cwd, runId);
    let current: {
      prd: PrdDocument;
      loopState: LoopState;
      progress: string;
      verification: VerificationEntry[];
    } = {
      ...artifacts,
      loopState: { ...artifacts.loopState, status: "running", updatedAt: nowIso() },
      prd: { ...artifacts.prd, status: "running" }
    };

    while (true) {
      const nextStory = current.prd.stories.find((story) => !story.passes);
      if (!nextStory) {
        const finalCritic = await this.finalCritic(cwd, current.prd);
        current.progress += `\n## Final Critic ${nowIso()}\n- Verdict: ${finalCritic.verdict}\n- Summary: ${finalCritic.summary}\n`;
        if (finalCritic.verdict === "APPROVE") {
          current.prd.status = "completed";
          current.loopState.status = "completed";
          current.loopState.currentStoryId = null;
          current.loopState.updatedAt = nowIso();
          await persistRunArtifacts(cwd, runId, current);
          return current;
        }

        const followUps =
          finalCritic.followUpStories?.map((story, index) => ({
            id: `story_followup_${String(current.prd.stories.length + index + 1).padStart(3, "0")}`,
            title: story.title,
            acceptanceCriteria: story.acceptanceCriteria,
            verificationCommands: story.verificationCommands ?? [],
            passes: false,
            attempts: 0,
            lastReviewerVerdict: "pending" as const
          })) ?? [];

        if (followUps.length === 0) {
          followUps.push({
            id: `story_followup_${String(current.prd.stories.length + 1).padStart(3, "0")}`,
            title: "Address final critic findings",
            acceptanceCriteria: finalCritic.findings.length > 0 ? finalCritic.findings : [finalCritic.summary],
            verificationCommands: [],
            passes: false,
            attempts: 0,
            lastReviewerVerdict: "pending"
          });
        }

        current.prd.stories.push(...followUps);
        current.prd.status = "running";
        current.loopState.status = "running";
        await persistRunArtifacts(cwd, runId, current);
        continue;
      }

      current.loopState.currentStoryId = nextStory.id;
      current.loopState.updatedAt = nowIso();
      await persistRunArtifacts(cwd, runId, current);

      const before = await snapshotProject(cwd);
      const implementerOutput = await this.runner.execText(this.buildImplementerPrompt(nextStory, runPaths.root), {
        cwd,
        sandbox: "workspace-write"
      });
      const after = await snapshotProject(cwd);
      const changedFiles = diffSnapshots(before, after);

      const qaVerdict = await this.runner.execJson<QaVerdict>(
        this.buildQaPrompt(nextStory, changedFiles),
        QA_SCHEMA,
        {
          cwd,
          sandbox: "read-only"
        }
      );

      const commandResults = await this.runVerificationCommands(nextStory.verificationCommands, cwd);
      const commandsPassed = commandResults.every((result) => result.exitCode === 0);

      let reviewerVerdict: ReviewVerdict | null = null;
      if (qaVerdict.verdict === "APPROVE" && commandsPassed) {
        reviewerVerdict = await this.runner.reviewJson<ReviewVerdict>(
          this.buildReviewerPrompt(nextStory, changedFiles, commandResults),
          REVIEW_SCHEMA,
          { cwd }
        );
      } else {
        reviewerVerdict = {
          verdict: "REJECT",
          summary: "Local QA or verification commands failed before reviewer approval.",
          failureSignature: qaVerdict.failureSignature ?? "pre-review-failure",
          findings: [
            ...qaVerdict.findings,
            ...commandResults
              .filter((result) => result.exitCode !== 0)
              .map((result) => `Command failed: ${result.command}`)
          ]
        };
      }

      current.verification.push({
        storyId: nextStory.id,
        changedFiles,
        implementerOutput,
        qaVerdict,
        reviewerVerdict,
        commandResults,
        recordedAt: nowIso()
      });
      current.progress += [
        `\n## Story ${nextStory.id} - ${nextStory.title}`,
        `- Changed files: ${changedFiles.join(", ") || "none detected"}`,
        `- QA: ${qaVerdict.verdict} | ${qaVerdict.summary}`,
        `- Reviewer: ${reviewerVerdict.verdict} | ${reviewerVerdict.summary}`
      ].join("\n");

      if (qaVerdict.verdict === "APPROVE" && reviewerVerdict.verdict === "APPROVE" && commandsPassed) {
        this.markStoryPassed(current.prd, nextStory.id);
        delete current.loopState.repeatedFailures[nextStory.id];
      } else {
        this.markStoryRejected(current.prd, nextStory.id);
        const signature =
          reviewerVerdict.failureSignature ?? qaVerdict.failureSignature ?? "unknown-failure";
        const repeated = current.loopState.repeatedFailures[nextStory.id];
        if (repeated && repeated.signature === signature) {
          repeated.count += 1;
        } else {
          current.loopState.repeatedFailures[nextStory.id] = { signature, count: 1 };
        }

        if (current.loopState.repeatedFailures[nextStory.id].count >= MAX_REPEATED_FAILURES) {
          current.loopState.status = "blocked";
          current.prd.status = "blocked";
          const story = current.prd.stories.find((item) => item.id === nextStory.id);
          if (story) {
            story.lastReviewerVerdict = "blocked";
          }
          await persistRunArtifacts(cwd, runId, current);
          return current;
        }
      }

      current.loopState.updatedAt = nowIso();
      await persistRunArtifacts(cwd, runId, current);
      await appendFile(runPaths.progressPath, "", "utf8");
    }
  }

  private buildImplementerPrompt(story: UserStory, runRoot: string): string {
    return `You are implementing one PRD story in a Ralph-style persistence loop.

Story ID: ${story.id}
Title: ${story.title}
Acceptance Criteria:
${story.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")}

Rules:
- Make the minimal changes needed to satisfy the story.
- Do not edit immutable seed/spec artifacts.
- Keep all temporary artifacts under ${runRoot}.
- Prefer explicit verification-friendly changes.
`;
  }

  private buildQaPrompt(story: UserStory, changedFiles: string[]): string {
    return `You are the incremental QA inspector for a hybrid harness.

Story: ${story.title}
Acceptance Criteria:
${story.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")}

Changed files:
${changedFiles.map((file) => `- ${file}`).join("\n") || "- none"}

Focus on:
- API / CLI contracts
- file output correctness
- state transition consistency
- path consistency

Reject if the changed boundary is likely mismatched.
`;
  }

  private buildReviewerPrompt(
    story: UserStory,
    changedFiles: string[],
    commandResults: CommandResult[]
  ): string {
    return `Review the implementation of this story and return JSON only.

Story: ${story.title}
Acceptance Criteria:
${story.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")}

Changed files:
${changedFiles.map((file) => `- ${file}`).join("\n") || "- none"}

Verification evidence:
${commandResults.map((result) => `- ${result.command}: exit ${result.exitCode}`).join("\n") || "- none"}

Approve only if the story is clearly complete with fresh evidence.
`;
  }

  private async finalCritic(cwd: string, prd: PrdDocument): Promise<ReviewVerdict> {
    return this.runner.reviewJson<ReviewVerdict>(
      `You are the final critic for a Ralph-style completion gate.

Source Seed ID: ${prd.sourceSeedId}
Stories:
${prd.stories
  .map(
    (story) =>
      `- ${story.id} | ${story.title} | passes=${story.passes} | attempts=${story.attempts} | verdict=${story.lastReviewerVerdict}`
  )
  .join("\n")}

Approve only when all stories are credibly complete. If not, reject and provide follow-up stories.
`,
      REVIEW_SCHEMA,
      { cwd }
    );
  }

  private async runVerificationCommands(commands: string[], cwd: string): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    for (const command of commands) {
      results.push(await runShellCommand(command, cwd));
    }
    return results;
  }

  private markStoryPassed(prd: PrdDocument, storyId: string): void {
    const story = prd.stories.find((item) => item.id === storyId);
    if (!story) {
      return;
    }
    story.passes = true;
    story.lastReviewerVerdict = "approved";
  }

  private markStoryRejected(prd: PrdDocument, storyId: string): void {
    const story = prd.stories.find((item) => item.id === storyId);
    if (!story) {
      return;
    }
    story.attempts += 1;
    story.lastReviewerVerdict = "rejected";
  }
}

function runShellCommand(command: string, cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        command,
        exitCode: exitCode ?? 1,
        stdout,
        stderr
      });
    });
  });
}
