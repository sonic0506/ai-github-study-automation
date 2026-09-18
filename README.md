# ai-github-study

AI 관련 GitHub Repository 트렌드를 매일 수집하고, Study 후보를 선정해 Claude Cowork가 Study 초안을 작성하는 시스템.
이 Repository는 **Claude Custom Skill의 Source of Truth**이며, 운영용 Skill은 ZIP으로 빌드해 Claude에 업로드한다.

> 현재 단계: **Phase 3 완료** — 7개 Skill 구현 완료 (조사·문체·작성 흐름 포함)

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
config/                 discovery.yml, study-policy.yml, report.yml (Zod로 검증)
schemas/                repository / ranking / study-queue / snapshot / registry / research-note / daily-bundle
                        (JSON Schema 2020-12)
src/core/               types.ts(공통 타입), config.ts, env.ts, schema.ts(Ajv), paths.ts, json-io.ts,
                        slug.ts, dates.ts, registry.ts, local-store.ts, template.ts(Markdown 렌더러)
src/adapters/           github.ts — adapter 인터페이스 + Fixture 구현
                        github-rest.ts — GitHub REST 클라이언트 (검색·조회·페이지·rate limit·재시도)
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
scripts/                discover.ts, demo.ts, registry.ts, test-skills.ts, build-skills.ts, lib/skill-package.ts
output/                 로컬 실행 결과 (git 제외): discovery/, demo/, local-data/
.env.example            환경변수 예시 (.env 는 git 제외)
```

## Skill 현황

| Skill | 종류 | 상태 | 번들 스크립트 |
|---|---|---|---|
| github-ai-discovery | generative | **GitHub 실검색 구현** | `scripts/discover.mjs`, `scripts/normalize.mjs` |
| github-star-analyzer | deterministic | **구현 완료** | `scripts/analyze.mjs` |
| study-candidate-selector | deterministic | **구현 완료** | `scripts/select.mjs` |
| github-researcher | generative | **구현 완료** (조사 + 검증) | `scripts/validate.mjs` |
| my-writing-style | generative | **구현 완료** (사용자 글 6편 기반) | — |
| daily-report-writer | deterministic | **구현 완료** | `scripts/render.mjs` |
| study-writer | deterministic | **구현 완료** | `scripts/render.mjs` |

## 환경 설정

```bash
npm install
cp .env.example .env      # GITHUB_TOKEN 입력 (공개 저장소 읽기 전용 Fine-grained token)
```

| 변수 | 설명 | 기본값 |
|---|---|---|
| `GITHUB_TOKEN` | GitHub 토큰. 비우면 비인증 호출 (검색 분당 10회, 일반 API 시간당 60회) | 없음 |
| `AGS_DATA_DIR` | Snapshot/Registry 위치. 로컬은 `output/local-data` 권장 (`data/`는 운영용) | `data` |
| `AGS_TIMEZONE` | 실행 날짜 기준 시간대 | `Asia/Seoul` |
| `GITHUB_MAX_RETRIES` 등 | 재시도·타임아웃·rate limit 대기 한도 (`.env.example` 참고) | — |

셸에 이미 `export` 된 환경변수는 `.env` 값보다 우선한다.

## 실행

```bash
npm test              # Vitest: 결정적 로직 unit test + schema/config test
npm run test:skills   # Skill 패키지 테스트 (업로드 형태로 조립 → 구조 검증 → 번들 CLI를 fixture로 실행)
npm run build:skills  # dist/skills/{name}.zip 생성
npm run typecheck     # tsc --noEmit
npm run demo          # fixture로 분석→선정 실행, 결과를 표로 출력 + output/demo/*.json 저장
npm run discover      # 실제 GitHub 수집 → output/discovery/{date}.json
npm run registry      # 로컬 Registry 조회 / Study 적합성 수동 판정

