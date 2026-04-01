import { basename } from "node:path";

import type { InterviewState, SeedBlueprint, SeedDocument, SpecDocument } from "../core/types.js";
import { createId, nowIso, slugify } from "../core/utils.js";
import {
  loadInterviewState,
  saveSeedDocument,
  saveSpecDocument
} from "../infra/filesystem.js";
import {
  parseSeedYaml,
  parseSpecMarkdown,
  renderSeedYaml,
  renderSpecMarkdown
} from "../infra/serializers.js";
import { renderHarnessPromptBlock } from "../interview/adaptive.js";

export class SeedService {
  async generateFromDraft(
    cwd: string,
    interviewId: string,
    blueprint: SeedBlueprint,
    options: { force?: boolean } = {}
  ): Promise<{ spec: SpecDocument; seed: SeedDocument; specPath: string; seedPath: string }> {
    const interview = await loadInterviewState(cwd, interviewId);
    if (!options.force && interview.currentAmbiguity > interview.threshold) {
      throw new Error(
        `Interview ${interviewId} is not seed-ready. Ambiguity ${interview.currentAmbiguity.toFixed(
          2
        )} exceeds threshold ${interview.threshold.toFixed(2)}.`
      );
    }

    const createdAt = nowIso();
    const seedId = createId("seed");
    const specId = createId("spec");
    const slug = slugify(blueprint.title);

    const spec: SpecDocument = {
      ...blueprint,
      ontology: blueprint.ontology.slice(0, 7),
      metadata: {
        specId,
        seedId,
        interviewId,
        ambiguityScore: interview.currentAmbiguity,
        forced: Boolean(options.force),
        projectType: interview.projectType,
        createdAt
      }
    };

    const seed: SeedDocument = {
      goal: blueprint.goal,
      task_type: "code",
      constraints: blueprint.constraints,
      acceptance_criteria: blueprint.acceptanceCriteria,
      ontology_schema: {
        name: blueprint.title,
        description: `${blueprint.title} output ontology`,
        fields: blueprint.ontology.slice(0, 7).map((entity) => ({
          name: entity.name,
          type: entity.type || "entity",
          description:
            entity.fields.length > 0
              ? `Fields: ${entity.fields.join(", ")}`
              : `${entity.name} entity`,
          required: true
        }))
      },
      metadata: {
        seed_id: seedId,
        interview_id: interviewId,
        ambiguity_score: interview.currentAmbiguity,
        forced: Boolean(options.force),
        created_at: createdAt
      }
    };

    const specPath = await saveSpecDocument(cwd, `${slug}.md`, renderSpecMarkdown(spec));
    const seedPath = await saveSeedDocument(cwd, `${seedId}.yaml`, renderSeedYaml(seed));

    return { spec, seed, specPath, seedPath };
  }

  createDraftPrompt(interview: InterviewState): string {
    return this.buildBlueprintPrompt(interview);
  }

  loadSourceFromContent(path: string, content: string): { spec: SpecDocument; seed: SeedDocument } {
    if (path.endsWith(".yaml") || path.endsWith(".yml")) {
      const seed = parseSeedYaml(content);
      const spec = this.specFromSeed(seed, basename(path));
      return { spec, seed };
    }

    const spec = parseSpecMarkdown(content);
    const seed = this.seedFromSpec(spec);
    return { spec, seed };
  }

  specFromSeed(seed: SeedDocument, titleHint: string): SpecDocument {
    return {
      title: titleHint.replace(/\.(ya?ml)$/i, ""),
      goal: seed.goal,
      constraints: seed.constraints,
      nonGoals: [],
      acceptanceCriteria: seed.acceptance_criteria,
      transcriptSummary: [],
      technicalContext: [],
      ontology: seed.ontology_schema.fields.map((field) => ({
        name: field.name,
        type: field.type,
        fields: [],
        relationships: []
      })),
      metadata: {
        specId: createId("spec"),
        seedId: seed.metadata.seed_id,
        interviewId: seed.metadata.interview_id,
        ambiguityScore: seed.metadata.ambiguity_score,
        forced: seed.metadata.forced,
        projectType: "greenfield",
        createdAt: seed.metadata.created_at
      }
    };
  }

  seedFromSpec(spec: SpecDocument): SeedDocument {
    return {
      goal: spec.goal,
      task_type: "code",
      constraints: spec.constraints,
      acceptance_criteria: spec.acceptanceCriteria,
      ontology_schema: {
        name: spec.title,
        description: `${spec.title} output ontology`,
        fields: spec.ontology.map((entity) => ({
          name: entity.name,
          type: entity.type,
          description: entity.fields.join(", ") || `${entity.name} entity`,
          required: true
        }))
      },
      metadata: {
        seed_id: spec.metadata.seedId,
        interview_id: spec.metadata.interviewId,
        ambiguity_score: spec.metadata.ambiguityScore,
        forced: spec.metadata.forced,
        created_at: spec.metadata.createdAt
      }
    };
  }

  private buildBlueprintPrompt(interview: InterviewState): string {
    const transcript = interview.rounds
      .map(
        (round) =>
          `Round ${round.roundNumber}\nQ: ${round.question}\nA: ${round.answer}\nAmbiguity: ${round.ambiguity.toFixed(
            2
          )}`
      )
      .join("\n\n");

    return `Transform this completed interview into an immutable build spec.

Initial idea:
${interview.initialIdea}

Project Type: ${interview.projectType}
Current ambiguity: ${interview.currentAmbiguity.toFixed(2)}
Brownfield Context:
${interview.brownfieldContext?.summary ?? "None"}
${renderHarnessPromptBlock(interview.activeHarness)}

Transcript:
${transcript}

Requirements:
- Return a concise title.
- Produce 3-7 ontology entities.
- Acceptance criteria must be concrete and testable.
- Non-goals must make scope boundaries explicit.
- Technical context must mention brownfield evidence when available.
- Treat the active harness as a verification bias, not a hard constraint.
- Reuse active harness terminology for work units, team topology, and verification emphasis when it clarifies the spec.
`;
  }
}
