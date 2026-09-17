---
name: github-star-analyzer
description: 오늘 수집한 GitHub Repository Star 데이터와 전날 Snapshot을 비교해 24시간 Star 증가량(delta24h), Total Stars TOP10, 24h Growth TOP10, 신규 발견 목록을 계산한다. 숫자 계산은 반드시 번들된 스크립트로 수행한다. github-ai-discovery 다음 단계에서 사용한다.
---

# github-star-analyzer

**결정적(deterministic) Skill.** 모든 숫자는 `scripts/analyze.mjs`가 계산한다.
LLM이 Star 수를 직접 더하거나 빼거나 정렬하지 않는다.

## 입력 (AnalyzerInput)

```json
{
  "date": "2026-09-17",
  "current": [ { "repository": "owner/name", "url": "...", "description": "...", "stars": 123 } ],
  "previousSnapshot": { "version": 1, "date": "2026-09-16", "repositories": [ { "repository": "owner/name", "stars": 100 } ] },
  "firstSeen": { "owner/name": "2026-09-01" },
  "options": { "topN": 10, "growthMinDelta": 1 }
}
```

- `current`: `github-ai-discovery` 출력의 `repositories`
- `previousSnapshot`: 전날 Snapshot. 없으면 `null`
- `firstSeen`: Registry의 최초 발견일 (선택)
- `options`: 생략 시 `resources/discovery.yml`의 `ranking` 값과 동일한 기본값(10, 1)

## 실행

```bash
node scripts/analyze.mjs input.json > analysis.json
```

## 출력 (AnalyzerOutput)

- `repositories`: RepositoryInfo[] (`resources/schemas/repository.schema.json`)
- `rankings`: `totalStarsTop10`, `growth24hTop10`, `newlyDiscovered` (`resources/schemas/ranking.schema.json`)
- `snapshot`: 오늘자 Snapshot (`resources/schemas/snapshot.schema.json`) — GitHub Actions가 `data/snapshots/{date}.json`으로 저장

## 계산 규칙

| 상황 | 결과 |
|---|---|
| 전날 데이터 없음 | `previousStars=null`, `delta24h=null`, `isNew=true` |
| Star 변화 없음 / 감소 | `delta24h`는 0 / 음수. Growth TOP10에서는 제외 (`growthMinDelta` 미만) |
| 중복 Repository (대소문자 무시) | Star가 큰 관측값 1개만 유지 |
| 후보가 N개 미만 | 있는 만큼만 반환 |
| 동점 | Total: stars → 이름순 / Growth: delta → stars → 이름순 |

## 규칙

- 스크립트 출력 JSON을 수정하지 않고 다음 단계(`study-candidate-selector`)로 전달한다.
- 스크립트가 오류를 내면 입력을 고쳐 재실행하고, 숫자를 추정해서 채우지 않는다.
