import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ArchitectInterviewState } from "../src/core/types.js";
import {
  resolveGeneratedHarnessPaths,
  loadActiveHarness,
  loadGeneratedHarnessManifest,
  saveRepoProfile,
  saveArchitectInterviewState
} from "../src/infra/filesystem.js";
import { parseHarnessSeedYaml, parseHarnessBlueprintMarkdown } from "../src/infra/serializers.js";
import { HarnessBlueprintService } from "../src/architect/blueprint-service.js";
import { HarnessScaffoldService } from "../src/architect/scaffold-service.js";
import { InterviewService } from "../src/interview/service.js";
import { FakeCodexRunner } from "./helpers/fake-runner.js";
import { cleanupTempDir, createTempDir } from "./helpers/temp-dir.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
});

describe("Harness blueprint and scaffold", () => {
  it("renders immutable blueprint/seed artifacts and activates generated harness", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const architect: ArchitectInterviewState = {
      interviewId: "architect_fixed",
      lane: "architect",
      status: "completed",
      initialIdea: "리서치 하네스를 구성해줘",
      threshold: 0.2,
      currentAmbiguity: 0.14,
      dimensions: ["domain_scope", "work_units", "team_topology", "verification_strategy", "user_operating_style"],
      weights: {
        domain_scope: 0.2,
        work_units: 0.25,
        team_topology: 0.2,
        verification_strategy: 0.25,
        user_operating_style: 0.1
      },
      repoProfileId: "profile_fixed",
      repoProfileSummary: "TypeScript CLI with npm scripts and docs.",
      rounds: [
        {
          roundNumber: 1,
          targeting: "work_units",
          rationale: "Work units first.",
          question: "어떤 작업 단위가 필요한가요?",
          answer: "search, paper review, community review, synthesis",
          askedAt: "2026-03-31T00:00:00.000Z",
          answeredAt: "2026-03-31T00:00:00.000Z",
          ambiguity: 0.14,
          breakdown: {
            domain_scope: { score: 0.9, justification: "Clear", gap: "Clear" },
            work_units: { score: 0.95, justification: "Clear", gap: "Clear" },
            team_topology: { score: 0.9, justification: "Clear", gap: "Clear" },
            verification_strategy: { score: 0.85, justification: "Clear", gap: "Clear" },
            user_operating_style: { score: 0.9, justification: "Clear", gap: "Clear" }
          },
          weakestDimension: "verification_strategy",
          weakestDimensionRationale: "Only light validation detail remains."
        }
      ],
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z"
    };
    await saveRepoProfile(cwd, {
      profileId: "profile_fixed",
      scannedAt: "2026-03-31T00:00:00.000Z",
      summary: "TypeScript CLI with npm scripts and docs.",
      stack: ["typescript"],
      packageManager: "npm",
      scripts: { build: "npm run build", test: "npm test" },
      topLevelDirectories: ["src", "tests", "docs"],
      likelyBoundaries: ["src", "tests", "docs"],
      conventions: ["local artifacts"],
      riskSurfaces: ["generated assets"],
      relevantFiles: ["README.md", "src/cli.ts"]
    });
    await saveArchitectInterviewState(cwd, architect);

    const runner = new FakeCodexRunner();
    runner.pushExecJson({
      title: "Research Harness",
      harnessGoal: "Build a repo-specific harness for multi-angle research and synthesis.",
      repoProfileSummary: ["TypeScript CLI", "npm build and test scripts"],
      workUnits: ["web-search", "paper-review", "community-review", "synthesis"],
      teamTopology: ["orchestrator", "web-researcher", "paper-analyst", "community-analyst", "synthesizer"],
      verificationStrategy: ["cross-check citations", "compare findings across sources", "require final synthesis checklist"],
      userOperatingStyle: ["single command entrypoint", "preserve intermediate artifacts"],
      agentRoster: [
        { name: "orchestrator", role: "Coordinate the research team", responsibilities: ["dispatch work", "merge outputs"] },
        { name: "web-researcher", role: "Gather web evidence", responsibilities: ["search web", "collect links"] },
        { name: "paper-analyst", role: "Review academic sources", responsibilities: ["find papers", "summarize evidence"] },
        { name: "community-analyst", role: "Review community responses", responsibilities: ["inspect forums", "summarize sentiment"] },
        { name: "synthesizer", role: "Write final synthesis", responsibilities: ["compare evidence", "draft report"] }
      ],
      skillRoster: [
        { name: "research-orchestrator", purpose: "Coordinate team workflow" },
        { name: "research-web", purpose: "Search and summarize web sources" },
        { name: "research-papers", purpose: "Review papers and academic evidence" },
        { name: "research-community", purpose: "Review community feedback" },
        { name: "research-synthesis", purpose: "Write synthesis report" }
      ],
      orchestrationProtocol: [
        "orchestrator dispatches all specialists",
        "specialists write into _workspace",
        "synthesizer merges findings into final report"
      ],
      constraints: ["Keep outputs local", "Do not overwrite user-edited generated files"],
      generationTargets: ["claude-agents", "claude-skills", "codex-skills"]
    });

    const blueprintService = new HarnessBlueprintService(runner);
    const scaffoldService = new HarnessScaffoldService();
    const blueprintResult = await blueprintService.generateFromInterview(cwd, architect.interviewId);

    const parsedBlueprint = parseHarnessBlueprintMarkdown(await readFile(blueprintResult.blueprintPath, "utf8"));
    const parsedSeed = parseHarnessSeedYaml(await readFile(blueprintResult.seedPath, "utf8"));

    expect(parsedBlueprint.harnessGoal).toBe(blueprintResult.blueprint.harnessGoal);
    expect(parsedSeed.harness_goal).toBe(blueprintResult.seed.harness_goal);

    const scaffoldResult = await scaffoldService.generateFromSource(cwd, blueprintResult.seedPath);
    expect(scaffoldResult.slug).toBe("research-harness");

    const manifest = await loadGeneratedHarnessManifest(cwd, "research-harness");
    const activeHarness = await loadActiveHarness(cwd);
    expect(manifest.slug).toBe("research-harness");
    expect(activeHarness.slug).toBe("research-harness");

    const orchestratorSkill = join(cwd, ".agents/skills/research-harness-orchestrator/SKILL.md");
    const orchestratorSkillContent = await readFile(orchestratorSkill, "utf8");
    expect(orchestratorSkillContent).toContain("research-harness");
    expect(orchestratorSkillContent).toContain("_workspace");
    expect(orchestratorSkillContent).toContain("validation-checklist.md");

    const generatedAgent = join(cwd, ".claude/agents/research-harness-orchestrator.md");
    const generatedAgentContent = await readFile(generatedAgent, "utf8");
    expect(generatedAgentContent).toContain("Inputs:");
    expect(generatedAgentContent).toContain("Outputs:");
    expect(generatedAgentContent).toContain("Collaboration:");

    const artifactContracts = await readFile(
      join(cwd, ".harness/generated-harness/research-harness/references/artifact-contracts.md"),
      "utf8"
    );
    expect(artifactContracts).toContain("web-search");
    expect(artifactContracts).toContain("Expected Artifacts");

    const handoffProtocol = await readFile(
      join(cwd, ".harness/generated-harness/research-harness/references/handoff-protocol.md"),
      "utf8"
    );
    expect(handoffProtocol).toContain("_workspace");
    expect(handoffProtocol).toContain("phase_role_artifact");

    const verificationPolicy = await readFile(
      join(cwd, ".harness/generated-harness/research-harness/references/verification-policy.md"),
      "utf8"
    );
    expect(verificationPolicy).toContain("typecheck");
    expect(verificationPolicy).toContain("Verification strategy");

    const manifestPath = resolveGeneratedHarnessPaths(cwd, "research-harness").manifestPath;
    expect(await readFile(manifestPath, "utf8")).toContain("research-harness");

    const interviewRunner = new FakeCodexRunner();
    interviewRunner.pushExecJson({
      targeting: "goal",
      rationale: "Goal needs a first action.",
      question: "What should happen first?"
    });
    const interviewService = new InterviewService(interviewRunner);
    const featureState = await interviewService.create("Build a report writer", cwd);
    await interviewService.nextQuestion(featureState, cwd);

    expect(interviewRunner.execJsonPrompts[0]).toContain("Active Harness");
    expect(interviewRunner.execJsonPrompts[0]).toContain("research-harness");
  });

  it("protects user-edited generated files on re-scaffold", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const seedPath = join(cwd, "harness-seed.yaml");
    await writeFile(
      seedPath,
      `harness_goal: Build a repo-specific research harness
repo_profile:
  stack:
    - typescript
  package_manager: npm
  scripts:
    build: npm run build
  top_level_directories:
    - src
  likely_boundaries:
    - cli
  conventions:
    - local artifacts
  risk_surfaces:
    - stale evidence
  relevant_files:
    - README.md
work_units:
  - web-search
  - synthesis
agents:
  - name: orchestrator
    role: Coordinate specialists
    responsibilities:
      - dispatch work
  - name: web-researcher
    role: Search web evidence
    responsibilities:
      - gather links
  - name: synthesizer
    role: Write synthesis
    responsibilities:
      - merge findings
skills:
  - name: research-orchestrator
    purpose: Coordinate workflow
  - name: research-web
    purpose: Search web
  - name: research-synthesis
    purpose: Write synthesis
verification:
  strategy:
    - compare sources
  emphasis:
    - citation consistency
generation_targets:
  slug: research-harness
  claude_agents: true
  claude_skills: true
  codex_skills: true
metadata:
  seed_id: harness_seed_fixed
  blueprint_id: blueprint_fixed
  interview_id: architect_fixed
  ambiguity_score: 0.14
  forced: false
  created_at: 2026-03-31T00:00:00.000Z
`,
      "utf8"
    );

    const scaffoldService = new HarnessScaffoldService();
    await scaffoldService.generateFromSource(cwd, seedPath);

    const target = join(cwd, ".claude/agents/research-harness-orchestrator.md");
    await writeFile(target, "# user-edited\n", "utf8");

    await expect(scaffoldService.generateFromSource(cwd, seedPath)).rejects.toThrow(/conflict/i);
  });

  it("allows multiple generated harness manifests to coexist by slug", async () => {
    const cwd = await createTempDir();
    tempDirs.push(cwd);

    const scaffoldService = new HarnessScaffoldService();
    const firstSeedPath = join(cwd, "research-seed.yaml");
    const secondSeedPath = join(cwd, "analysis-seed.yaml");

    await writeFile(
      firstSeedPath,
      `harness_goal: Build a repo-specific research harness
repo_profile:
  stack:
    - typescript
  package_manager: npm
  scripts: {}
  top_level_directories:
    - src
  likely_boundaries:
    - src
  conventions:
    - local artifacts
  risk_surfaces:
    - generated assets
  relevant_files:
    - README.md
work_units:
  - web-search
agents:
  - name: orchestrator
    role: Coordinate specialists
    responsibilities:
      - dispatch work
skills:
  - name: research-orchestrator
    purpose: Coordinate workflow
verification:
  strategy:
    - compare sources
  emphasis:
    - citation consistency
generation_targets:
  slug: research-harness
  claude_agents: true
  claude_skills: true
  codex_skills: true
metadata:
  seed_id: harness_seed_research
  blueprint_id: blueprint_research
  interview_id: architect_research
  ambiguity_score: 0.14
  forced: false
  created_at: 2026-03-31T00:00:00.000Z
`,
      "utf8"
    );

    await writeFile(
      secondSeedPath,
      `harness_goal: Build a repo-specific analysis harness
repo_profile:
  stack:
    - typescript
  package_manager: npm
  scripts: {}
  top_level_directories:
    - src
  likely_boundaries:
    - src
  conventions:
    - local artifacts
  risk_surfaces:
    - generated assets
  relevant_files:
    - README.md
work_units:
  - data-analysis
agents:
  - name: orchestrator
    role: Coordinate specialists
    responsibilities:
      - dispatch work
skills:
  - name: analysis-orchestrator
    purpose: Coordinate workflow
verification:
  strategy:
    - compare outputs
  emphasis:
    - consistency
generation_targets:
  slug: analysis-harness
  claude_agents: true
  claude_skills: true
  codex_skills: true
metadata:
  seed_id: harness_seed_analysis
  blueprint_id: blueprint_analysis
  interview_id: architect_analysis
  ambiguity_score: 0.12
  forced: false
  created_at: 2026-03-31T00:00:00.000Z
`,
      "utf8"
    );

    await scaffoldService.generateFromSource(cwd, firstSeedPath);
    await scaffoldService.generateFromSource(cwd, secondSeedPath);

    const firstManifest = await loadGeneratedHarnessManifest(cwd, "research-harness");
    const secondManifest = await loadGeneratedHarnessManifest(cwd, "analysis-harness");

    expect(firstManifest.slug).toBe("research-harness");
    expect(secondManifest.slug).toBe("analysis-harness");
  });
});
