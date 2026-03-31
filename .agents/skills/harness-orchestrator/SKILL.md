---
name: harness-orchestrator
description: "Run the Hybrid Harness end-to-end feature pipeline from idea to verified completion. Trigger this when the user wants interview, immutable seed generation, Ralph execution, and automatic reopen handling in one flow."
---

# Harness Orchestrator

Use the local CLI to run the full pipeline.

## Commands

```bash
node dist/cli.js run "<idea>"
node dist/cli.js run "<spec-or-seed-path>"
```

## Why

This wrapper keeps the feature lane in one flow: adaptive interview, immutable seed generation, Ralph execution, and critic-driven reopen handling. If an active repo-specific harness exists, the run uses it automatically for prompt shaping.