# 일부 Skill만
npm run test:skills -- --only github-star-analyzer
npm run build:skills -- --only study-candidate-selector
```

### 실제 데이터로 하루 실행하기

```bash
npm run discover -- --dry-run     # 실행할 검색어만 확인 (API 호출 없음)
npm run discover                  # 수집 (토큰 있으면 약 20초, 없으면 rate limit 대기로 약 1분)
npm run demo -- --input output/discovery/<날짜>.analyzer-input.json --save
```

- `--save`는 오늘 Snapshot과 Registry를 `AGS_DATA_DIR`에 저장한다. 다음 날 실행하면 이 기록과 비교해 증가량이 계산된다.
- 첫 실행은 비교 기록이 없어 모든 저장소가 신규이고 Growth TOP10이 비어 있다.
- `AGS_DATA_DIR`이 `data`(운영 폴더)이면 `--save`는 `--force` 없이는 저장하지 않는다.
- 수집 방식: topic 검색 + 최근 생성 저장소 보완 검색 + Registry 등록 저장소 개별 추적 (`config/discovery.yml`)

### AI와 무관한 저장소 거르기

| 방법 | 언제 | 효과 |
|---|---|---|
| `config/discovery.yml`의 `exclude.repositories` | AI 도구가 아닌 게 명확할 때 | 수집·순위·추적에서 완전히 제외 |
| Study 적합성 판정 (`github-researcher` 1단계) | awesome-list, 튜토리얼, 면접 가이드 등 | 순위에는 남고 Study 후보에서만 제외 (Registry에 저장) |

```bash
npm run registry -- list --not-studyable
npm run registry -- mark punkpeye/awesome-mcp-servers --category awesome-list --reason "MCP 서버 링크 목록"
npm run registry -- unmark punkpeye/awesome-mcp-servers
```

판정 기준과 category 목록: `skills/github-researcher/resources/studyability.md`

### 결과 확인 (demo)

```bash
npm run demo                                   # 기본 fixture
npm run demo -- --input my-input.json          # 직접 만든 analyzer 입력
npm run demo -- --selector my-selector.json    # history / studyStates 지정
```

TOP10, Growth TOP10, 신규 목록, Study Queue(점수·상태·사유)를 표로 출력하고 아래 파일을 만든다 (`output/`은 git 제외).

| 파일 | 내용 |
|---|---|
| `output/demo/analysis.json` | 저장소별 Star·증가량, Ranking, 그날 Snapshot |
| `output/demo/study-queue.json` | 후보별 점수·상태·사유 |
| `output/demo/daily-report.md` | 한국어 Daily Report (운영 시 `reports/daily/{date}.md`) |
| `output/demo/telegram.md` | Telegram 요약 |

### 스크립트 단독 실행 (로컬)

```bash
npx tsx skills/github-star-analyzer/scripts/cli.ts skills/github-star-analyzer/tests/fixtures/input.json
npx tsx skills/study-candidate-selector/scripts/cli.ts skills/study-candidate-selector/tests/fixtures/input.json
```

빌드된 ZIP 안에서는 `node scripts/analyze.mjs input.json` 형태로 실행된다 (npm 의존성 불필요).

## 테스트 전략

| 구분 | 대상 | 방법 |
|---|---|---|
| Deterministic | star-analyzer, candidate-selector, daily-report-writer, study-writer, schema | Vitest unit test (신규/증가 0/감소/중복/후보 부족/Study 존재/PR 열림/동점/입력 오류) + 번들 CLI golden 비교 |
| Generative | discovery, researcher, writing-style | `tests/rubric.md`(★ 필수 기준) + `tests/fixtures/` — 문자열 Snapshot 비교 안 함 |

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
| 템플릿 렌더링 | 표·숫자·순위·한 줄 요약(GitHub 설명문 원문)을 코드가 채운다. Daily Report는 결정적 Skill |
| 리포트 언어·분량 | 한국어. 신규 저장소는 Star 순 상위 `newly_discovered_limit`개 + "외 N개" |
| Study 파일/브랜치 이름 | 소문자 + `owner__name` (`src/core/slug.ts`, 스키마에서 강제) |
| AI 무관 저장소 | 명확한 것은 제외 목록, 애매한 것은 researcher가 Study 적합성 판정 → Registry `studyability` 저장 → selector `skipped_not_studyable` + 다음 후보 승격 |

## Study 작성 흐름

```
study-candidate-selector (selected)
  → github-researcher   1) Study 적합성 판정 → 대상 아니면 중단하고 다음 후보 승격
                        2) README·문서·Release·Issues 조사 → Research Note(JSON)
                        3) node scripts/validate.mjs 로 출처 참조 검사 (ok: true 필수)
  → my-writing-style    문장만 사용자 문체로 변환 (숫자·출처·판정은 불변)
  → study-writer        Study Markdown + PR 본문 (branch/path 는 소문자 slug)
```

- Research Note의 모든 주장에는 `sourceIds`가 붙고, 검증 스크립트가 없는 출처·중복 id·스키마 위반을 잡는다.
- 확인하지 못한 내용은 `openQuestions`로 남고, Study 문서의 "더 알아볼 것"과 PR 본문에 그대로 표시된다.

## 설정 변경

- `config/discovery.yml`: topics, minimum_stars, 검색 옵션, ranking(top_n, growth_min_delta)
- `config/discovery.yml`의 `exclude.repositories`: 수집 제외 목록
- `config/report.yml`: newly_discovered_limit, description_max_length, telegram_growth_top, report_path
- `templates/daily-report.md`, `templates/telegram-daily.md`: 리포트 문구·레이아웃 (`{{var}}`, `{{#list}}` 문법)
- `config/study-policy.yml`: max_daily_drafts, priority 가중치, repeated_top10_window_days, skip_if(study_exists, pr_open, not_studyable)

설정은 빌드 시 각 Skill의 `resources/`에 복사되며, 실행 시 입력 JSON의 `policy`/`config`로 덮어쓸 수 있다.

## 로드맵

- [x] Phase 0 — 프로젝트 세팅, 타입, 스키마, config
- [x] Phase 1 — github-star-analyzer, study-candidate-selector + unit test
- [x] Phase 2 — Skill 골격, test:skills, build:skills
- [ ] Phase 3 — 생성형 Skill 본 구현
  - [x] discovery 실검색 (REST 클라이언트, 신규 보완 검색, 등록 저장소 추적, env 설정)
  - [x] AI 무관 저장소 필터 (제외 목록 + Study 적합성 판정)
  - [x] daily-report-writer 렌더러 (Markdown 템플릿 + Telegram 요약)
  - [x] github-researcher (Research Note 스키마 + 출처 검증 스크립트)
  - [x] my-writing-style (사용자 글 6편에서 뽑은 style-guide / anti-patterns)
  - [x] study-writer (Study Markdown + PR 본문 렌더링)
- [ ] Phase 4 — Handoff (Cowork → GitHub Actions), Actions workflow, Registry 갱신
- [ ] Phase 5 — PR 생성, Telegram 알림, Cowork Scheduled Task 연결
