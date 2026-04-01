# Dead Code Cleanup and Quality Fixes

## 1. What changed

Codex-to-Claude-native 전환(2026-04-01) 이후 남아있던 dead code를 제거하고, 코드 품질 이슈와 패키징 문제를 수정했다.

### Dead code 삭제
- `.agents/skills/harness/` 디렉토리 (7파일) - Codex 시대 duplicate asset 잔여물
- `OrchestratorRunResult` 인터페이스 - orchestrator 서비스 제거 후 미사용
- `ScoreDraft` 인터페이스 - 어디서도 import/사용되지 않음
- `ArchitectScoreDraft` 인터페이스 - import만 있고 실제 미사용
- `DimensionName` 타입 별칭 - ScoreDraft 전용이었고 함께 삭제
- `MAX_AUTO_REOPENS` 상수 - 코드에서 참조 없음
- `stableStringify` 함수 - 호출처 없음
- `extractJsonObject` 함수 - 호출처 없음
- `ArchitectScoreDraft`, `ArchitectAmbiguityBreakdown` 미사용 import 제거

### 버그 수정
- `printJsonIfRequested` (src/cli.ts) - if/else 양쪽이 동일한 코드를 실행하는 dead branch 제거

### 코드 품질 개선
- `RalphService` (src/ralph/service.ts) - 깊은 중첩 객체 직접 mutation을 immutable 패턴으로 변경
  - `markStoryPassed/Rejected`를 `map` + spread 패턴으로 변경
  - `delete` 연산자를 destructuring 패턴으로 변경
  - `repeated.count += 1`을 새 객체 생성으로 변경

### 패키징/설정 개선
- `.gitignore` - `vitest.config.js`, `vitest.config.js.map` 추가
- `package.json` - `main`과 `exports` 필드 추가 (라이브러리 진입점)
- `src/index.ts` - `brownfield.ts` export 추가

## 2. Why it changed

2026-04-01 Claude-native 전환에서 Codex 런타임 코드는 제거했지만, 관련 타입 정의, 상수, 유틸 함수, duplicate asset 디렉토리 등의 잔여물이 남아있었다. 또한 프로젝트의 불변성 원칙에 위배되는 mutation 패턴과 패키징 누락을 함께 정리했다.

## 3. Verification performed

```bash
npm run build      # 성공
npm run typecheck  # 성공
npm test           # 9 files, 24 tests passed (695ms)
npm run smoke:cli  # CLI help surface 정상 출력
```

CLI 통합 테스트:
- `node dist/cli.js internal feature-init --idea "test" --json` - JSON 출력 및 파일 생성 정상
- `node dist/cli.js internal architect-init --goal "test" --json` - repo profile 스캔 및 JSON 출력 정상
- `bash scripts/harness-plugin-runner.sh internal --help` - 11개 내부 커맨드 정상 표시

## 4. Files modified

- `src/core/types.ts` - ScoreDraft, ArchitectScoreDraft, DimensionName, OrchestratorRunResult 삭제
- `src/core/constants.ts` - MAX_AUTO_REOPENS 삭제
- `src/core/utils.ts` - stableStringify, extractJsonObject 삭제
- `src/architect/service.ts` - 미사용 import 제거
- `src/ralph/service.ts` - immutable 패턴 적용
- `src/cli.ts` - printJsonIfRequested dead branch 제거
- `src/index.ts` - brownfield export 추가
- `package.json` - main, exports 추가
- `.gitignore` - vitest 산출물 추가

## 5. Files deleted

- `.agents/skills/harness/SKILL.md`
- `.agents/skills/harness/references/skill-writing-guide.md`
- `.agents/skills/harness/references/team-examples.md`
- `.agents/skills/harness/references/skill-testing-guide.md`
- `.agents/skills/harness/references/agent-design-patterns.md`
- `.agents/skills/harness/references/orchestrator-template.md`
- `.agents/skills/harness/references/qa-agent-guide.md`
