# SolPE Harness Usage Guide

이 문서는 `/home/hjsg1010/SolPE` 같은 phase-driven experiment repo에 `harness-js`를 어떻게 얹어 쓰는지 정리한 운영 가이드다.

핵심 전제는 단순하다.

- SolPE는 이미 자체 실험 엔진을 가지고 있다.
- `harness-js`는 그 엔진을 대체하지 않는다.
- 대신 intent clarification, immutable brief, repo-specific orchestration, reopen guidance를 더하는 상위 harness로 붙는다.

## SolPE 현재 운영 구조

로컬 분석 기준으로 SolPE의 현재 운영 중심은 아래 다섯 축이다.

| 역할 | 대표 자산 | 의미 |
| --- | --- | --- |
| Phase brief | `docs/phase8_instruction.md` | 현재 phase의 canonical experiment brief |
| Workflow model | `docs/phase8_workflow_report.md` | search, judge, validation 흐름과 metric 해석 기준 |
| Experiment entrypoint | `scripts/run_experiments_phase8.sh` | baseline, retrieval, guardrail, decomp, synergy 그룹 실행 |
| Analyzer | `scripts/analyze_experiments.py` | 실험 간 metric 비교, search vs judge failure 분류 |
| Validation trace | `src/validation/golden_set.py` | `search_candidates`, `selected_tc_ids`, decision metrics 생성 |

현재 SolPE는 일반적인 기능 개발 repo보다 "실험 정의서 + 실행 스크립트 + 결과 분석기" 구조에 더 가깝다.

실제로 중요한 검증 축도 아래처럼 이미 분리되어 있다.

- `search_hit_rate`: 정답 TC가 검색 후보군에 들어왔는가
- `selection_hit_rate`: 선택된 최상위 candidate가 정답인가
- `decision_accuracy`: 최종 label이 기대 label과 일치하는가
- `overall_precision`, `overall_recall`, `overall_f1`: label macro 품질

즉 SolPE의 핵심 질문은 보통 아래 셋 중 하나다.

1. retrieval이 문제인가
2. judge/selection이 문제인가
3. 다음 phase brief를 어떻게 정의할 것인가

### 현재 로컬 상태 메모

- working tree는 사실상 clean 상태이고 `.omc/`만 untracked다.
- local clone에는 `output/exp8_*` 산출물이 보이지 않는다.
- 따라서 지금 시점의 harness 활용은 "과거/현재 실험 구조를 이해한 상태에서 다음 루프를 설계하는 것"이 먼저다.

### 중요한 차이: 코드 기본값 vs Phase 8 baseline

SolPE에서는 아래 차이를 항상 의식해야 한다.

| 항목 | 코드 기본값 | `phase8_instruction.md` baseline |
| --- | --- | --- |
| `fetch_k` | `30` | `10` |
| `judge_mode` | `comparative` | `single` |
| `search_type` | `cc` | `cc` |
| `top_k` | `10` | `10` |

따라서 harness를 쓸 때도 "지금 내가 고치려는 대상이 코드 기본값인지, phase brief baseline인지"를 명시하는 습관이 중요하다.

## Harness를 왜 얹는가

`harness-js`를 SolPE에 붙이는 이유는 새 실행기를 만들기 위해서가 아니다.

역할 분리는 아래처럼 보는 것이 맞다.

| 레이어 | 담당 |
| --- | --- |
| SolPE | 실제 retrieval, judge, validate, analyze, deep dive 실행 |
| `harness-js` | 실험 의도 구체화, immutable brief/seed 고정, repo-specific role framing, reviewer/critic 기반 reopen guidance |

이 조합이 유용한 이유는 다음과 같다.

- vague한 개선 아이디어를 바로 코드 수정으로 밀지 않고 `spec.md` / `seed.yaml`로 고정할 수 있다.
- search-side 문제와 judge-side 문제를 서로 다른 feature run으로 분리하기 쉬워진다.
- SolPE 전용 harness를 깔면 이후 질문 wording, story planning, verification focus가 실험 repo 현실에 맞게 바뀐다.
- final critic가 `requirement_ambiguity` 또는 `harness_design_gap`를 지적할 때 다음 재인터뷰 방향을 남길 수 있다.

## 언제 `architect`를 쓰고 언제 `interview`를 쓰는가

### `architect`

아래 상황이면 `architect` lane이 먼저다.

- "이 repo에 맞는 연구 하네스를 먼저 만들고 싶다"
- "experiment planner / search investigator / judge investigator 같은 팀 구조가 필요하다"
- "phase 문서 중심 repo에 맞게 agent/skill을 깔아두고 싶다"

목표는 "무엇을 고칠까"가 아니라 "이 repo에서 앞으로 어떤 방식으로 실험과 개선을 운영할까"를 정하는 것이다.

### `interview`

아래 상황이면 `interview` lane으로 바로 들어간다.

- "best search case를 찾고 싶다"
- "judge false positive를 줄이고 싶다"
- "phase9 instruction 초안을 만들고 싶다"

