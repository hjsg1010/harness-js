import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Claude plugin assets", () => {
  it("ships namespaced slash commands that point at top-level skills", async () => {
    const commands = [
      "harness.md",
      "harness-interview.md",
      "harness-architect.md",
      "harness-seed.md",
      "harness-blueprint.md",
      "harness-scaffold.md",
      "harness-ralph.md",
      "harness-run.md"
    ];

    for (const name of commands) {
      const content = await readFile(join(process.cwd(), "commands", name), "utf8");
      expect(content).toContain("${CLAUDE_PLUGIN_ROOT}");
      expect(content).toContain("skills/");
    }
  });

  it("keeps top-level skills on the internal helper runtime", async () => {
    const interviewSkill = await readFile(join(process.cwd(), "skills", "harness-interview", "skill.md"), "utf8");
    const architectSkill = await readFile(join(process.cwd(), "skills", "harness-architect", "skill.md"), "utf8");
    const plugin = JSON.parse(await readFile(join(process.cwd(), ".claude-plugin", "plugin.json"), "utf8")) as {
      version: string;
    };

    expect(interviewSkill).toContain("internal feature-init");
    expect(interviewSkill).toContain("internal feature-apply-round");
    expect(architectSkill).toContain("internal architect-init");
    expect(architectSkill).toContain("internal architect-apply-round");
    expect(plugin.version).toBe("0.2.0");
  });
});
