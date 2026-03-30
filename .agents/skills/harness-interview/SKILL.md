---
name: harness-interview
description: "Run the Hybrid Harness interview lane for vague ideas, requirement clarification, and ambiguity-gated seed preparation. Trigger this whenever the user wants Socratic interviewing before implementation."
---

# Harness Interview

Use the local CLI to run or resume the interview lane.

## Commands

```bash
node dist/cli.js interview "<idea>"
node dist/cli.js interview --resume <interview-id>
```

## Why

The interview lane exists to reduce ambiguity before code execution. It writes resumable state into `.harness/interviews/` and only hands off once the idea is concrete enough for immutable seed generation.
