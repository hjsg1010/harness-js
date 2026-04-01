# Implementation Repo Harness Usage Guide

이 문서는 일반적인 기능 개발/구현 repo에서 `harness-js`를 어떻게 쓰면 좋은지 정리한 운영 가이드다.

대상 repo 예시는 아래와 같다.

- 웹 서비스 product repo
- API / backend repo
- SaaS admin / dashboard repo
- internal tool repo
- 기존 brownfield 애플리케이션 유지보수 repo

이런 repo에서는 보통 "실험 운영"보다 아래 흐름이 더 중요하다.

- 요구사항을 명확히 만들기
- 구현 경계를 나누기
- reviewer-backed verification까지 밀기
- 애매한 요구사항이면 다시 interview로 돌아가기

즉 SolPE 같은 연구형 repo에서는 harness가 상위 experiment orchestrator에 가깝다면, 일반 구현 repo에서는 harness가 훨씬 더 직접적으로 feature delivery loop를 담당한다.

## 이 문서가 가정하는 repo 성격

일반 구현 repo에서는 아래 특성이 자주 나타난다.

| 항목 | 흔한 모습 |
| --- | --- |
| 입력 | vague ticket, Slack 요청, issue, PRD 초안 |
| 목표 | 기능 추가, 버그 수정, refactor, release hardening |
| 검증 | test, lint, typecheck, build, reviewer feedback |
| 출력 | working code, PR-ready diff, docs update, run artifacts |

이런 환경에서 `harness-js`는 아래 두 lane으로 생각하면 된다.

| Lane | 역할 |
| --- | --- |
| `architect` | 이 repo에 맞는 implementation harness를 먼저 설계 |
| `interview` | 특정 기능/버그/작업을 구체화 |

## Harness를 왜 얹는가

일반 구현 repo에서 하네스를 쓰는 이유는 "코드를 대신 써주는 도구"를 하나 더 두기 위해서가 아니다.

핵심 가치는 아래 네 가지다.

- vague feature request를 바로 구현으로 밀지 않고 `spec.md` / `seed.yaml`로 잠근다
- repo-specific harness를 깔아 API, frontend, migration, QA 같은 work unit을 repo 현실에 맞게 정렬한다
- `ralph` loop가 implement -> incremental QA -> reviewer -> critic 흐름으로 story를 끝까지 민다
- critic가 `requirement_ambiguity`나 `harness_design_gap`를 지적하면 다시 적절한 lane으로 돌아간다

## 언제 `architect`를 먼저 쓰는가

일반 구현 repo라고 해서 항상 `architect`가 필요한 건 아니다.

아래 중 하나면 먼저 `architect`를 권장한다.

- 이 repo에서 앞으로 여러 번 같은 유형의 기능 개발을 반복할 예정일 때
- frontend / backend / DB / QA처럼 역할 분리가 자주 필요한 repo일 때
- 팀 규칙이나 verification policy를 repo-specific하게 고정하고 싶을 때
- Claude plugin assets까지 함께 깔아두고 싶을 때

예를 들어 이런 프롬프트가 좋다.

```text
이 repo는 TypeScript 기반 제품 개발 repo다. 기능 개발 시 보통 API 변경, 상태 관리, UI 수정, 검증, 회귀 확인이 함께 필요하다. feature implementer, API reviewer, QA inspector, release critic 중심의 repo-specific harness를 설계해줘.
```

기대 효과:

- 이후 feature interview가 generic wording이 아니라 repo-specific terminology를 사용한다
- PRD story도 work unit, expected artifact, verification ordering을 더 잘 반영한다

## 언제 `interview`로 바로 시작하는가

아래 상황이면 `interview`부터 시작하는 것이 더 낫다.

- 한 번성 기능 구현
- 버그 수정 범위가 아직 모호함
- 이미 repo 구조는 충분히 익숙하고, 지금 당장 task clarity가 더 중요함
- 아직 harness bootstrap에 시간을 쓰기보다, 이번 feature를 먼저 끝내고 싶음

## 추천 시작 시나리오

### Scenario 1. 모호한 기능 요청을 구현 가능한 spec으로 바꾸기

언제 쓰나:

- "대시보드에 알림 기능 넣어줘"
- "배포 체크리스트 자동화해줘"
- "권한 흐름 좀 정리해줘"

처럼 요청은 있는데 acceptance criteria가 아직 흐린 경우

추천 시작:

```bash
/harness-interview I want to add a release checklist assistant to this repo.
/harness-seed <interview-id>
/harness-ralph .harness/seeds/<seed-id>.yaml
```

이 시나리오에서 harness는 아래를 한다.

- weakest dimension을 따라 질문한다
- brownfield context를 먼저 읽는다
- spec과 seed를 immutable artifact로 만든다
- PRD story를 만들고 reviewer-backed loop를 돈다

### Scenario 2. 기존 PRD / spec이 있고 구현-검증만 끝까지 밀기

언제 쓰나:

- 이미 issue/PRD/spec 문서가 있다
- 요구사항은 비교적 명확하다
- 구현과 검증 persistence가 중요하다

추천 시작:

```bash
/harness-ralph path/to/spec.md
/harness-ralph path/to/seed.yaml
```

이 시나리오는 아래에 잘 맞는다.

- API contract 구현
- frontend feature 마감
- refactor 후 회귀 검증
- PR-ready story execution

### Scenario 3. 이 repo에 맞는 기능 개발 harness를 먼저 깔기

