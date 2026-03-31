import { MAX_AUTO_REOPENS } from "../core/constants.js";
import type { ArchitectInterviewState, InterviewState, OrchestratorRunResult } from "../core/types.js";
import { nowIso } from "../core/utils.js";
import { ArchitectService } from "../architect/service.js";
import { HarnessBlueprintService } from "../architect/blueprint-service.js";
import { HarnessScaffoldService } from "../architect/scaffold-service.js";
import { PrdService } from "../prd/service.js";
import { RalphService } from "../ralph/service.js";
import { SeedService } from "../seed/service.js";
import { InterviewService } from "../interview/service.js";

export class OrchestratorService {
  constructor(
    private readonly interviewService: InterviewService,
    private readonly seedService: SeedService,
    private readonly prdService: PrdService,
    private readonly ralphService: RalphService,
    private readonly architectService?: ArchitectService,
    private readonly harnessBlueprintService?: HarnessBlueprintService,
    private readonly harnessScaffoldService?: HarnessScaffoldService
  ) {}

  async runIdea(
    cwd: string,
    idea: string,
    featureAnswers: string[] = [],
    harnessAnswers: string[] = []
  ): Promise<OrchestratorRunResult> {
    const reopenHistory: OrchestratorRunResult["reopenHistory"] = [];
    const counters = { total: 0, feature: 0, harness: 0 };

    let featureState = await this.completeFeatureInterview(
      await this.interviewService.create(idea, cwd),
      cwd,
      featureAnswers
    );
    let seedArtifacts = await this.seedService.generateFromInterview(cwd, featureState.interviewId);
    let run = await this.prdService.createRunFromSource(cwd, seedArtifacts.seedPath, {
      activeHarness: featureState.activeHarness ?? null
    });
    run.loopState.reopenHistory = [...reopenHistory];
    let result = await this.ralphService.execute(cwd, run.runId, {
      prd: run.prd,
      loopState: run.loopState,
      progress: `# Ralph Progress\n\nRun ID: ${run.runId}\nSource: ${seedArtifacts.seedPath}\n`,
      verification: []
    });
    let latestRunId = run.runId;

    while (result.loopState.status === "reopen_required") {
      if (counters.total >= MAX_AUTO_REOPENS) {
        break;
      }

      if (result.loopState.reopenTarget === "feature" && counters.feature < 1) {
        counters.total += 1;
        counters.feature += 1;
        const stateId = result.loopState.reopenStateId;
        if (!stateId) {
          break;
        }
        reopenHistory.push({
          target: "feature",
          stateId,
          reason: result.loopState.reopenReason ?? "requirement_ambiguity",
          command: result.loopState.suggestedNextCommand ?? `harness interview --resume ${stateId}`,
          recordedAt: nowIso()
        });
        featureState = await this.completeFeatureInterview(
          await this.interviewService.resume(stateId, cwd),
          cwd,
          featureAnswers
        );
        seedArtifacts = await this.seedService.generateFromInterview(cwd, featureState.interviewId, {
          force: featureState.currentAmbiguity <= featureState.threshold ? false : true
        });
        run = await this.prdService.createRunFromSource(cwd, seedArtifacts.seedPath, {
          activeHarness: featureState.activeHarness ?? null
        });
        run.loopState.reopenHistory = [...reopenHistory];
        latestRunId = run.runId;
        result = await this.ralphService.execute(cwd, run.runId, {
          prd: run.prd,
          loopState: run.loopState,
          progress: `# Ralph Progress\n\nRun ID: ${run.runId}\nSource: ${seedArtifacts.seedPath}\n`,
          verification: []
        });
        continue;
      }

      if (result.loopState.reopenTarget === "harness" && counters.harness < 1) {
        this.requireArchitectSuite();
        counters.total += 1;
        counters.harness += 1;
        const stateId = result.loopState.reopenStateId;
        if (!stateId) {
          break;
        }
        reopenHistory.push({
          target: "harness",
          stateId,
          reason: result.loopState.reopenReason ?? "harness_design_gap",
          command: result.loopState.suggestedNextCommand ?? `harness architect --resume ${stateId}`,
          recordedAt: nowIso()
        });
        const completedArchitect = await this.completeArchitectInterview(
          await this.architectService!.resume(stateId, cwd),
          cwd,
          harnessAnswers
        );
        const blueprintArtifacts = await this.harnessBlueprintService!.generateFromInterview(
          cwd,
          completedArchitect.interviewId,
          {
            force: completedArchitect.currentAmbiguity <= completedArchitect.threshold ? false : true
          }
        );
        await this.harnessScaffoldService!.generateFromSource(cwd, blueprintArtifacts.seedPath);
        run = await this.prdService.createRunFromSource(cwd, run.prd.sourceSeedPath);
        run.loopState.reopenHistory = [...reopenHistory];
        latestRunId = run.runId;
        result = await this.ralphService.execute(cwd, run.runId, {
          prd: run.prd,
          loopState: run.loopState,
          progress: `# Ralph Progress\n\nRun ID: ${run.runId}\nSource: ${run.prd.sourceSeedPath}\n`,
          verification: []
        });
        continue;
      }

      break;
    }

    return {
      ...result,
      runId: latestRunId,
      reopenHistory
    };
  }

  private async completeFeatureInterview(
    state: InterviewState,
    cwd: string,
    answers: string[]
  ): Promise<InterviewState> {
    let current = state;
    while (current.status !== "completed") {
      const draft = await this.interviewService.nextQuestion(current, cwd);
      const answer = answers.shift();
      if (!answer) {
        throw new Error(`No scripted feature answer available for: ${draft.question}`);
      }
      current = await this.interviewService.answer(current, draft, answer, cwd);
    }
    return current;
  }

  private async completeArchitectInterview(
    state: ArchitectInterviewState,
    cwd: string,
    answers: string[]
  ): Promise<ArchitectInterviewState> {
    while (state.status !== "completed") {
      const draft = await this.architectService!.nextQuestion(state, cwd);
      const answer = answers.shift();
      if (!answer) {
        throw new Error(`No scripted architect answer available for: ${draft.question}`);
      }
      state = await this.architectService!.answer(state, draft, answer, cwd);
    }
    return state;
  }

  private requireArchitectSuite(): void {
    if (!this.architectService || !this.harnessBlueprintService || !this.harnessScaffoldService) {
      throw new Error("Architect services are required for harness reopen orchestration.");
    }
  }
}
