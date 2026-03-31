# 변경 내용

Hybrid Harness v1의 실행 가능한 TypeScript CLI 스캐폴드를 추가했다. 구현 범위는 interview -> immutable spec/seed -> seed-to-PRD bridge -> Ralph-style verification loop이며, Claude/Codex 양쪽에서 재사용할 수 있는 agent/skill asset도 함께 생성했다.

## 변경 이유

사용자가 원한 것은 `Ouroboros`식 requirement interview와 `ralph`식 개발-검증 persistence loop를 하나의 하네스로 결합하는 것이었다. 따라서 v1에서는 full Ouroboros workflow engine이나 ralplan consensus 전체를 복제하지 않고, 가장 핵심적인 specification-first handoff와 reviewer-gated execution loop만 우선 구현했다.

## 영향 범위

- `src/`
  - CLI entrypoint
  - interview service / ambiguity scoring flow
  - immutable spec/seed generation
  - seed-to-PRD mapping
  - Codex runner abstraction
  - Ralph loop state machine
- `tests/`
  - unit / golden / integration(fake runner) 테스트
- `.claude/agents/`, `.claude/skills/`
  - Claude용 hybrid harness asset
- `.agents/skills/`
  - Codex wrapper skill
- `README.md`, `docs/CHANGELOG.md`
  - 사용법과 changelog 동기화

## 검증 수행

### 환경 준비

현재 시스템에는 Node.js가 없어서, 검증용으로 사용자 홈 디렉터리에 로컬 Node 20 toolchain을 풀어 사용했다.

실행:

```bash
mkdir -p "$HOME/.local"
cd "$HOME/.local"
curl -fsSLO https://nodejs.org/dist/v20.18.0/node-v20.18.0-linux-x64.tar.xz
tar -xf node-v20.18.0-linux-x64.tar.xz
export PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH"
```

### 패키지 설치

```bash
export PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH"
npm install
```

결과:
- 성공
- `package-lock.json` 생성

### 빌드

```bash
export PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH"
npm run build
```

결과:
- 성공
- `dist/` 산출물 생성

### 테스트

```bash
export PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH"
npm test
```

결과:
- 성공
- 5개 test file 통과
- 10개 test 통과

### CLI smoke

```bash
export PATH="$HOME/.local/node-v20.18.0-linux-x64/bin:$PATH"
node dist/cli.js --help
```

결과:
- 성공
- `interview`, `seed`, `ralph`, `run` usage 출력 확인

## 알려진 제한 사항

- verification command discovery는 현재 Node/TypeScript 프로젝트의 `package.json` script 우선으로 동작한다.
- Git 저장소가 없는 workspace에서는 reviewer/critic가 `codex review` 대신 `codex exec` structured review fallback을 사용한다.
- interview question generation / seed extraction / QA / critic는 실제 Codex transport에 의존하므로, 오프라인 deterministic mode는 아직 없다.

## 후속 작업

- verification command discovery를 Python 등 타 언어 프로젝트까지 확장
- review fallback의 structured parsing 강건성 강화
- CLI prompt asset과 runtime prompt drift를 줄이기 위한 shared prompt template 추출

## Lessons

이번 작업 중 사용자 수정 피드백은 없었다. 추가 lesson 기록은 없음.
