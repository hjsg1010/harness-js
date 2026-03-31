import { spawn } from "node:child_process";
import { appendFile } from "node:fs/promises";

import { MAX_REPEATED_FAILURES } from "../core/constants.js";
import type {
  ArchitectInterviewState,
  CodexRunner,
  CommandResult,
  InterviewState,
  LoopState,
  PrdDocument,
  QaVerdict,
  RejectionCategory,
  ReviewVerdict,
  UserStory,
  VerificationEntry
} from "../core/types.js";
import { createId, nowIso } from "../core/utils.js";
import {
  diffSnapshots,
  persistRunArtifacts,
  resolveRunPaths,
  saveArchitectInterviewState,
  saveInterviewState,
  saveRepoProfile,
  snapshotProject
} from "../infra/filesystem.js";
import { renderHarnessPromptBlock } from "../interview/adaptive.js";
import { scanBrownfieldContext } from "../interview/brownfield.js";
import { scanRepoProfile } from "../architect/repo-profile.js";

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
    rejectionCategory: {
      type: ["string", "null"],
      enum: [null, "implementation_gap", "requirement_ambiguity", "harness_design_gap"]
    },
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

const FINAL_CRITIC_SCHEMA = {
  ...REVIEW_SCHEMA,
  properties: {
    ...(REVIEW_SCHEMA.properties as Record<string, unknown>),
    rejectionCategory: {
      type: ["string", "null"],
      enum: [null, "implementation_gap", "requirement_ambiguity", "harness_design_gap"]
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
      loopState: {
        ...artifacts.loopState,
        status: "running",
        updatedAt: nowIso(),
        reopenHistory: [...(artifacts.loopState.reopenHistory ?? [])]
      },
      prd: { ...artifacts.prd, status: "running" }
    };
    this._currentHarness = current.prd.activeHarness ?? null;

    while (true) {
      const nextStory = current.prd.stories.find((story) => !story.passes);
      if (!nextStory) {
        const finalCritic = this.normalizeCriticVerdict(await this.finalCritic(cwd, current.prd));
        current.progress += `\n## Final Critic ${nowIso()}\n- Verdict: ${finalCritic.verdict}\n- Summary: ${finalCritic.summary}\n`;
        if (finalCritic.verdict === "APPROVE") {
          current.prd.status = "completed";
          current.loopState.status = "completed";
          current.loopState.currentStoryId = null;
          current.loopState.updatedAt = nowIso();
          await persistRunArtifacts(cwd, runId, current);
          return current;
        }

        if (
          finalCritic.rejectionCategory === "requirement_ambiguity" ||
          finalCritic.rejectionCategory === "harness_design_gap"
        ) {
          const reopen = await this.prepareReopenState(cwd, current.prd, finalCritic);
          current.loopState.reopenHistory.push({
            target: reopen.target,
            stateId: reopen.stateId,
            reason: finalCritic.rejectionCategory,
            command: reopen.command,
            recordedAt: nowIso()
          });
          current.prd.status = "reopen_required";
          current.loopState.status = "reopen_required";
          current.loopState.currentStoryId = null;
          current.loopState.reopenTarget = reopen.target;
          current.loopState.reopenStateId = reopen.stateId;
          current.loopState.suggestedNextCommand = reopen.command;
          current.loopState.reopenReason = finalCritic.rejectionCategory;
          current.loopState.suggestedQuestionFocus = reopen.questionFocus;
          current.loopState.suggestedRepairFocus = reopen.repairFocus;
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
Boundary Hints:
${story.boundaryHints?.map((hint) => `- ${hint}`).join("\n") || "- none"}
Verification Focus:
${story.verificationFocus?.map((focus) => `- ${focus}`).join("\n") || "- none"}
${renderHarnessPromptBlock(this.currentHarness)}

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
Boundary Hints:
${story.boundaryHints?.map((hint) => `- ${hint}`).join("\n") || "- none"}
Verification Focus:
${story.verificationFocus?.map((focus) => `- ${focus}`).join("\n") || "- none"}
${renderHarnessPromptBlock(this.currentHarness)}

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
Boundary Hints:
${story.boundaryHints?.map((hint) => `- ${hint}`).join("\n") || "- none"}
Verification Focus:
${story.verificationFocus?.map((focus) => `- ${focus}`).join("\n") || "- none"}
${renderHarnessPromptBlock(this.currentHarness)}

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
${renderHarnessPromptBlock(prd.activeHarness)}

Approve only when all stories are credibly complete.
If not, reject and set rejectionCategory to one of:
- implementation_gap
- requirement_ambiguity
- harness_design_gap

Use follow-up stories only for implementation_gap.
`,
      FINAL_CRITIC_SCHEMA,
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

  private get currentHarness() {
    return this._currentHarness;
  }

  private _currentHarness = null as PrdDocument["activeHarness"];

  private normalizeCriticVerdict(verdict: ReviewVerdict): ReviewVerdict {
    if (verdict.verdict === "APPROVE") {
      return verdict;
    }

    if (verdict.rejectionCategory) {
      return verdict;
    }

    return {
      ...verdict,
      rejectionCategory: classifyRejectionCategory(verdict)
    };
  }

  private async prepareReopenState(
    cwd: string,
    prd: PrdDocument,
    verdict: ReviewVerdict
  ): Promise<{
    target: "feature" | "harness";
    stateId: string;
    command: string;
    questionFocus: string[] | null;
    repairFocus: string[] | null;
  }> {
    if (verdict.rejectionCategory === "requirement_ambiguity") {
      const brownfieldContext = await scanBrownfieldContext(cwd);
      const stateId = createId("interview");
      const questionFocus = buildQuestionFocus(verdict);
      const state: InterviewState = {
        interviewId: stateId,
        lane: "feature",
        status: "in_progress",
        initialIdea: prd.goal,
        projectType: brownfieldContext.projectType,
        threshold: 0.2,
        currentAmbiguity: 1,
        dimensions:
          brownfieldContext.projectType === "brownfield"
            ? ["goal", "constraints", "criteria", "context"]
            : ["goal", "constraints", "criteria"],
        weights:
          brownfieldContext.projectType === "brownfield"
            ? { goal: 0.35, constraints: 0.25, criteria: 0.25, context: 0.15 }
            : { goal: 0.4, constraints: 0.3, criteria: 0.3, context: 0 },
        brownfieldContext,
        activeHarness: prd.activeHarness ?? null,
        rounds: [
          {
            roundNumber: 1,
            targeting: "criteria",
            rationale: "Final critic requested requirement clarification.",
            question: verdict.findings[0] ?? verdict.summary,
            answer: "Pending user clarification",
            askedAt: nowIso(),
            answeredAt: nowIso(),
            ambiguity: 1,
            breakdown: {
              goal: { score: 0.5, justification: "Carry over previous goal", gap: "Refine requirement gap" },
              constraints: { score: 0.5, justification: "Carry over previous constraints", gap: "Refine requirement gap" },
              criteria: { score: 0.1, justification: "Final critic found ambiguity", gap: verdict.summary },
              context:
                brownfieldContext.projectType === "brownfield"
                  ? { score: 0.8, justification: "Repo context already known", gap: "Clear" }
                  : undefined
            },
            weakestDimension: "criteria",
            weakestDimensionRationale: verdict.summary
          }
        ],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      await saveInterviewState(cwd, state);
      return {
        target: "feature",
        stateId,
        command: `harness interview --resume ${stateId}`,
        questionFocus,
        repairFocus: null
      };
    }

    const repoProfile = await scanRepoProfile(cwd);
    await saveRepoProfile(cwd, repoProfile);
    const stateId = createId("architect");
    const repairFocus = buildRepairFocus(verdict, prd);
    const state: ArchitectInterviewState = {
      interviewId: stateId,
      lane: "architect",
      status: "in_progress",
      initialIdea: prd.activeHarness?.harnessGoal ?? "Design a repo-specific harness for this repository",
      threshold: 0.2,
      currentAmbiguity: 1,
      dimensions: [
        "domain_scope",
        "work_units",
        "team_topology",
        "verification_strategy",
        "user_operating_style"
      ],
      weights: {
        domain_scope: 0.2,
        work_units: 0.25,
        team_topology: 0.2,
        verification_strategy: 0.25,
        user_operating_style: 0.1
      },
      repoProfileId: repoProfile.profileId,
      repoProfileSummary: repoProfile.summary,
      rounds: [
        {
          roundNumber: 1,
          targeting: "verification_strategy",
          rationale: "Final critic found a harness design gap.",
          question: verdict.findings[0] ?? verdict.summary,
          answer: "Pending user clarification",
          askedAt: nowIso(),
          answeredAt: nowIso(),
          ambiguity: 1,
          breakdown: {
            domain_scope: { score: 0.6, justification: "Base goal exists", gap: "Clarify harness gap" },
            work_units: { score: 0.5, justification: "Needs better work-unit coverage", gap: verdict.summary },
            team_topology: { score: 0.5, justification: "May need new specialist split", gap: verdict.summary },
            verification_strategy: { score: 0.1, justification: "Critic reported verification design gap", gap: verdict.summary },
            user_operating_style: { score: 0.6, justification: "Base usage style exists", gap: "Clarify expected operator experience" }
          },
          weakestDimension: "verification_strategy",
          weakestDimensionRationale: verdict.summary
        }
      ],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    await saveArchitectInterviewState(cwd, state);
    return {
      target: "harness",
      stateId,
      command: `harness architect --resume ${stateId}`,
      questionFocus: null,
      repairFocus
    };
  }
}

function classifyRejectionCategory(verdict: ReviewVerdict): RejectionCategory {
  const corpus = [
    verdict.summary,
    ...verdict.findings,
    ...(verdict.followUpStories?.map((story) => story.title) ?? [])
  ]
    .join(" ")
    .toLowerCase();

  if (/(harness|orchestrator|agent|workflow|team topology|verification strategy|repo-specific)/.test(corpus)) {
    return "harness_design_gap";
  }

  if (/(ambigu|clarify|unclear|not specified|needs clarification|required format|output format)/.test(corpus)) {
    return "requirement_ambiguity";
  }

  return "implementation_gap";
}

function buildQuestionFocus(verdict: ReviewVerdict): string[] {
  const hints = verdict.findings.length > 0 ? verdict.findings : [verdict.summary];
  return uniqueGuidance(
    hints.map((hint) => {
      const normalized = normalizeGuidance(hint);
      return /^clarify/i.test(normalized) ? normalized : `Clarify: ${normalized}`;
    })
  );
}

function buildRepairFocus(verdict: ReviewVerdict, prd: PrdDocument): string[] {
  const hints = verdict.findings.length > 0 ? verdict.findings : [verdict.summary];
  const harnessBias = prd.activeHarness?.verificationStrategy?.slice(0, 1) ?? [];
  return uniqueGuidance([
    ...harnessBias.map((item) => `Strengthen verification strategy around: ${item}`),
    ...hints.map((hint) => normalizeGuidance(hint))
  ]);
}

function normalizeGuidance(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueGuidance(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
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