언제 쓰나:

- 이 repo에서 비슷한 feature를 계속 만들 예정일 때
- repo-specific verification policy가 중요할 때
- Claude Code 안에서 repo-specific team workflow를 반복 가능하게 만들고 싶을 때

추천 시작:

```bash
/harness-architect 이 repo는 일반적인 제품 개발 repo다. 기능 개발 시 API, UI, 상태 변경, 검증, 회귀 확인이 자주 함께 발생한다. implementer, QA inspector, reviewer, critic 중심의 repo-specific harness를 설계해줘.
/harness-blueprint <architect-id>
/harness-scaffold .harness/harness-seeds/<seed-id>.yaml
```

그 다음 feature부터는:

```bash
/harness-run Add a user-facing audit log filter to the admin dashboard
```

### Scenario 4. 버그 수정 + 회귀 방지

언제 쓰나:

- 증상은 있는데 root cause가 아직 분명하지 않을 때
- 수정 후 build/test/reviewer verification까지 한 번에 관리하고 싶을 때

추천 시작:

```bash
/harness-interview Users occasionally lose unsaved edits when navigating between tabs. I want to identify the intended behavior, fix the bug, and add regression coverage.
/harness-seed <interview-id>
/harness-ralph .harness/seeds/<seed-id>.yaml
```

이 시나리오에서는 특히 `interview`가 유용하다.

- 버그 재현 조건
- 의도된 동작
- 비의도적 부작용
- 필요한 regression evidence

를 먼저 고정할 수 있기 때문이다.

## 실제 명령 예시

기본 작업 위치:

```bash
cd /path/to/your/app-repo
```

### 1. Repo-specific harness bootstrap

```bash
/harness-architect 이 repo는 일반적인 제품 개발 repo다. 기능 개발 시 API, UI, 상태 변경, 검증, 회귀 확인이 자주 함께 발생한다. implementer, QA inspector, reviewer, critic 중심의 repo-specific harness를 설계해줘.
/harness-blueprint <architect-id>
/harness-scaffold .harness/harness-seeds/<seed-id>.yaml
```

### 2. 새 기능 구현

```bash
/harness-interview Add a release checklist assistant to the admin area
/harness-seed <interview-id>
/harness-ralph .harness/seeds/<seed-id>.yaml
```

### 3. 버그 수정

```bash
/harness-interview Users occasionally lose unsaved edits when navigating between tabs. I want to fix the bug and add regression protection.
/harness-seed <interview-id>
/harness-ralph .harness/seeds/<seed-id>.yaml
```

### 4. 한 번에 끝까지

```bash
/harness-run Add a release checklist assistant to the admin area
```

`run`은 편하지만, 중요한 기능일수록 `interview -> seed -> ralph`를 권장한다. 요구사항과 acceptance criteria를 immutable artifact로 남길 수 있기 때문이다.

## 일반 구현 repo에서 유지해야 하는 검증 루프

repo마다 다르지만, 기본적으로 아래 범주의 명령이 핵심이다.

```bash
npm test
npm run build
npm run lint
```

또는 Python/other stack이라면 그 repo의 test, lint, typecheck, build에 해당하는 명령을 verification command로 유지해야 한다.

하네스는 이 검증을 대체하지 않는다. 대신 story마다 아래를 더 분명하게 만든다.

- 어떤 evidence가 pass 판단에 필요한가
- 어떤 경계면을 QA가 확인해야 하는가
- reviewer가 어떤 이유로 reject했는가
- requirement 문제면 interview로 돌아가야 하는가

## 운영 시 주의점

### 1. `architect`는 반복 사용 가치가 있을 때 먼저 쓴다

repo-specific harness는 강력하지만, 모든 작은 작업 앞에 반드시 필요한 건 아니다. 한 번성 task라면 `interview`만으로도 충분할 수 있다.

### 2. `run`은 shortcut이고, 중요한 작업은 `seed`를 남기는 것이 좋다

간단한 작업은 `run`으로 충분하지만, 중요한 feature나 tricky bug는 `seed`까지 명시적으로 남기는 편이 좋다.

### 3. 요구사항 ambiguity와 implementation failure를 섞지 않는다

critic가 implementation 문제가 아니라 requirement 문제를 지적하면, 무리하게 같은 run 안에서 patch를 누적하기보다 interview reopen이 더 맞다.

### 4. verification policy는 repo 현실을 따라야 한다

하네스는 generic loop를 제공하지만, 실제 pass 기준은 repo의 test/build/review 문화가 정한다. repo-specific harness를 만든 뒤에는 그 정책을 active harness에 반영하는 것이 좋다.

## 추천 시작 순서

일반 구현 repo에서 처음 하네스를 붙일 때는 아래 순서를 권장한다.

1. 반복 개발 repo라면 먼저 `architect -> blueprint -> scaffold`
2. 그 다음 대표 feature 하나를 `interview -> seed -> ralph`
3. 그 과정에서 verification loop와 story decomposition이 repo 현실에 맞는지 확인
4. 이후에는 작은 작업은 `run`, 큰 작업은 `interview -> seed -> ralph`

요약하면:

- repo 운영 방식을 먼저 정의하고 싶으면 `architect`
- 특정 기능/버그를 명확히 하고 싶으면 `interview`
- 이미 brief가 있으면 `ralph`
- 빨리 한 번에 끝내고 싶으면 `run`