즉 `interview`는 특정 개선 과제를 구체화할 때 쓰고, `architect`는 SolPE용 운영 harness 자체를 설계할 때 쓴다.

## 추천 시작 시나리오

### Scenario 1. SolPE Harness Bootstrap

언제 쓰나:

- SolPE에 repo-specific harness가 아직 없을 때
- 이후의 모든 feature run을 repo-aware하게 만들고 싶을 때

핵심 목표:

- SolPE의 phase 문서 중심 문화를 반영하는 active harness를 만든다.
- agent roster를 retrieval/judge 실험 운영에 맞게 고정한다.

추천 architect prompt:

```text
이 repo는 Function Requirement와 analyzed TC 매핑 실험을 운영하는 연구형 repo다. phase instruction 문서를 기준으로 실험을 설계하고, scripts/run_experiments_phase8.sh로 실행하고, scripts/analyze_experiments.py와 scripts/error_deep_dive.py로 search failure와 judge failure를 분리 분석하는 repo-specific harness를 설계해줘. experiment planner, experiment runner, search investigator, judge investigator, metrics analyst, phase report writer가 필요하다.
```

기대 산출물:

- repo profile
- harness interview state
- immutable blueprint / harness seed
- SolPE 전용 generated agents / skills / reference contracts

### Scenario 2. Best Search Case 탐색

이 문서의 추천 첫 시나리오다.

언제 쓰나:

- 현재 관심사가 "최적의 case를 찾는 것"일 때
- candidate coverage와 search recall 쪽이 먼저 의심될 때
- judge 변경을 최소화하고 retrieval-side 개선을 우선 보고 싶을 때

핵심 목표:

- `search_hit_rate`와 candidate coverage를 먼저 올린다.
- `exact_terms`, `entity_query`, `fetch_k`, decomposition context 같은 search-side 요소를 주제로 고정한다.
- judge-side 변경은 후순위로 둔다.

추천 interview prompt:

```text
SolPE에서 현재 최적의 case를 찾고 있다. docs/phase8_instruction.md 를 baseline brief로 삼고, search_hit_rate와 candidate coverage 개선에 집중하고 싶다. exact-term, entity_query, enriched decomposition context 쪽을 우선 보고 judge-side 변경은 최소화하는 실험/개발 loop를 설계하자.
```

추천 대표 검증 대상:

- `REQ-000002`
- `REQ-000865`
- `REQ-000900`

### Scenario 3. Judge / Guardrail Calibration

언제 쓰나:

- 검색 후보군 자체는 어느 정도 맞게 들어오는데 최종 선택과 label이 불안정할 때
- `selection_hit_rate` 또는 `decision_accuracy`가 핵심일 때
- false positive 억제, default-state, negative-capability handling이 중요할 때

핵심 목표:

- retrieval 후보군은 크게 흔들지 않는다.
- judge prompt, synthesis guardrail, exact-value handling을 개선한다.

추천 interview prompt:

```text
SolPE phase8 baseline을 기준으로 retrieval 후보군은 유지하면서 judge-side calibration을 개선하고 싶다. 목표는 selection_hit_rate와 decision_accuracy를 높이고, exact-value guardrail과 default-state/negative-capability handling을 더 안정화하는 것이다.
```

추천 대표 검증 대상:

- `REQ-000071`
- `REQ-000865`

### Scenario 4. Phase 8 결과 기반 Phase 9 Brief 준비

언제 쓰나:

- fresh experiment output이 생겼을 때
- phase8 결과를 다음 phase brief로 승격하고 싶을 때

핵심 목표:

- persistent failure case와 실험 비교표를 바탕으로 다음 phase instruction 초안을 만든다.
- search-side, judge-side, metrics-side 우선순위를 분리한다.

추천 interview prompt:

```text
SolPE의 phase8 실험 결과를 바탕으로 다음 phase instruction을 만들고 싶다. 실험 output, analyze_experiments 결과, persistent failure case를 기준으로 phase9에서 search-side, judge-side, metrics-side 우선순위를 분리해서 정리하자.
```

주의:

- 현재 local clone에는 `output/exp8_*`가 보이지 않으므로, 이 시나리오는 새 결과가 생긴 뒤에 쓰는 것이 가장 자연스럽다.

## 실제 명령 예시

기본 작업 위치:

```bash
cd /home/hjsg1010/SolPE
```

### 1. SolPE 전용 harness bootstrap

```bash
harness architect "이 repo는 Function Requirement와 analyzed TC 매핑 실험을 운영하는 연구형 repo다. phase instruction 문서를 기준으로 실험을 설계하고, scripts/run_experiments_phase8.sh로 실행하고, scripts/analyze_experiments.py와 scripts/error_deep_dive.py로 search failure와 judge failure를 분리 분석하는 repo-specific harness를 설계해줘. experiment planner, experiment runner, search investigator, judge investigator, metrics analyst, phase report writer가 필요하다."
harness blueprint <architect-id>
harness scaffold .harness/harness-seeds/<seed-id>.yaml
```

