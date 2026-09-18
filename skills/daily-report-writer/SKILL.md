---
name: daily-report-writer
description: github-star-analyzer의 Ranking과 study-candidate-selector의 Study Queue를 고정 Markdown 템플릿으로 변환해 한국어 Daily Report와 Telegram 요약을 만든다. AI GitHub 일일 리포트를 작성할 때 사용한다. 숫자를 새로 계산하거나 순위를 바꾸지 않는다.
---

# daily-report-writer

**결정적(deterministic) Skill.** 표·숫자·순위·문구를 `scripts/render.mjs`가 채운다.
LLM이 표를 직접 옮겨 적거나 요약 문장을 지어내지 않는다.

## 입력

```json
{
  "date": "2026-09-18",
  "baseline": { "date": "2026-09-17", "gapDays": 1 },
  "rankings": { "totalStarsTop10": [], "growth24hTop10": [], "newlyDiscovered": [] },
  "studyQueue": { "version": 1, "date": "2026-09-18", "maxDailyDrafts": 3, "candidates": [] },
  "repositoryCount": 347
}
```

- `baseline`, `rankings`: `github-star-analyzer` 출력 그대로
- `studyQueue`: `study-candidate-selector` 출력 그대로 (`date`가 일치해야 한다)
- `repositoryCount`: 그날 수집한 전체 개수
- `config` / `templates`를 넘기면 번들된 `resources/`의 값을 대신 사용한다

## 실행

```bash
node scripts/render.mjs input.json > report.json
```

## 출력

```json
{ "dailyReport": { "path": "reports/daily/2026-09-18.md", "markdown": "..." },
  "telegram": { "markdown": "..." } }
```

`dailyReport`는 DailyBundle의 `dailyReport` 필드에 그대로 넣는다.

## 리포트 구성 (`resources/daily-report.md`)

| 섹션 | 내용 |
|---|---|
| 머리말 | 수집·신규·Study 개수, 비교 기준일 (`gapDays`가 2 이상이면 "N일 전"으로 표시) |
| 24h Growth TOP | 순위, Star, 증가량, 설명. 증가분이 없으면 이유 문장 |
| Total Stars TOP | 순위, Star, 증가량(`NEW` 포함), 설명 |
| 신규 발견 | Star 순 상위 `newly_discovered_limit`개 + "외 N개". 전부 신규인 첫 수집이면 안내 문구 |
| 오늘의 Study | `selected` 후보만. 전체 Queue는 접이식 표 |

설정: `resources/report.yml` (`newly_discovered_limit`, `description_max_length`, `telegram_growth_top`, `report_path`)

## 규칙

- 한 줄 요약은 GitHub `description` 원문을 그대로 쓴다 (공백 정리, 표 깨짐 방지, 길이 초과 시 `…`). 직접 요약하지 않는다.
- 스크립트 출력 Markdown을 손대지 않는다. 문구를 바꾸려면 `resources/daily-report.md` 템플릿을 고친다.
- 입력에 없는 Repository를 추가하지 않는다.
