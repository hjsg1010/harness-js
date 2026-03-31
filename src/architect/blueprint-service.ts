import { basename } from "node:path";

import type {
  CodexRunner,
  HarnessBlueprint,
  HarnessBlueprintDocument,
  HarnessSeedDocument
} from "../core/types.js";
import { createId, nowIso, slugify } from "../core/utils.js";
import {
  loadArchitectInterviewState,
  loadRepoProfile,
  saveHarnessBlueprintDocument,
  saveHarnessSeedDocument
} from "../infra/filesystem.js";
import {
  parseHarnessBlueprintMarkdown,
  parseHarnessSeedYaml,
  renderHarnessBlueprintMarkdown,
  renderHarnessSeedYaml
} from "../infra/serializers.js";

const BLUEPRINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "harnessGoal",
    "repoProfileSummary",
    "workUnits",
    "teamTopology",
    "verificationStrategy",
    "userOperatingStyle",
    "agentRoster",
    "skillRoster",
    "orchestrationProtocol",
    "constraints",
    "generationTargets"
  ],
  properties: {
    title: { type: "string" },
    harnessGoal: { type: "string" },
    repoProfileSummary: { type: "array", items: { type: "string" } },
    workUnits: { type: "array", items: { type: "string" } },
    teamTopology: { type: "array", items: { type: "string" } },
    verificationStrategy: { type: "array", items: { type: "string" } },
    userOperatingStyle: { type: "array", items: { type: "string" } },
    agentRoster: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role", "responsibilities"],
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          responsibilities: { type: "array", items: { type: "string" } }
        }
      }
    },
    skillRoster: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "purpose"],
        properties: {
          name: { type: "string" },
          purpose: { type: "string" }
        }
      }
    },
    orchestrationProtocol: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    generationTargets: { type: "array", items: { type: "string" } }
  }
} satisfies Record<string, unknown>;

export class HarnessBlueprintService {
  constructor(private readonly runner: CodexRunner) {}

  async generateFromInterview(
    cwd: string,
    architectInterviewId: string,
    options: { force?: boolean } = {}
  ): Promise<{
    blueprint: HarnessBlueprintDocument;
    seed: HarnessSeedDocument;
    blueprintPath: string;
    seedPath: string;
  }> {
    const interview = await loadArchitectInterviewState(cwd, architectInterviewId);
    if (!options.force && interview.currentAmbiguity > interview.threshold) {
      throw new Error(
        `Architect interview ${architectInterviewId} is not seed-ready. Ambiguity ${interview.currentAmbiguity.toFixed(
          2
        )} exceeds threshold ${interview.threshold.toFixed(2)}.`
      );
    }
    const repoProfile = await loadRepoProfile(cwd, interview.repoProfileId);
    const blueprintDraft = await this.runner.execJson<HarnessBlueprint>(
      this.buildBlueprintPrompt(interview.initialIdea, interview.currentAmbiguity, repoProfile.summary, interview.rounds),
      BLUEPRINT_SCHEMA,
      {
        cwd,
        sandbox: "read-only"
      }
    );

    const createdAt = nowIso();
    const seedId = createId("harness_seed");
    const blueprintId = createId("blueprint");
    const slug = slugify(blueprintDraft.title);

    const blueprint: HarnessBlueprintDocument = {
      ...blueprintDraft,
      metadata: {
        blueprintId,
        seedId,
        architectInterviewId,
        repoProfileId: interview.repoProfileId,
        ambiguityScore: interview.currentAmbiguity,
        forced: Boolean(options.force),
        createdAt
      }
    };

    const seed = this.seedFromBlueprint(blueprint, repoProfile);
    const blueprintPath = await saveHarnessBlueprintDocument(
      cwd,
      `${slug}.md`,
      renderHarnessBlueprintMarkdown(blueprint)
    );
    const seedPath = await saveHarnessSeedDocument(
      cwd,
      `${seed.metadata.seed_id}.yaml`,
      renderHarnessSeedYaml(seed)
    );
    return { blueprint, seed, blueprintPath, seedPath };
  }

  loadSourceFromContent(
    path: string,
    content: string
  ): { blueprint: HarnessBlueprintDocument; seed: HarnessSeedDocument } {
    if (path.endsWith(".yaml") || path.endsWith(".yml")) {
      const seed = parseHarnessSeedYaml(content);
      return {
        seed,
        blueprint: this.blueprintFromSeed(seed)
      };
    }

    const blueprint = parseHarnessBlueprintMarkdown(content);
    return {
      blueprint,
      seed: this.seedFromBlueprintDocument(blueprint)
    };
  }

