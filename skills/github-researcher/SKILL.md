---
name: github-researcher
description: GitHub Repository 하나가 Study 대상(라이브러리·도구 등)인지 먼저 판정하고, 대상이면 README, 공식 문서, Release, Issues를 조사해 출처가 달린 사실 기반 Research Note(JSON)를 만든다. Study 초안 작성 전 조사 단계에서 사용한다. 글쓰기 스타일은 적용하지 않는다.
---

# github-researcher

> 상태: **Phase 3 진행 중** — 적합성 판정 규칙 확정, Research Note 본 조사는 골격. 평가는 `tests/rubric.md`.

## 입력
- `repository` (owner/name), `url`, `description`, `stars`, `delta24h` — StudyQueue의 `selected` 항목 + RepositoryInfo

## 1단계: Study 적합성 판정 (먼저, 짧게)

README 첫 화면과 저장소 구조만 보고 판정한다. 기준은 `resources/studyability.md`.

- **Study 대상**: 설치하거나 실행해서 쓰는 것 — `library`, `framework`, `tool`, `application`, `model`, `platform`
- **Study 대상 아님**: 읽는 자료나 링크 모음 — `awesome-list`, `tutorial`, `course`, `interview-guide`, `documentation`, `other`

판정 결과:

```json
{ "studyable": false, "category": "interview-guide", "reason": "Java 백엔드 면접 대비 문서 모음으로 설치해서 쓰는 코드가 아님", "checkedAt": "2026-09-17" }
```

- `reason`은 README에서 확인한 사실에 근거한 한 문장.
- 판정 결과는 DailyBundle의 `studyabilityUpdates`에 넣는다 → GitHub Actions가 Registry에 저장하고, 이후 실행에서는 선정 단계에서 자동으로 제외된다.
- **Study 대상이 아니면 여기서 멈춘다.** 조사하지 않고 `{ "repository": "...", "studyability": {...} }`만 반환한다.
  호출 측(오케스트레이션)은 `markNotStudyable(queue, repository)`로 다음 대기 후보를 올려 조사를 이어간다.
- 애매하면 `studyable: true`로 두고 조사를 진행한다 (억지로 제외하지 않음).

## 2단계: 조사 (Study 대상인 경우)

조사 대상 (우선순위 순)
1. README (기본 브랜치)
2. 공식 Documentation / 공식 사이트
3. 최근 Release 3개 (버전, 날짜, 주요 변경)
4. 최근 Issues / Discussions에서 반복되는 주제
5. 관련 기술 자료 (논문, 공식 블로그)

## 출력 계약 (ResearchNote JSON)

`resources/research-note.example.json` 형식을 따른다.
- 최상단에 1단계의 `studyability`를 포함한다.
- 모든 `facts[]` 항목은 `sources[]`의 `id`를 1개 이상 참조한다.
- 확인하지 못한 내용은 `openQuestions[]`에 넣고 사실처럼 쓰지 않는다.
- 문체 가공, 의견, 비유를 넣지 않는다 (→ `my-writing-style`).
- `studyability` 형식: `resources/schemas/registry.schema.json`의 `#/$defs/studyability`
