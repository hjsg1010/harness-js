# Research Harness

## Metadata
- Blueprint ID: blueprint_fixed
- Seed ID: harness_seed_fixed
- Architect Interview ID: architect_fixed
- Repo Profile ID: profile_fixed
- Ambiguity Score: 0.14
- Forced: no
- Created At: 2026-03-31T00:00:00.000Z

## Harness Goal
Build a repo-specific harness for multi-angle research and synthesis.

## Repo Profile Summary
- TypeScript CLI
- npm build and test scripts

## Work Units
- web-search
- paper-review
- community-review
- synthesis

## Team Topology
- orchestrator
- web-researcher
- paper-analyst
- community-analyst
- synthesizer

## Verification Strategy
- cross-check citations
- compare findings across sources
- require final synthesis checklist

## User Operating Style
- single command entrypoint
- preserve intermediate artifacts

## Agent Roster
- orchestrator: Coordinate the research team | dispatch work, merge outputs
- web-researcher: Gather web evidence | search web, collect links
- paper-analyst: Review academic sources | find papers, summarize evidence
- community-analyst: Review community responses | inspect forums, summarize sentiment
- synthesizer: Write final synthesis | compare evidence, draft report

## Skill Roster
- research-orchestrator: Coordinate team workflow
- research-web: Search and summarize web sources
- research-papers: Review papers and academic evidence
- research-community: Review community feedback
- research-synthesis: Write synthesis report

## Orchestration Protocol
- orchestrator dispatches all specialists
- specialists write into _workspace
- synthesizer merges findings into final report

## Constraints
- Keep outputs local
- Do not overwrite user-edited generated files

## Generation Targets
- claude-agents
- claude-skills
- codex-skills

