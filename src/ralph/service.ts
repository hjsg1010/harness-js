import { MAX_REPEATED_FAILURES } from "../core/constants.js";
import type {
  ArchitectInterviewState,
  InterviewState,
  LoopState,
  PrdDocument,
  RejectionCategory,
  ReviewVerdict,
  RunArtifacts,
  StoryResultInput,
  VerificationEntry
} from "../core/types.js";
import { createId, nowIso } from "../core/utils.js";
import {
  persistRunArtifacts,
  saveArchitectInterviewState,
  saveInterviewState,
  saveRepoProfile
} from "../infra/filesystem.js";
import { scanRepoProfile } from "../architect/repo-profile.js";
import { scanBrownfieldContext } from "../interview/brownfield.js";

export class RalphService {
  async applyStoryResult(
    cwd: string,
    runId: string,
    artifacts: RunArtifacts,
    input: StoryResultInput
  ): Promise<RunArtifacts> {
    const current: RunArtifacts = {
      ...artifacts,
      prd: {
        ...artifacts.prd,
        stories: artifacts.prd.stories.map((story) => ({ ...story }))
      },
      loopState: {
        ...artifacts.loopState,
        repeatedFailures: { ...artifacts.loopState.repeatedFailures },
        reopenHistory: [...(artifacts.loopState.reopenHistory ?? [])]
      },
      verification: [...artifacts.verification]
    };

    const story = current.prd.stories.find((item) => item.id === input.storyId);
    if (!story) {
      throw new Error(`Story ${input.storyId} not found in run ${runId}.`);
    }

    current.loopState.status = "running";
    current.loopState.currentStoryId = story.id;
    current.loopState.updatedAt = nowIso();

    const commandsPassed = input.commandResults.every((result) => result.exitCode === 0);
    const verificationEntry: VerificationEntry = {
      storyId: story.id,
      changedFiles: input.changedFiles,
      implementerOutput: input.implementerOutput,
      qaVerdict: input.qaVerdict,
      reviewerVerdict: input.reviewerVerdict,
      commandResults: input.commandResults,
      recordedAt: nowIso()
    };
    current.verification.push(verificationEntry);
    current.progress += [
      `\n## Story ${story.id} - ${story.title}`,
      `- Changed files: ${input.changedFiles.join(", ") || "none"}`,
      `- QA: ${input.qaVerdict.verdict} | ${input.qaVerdict.summary}`,
      `- Reviewer: ${input.reviewerVerdict.verdict} | ${input.reviewerVerdict.summary}`
    ].join("\n");

    if (
      input.qaVerdict.verdict === "APPROVE" &&
      input.reviewerVerdict.verdict === "APPROVE" &&
      commandsPassed
    ) {
      this.markStoryPassed(current.prd, story.id);
      const { [story.id]: _removed, ...remainingFailures } = current.loopState.repeatedFailures;
      current.loopState.repeatedFailures = remainingFailures;
    } else {
      this.markStoryRejected(current.prd, story.id);
      const signature =
        input.reviewerVerdict.failureSignature ??
        input.qaVerdict.failureSignature ??
        "unknown-failure";
      const repeated = current.loopState.repeatedFailures[story.id];
      current.loopState.repeatedFailures = {
        ...current.loopState.repeatedFailures,
        [story.id]:
          repeated && repeated.signature === signature
            ? { signature, count: repeated.count + 1 }
            : { signature, count: 1 }
      };

      if (current.loopState.repeatedFailures[story.id].count >= MAX_REPEATED_FAILURES) {
        current.prd.stories = current.prd.stories.map((item) =>
          item.id === story.id ? { ...item, lastReviewerVerdict: "blocked" as const } : item
        );
        current.loopState.status = "blocked";
        current.loopState.currentStoryId = story.id;
        current.prd.status = "blocked";
        current.loopState.updatedAt = nowIso();
        await persistRunArtifacts(cwd, runId, current);
        return current;
      }

      current.prd.status = "running";
      current.loopState.updatedAt = nowIso();
      await persistRunArtifacts(cwd, runId, current);
      return current;
    }

    const nextStory = current.prd.stories.find((candidate) => !candidate.passes);
    if (nextStory) {
      current.prd.status = "running";
      current.loopState.status = "running";
      current.loopState.currentStoryId = nextStory.id;
      current.loopState.updatedAt = nowIso();
      await persistRunArtifacts(cwd, runId, current);
      return current;
    }

    const finalCritic = input.finalCritic ? this.normalizeCriticVerdict(input.finalCritic) : null;
    if (!finalCritic || finalCritic.verdict === "APPROVE") {
      current.prd.status = "completed";
      current.loopState.status = "completed";
      current.loopState.currentStoryId = null;
      current.loopState.updatedAt = nowIso();
      await persistRunArtifacts(cwd, runId, current);
      return current;
    }

    current.progress += `\n## Final Critic ${nowIso()}\n- Verdict: ${finalCritic.verdict}\n- Summary: ${finalCritic.summary}\n`;
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
      finalCritic.followUpStories?.map((followUp, index) => ({
        id: `story_followup_${String(current.prd.stories.length + index + 1).padStart(3, "0")}`,
        title: followUp.title,
        acceptanceCriteria: followUp.acceptanceCriteria,
        verificationCommands: followUp.verificationCommands ?? [],
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
    current.loopState.currentStoryId = followUps[0]?.id ?? null;
    current.loopState.updatedAt = nowIso();
    await persistRunArtifacts(cwd, runId, current);
    return current;
  }

  private markStoryPassed(prd: PrdDocument, storyId: string): void {
    prd.stories = prd.stories.map((item) =>
      item.id === storyId
        ? { ...item, passes: true, lastReviewerVerdict: "approved" as const }
        : item
    );
  }

  private markStoryRejected(prd: PrdDocument, storyId: string): void {
    prd.stories = prd.stories.map((item) =>
      item.id === storyId
        ? { ...item, attempts: item.attempts + 1, lastReviewerVerdict: "rejected" as const }
        : item
    );
  }

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
      const questionFocus = verdict.suggestedQuestionFocus ?? buildQuestionFocus(verdict);
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
        command: `harness internal feature-init --resume ${stateId} --json`,
        questionFocus,
        repairFocus: null
      };
    }

    const repoProfile = await scanRepoProfile(cwd);
    await saveRepoProfile(cwd, repoProfile);
    const stateId = createId("architect");
    const repairFocus = verdict.suggestedRepairFocus ?? buildRepairFocus(verdict, prd);
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
            user_operating_style: {
              score: 0.6,
              justification: "Base usage style exists",
              gap: "Clarify expected operator experience"
            }
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
      command: `harness internal architect-init --resume ${stateId} --json`,
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
