# ai-github-study

AI 관련 GitHub Repository 트렌드를 매일 수집하고, Study 후보를 선정해 Claude Cowork가 Study 초안을 작성하는 시스템.
이 Repository는 **Claude Custom Skill의 Source of Truth**이며, 운영용 Skill은 ZIP으로 빌드해 Claude에 업로드한다.

> 현재 단계: **Phase 0~2** (프로젝트 기반 · 결정적 Skill 구현 · Skill 골격/빌드)

## 역할 분담

| 주체 | 담당 |
|---|---|
| **Claude Cowork** | 06:00 Scheduled Task, 탐색, Star 분석, Study 후보 선정, Research, 문체 적용, Daily Report / Study Draft 작성 → **Daily Bundle(JSON)** 생성. Repository에 직접 쓰지 않음 |
| **GitHub Actions** | Daily Bundle 수신 → Snapshot/Registry/Queue 저장, Report commit, Study branch·PR 생성, Telegram 알림 |
| **GitHub** | Skill 원본, Snapshot, Report, Study Knowledge Base, PR 관리 |

## 파이프라인

```
github-ai-discovery ──► github-star-analyzer ──► study-candidate-selector
   (JSON)                  (JSON, 코드 계산)          (JSON, 코드 계산)
                                   │                        │ selected (≤3)
                                   ▼                        ▼
                         daily-report-writer      github-researcher ─► my-writing-style ─► study-writer
                            (Markdown)               (JSON)                (JSON)              (Markdown)
                                   └────────────── DailyBundle (daily-bundle.schema.json) ─────────┘
```

- Skill 사이 데이터는 **JSON**. Markdown은 Writer Skill에서만 생성.
- 숫자 계산(delta, 순위, 점수)은 **TypeScript 스크립트**가 수행하고 LLM은 결과만 전달.

## 디렉터리

```
config/                 discovery.yml, study-policy.yml (Zod로 검증)
schemas/                repository / ranking / study-queue / snapshot / daily-bundle (JSON Schema 2020-12)
src/core/               types.ts(공통 타입), config.ts, schema.ts(Ajv), paths.ts, json-io.ts, slug.ts
src/adapters/           github.ts — 외부 서비스 adapter 인터페이스 + Fixture 구현
skills/{name}/
  SKILL.md              Claude가 읽는 지침 (frontmatter name = 디렉터리명)
  skill.json            빌드/테스트 메타데이터 (ZIP 제외)
  resources/            Skill 전용 리소스
  scripts/*.ts          결정적 로직 + CLI (빌드 시 단일 .mjs로 번들)
  tests/                unit test(*.test.ts), rubric.md, fixtures/ (ZIP 제외)
templates/              daily-report / study / study-pr / telegram-daily
data/                   registry.json, study-queue.json, snapshots/
reports/daily/, studies/  GitHub Actions가 채우는 산출물
tests/                  공통 테스트 (schema·config), fixtures/
scripts/                test-skills.ts, build-skills.ts, lib/skill-package.ts
```

## Skill 현황

| Skill | 종류 | 상태 | 번들 스크립트 |
|---|---|---|---|
| github-ai-discovery | generative | 골격 + 정규화 스크립트 | `scripts/normalize.mjs` |
| github-star-analyzer | deterministic | **구현 완료** | `scripts/analyze.mjs` |
| study-candidate-selector | deterministic | **구현 완료** | `scripts/select.mjs` |
| github-researcher | generative | 골격 | — |
| my-writing-style | generative | 골격 (style 리소스 TODO) | — |
| daily-report-writer | generative | 골격 | — |
| study-writer | generative | 골격 | — |

## 실행

```bash
npm install

npm test              # Vitest: 결정적 로직 unit test + schema/config test
npm run test:skills   # Skill 패키지 테스트 (업로드 형태로 조립 → 구조 검증 → 번들 CLI를 fixture로 실행)
npm run build:skills  # dist/skills/{name}.zip 생성
npm run typecheck     # tsc --noEmit

# 일부 Skill만
npm run test:skills -- --only github-star-analyzer
npm run build:skills -- --only study-candidate-selector
```

### 스크립트 단독 실행 (로컬)

```bash
npx tsx skills/github-star-analyzer/scripts/cli.ts skills/github-star-analyzer/tests/fixtures/input.json
npx tsx skills/study-candidate-selector/scripts/cli.ts skills/study-candidate-selector/tests/fixtures/input.json
```

빌드된 ZIP 안에서는 `node scripts/analyze.mjs input.json` 형태로 실행된다 (npm 의존성 불필요).

## 테스트 전략

| 구분 | 대상 | 방법 |
|---|---|---|
| Deterministic | star-analyzer, candidate-selector, schema | Vitest unit test (신규/증가 0/감소/중복/후보 부족/Study 존재/PR 열림/동점/입력 오류) + 번들 CLI golden 비교 |
| Generative | discovery, researcher, writing-style, report-writer, study-writer | `tests/rubric.md`(★ 필수 기준) + `tests/fixtures/` — 문자열 Snapshot 비교 안 함 |

`test:skills`는 staging(업로드 형태) 디렉터리에서 CLI를 실행하므로, Skill이 로컬 프로젝트 파일에 의존하지 않는지 함께 검증한다.

## Skill ZIP 구조

```
github-star-analyzer.zip
└─ github-star-analyzer/
   ├─ SKILL.md
   ├─ resources/discovery.yml, resources/schemas/*.json   ← skill.json.bundle 로 복사
   └─ scripts/analyze.mjs                                  ← esbuild 단일 번들
```

## 확정된 설계 결정

| 항목 | 결정 |
|---|---|
| 신규(`isNew`) 판단 | Registry에 한 번도 등록된 적 없는 Repository만 신규. 목록에서 빠졌다 돌아온 Repository는 신규 아님 |
| Snapshot 누락일 | 오늘 이전의 가장 최근 Snapshot과 비교 (`selectBaselineDate`). `baseline.gapDays`로 기간을 리포트에 표시 |
| 템플릿 렌더링 | 표·숫자·순위는 코드가 채우고, Claude는 한 줄 요약·본문만 작성 (Phase 3) |
| Study 파일/브랜치 이름 | 소문자 + `owner__name` (`src/core/slug.ts`, 스키마에서 강제) |

## 설정 변경

- `config/discovery.yml`: topics, minimum_stars, 검색 옵션, ranking(top_n, growth_min_delta)
- `config/study-policy.yml`: max_daily_drafts, priority 가중치, repeated_top10_window_days, skip_if

설정은 빌드 시 각 Skill의 `resources/`에 복사되며, 실행 시 입력 JSON의 `policy`/`config`로 덮어쓸 수 있다.

## 로드맵

- [x] Phase 0 — 프로젝트 세팅, 타입, 스키마, config
- [x] Phase 1 — github-star-analyzer, study-candidate-selector + unit test
- [x] Phase 2 — Skill 골격, test:skills, build:skills
- [ ] Phase 3 — 생성형 Skill 본 구현 (discovery 실검색, researcher, writing-style 리소스, writers 렌더러)
- [ ] Phase 4 — Handoff (Cowork → GitHub Actions), Actions workflow, Registry 갱신
- [ ] Phase 5 — PR 생성, Telegram 알림, Cowork Scheduled Task 연결