  blueprintFromSeed(seed: HarnessSeedDocument): HarnessBlueprintDocument {
    return {
      title: toTitle(seed.generation_targets.slug),
      harnessGoal: seed.harness_goal,
      repoProfileSummary: [
        `Stack: ${seed.repo_profile.stack.join(", ") || "unknown"}`,
        `Package manager: ${seed.repo_profile.package_manager}`
      ],
      workUnits: seed.work_units,
      teamTopology: seed.agents.map((agent) => agent.name),
      verificationStrategy: seed.verification.strategy,
      userOperatingStyle: seed.verification.emphasis,
      agentRoster: seed.agents,
      skillRoster: seed.skills,
      orchestrationProtocol: [
        "Run orchestrator first",
        "Write specialist outputs into _workspace",
        "Synthesize the final result"
      ],
      constraints: seed.repo_profile.conventions,
      generationTargets: compactGenerationTargets(seed),
      metadata: {
        blueprintId: seed.metadata.blueprint_id,
        seedId: seed.metadata.seed_id,
        architectInterviewId: seed.metadata.interview_id,
        repoProfileId: "unknown",
        ambiguityScore: seed.metadata.ambiguity_score,
        forced: seed.metadata.forced,
        createdAt: seed.metadata.created_at
      }
    };
  }

  seedFromBlueprintDocument(blueprint: HarnessBlueprintDocument): HarnessSeedDocument {
    return {
      harness_goal: blueprint.harnessGoal,
      repo_profile: {
        stack: [],
        package_manager: "unknown",
        scripts: {},
        top_level_directories: [],
        likely_boundaries: [],
        conventions: blueprint.constraints,
        risk_surfaces: [],
        relevant_files: []
      },
      work_units: blueprint.workUnits,
      agents: blueprint.agentRoster,
      skills: blueprint.skillRoster,
      verification: {
        strategy: blueprint.verificationStrategy,
        emphasis: blueprint.userOperatingStyle
      },
      generation_targets: {
        slug: slugify(blueprint.title),
        claude_agents: true,
        claude_skills: true,
        codex_skills: true
      },
      metadata: {
        seed_id: blueprint.metadata.seedId,
        blueprint_id: blueprint.metadata.blueprintId,
        interview_id: blueprint.metadata.architectInterviewId,
        ambiguity_score: blueprint.metadata.ambiguityScore,
        forced: blueprint.metadata.forced,
        created_at: blueprint.metadata.createdAt
      }
    };
  }

  private seedFromBlueprint(
    blueprint: HarnessBlueprintDocument,
    repoProfile: Awaited<ReturnType<typeof loadRepoProfile>>
  ): HarnessSeedDocument {
    return {
      harness_goal: blueprint.harnessGoal,
      repo_profile: {
        stack: repoProfile.stack,
        package_manager: repoProfile.packageManager,
        scripts: repoProfile.scripts,
        top_level_directories: repoProfile.topLevelDirectories,
        likely_boundaries: repoProfile.likelyBoundaries,
        conventions: repoProfile.conventions,
        risk_surfaces: repoProfile.riskSurfaces,
        relevant_files: repoProfile.relevantFiles
      },
      work_units: blueprint.workUnits,
      agents: blueprint.agentRoster,
      skills: blueprint.skillRoster,
      verification: {
        strategy: blueprint.verificationStrategy,
        emphasis: [
          ...blueprint.userOperatingStyle,
          ...blueprint.verificationStrategy.slice(0, 2)
        ].slice(0, 6)
      },
      generation_targets: {
        slug: slugify(blueprint.title),
        claude_agents: true,
        claude_skills: true,
        codex_skills: true
      },
      metadata: {
        seed_id: blueprint.metadata.seedId,
        blueprint_id: blueprint.metadata.blueprintId,
        interview_id: blueprint.metadata.architectInterviewId,
        ambiguity_score: blueprint.metadata.ambiguityScore,
        forced: blueprint.metadata.forced,
        created_at: blueprint.metadata.createdAt
      }
    };
  }

  private buildBlueprintPrompt(
    goal: string,
    ambiguity: number,
    repoProfileSummary: string,
    rounds: Array<{ roundNumber: number; question: string; answer: string }>
  ): string {
    const transcript = rounds
      .map((round) => `Round ${round.roundNumber}\nQ: ${round.question}\nA: ${round.answer}`)
      .join("\n\n");

    return `Transform this architect interview into an immutable repo-specific harness blueprint.

Goal:
${goal}

Current ambiguity: ${ambiguity.toFixed(2)}
Repo profile:
${repoProfileSummary}

Transcript:
${transcript || "None"}

Requirements:
- Produce a concise title.
- Work units must be explicit and reusable.
- Team topology must match the work units.
- Skill roster must explain the purpose of each generated skill.
- Constraints must preserve user-edited generated files.
- Generation targets must stay compatible with Claude and Codex assets.
`;
  }
}

function compactGenerationTargets(seed: HarnessSeedDocument): string[] {
  const targets = [seed.generation_targets.slug];
  if (seed.generation_targets.claude_agents) {
    targets.push("claude-agents");
  }
  if (seed.generation_targets.claude_skills) {
    targets.push("claude-skills");
  }
  if (seed.generation_targets.codex_skills) {
    targets.push("codex-skills");
  }
  return targets;
}

function toTitle(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || basename(slug);
}
