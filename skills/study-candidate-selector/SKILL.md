---
name: study-candidate-selector
description: github-star-analyzer의 Ranking 결과와 기존 Study/PR 상태를 이용해 아직 작성되지 않은 Study 후보를 점수화하고, 하루 최대 N개(기본 3개)의 Study Draft 대상을 선정해 Study Queue JSON을 만든다. 선정 기준은 study-policy.yml로 관리한다.
---

# study-candidate-selector

**결정적(deterministic) Skill.** 점수 계산·정렬·선정은 `scripts/select.mjs`가 수행한다.

## 입력

```json
{
  "date": "2026-09-17",
  "rankings": { "totalStarsTop10": [], "growth24hTop10": [], "newlyDiscovered": [] },
  "history": { "owner/name": { "top10Days": 3 } },
  "studyStates": { "owner/name": { "studyExists": false, "prOpen": true } },
  "policy": "(선택) study-policy YAML 문자열 또는 객체"
}
```

- `rankings`: `github-star-analyzer` 출력의 `rankings`
- `history`: 최근 `repeated_top10_window_days`일 동안 TOP10 등장 일수(오늘 포함). 없으면 오늘 등장 여부(0/1)로 계산
- `studyStates`: 기존 Study 파일 존재 여부, 열린 PR 여부. 없으면 미작성으로 간주
- `policy`: 생략 시 `resources/study-policy.yml`

## 실행

```bash
node scripts/select.mjs input.json > study-queue.json
```

## 점수 계산 (0~100)

각 요소를 0~1로 정규화한 뒤 `priority` 가중치를 곱해 합산 (소수 둘째 자리 반올림).

| 요소 | 정규화 |
|---|---|
| `growth_24h` | delta24h / 후보 중 최대 delta (0 이하 → 0) |
| `repeated_top10` | min(top10Days / window, 1) |
| `total_stars` | log10(stars+1) / log10(최대 stars+1) |
| `new_repository` | 신규면 1 |

## 상태

- `skipped_study_exists` / `skipped_pr_open`: `skip_if` 규칙에 해당 (study_exists 우선)
- `selected`: 나머지 중 priority 상위 `max_daily_drafts`개
- `queued`: 선정되지 않은 나머지

정렬: priority ↓ → stars ↓ → 이름순. 출력은 `resources/schemas/study-queue.schema.json`을 따른다.

## 규칙

- 점수를 직접 계산하거나 순서를 임의로 바꾸지 않는다.
- `selected` 항목만 `github-researcher` → `study-writer` 단계로 넘긴다.
