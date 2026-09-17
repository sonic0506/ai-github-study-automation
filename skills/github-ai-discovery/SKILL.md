---
name: github-ai-discovery
description: GitHub에서 AI 관련 Repository(LLM, AI agent, RAG, MCP, generative AI 등)를 topic 기반으로 탐색해 표준 RepositoryObservation JSON으로 반환한다. AI GitHub 트렌드 수집의 첫 단계에서 사용한다. Ranking, Study 선정, Markdown 작성은 하지 않는다.
---

# github-ai-discovery

AI 관련 GitHub Repository를 수집해 **표준 JSON**으로만 반환하는 Skill.
검색·필터·중복 제거는 번들된 스크립트가 수행한다.

## 책임 범위

| 한다 | 하지 않는다 |
|---|---|
| topic별 검색 + 최근 생성 저장소 보완 검색 | Star 증감 계산 / Ranking (→ `github-star-analyzer`) |
| Registry 등록 저장소의 Star 수 추적 | Study 후보 선정 (→ `study-candidate-selector`) |
| 최소 Star, archived, fork 필터 · 중복 제거 | Markdown 작성 |

## 입력

```json
{ "date": "2026-09-17", "registered": ["owner/name"], "config": "(선택) discovery 설정" }
```

- `date`: 실행일 (Asia/Seoul 기준 YYYY-MM-DD)
- `registered`: Registry(`data/registry.json`)의 저장소 이름 목록. 첫 실행이면 `[]`
- `config`: 생략하면 `resources/discovery.yml`

환경변수 `GITHUB_TOKEN` (공개 저장소 읽기 전용 토큰). 없으면 비인증 호출로 동작하지만 한도가 낮다.

## 절차

1. 실행할 검색어를 확인한다 (API 호출 없음).
   ```bash
   echo '{"date":"2026-09-17","dryRun":true}' > plan.json
   node scripts/discover.mjs plan.json
   ```
2. 수집을 실행한다. 진행 상황과 통계는 stderr, 결과 JSON은 stdout으로 나온다.
   ```bash
   GITHUB_TOKEN=... node scripts/discover.mjs input.json > discovery.json
   ```
   - topic 검색: `topic:{t} stars:>={minimum_stars} pushed:>={date-pushed_within_days} archived:false fork:false` (Star 순)
   - 신규 검색: `topic:{t} stars:>={new.minimum_stars} created:>={date-created_within_days} ...` (Star 순)
   - 등록 저장소 추적: 검색에 없는 `registered` 저장소를 개별 조회 (최대 `tracking.max_lookups`개, 삭제·archived 제외)
   - rate limit 은 스크립트가 기다리거나, 추적 단계에서는 중단하고 검색 결과만 반환한다.
3. `discovery.json`을 그대로 다음 단계(`github-star-analyzer`의 `current`)로 전달한다.

### API를 직접 호출할 수 없는 환경

GitHub 웹 검색 결과를 아래 형식으로 옮겨 적은 뒤 정규화 스크립트만 실행한다. **숫자(star)는 추정하지 말고 원문 값만 사용한다.**

```json
{ "date": "2026-09-17", "resultsByTopic": { "llm": [ { "full_name": "...", "html_url": "...", "description": "...", "stargazers_count": 123, "topics": [], "language": "Python", "pushed_at": "...", "archived": false, "fork": false } ] } }
```
```bash
node scripts/normalize.mjs raw.json > discovery.json
```

## 출력 계약

`resources/schemas/repository.schema.json`의 `#/$defs/discoveryOutput`:

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
- Repository를 새로 만들어내지 않는다. 검색·조회 결과에 없는 항목은 넣지 않는다.
- 토큰 값을 출력하거나 파일에 쓰지 않는다.
- 로컬 파일 시스템 경로에 의존하지 않는다. 입력/출력은 대화 안의 JSON 또는 Skill 내부 파일만 사용한다.
