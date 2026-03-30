#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { ProcessCodexRunner } from "./infra/codex-runner.js";
import { loadRunArtifacts } from "./infra/filesystem.js";
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
  const seedService = new SeedService(runner);
  const prdService = new PrdService(seedService);
  const ralphService = new RalphService(runner);

  switch (command) {
    case "interview":
      await runInterviewCommand(argv, cwd, interviewService);
      return;
    case "seed":
      await runSeedCommand(argv, cwd, seedService);
      return;
    case "ralph":
      await runRalphCommand(argv, cwd, prdService, ralphService);
      return;
    case "run":
      await runCompositeCommand(argv, cwd, interviewService, seedService, prdService, ralphService);
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
}

async function runCompositeCommand(
  argv: string[],
  cwd: string,
  interviewService: InterviewService,
  seedService: SeedService,
  prdService: PrdService,
  ralphService: RalphService
): Promise<void> {
  const input = positionalArgs(argv, new Set()).join(" ").trim();
  if (!input) {
    throw new Error("run command requires an idea or file path");
  }

  if (existsSync(resolve(cwd, input))) {
    await runRalphCommand([input], cwd, prdService, ralphService);
    return;
  }

  let state = await interviewService.create(input, cwd);
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    while (state.status !== "completed") {
      const draft = await interviewService.nextQuestion(state, cwd);
      console.log(`\nRound ${state.rounds.length + 1} | Targeting: ${draft.targeting}`);
      console.log(draft.question);
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

  const { seedPath } = await seedService.generateFromInterview(cwd, state.interviewId);
  const { runId, prd, loopState } = await prdService.createRunFromSource(cwd, seedPath);
  const result = await ralphService.execute(cwd, runId, {
    prd,
    loopState,
    progress: `# Ralph Progress\n\nRun ID: ${runId}\nSource: ${seedPath}\n`,
    verification: []
  });
  console.log(`Run ${runId} finished with status: ${result.loopState.status}`);
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
  node ${file} seed <interview-id> [--force]
  node ${file} ralph <spec-or-seed-path> [--resume <run-id>]
  node ${file} run "<idea-or-path>"`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
