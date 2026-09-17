---
name: github-researcher
description: GitHub Repository 하나를 대상으로 README, 공식 문서, Release, Issues, 공식 사이트를 조사해 출처가 달린 사실 기반 Research Note(JSON)를 만든다. Study 초안 작성 전 조사 단계에서 사용한다. 글쓰기 스타일은 적용하지 않는다.
---

# github-researcher

> 상태: **골격(Phase 2)** — 절차와 출력 계약만 정의. 평가는 `tests/rubric.md`.

## 입력
- `repository` (owner/name), `url`, `description`, `stars`, `delta24h` — StudyQueue의 `selected` 항목 + RepositoryInfo

## 조사 대상 (우선순위 순)
1. README (기본 브랜치)
2. 공식 Documentation / 공식 사이트
3. 최근 Release 3개 (버전, 날짜, 주요 변경)
4. 최근 Issues / Discussions에서 반복되는 주제
5. 관련 기술 자료 (논문, 공식 블로그)

## 출력 계약 (ResearchNote JSON)

`resources/research-note.example.json` 형식을 따른다.
- 모든 `facts[]` 항목은 `sources[]`의 `id`를 1개 이상 참조한다.
- 확인하지 못한 내용은 `openQuestions[]`에 넣고 사실처럼 쓰지 않는다.
- 문체 가공, 의견, 비유를 넣지 않는다 (→ `my-writing-style`).
