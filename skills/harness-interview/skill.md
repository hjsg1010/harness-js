---
name: harness-interview
description: "Run the Hybrid Harness feature interview lane inside Claude Code."
---

# Harness Interview

이 스킬은 feature requirement를 한 번에 한 질문씩 줄여 가는 Claude-native interview lane이다.

## Start or resume

새 interview를 시작할 때:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal feature-init --idea "{{ARGUMENTS}}" --json
```

기존 interview를 이어갈 때:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal feature-init --resume <interview-id> --json
```

## What to do with the helper output

1. JSON에서 `questionPrompt`, `questionSchema`, `state`, `interviewId`를 읽는다.
2. `questionPrompt`를 기준으로 **딱 한 개의 질문만** 만든다.
3. 질문은 30단어 이내로 유지하고 weakest dimension을 겨냥한다.
4. 사용자가 답하면 round JSON을 만든다.

Round JSON shape:

```json
{
  "targeting": "goal",
  "rationale": "Why this question matters",
  "question": "Ask one question only",
  "answer": "User answer",
  "breakdown": {
    "goal": { "score": 0.9, "justification": "Clear", "gap": "Clear" },
    "constraints": { "score": 0.7, "justification": "Mostly clear", "gap": "Need boundary details" },
    "criteria": { "score": 0.6, "justification": "Partly clear", "gap": "Need testable output" },
    "context": { "score": 0.8, "justification": "Known", "gap": "Clear" }
  },
  "weakestDimension": "criteria",
  "weakestDimensionRationale": "Output contract is still ambiguous"
}
```

그 다음 helper를 호출한다.

```bash
bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/harness-plugin-runner.sh" internal feature-apply-round --interview-id <interview-id> --round-file <round.json> --json
```

## Completion

- `state.status`가 `completed`가 되면 다음 단계는 `seed-render`다.
- helper output의 `nextCommand`를 사용자에게 바로 안내한다.

## Guardrails

- brownfield면 repo 사실을 다시 사용자에게 물어보지 않는다.
- feature list보다 assumption, constraints, acceptance criteria를 우선한다.
- Claude가 reasoning을 맡고, helper CLI는 state persistence만 맡는다.
