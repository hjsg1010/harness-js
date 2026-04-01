import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ActiveHarnessDocument,
  GeneratedHarnessManifest,
  HarnessBlueprintDocument,
  HarnessSeedDocument
} from "../core/types.js";
import { nowIso, sha1, slugify } from "../core/utils.js";
import {
  ensureDir,
  loadHarnessBlueprintFromPath,
  loadHarnessSeedFromPath,
  readText,
  resolveGeneratedHarnessPaths,
  saveActiveHarness,
  saveGeneratedHarnessManifest,
  tryLoadGeneratedHarnessManifest,
  writeText
} from "../infra/filesystem.js";
import {
  parseHarnessBlueprintMarkdown,
  parseHarnessSeedYaml
} from "../infra/serializers.js";

export class HarnessScaffoldService {
  async generateFromSource(
    cwd: string,
    sourcePath: string
  ): Promise<{ slug: string; manifest: GeneratedHarnessManifest; activeHarness: ActiveHarnessDocument }> {
    const sourceContent = sourcePath.endsWith(".md")
      ? await loadHarnessBlueprintFromPath(sourcePath)
      : await loadHarnessSeedFromPath(sourcePath);
    const seed = sourcePath.endsWith(".md")
      ? this.seedFromBlueprint(parseHarnessBlueprintMarkdown(sourceContent))
      : parseHarnessSeedYaml(sourceContent);

    const slug = seed.generation_targets.slug || slugify(seed.harness_goal);
    const generatedPaths = resolveGeneratedHarnessPaths(cwd, slug);
    const fileMap = this.renderFiles(cwd, slug, seed, generatedPaths);
    const conflicts = await this.detectConflicts(cwd, slug, fileMap);
    if (conflicts.length > 0) {
      throw new Error(`Generated harness conflict detected: ${conflicts.join(", ")}`);
    }

    await ensureDir(generatedPaths.root);
    await ensureDir(generatedPaths.referencesDir);
    for (const [path, content] of Object.entries(fileMap)) {
      await writeText(join(cwd, path), content);
    }

    const manifest: GeneratedHarnessManifest = {
      blueprintId: seed.metadata.blueprint_id,
      seedId: seed.metadata.seed_id,
      slug,
      generatedAt: nowIso(),
      files: Object.entries(fileMap).map(([path, content]) => ({
        path,
        sha1: sha1(content)
      })),
      conflicts: []
    };
    const activeHarness = this.toActiveHarness(slug, seed, sourcePath);

    await saveGeneratedHarnessManifest(cwd, manifest);
    await saveActiveHarness(cwd, activeHarness);

    return { slug, manifest, activeHarness };
  }

  private renderFiles(
    cwd: string,
    slug: string,
    seed: HarnessSeedDocument,
    generatedPaths: ReturnType<typeof resolveGeneratedHarnessPaths>
  ): Record<string, string> {
    const files: Record<string, string> = {};
    const validationChecklistRelativePath = join(
      ".harness/generated-harness",
      slug,
      "validation-checklist.md"
    );

    for (const agent of seed.agents) {
      files[join("agents", `${slug}-${agent.name}.md`)] = renderClaudeAgent(
        slug,
        agent.name,
        agent.role,
        agent.responsibilities,
        seed.work_units
      );
    }

    files[join("skills", `${slug}-orchestrator`, "skill.md")] = renderClaudeSkill(
      `${slug}-orchestrator`,
      `Coordinate the ${slug} harness.`,
      renderOrchestratorInstructions(
        slug,
        validationChecklistRelativePath,
        `bash "\${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal architect-init --goal "<repo-goal>" --json`
      )
    );

    for (const skill of seed.skills) {
      const skillSlug = `${slug}-${slugify(skill.name)}`;
      const instruction = renderGeneratedSkillInstructions(
        slug,
        skill.name,
        skill.purpose,
        seed.work_units,
        validationChecklistRelativePath
      );
      files[join("skills", skillSlug, "skill.md")] = renderClaudeSkill(
        skillSlug,
        skill.purpose,
        instruction
      );
    }

    files[join(".harness/generated-harness", slug, "validation-checklist.md")] = renderValidationChecklist(seed);
    files[join(".harness/generated-harness", slug, "references", "overview.md")] = renderReferenceOverview(
      slug,
      seed
    );
    files[join(".harness/generated-harness", slug, "references", "artifact-contracts.md")] =
      renderArtifactContracts(seed);
    files[join(".harness/generated-harness", slug, "references", "handoff-protocol.md")] =
      renderHandoffProtocol(slug, seed);
    files[join(".harness/generated-harness", slug, "references", "verification-policy.md")] =
      renderVerificationPolicy(seed);

    return files;
  }

  private async detectConflicts(
    cwd: string,
    slug: string,
    fileMap: Record<string, string>
  ): Promise<string[]> {
    const manifest = await tryLoadGeneratedHarnessManifest(cwd, slug);
    if (!manifest) {
      return [];
    }

    const conflicts: string[] = [];
    for (const entry of manifest.files) {
      if (!(entry.path in fileMap)) {
        continue;
      }
      try {
        const current = await readText(join(cwd, entry.path));
        if (sha1(current) !== entry.sha1) {
          conflicts.push(entry.path);
        }
      } catch {
        continue;
      }
    }
    return conflicts;
  }

