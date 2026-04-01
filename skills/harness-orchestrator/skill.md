---
name: harness-orchestrator
description: "Coordinate the full Claude-native Hybrid Harness flow."
---

# Harness Orchestrator

이 스킬은 feature lane 전체를 Claude-native 방식으로 묶는다.

## Preferred flow

1. `harness-interview`로 feature interview를 완료한다.
2. Claude가 seed draft JSON을 만든 뒤 helper로 렌더링한다.
3. `internal run-init`으로 run state를 만든다.
4. 각 story마다 구현, verification, reviewer/final critic 판단을 Claude가 수행한다.
5. story result JSON을 `internal run-apply-story`로 반영한다.
6. `completed`, `blocked`, `reopen_required` 중 하나가 될 때까지 반복한다.

## Helper commands

Run init:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal run-init --source <spec-or-seed-path> --json
```

Apply story result:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal run-apply-story --run-id <run-id> --story-result-file <story-result.json> --json
```

## Story result requirements

- story 하나만 처리한다.
- reviewer verdict와 verification evidence를 함께 남긴다.
- 마지막 story라면 가능하면 `finalCritic`도 함께 포함한다.

## Reopen behavior

- `reopen_required`가 되면 helper output의 `suggestedNextCommand`를 따른다.
- feature ambiguity면 interview lane으로,
- harness design gap이면 architect lane으로 되돌아간다.
