# Demo Harness Spec

## Metadata
- Spec ID: spec_fixed
- Seed ID: seed_fixed
- Interview ID: interview_fixed
- Project Type: greenfield
- Ambiguity Score: 0.15
- Forced: no
- Created At: 2026-03-31T00:00:00.000Z

## Goal
Build a small CLI that interviews the user and writes a seed file.

## Constraints
- Node.js 20+
- Use local files only

## Non-Goals
- No TUI

## Acceptance Criteria
- The CLI can create an interview session
- The CLI can write a seed YAML file

## Transcript Summary
- User wants a local CLI
- The workflow must keep immutable artifacts

## Technical Context
- No existing codebase context

## Ontology
| Entity | Type | Fields | Relationships |
| --- | --- | --- | --- |
| Interview | core domain | id, rounds | Interview produces Seed |
| Seed | core domain | goal, acceptanceCriteria | Seed feeds PRD |
