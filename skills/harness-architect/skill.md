---
name: harness-architect
description: "Run the Hybrid Harness architect lane inside Claude Code."
---

# Harness Architect

이 스킬은 repo-specific harness 자체를 설계하는 Claude-native architect lane이다.

## Start or resume

새 architect interview를 시작할 때:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal architect-init --goal "{{ARGUMENTS}}" --json
```

기존 architect interview를 이어갈 때:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal architect-init --resume <interview-id> --json
```

## What to do with the helper output

1. JSON에서 `questionPrompt`, `state`, `interviewId`를 읽는다.
2. repo profile을 활용해 **딱 한 개의 architect 질문만** 만든다.
3. 질문 축은 `domain_scope`, `work_units`, `team_topology`, `verification_strategy`, `user_operating_style` 중 weakest dimension을 겨냥한다.
4. 사용자가 답하면 architect round JSON을 만든다.

그 다음 helper를 호출한다.

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal architect-apply-round --interview-id <interview-id> --round-file <round.json> --json
```

## Completion

- `state.status`가 `completed`면 다음 단계는 `blueprint-render`다.
- Claude는 immutable harness blueprint draft JSON을 만들고 helper로 렌더링한다.

## Guardrails

- repo profile에 이미 있는 사실을 사용자가 다시 재발견하게 만들지 않는다.
- generated harness는 Claude plugin assets 중심으로 설계한다.
- user-edited generated file을 덮어쓰는 설계는 피한다.
