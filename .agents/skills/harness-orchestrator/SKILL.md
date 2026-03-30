---
name: harness-orchestrator
description: "Run the Hybrid Harness end-to-end pipeline from idea to verified completion. Trigger this when the user wants interview, immutable seed generation, and Ralph execution in one flow."
---

# Harness Orchestrator

Use the local CLI to run the full pipeline.

## Commands

```bash
node dist/cli.js run "<idea>"
node dist/cli.js run "<spec-or-seed-path>"
```

## Why

This wrapper keeps the interview/specification stage and the Ralph loop in a single harness while preserving immutable spec/seed artifacts between them.
