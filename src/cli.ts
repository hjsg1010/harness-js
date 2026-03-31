#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ProcessCodexRunner } from "./infra/codex-runner.js";
import { loadRunArtifacts } from "./infra/filesystem.js";
import { ArchitectService } from "./architect/service.js";
import { HarnessBlueprintService } from "./architect/blueprint-service.js";
import { HarnessScaffoldService } from "./architect/scaffold-service.js";
import { MAX_AUTO_REOPENS } from "./core/constants.js";
import type { InterviewState } from "./core/types.js";
import { InterviewService } from "./interview/service.js";
import { PrdService } from "./prd/service.js";
import { RalphService } from "./ralph/service.js";
import { SeedService } from "./seed/service.js";

async function main(): Promise<void> {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  const cwd = process.cwd();
  const runner = new ProcessCodexRunner();
  const interviewService = new InterviewService(runner);
  const architectService = new ArchitectService(runner);
  const seedService = new SeedService(runner);
  const harnessBlueprintService = new HarnessBlueprintService(runner);
  const harnessScaffoldService = new HarnessScaffoldService();
  const prdService = new PrdService(seedService);
  const ralphService = new RalphService(runner);

  switch (command) {
    case "interview":
      await runInterviewCommand(argv, cwd, interviewService);
      return;
    case "architect":
      await runArchitectCommand(argv, cwd, architectService);
      return;
    case "seed":
      await runSeedCommand(argv, cwd, seedService);
      return;
    case "blueprint":
      await runBlueprintCommand(argv, cwd, harnessBlueprintService);
      return;
    case "scaffold":
      await runScaffoldCommand(argv, cwd, harnessScaffoldService);
      return;
    case "ralph":
      await runRalphCommand(argv, cwd, prdService, ralphService);
      return;
    case "run":
      await runCompositeCommand(
        argv,
        cwd,
        interviewService,
        architectService,
        seedService,
        harnessBlueprintService,
        harnessScaffoldService,
        prdService,
        ralphService
      );
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function runInterviewCommand(
  argv: string[],
  cwd: string,
  interviewService: InterviewService
): Promise<void> {
  const resume = readFlagValue(argv, "--resume");
  const idea = positionalArgs(argv, new Set(["--resume"])).join(" ").trim();
  if (!resume && !idea) {
    throw new Error("interview command requires an idea or --resume");
  }
  let state = resume ? await interviewService.resume(resume, cwd) : await interviewService.create(idea, cwd);

  console.log(`Interview ID: ${state.interviewId}`);
  console.log(`Project Type: ${state.projectType}`);
  console.log(`Current Ambiguity: ${(state.currentAmbiguity * 100).toFixed(0)}%`);
  if (state.brownfieldContext) {
    console.log(`Context: ${state.brownfieldContext.summary}`);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    while (state.status !== "completed") {
      const draft = await interviewService.nextQuestion(state, cwd);
      console.log(`\nRound ${state.rounds.length + 1} | Targeting: ${draft.targeting}`);
      console.log(`${draft.question}`);
      const answer = (await rl.question("> ")).trim();
      if (!answer || [":quit", "quit", "exit"].includes(answer.toLowerCase())) {
        console.log(`Interview saved. Resume with: harness interview --resume ${state.interviewId}`);
        return;
      }
      state = await interviewService.answer(state, draft, answer, cwd);
      console.log(interviewService.formatProgress(state));
    }
  } finally {
    rl.close();
  }

  console.log(`Interview completed. Generate seed with: harness seed ${state.interviewId}`);
}

async function runArchitectCommand(
  argv: string[],
  cwd: string,
  architectService: ArchitectService
): Promise<void> {
  const resume = readFlagValue(argv, "--resume");
  const idea = positionalArgs(argv, new Set(["--resume"])).join(" ").trim();
  if (!resume && !idea) {
    throw new Error("architect command requires a repo goal or --resume");
  }

  let state = resume ? await architectService.resume(resume, cwd) : await architectService.create(idea, cwd);
  console.log(`Architect Interview ID: ${state.interviewId}`);
  console.log(`Current Ambiguity: ${(state.currentAmbiguity * 100).toFixed(0)}%`);
  console.log(`Repo Profile: ${state.repoProfileSummary}`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    state = await completeArchitectInterviewInteractive(state, cwd, architectService, rl);
  } catch (error) {
    if (error instanceof Error && error.message === "__quit__") {
      return;
    }
    throw error;
  } finally {
    rl.close();
  }

  console.log(`Architect interview completed. Generate blueprint with: harness blueprint ${state.interviewId}`);
}

async function runSeedCommand(
  argv: string[],
  cwd: string,
  seedService: SeedService
): Promise<void> {
  const force = argv.includes("--force");
  const interviewId = positionalArgs(argv, new Set())[0];
  if (!interviewId) {
    throw new Error("seed command requires an interview id");
  }

  const result = await seedService.generateFromInterview(cwd, interviewId, { force });
  console.log(`Spec: ${result.specPath}`);
  console.log(`Seed: ${result.seedPath}`);
}

async function runBlueprintCommand(
  argv: string[],
  cwd: string,
  blueprintService: HarnessBlueprintService
): Promise<void> {
  const force = argv.includes("--force");
  const architectInterviewId = positionalArgs(argv, new Set())[0];
  if (!architectInterviewId) {
    throw new Error("blueprint command requires an architect interview id");
  }

  const result = await blueprintService.generateFromInterview(cwd, architectInterviewId, { force });
  console.log(`Blueprint: ${result.blueprintPath}`);
  console.log(`Harness Seed: ${result.seedPath}`);
}

async function runScaffoldCommand(
  argv: string[],
  cwd: string,
  scaffoldService: HarnessScaffoldService
): Promise<void> {
  const source = positionalArgs(argv, new Set())[0];
  if (!source) {
    throw new Error("scaffold command requires a blueprint or harness seed path");
  }
  const result = await scaffoldService.generateFromSource(cwd, resolve(cwd, source));
  console.log(`Generated harness: ${result.slug}`);
  console.log(`Active harness: ${result.activeHarness.slug}`);
}

async function runRalphCommand(
  argv: string[],
  cwd: string,
  prdService: PrdService,
  ralphService: RalphService
): Promise<void> {
  const resume = readFlagValue(argv, "--resume");
  if (resume) {
    const artifacts = await loadRunArtifacts(cwd, resume);
    const result = await ralphService.execute(cwd, resume, artifacts);
    console.log(`Run ${resume} finished with status: ${result.loopState.status}`);
    if (result.loopState.status === "reopen_required" && result.loopState.suggestedNextCommand) {
      console.log(`Next step: ${result.loopState.suggestedNextCommand}`);
    }
    return;
  }

  const source = positionalArgs(argv, new Set(["--resume"]))[0];
  if (!source) {
    throw new Error("ralph command requires a seed or spec path");
  }

  const resolvedSource = resolve(cwd, source);
  const { runId, prd, loopState } = await prdService.createRunFromSource(cwd, resolvedSource);
  const artifacts = {
    prd,
    loopState,
    progress: `# Ralph Progress\n\nRun ID: ${runId}\nSource: ${resolvedSource}\n`,
    verification: []
  };
  const result = await ralphService.execute(cwd, runId, artifacts);
  console.log(`Run ${runId} finished with status: ${result.loopState.status}`);
  if (result.loopState.status === "reopen_required" && result.loopState.suggestedNextCommand) {
    console.log(`Next step: ${result.loopState.suggestedNextCommand}`);
  }
}

async function runCompositeCommand(
  argv: string[],
  cwd: string,
  interviewService: InterviewService,
  architectService: ArchitectService,
  seedService: SeedService,
  blueprintService: HarnessBlueprintService,
  scaffoldService: HarnessScaffoldService,
  prdService: PrdService,
  ralphService: RalphService
): Promise<void> {
  const input = positionalArgs(argv, new Set()).join(" ").trim();
  if (!input) {
    throw new Error("run command requires an idea or file path");
  }

  if (existsSync(resolve(cwd, input))) {
    await runCompositeFromSource(
      cwd,
      resolve(cwd, input),
      interviewService,
      architectService,
      seedService,
      blueprintService,
      scaffoldService,
      prdService,
      ralphService
    );
    return;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    let featureState = await completeFeatureInterviewInteractive(
      await interviewService.create(input, cwd),
      cwd,
      interviewService,
      rl
    );
    let currentSourcePath = (await seedService.generateFromInterview(cwd, featureState.interviewId)).seedPath;
    let currentRun = await executeRunFromSource(cwd, currentSourcePath, prdService, ralphService, {
      activeHarness: featureState.activeHarness ?? null
    });
    let autoFeatureReopens = 0;
    let autoHarnessReopens = 0;
    let totalReopens = 0;

    while (
      currentRun.result.loopState.status === "reopen_required" &&
      totalReopens < MAX_AUTO_REOPENS
    ) {
      if (
        currentRun.result.loopState.reopenTarget === "feature" &&
        currentRun.result.loopState.reopenStateId &&
        autoFeatureReopens < 1
      ) {
        totalReopens += 1;
        autoFeatureReopens += 1;
        featureState = await completeFeatureInterviewInteractive(
          await interviewService.resume(currentRun.result.loopState.reopenStateId, cwd),
          cwd,
          interviewService,
          rl
        );
        currentSourcePath = (
          await seedService.generateFromInterview(cwd, featureState.interviewId, {
            force: featureState.currentAmbiguity > featureState.threshold
          })
        ).seedPath;
        currentRun = await executeRunFromSource(cwd, currentSourcePath, prdService, ralphService, {
          activeHarness: featureState.activeHarness ?? null
        });
        continue;
      }

      if (
        currentRun.result.loopState.reopenTarget === "harness" &&
        currentRun.result.loopState.reopenStateId &&
        autoHarnessReopens < 1
      ) {
        totalReopens += 1;
        autoHarnessReopens += 1;
        const architectState = await completeArchitectInterviewInteractive(
          await architectService.resume(currentRun.result.loopState.reopenStateId, cwd),
          cwd,
          architectService,
          rl
        );
        const blueprintArtifacts = await blueprintService.generateFromInterview(cwd, architectState.interviewId, {
          force: architectState.currentAmbiguity > architectState.threshold
        });
        await scaffoldService.generateFromSource(cwd, blueprintArtifacts.seedPath);
        currentRun = await executeRunFromSource(cwd, currentSourcePath, prdService, ralphService);
        continue;
      }

      break;
    }

    console.log(`Run ${currentRun.runId} finished with status: ${currentRun.result.loopState.status}`);
    if (
      currentRun.result.loopState.status === "reopen_required" &&
      currentRun.result.loopState.suggestedNextCommand
    ) {
      console.log(`Next step: ${currentRun.result.loopState.suggestedNextCommand}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "__quit__") {
      return;
    }
    throw error;
  } finally {
    rl.close();
  }
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function positionalArgs(argv: string[], flagsWithValues: Set<string>): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--")) {
      if (flagsWithValues.has(item)) {
        index += 1;
      }
      continue;
    }
    values.push(item);
  }
  return values;
}

function printUsage(): void {
  const file = resolve(dirname(new URL(import.meta.url).pathname), "cli.js");
  console.log(`Usage:
  node ${file} interview "<idea>" [--resume <interview-id>]
  node ${file} architect "<repo-goal>" [--resume <architect-id>]
  node ${file} seed <interview-id> [--force]
  node ${file} blueprint <architect-id> [--force]
  node ${file} scaffold <blueprint-or-seed-path>
  node ${file} ralph <spec-or-seed-path> [--resume <run-id>]
  node ${file} run "<idea-or-path>"`);
}

async function completeFeatureInterviewInteractive(
  state: InterviewState,
  cwd: string,
  interviewService: InterviewService,
  rl: ReturnType<typeof createInterface>
): Promise<InterviewState> {
  let current = state;
  while (current.status !== "completed") {
    const draft = await interviewService.nextQuestion(current, cwd);
    console.log(`\nRound ${current.rounds.length + 1} | Targeting: ${draft.targeting}`);
    console.log(draft.question);
    const answer = (await rl.question("> ")).trim();
    if (!answer || [":quit", "quit", "exit"].includes(answer.toLowerCase())) {
      console.log(`Interview saved. Resume with: harness interview --resume ${current.interviewId}`);
      process.exitCode = 0;
      throw new Error("__quit__");
    }
    current = await interviewService.answer(current, draft, answer, cwd);
    console.log(interviewService.formatProgress(current));
  }
  return current;
}

async function completeArchitectInterviewInteractive(
  state: Awaited<ReturnType<ArchitectService["resume"]>>,
  cwd: string,
  architectService: ArchitectService,
  rl: ReturnType<typeof createInterface>
): Promise<Awaited<ReturnType<ArchitectService["resume"]>>> {
  let current = state;
  while (current.status !== "completed") {
    const draft = await architectService.nextQuestion(current, cwd);
    console.log(`\nArchitect Round ${current.rounds.length + 1} | Targeting: ${draft.targeting}`);
    console.log(draft.question);
    const answer = (await rl.question("> ")).trim();
    if (!answer || [":quit", "quit", "exit"].includes(answer.toLowerCase())) {
      console.log(`Architect interview saved. Resume with: harness architect --resume ${current.interviewId}`);
      process.exitCode = 0;
      throw new Error("__quit__");
    }
    current = await architectService.answer(current, draft, answer, cwd);
    console.log(architectService.formatProgress(current));
  }
  return current;
}

async function executeRunFromSource(
  cwd: string,
  sourcePath: string,
  prdService: PrdService,
  ralphService: RalphService,
  options: { activeHarness?: InterviewState["activeHarness"] } = {}
) {
  const { runId, prd, loopState } = await prdService.createRunFromSource(cwd, sourcePath, {
    activeHarness: options.activeHarness ?? null
  });
  const result = await ralphService.execute(cwd, runId, {
    prd,
    loopState,
    progress: `# Ralph Progress\n\nRun ID: ${runId}\nSource: ${sourcePath}\n`,
    verification: []
  });
  return { runId, result };
}

async function runCompositeFromSource(
  cwd: string,
  sourcePath: string,
  interviewService: InterviewService,
  architectService: ArchitectService,
  seedService: SeedService,
  blueprintService: HarnessBlueprintService,
  scaffoldService: HarnessScaffoldService,
  prdService: PrdService,
  ralphService: RalphService
): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    let currentSourcePath = sourcePath;
    let currentRun = await executeRunFromSource(cwd, currentSourcePath, prdService, ralphService);
    let autoFeatureReopens = 0;
    let autoHarnessReopens = 0;
    let totalReopens = 0;

    while (
      currentRun.result.loopState.status === "reopen_required" &&
      totalReopens < MAX_AUTO_REOPENS
    ) {
      if (
        currentRun.result.loopState.reopenTarget === "feature" &&
        currentRun.result.loopState.reopenStateId &&
        autoFeatureReopens < 1
      ) {
        totalReopens += 1;
        autoFeatureReopens += 1;
        const featureState = await completeFeatureInterviewInteractive(
          await interviewService.resume(currentRun.result.loopState.reopenStateId, cwd),
          cwd,
          interviewService,
          rl
        );
        currentSourcePath = (
          await seedService.generateFromInterview(cwd, featureState.interviewId, {
            force: featureState.currentAmbiguity > featureState.threshold
          })
        ).seedPath;
        currentRun = await executeRunFromSource(cwd, currentSourcePath, prdService, ralphService, {
          activeHarness: featureState.activeHarness ?? null
        });
        continue;
      }

      if (
        currentRun.result.loopState.reopenTarget === "harness" &&
        currentRun.result.loopState.reopenStateId &&
        autoHarnessReopens < 1
      ) {
        totalReopens += 1;
        autoHarnessReopens += 1;
        const architectState = await completeArchitectInterviewInteractive(
          await architectService.resume(currentRun.result.loopState.reopenStateId, cwd),
          cwd,
          architectService,
          rl
        );
        const blueprintArtifacts = await blueprintService.generateFromInterview(cwd, architectState.interviewId, {
          force: architectState.currentAmbiguity > architectState.threshold
        });
        await scaffoldService.generateFromSource(cwd, blueprintArtifacts.seedPath);
        currentRun = await executeRunFromSource(cwd, currentSourcePath, prdService, ralphService);
        continue;
      }

      break;
    }

    console.log(`Run ${currentRun.runId} finished with status: ${currentRun.result.loopState.status}`);
    if (
      currentRun.result.loopState.status === "reopen_required" &&
      currentRun.result.loopState.suggestedNextCommand
    ) {
      console.log(`Next step: ${currentRun.result.loopState.suggestedNextCommand}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "__quit__") {
      return;
    }
    throw error;
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