### 2. Best search case 탐색

```bash
harness interview "SolPE에서 현재 최적의 case를 찾고 있다. docs/phase8_instruction.md 를 baseline brief로 삼고, search_hit_rate와 candidate coverage 개선에 집중하고 싶다. exact-term, entity_query, enriched decomposition context 쪽을 우선 보고 judge-side 변경은 최소화하는 실험/개발 loop를 설계하자."
harness seed <interview-id>
harness ralph .harness/seeds/<seed-id>.yaml
```

### 3. Judge / guardrail calibration

```bash
harness interview "SolPE phase8 baseline을 기준으로 retrieval 후보군은 유지하면서 judge-side calibration을 개선하고 싶다. 목표는 selection_hit_rate와 decision_accuracy를 높이고, exact-value guardrail과 default-state/negative-capability handling을 더 안정화하는 것이다."
harness seed <interview-id>
harness ralph .harness/seeds/<seed-id>.yaml
```

### 4. 참고: 한 번에 묶고 싶다면

```bash
harness run "SolPE에서 현재 최적의 case를 찾고 있다. docs/phase8_instruction.md 를 baseline brief로 삼고, search_hit_rate와 candidate coverage 개선에 집중하고 싶다."
```

다만 SolPE에서는 보통 `interview -> seed -> ralph`를 먼저 권장한다. 이유는 phase brief, baseline, 검증 기준을 immutable artifact로 고정하는 이점이 크기 때문이다.

## SolPE에서 계속 유지해야 하는 검증 루프

하네스를 붙여도 실제 실험 검증 엔진은 여전히 SolPE 쪽이다.

핵심 검증 명령은 아래로 유지한다.

```bash
python scripts/cli.py status
bash scripts/run_experiments_phase8.sh baseline
bash scripts/run_experiments_phase8.sh retrieval
bash scripts/run_experiments_phase8.sh guardrail
bash scripts/run_experiments_phase8.sh decomp
bash scripts/run_experiments_phase8.sh synergy
python scripts/analyze_experiments.py output/exp8_*
python scripts/error_deep_dive.py output/exp8_* --req REQ-000002
python scripts/error_deep_dive.py output/exp8_* --req REQ-000071
python scripts/error_deep_dive.py output/exp8_* --req REQ-000865
python scripts/error_deep_dive.py output/exp8_* --req REQ-000900
```

하네스는 이 루프를 대체하지 않는다. 대신 아래를 더해준다.

- 실험 목표를 먼저 명확히 만드는 interview
- replay 가능한 `spec.md` / `seed.yaml`
- repo-specific agent/skill framing
- 실패 시 next step을 남기는 reopen guidance

## 운영 시 주의점

### 1. `docs/phase8_instruction.md`를 canonical brief처럼 다룬다

SolPE에서는 phase instruction 문서가 단순 메모가 아니다. 실험 목표, 토글, 대표 requirement, 성공 기준까지 들어간 brief다. harness prompt에서도 이 파일을 기준 자산으로 명시하는 것이 좋다.

### 2. 코드 기본값과 phase baseline을 섞어 쓰지 않는다

예를 들어 `fetch_k`, `judge_mode`는 코드 기본값과 phase8 baseline이 다르다. 실험/개발 loop를 돌릴 때는 "무엇을 baseline으로 삼았는가"를 매번 seed나 run notes에서 명시하는 습관이 필요하다.

### 3. search 문제와 judge 문제를 같은 run에 섞지 않는다

SolPE는 이미 `search_hit_rate`와 `selection_hit_rate`를 분리한다. harness feature lane도 이 구분을 따르는 것이 좋다.

- search run: exact terms, entity query, fetch/retrieval coverage, decomposition context
- judge run: prompt, guardrail, calibration, label synthesis

### 4. Phase 9 brief 생성은 결과가 쌓인 뒤에 한다

phase instruction을 다음 phase로 진화시키는 작업은 output, 비교표, deep dive evidence가 있어야 강해진다. 현재 output artifact가 없는 상태에서는 먼저 Scenario 2 또는 Scenario 3처럼 concrete improvement run을 만드는 것이 낫다.

## 추천 시작 순서

SolPE에서 처음 하네스를 붙일 때는 아래 순서를 권장한다.

1. `architect -> blueprint -> scaffold`로 SolPE 전용 harness를 먼저 만든다.
2. 첫 실전 use case는 Scenario 2인 "best search case 탐색"으로 시작한다.
3. 그 다음 필요하면 Scenario 3으로 judge/guardrail calibration을 분리한다.
4. fresh output이 쌓이면 Scenario 4로 다음 phase brief를 준비한다.

이렇게 쓰면 SolPE의 기존 실험 문화는 유지하면서도, 실험 의도와 다음 액션은 더 재현 가능하게 관리할 수 있다.
