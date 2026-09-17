---
name: github-ai-discovery
description: GitHub에서 AI 관련 Repository(LLM, AI agent, RAG, MCP, generative AI 등)를 topic 기반으로 탐색해 표준 RepositoryObservation JSON으로 반환한다. AI GitHub 트렌드 수집의 첫 단계에서 사용한다. Ranking, Study 선정, Markdown 작성은 하지 않는다.
---

# github-ai-discovery

AI 관련 GitHub Repository를 수집해 **표준 JSON**으로만 반환하는 Skill.

## 책임 범위

| 한다 | 하지 않는다 |
|---|---|
| topic별 Repository 검색 | Star 증감 계산 / Ranking (→ `github-star-analyzer`) |
| 최소 Star, archived, fork 필터 | Study 후보 선정 (→ `study-candidate-selector`) |
| 중복 제거 및 표준 모델 변환 | Markdown 작성 |

## 입력

- `date` (YYYY-MM-DD, Asia/Seoul 기준 실행일)
- 설정: 호출자가 `config`를 넘기지 않으면 `resources/discovery.yml` 사용
  - `topics`, `minimum_stars`, `search.max_results_per_topic`, `search.pushed_within_days`, `search.exclude_archived`, `search.exclude_forks`

## 절차

1. 설정의 `topics` 각각에 대해 GitHub Search API를 호출한다.
   - `GET https://api.github.com/search/repositories?q=topic:{topic}+stars:>={minimum_stars}[+pushed:>={date - pushed_within_days}]&sort=stars&order=desc&per_page={max_results_per_topic}`
   - 호출이 불가능하면 GitHub 웹 검색 결과를 같은 필드 구조로 옮겨 적는다. **숫자(star)는 추정하지 말고 원문 값만 사용한다.**
2. 결과를 topic별로 모아 아래 형태의 JSON 파일로 저장한다.
   ```json
   { "date": "2026-09-17", "resultsByTopic": { "llm": [ { "full_name": "...", "html_url": "...", "description": "...", "stargazers_count": 123, "topics": [], "language": "Python", "pushed_at": "...", "archived": false, "fork": false } ] } }
   ```
3. 정규화 스크립트를 실행한다 (필터링·중복 제거는 코드가 수행).
   ```bash
   node scripts/normalize.mjs raw.json > discovery.json
   ```
4. `discovery.json`이 `resources/schemas/repository.schema.json`의 `#/$defs/discoveryOutput` 계약을 만족하는지 확인하고 그대로 반환한다.

## 출력 계약

```json
{
  "date": "YYYY-MM-DD",
  "repositories": [
    { "repository": "owner/name", "url": "https://github.com/owner/name", "description": "string|null",
      "stars": 0, "topics": ["llm"], "language": "Python", "pushedAt": "ISO-8601|null" }
  ]
}
```

## 규칙

- 출력은 JSON만. 설명 문장, Markdown, 순위를 섞지 않는다.
- Repository를 새로 만들어내지 않는다. 검색 결과에 없는 항목은 넣지 않는다.
- 로컬 파일 시스템 경로에 의존하지 않는다. 입력/출력은 대화 안의 JSON 또는 Skill 내부 파일만 사용한다.
