---
name: harness-orchestrator
description: "Hybrid harness orchestrator. Use when the user wants the full interview -> seed -> Ralph flow from one entrypoint."
---

# Harness Orchestrator

이 스킬은 interview -> seed -> ralph 파이프라인을 하나의 실행 경로로 묶는다.

## 실행

아이디어에서 시작:

```bash
node dist/cli.js run "<idea>"
```

기존 artifact에서 시작:

```bash
node dist/cli.js run "<spec-or-seed-path>"
```

## 단계

1. ambiguity-gated interview
2. immutable spec/seed generation
3. seed-to-PRD bridge
4. Ralph verification loop
