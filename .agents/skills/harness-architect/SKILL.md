---
name: harness-architect
description: "Run the Hybrid Harness architect lane for repo-specific harness design, immutable blueprint generation, and scaffold activation. Trigger this when the user wants a harness for the repository itself."
---

# Harness Architect

Use the local CLI to design and generate a repo-specific harness.

## Commands

```bash
node dist/cli.js architect "<repo-goal>"
node dist/cli.js architect --resume <architect-id>
node dist/cli.js blueprint <architect-id>
node dist/cli.js scaffold <blueprint-or-seed-path>
```

## Why

This lane interviews the repo-specific workflow before generating agents and skills. It writes immutable harness artifacts into `.harness/harness-*` and activates the generated harness for future feature runs.