  private seedFromBlueprint(blueprint: HarnessBlueprintDocument): HarnessSeedDocument {
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
        claude_skills: true
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

  private toActiveHarness(
    slug: string,
    seed: HarnessSeedDocument,
    sourcePath: string
  ): ActiveHarnessDocument {
    return {
      slug,
      harnessGoal: seed.harness_goal,
      workUnits: seed.work_units,
      teamTopology: seed.agents.map((agent) => agent.name),
      verificationStrategy: seed.verification.strategy,
      verificationEmphasis: seed.verification.emphasis,
      agentNames: seed.agents.map((agent) => agent.name),
      skillNames: seed.skills.map((skill) => skill.name),
      sourceSeedId: seed.metadata.seed_id,
      sourceBlueprintId: seed.metadata.blueprint_id,
      activatedAt: nowIso(),
      sourceSeedPath: sourcePath,
      sourceBlueprintPath: sourcePath.endsWith(".md") ? sourcePath : null
    };
  }
}

function renderClaudeAgent(
  slug: string,
  name: string,
  role: string,
  responsibilities: string[],
  workUnits: string[]
): string {
  return `---
name: ${slug}-${name}
description: "${role}"
---

# ${slug}-${name}

Core role: ${role}

Responsibilities:
${responsibilities.map((item) => `- ${item}`).join("\n") || "- Execute assigned work"}

Inputs:
- Active task or handoff from the orchestrator
- Relevant artifacts from _workspace
- Validation expectations tied to: ${workUnits.join(", ") || "the assigned work unit"}

Outputs:
- Updated implementation or analysis artifacts
- A concise handoff note that lists what changed, what remains, and how to verify it

Collaboration:
- Do not overwrite user-edited generated files outside your owned scope
- Read upstream handoff artifacts before starting new work
- Write intermediate artifacts under _workspace using phase-oriented filenames

Failure handling:
- Escalate blockers with the concrete missing input or failed validation step
- Preserve partial findings instead of deleting them when downstream work must continue
`;
}

function renderClaudeSkill(name: string, description: string, instruction: string): string {
  return `---
name: ${name}
description: "${description}"
---

# ${name}

${instruction}
`;
}

function renderValidationChecklist(seed: HarnessSeedDocument): string {
  return `# Validation Checklist

- Confirm generated agents match work units: ${seed.work_units.join(", ") || "none"}
- Confirm verification strategy: ${seed.verification.strategy.join(", ") || "none"}
- Confirm user-edited generated files are preserved on re-scaffold
- Confirm orchestrator and plugin skills call the intended internal helper runtime
`;
}

function renderReferenceOverview(slug: string, seed: HarnessSeedDocument): string {
  return `# ${slug} References

Harness goal: ${seed.harness_goal}

Work units:
${seed.work_units.map((unit) => `- ${unit}`).join("\n") || "- None"}

Verification emphasis:
${seed.verification.emphasis.map((item) => `- ${item}`).join("\n") || "- None"}
`;
}

function renderOrchestratorInstructions(
  slug: string,
  validationChecklistPath: string,
  command: string
): string {
  return `When to use:
- Use this skill when the ${slug} harness must coordinate specialists around a repo-specific workflow.

Workflow:
1. Read the active blueprint or harness seed before dispatching work.
2. Create intermediate artifacts under _workspace using phase-based filenames.
3. Route specialist outputs through a final synthesis or verification pass.
4. Review ${validationChecklistPath} before declaring the harness ready.

Expected artifacts:
- _workspace/* handoff notes for each phase
- ${validationChecklistPath}
- .harness/generated-harness/${slug}/references/overview.md
- .harness/generated-harness/${slug}/references/artifact-contracts.md
- .harness/generated-harness/${slug}/references/handoff-protocol.md
- .harness/generated-harness/${slug}/references/verification-policy.md

Validation checklist:
- Confirm each handoff points to the next responsible role
- Confirm verification steps are runnable in the current repository
- Confirm the reference contracts still match the generated work units

Execution:
\`${command}\`
`;
}

function renderGeneratedSkillInstructions(
  slug: string,
  skillName: string,
  purpose: string,
  workUnits: string[],
  validationChecklistPath: string
): string {
  return `When to use:
- Use ${skillName} when the ${slug} harness needs ${purpose.toLowerCase()}.

Workflow:
1. Read the current assignment and the latest _workspace handoff.
2. Focus on work units that match: ${workUnits.join(", ") || "the assigned scope"}.
3. Produce deterministic artifacts that the next role can verify quickly.

Expected artifacts:
- Updated _workspace notes
- Clear verification evidence for the next reviewer
- References to ${validationChecklistPath} when the work affects validation

Validation checklist:
- Confirm the output stays within the assigned work unit
- Confirm the handoff names the next expected verification step
`;
}

function renderArtifactContracts(seed: HarnessSeedDocument): string {
  return `# Artifact Contracts

Expected Artifacts:
${seed.work_units
  .map((workUnit) => `- ${workUnit}: produce a deterministic artifact or handoff note for this unit`)
  .join("\n") || "- None"}

Agent Ownership:
${seed.agents
  .map((agent) => `- ${agent.name}: ${agent.responsibilities.join(", ") || "owned execution scope"}`)
  .join("\n") || "- None"}
`;
}

function renderHandoffProtocol(slug: string, seed: HarnessSeedDocument): string {
  return `# Handoff Protocol

- Store intermediate artifacts under _workspace.
- Use the filename pattern: phase_role_artifact.ext
- Prefix files with the current sequence so later agents can sort them deterministically.
- Mention the next responsible role and verification step in every handoff note.

Roles:
${seed.agents.map((agent) => `- ${slug}-${agent.name}`).join("\n") || "- None"}
`;
}

function renderVerificationPolicy(seed: HarnessSeedDocument): string {
  return `# Verification Policy

Verification strategy:
${seed.verification.strategy.map((item) => `- ${item}`).join("\n") || "- None"}

Preferred command ordering:
- npm run typecheck
- npm test
- npm run build
- npm run lint

Emphasis:
${seed.verification.emphasis.map((item) => `- ${item}`).join("\n") || "- None"}
`;
}
