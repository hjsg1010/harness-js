---
name: harness-orchestrator
description: "Hybrid harness orchestrator. Use when the user wants the full interview -> seed -> Ralph flow from one entrypoint."
---

# Harness Orchestrator

이 스킬은 interview -> seed -> ralph 파이프라인을 하나의 실행 경로로 묶는다.

## 실행

아이디어에서 시작:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" run "<idea>"
```

기존 artifact에서 시작:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" run "<spec-or-seed-path>"
```

## 단계

1. ambiguity-gated interview
2. immutable spec/seed generation
3. seed-to-PRD bridge
4. Ralph verification loop

## 참고

- `run "<idea>"`는 `interview -> seed -> ralph`를 한 번에 묶은 shortcut이다.
