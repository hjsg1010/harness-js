---
name: harness-orchestrator
description: "Hybrid harness orchestrator. Use when the user wants the full feature lane from one entrypoint, including critic-driven reopen."
---

# Harness Orchestrator

이 스킬은 feature lane 전체를 하나의 실행 경로로 묶는다.

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

1. ambiguity-gated feature interview
2. immutable spec/seed generation
3. seed-to-PRD bridge
4. Ralph verification loop
5. critic-driven reopen when requirement or harness ambiguity remains

## 참고

- active harness가 있으면 `run` prompt와 verification framing에 자동 반영된다.
- `run "<idea>"`는 가능한 범위에서 feature/harness reopen을 자동으로 처리한다.
