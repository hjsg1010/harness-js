---
name: harness-ralph
description: "Hybrid harness Ralph loop. Use when an immutable spec or seed already exists and work must continue until story-by-story verification passes."
---

# Harness Ralph

이 스킬은 spec/seed를 PRD로 변환하고 Ralph-style persistence loop를 실행한다.

## 실행

```bash
node dist/cli.js ralph <spec-or-seed-path>
```

resume:

```bash
node dist/cli.js ralph --resume <run-id>
```

## 출력

- `.harness/runs/<run-id>/prd.json`
- `.harness/runs/<run-id>/loop-state.json`
- `.harness/runs/<run-id>/progress.md`
- `.harness/runs/<run-id>/verification.json`

## 핵심 원칙

- story 하나씩 구현한다.
- story 직후 incremental QA를 수행한다.
- reviewer/critic approval 없이는 완료를 주장하지 않는다.
