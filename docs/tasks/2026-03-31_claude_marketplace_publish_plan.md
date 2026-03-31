# Original request

Claude용으로도 GitHub marketplace를 통해 설치할 수 있게 구성하고, 관련 README 사용법을 보강한다. 또한 `interview`, `seed`, `run`, `ralph`의 권장 실행 순서를 명확히 설명한다.

# Situation overview

현재 저장소는 TypeScript CLI와 Claude/Codex skill 자산은 갖추고 있지만, Claude Code plugin marketplace가 요구하는 `.claude-plugin/plugin.json` 및 `.claude-plugin/marketplace.json`이 없다. README에는 로컬 `npm install` 기반 사용법은 있으나 Claude marketplace 설치 흐름과 private GitHub 저장소 설치 전제, plugin 설치 후 실제로 어떤 경로로 harness를 실행하는지가 빠져 있다.

# Current implementation analysis

- CLI 엔트리포인트는 `src/cli.ts`이며 `interview`, `seed`, `ralph`, `run` 네 가지 명령을 제공한다.
- Claude 자산은 `.claude/agents/*`와 `.claude/skills/harness-*`에 있고, 현재 skill 본문은 `node dist/cli.js ...`를 직접 실행하도록 되어 있다.
- 현재 원격 저장소에는 `dist/`와 `node_modules/`를 올리지 않았다.
- 따라서 Claude plugin이 GitHub에서 설치되더라도, 별도 bootstrap 경로가 없으면 plugin cache 안에서 `dist/cli.js`와 dependency를 즉시 사용할 수 없다.
- 레퍼런스 `ouroboros`, `oh-my-claudecode`는 둘 다 저장소 루트에 `.claude-plugin/plugin.json`과 `.claude-plugin/marketplace.json`을 두고 `source: "./"` 형태로 자기 자신을 plugin source로 노출한다.

# Requirements mapping

- Claude marketplace 설치 가능:
  - `.claude-plugin/plugin.json` 추가
  - `.claude-plugin/marketplace.json` 추가
- plugin 설치 후 실행 가능:
  - plugin root에서 dependency 설치 및 build를 보조하는 runner 추가
  - Claude skills를 plugin root 기준 실행 방식으로 보강
- 사용자 안내 보강:
  - README에 GitHub marketplace 설치 경로 추가
  - private GitHub 저장소 인증 전제 추가
  - `interview -> seed -> ralph`와 `run`의 관계를 명확히 설명
- 변경 이력 문서화:
  - `docs/CHANGELOG.md` 갱신
  - 결과 문서 작성

# Detailed implementation plan

## Step 1 -> verify

Claude marketplace manifest 구조를 저장소 루트에 추가한다.

- `.claude-plugin/plugin.json`에 plugin 메타데이터와 `skills`, `agents` 경로를 정의한다.
- `.claude-plugin/marketplace.json`에 GitHub marketplace 카탈로그를 정의하고 plugin source를 `./`로 둔다.

Verify:

- JSON parse 확인
- 공식 문서 요구 필드(`name`, `owner`, `plugins`, plugin `name`, `source`) 충족 여부 확인

## Step 2 -> verify

plugin 설치 후 Claude skill이 동작할 수 있도록 bootstrap runner를 추가하고 skill 경로를 교정한다.

- `scripts/harness-plugin-runner.sh`를 추가한다.
- runner는 plugin root를 기준으로 `node_modules`와 `dist/cli.js`가 없으면 `npm install`, `npm run build`를 수행한 뒤 CLI를 실행한다.
- `.claude/skills/harness-*`는 repo-local 실행과 plugin-installed 실행을 모두 지원하도록 runner를 호출한다.

Verify:

- `bash -n scripts/harness-plugin-runner.sh`
- 로컬 repo root에서 runner 경유 `--help` 확인

## Step 3 -> verify

README를 Claude marketplace 설치 경로와 실행 순서 설명까지 포함하도록 갱신한다.

- `Quick Start`에 Claude marketplace 설치 subsection 추가
- `/plugin marketplace add hjsg1010/harness-js`와 `/plugin install hybrid-harness@harness-js` 예시 추가
- private GitHub 저장소일 때 `gh auth login` 또는 `GITHUB_TOKEN`이 필요하다는 점 추가
- 권장 흐름을 `interview -> seed -> ralph`로 명시하고, `run`은 이를 합친 shortcut임을 분명히 적는다

Verify:

- README diff 수동 검토
- 명령 시그니처가 `src/cli.ts`와 일치하는지 확인

## Step 4 -> verify

변경 사항을 검증하고 문서화한다.

- `npm run build`
- `npm test`
- `node dist/cli.js --help`
- plugin manifest JSON 검증
- changelog/result 문서 작성

Verify:

- 모든 명령 성공 로그 확보
- `docs/CHANGELOG.md` 링크가 새 result 문서를 가리키는지 확인

# Test strategy

- 테스트는 기존 TypeScript 검증 루프를 유지한다: `npm run build`, `npm test`, `node dist/cli.js --help`
- 추가 검증:
  - `bash -n scripts/harness-plugin-runner.sh`
  - `node -e`로 `.claude-plugin/plugin.json`과 `.claude-plugin/marketplace.json` parse
- live Claude marketplace 설치는 이 환경에서 직접 실행하지 못하므로, 공식 문서 요구 shape + repo-local bootstrap 동작으로 대체 검증한다.

# Expected results

- 이 저장소는 GitHub 기반 Claude Code marketplace로 등록 가능해진다.
- Claude 사용자는 repository를 marketplace로 추가하고 plugin을 설치할 수 있다.
- README에서 로컬 CLI 사용법과 Claude marketplace 사용법을 함께 이해할 수 있다.
- 사용자는 기본 흐름이 `interview -> seed -> ralph`이고, `run`은 end-to-end shortcut이라는 점을 혼동하지 않게 된다.

# Ambiguities / assumptions / tradeoffs / risks

- 해석 1: marketplace 설치만 가능하면 충분하고, 첫 실행 시 bootstrap은 허용한다.
- 해석 2: install 직후 완전 무설정으로 동작해야 하므로 build artifact를 저장소에 포함해야 한다.
- 선택: 해석 1을 선택한다.
  - 이유: 기존 publish 원칙상 `dist/`와 `node_modules/`를 저장소에 포함하지 않는 편이 더 단순하고, bootstrap runner로 first-run setup을 해결할 수 있다.
- 리스크:
  - Claude plugin runtime에서 `CLAUDE_PLUGIN_ROOT`를 shell에서 사용 가능한지에 따라 경로 처리 방식이 달라질 수 있다.
  - 대응: runner 스크립트는 script path 기준으로 root를 계산하고, skill 명령은 `${CLAUDE_PLUGIN_ROOT:-.}` fallback을 사용한다.
- 질문이 필요한 항목은 현재 없음.
