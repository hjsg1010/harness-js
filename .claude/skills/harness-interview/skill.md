---
name: harness-interview
description: "Hybrid harness interview lane. Use when the user has a vague implementation idea and wants Ouroboros-style clarification before code execution."
---

# Harness Interview

이 스킬은 ambiguity-gated interview를 시작하거나 이어간다.

## 실행

다음 명령으로 interview를 시작한다.

```bash
node dist/cli.js interview "<idea>"
```

이어받기는 다음 명령을 사용한다.

```bash
node dist/cli.js interview --resume <interview-id>
```

## 출력

- `.harness/interviews/<id>.json`

## 사용 시점

- 요구사항이 모호할 때
- brownfield 변경이지만 수정 경계가 불분명할 때
- seed/spec를 먼저 고정하고 싶을 때
