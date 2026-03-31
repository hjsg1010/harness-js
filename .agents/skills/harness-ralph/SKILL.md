---
name: harness-ralph
description: "Run the Hybrid Harness Ralph loop when a spec or seed already exists and the task must continue until reviewer-backed verification passes. Trigger this for persistence, resume, and PRD/story execution."
---

# Harness Ralph

Use the local CLI to run the story-by-story implementation loop.

## Commands

```bash
node dist/cli.js ralph <spec-or-seed-path>
node dist/cli.js ralph --resume <run-id>
```

## Why

This loop keeps mutable work inside `.harness/runs/`, performs incremental QA after each story, and blocks completion until reviewer and critic gates pass. If the final critic detects requirement or harness ambiguity, the run records a synthetic reopen state and prints the next command instead of silently looping forever.
