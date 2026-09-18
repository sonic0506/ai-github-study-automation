---
name: github-researcher
description: GitHub Repository 하나가 Study 대상(라이브러리·도구 등)인지 먼저 판정하고, 대상이면 README, 공식 문서, Release, Issues를 조사해 출처가 달린 사실 기반 Research Note(JSON)를 만든다. Study 초안 작성 전 조사 단계에서 사용한다. 글쓰기 스타일은 적용하지 않는다.
---

# github-researcher

Repository 하나를 조사해 **모든 주장에 출처가 달린 JSON**을 만드는 Skill.

## 입력

StudyQueue의 `selected` 항목 + RepositoryInfo

```json
{ "repository": "owner/name", "url": "https://github.com/owner/name", "description": "...", "stars": 48210, "delta24h": 210 }
```

## 1단계: Study 적합성 판정

README 첫 화면과 저장소 구조만 보고 판정한다. 기준은 `resources/studyability.md`.

- **Study 대상**: 설치하거나 실행해서 쓰는 것 — `library`, `framework`, `tool`, `application`, `model`, `platform`
- **Study 대상 아님**: 읽는 자료나 링크 모음 — `awesome-list`, `tutorial`, `course`, `interview-guide`, `documentation`, `other`

**Study 대상이 아니면 조사하지 않고 판정만 반환한다.**

```json
{
  "repository": "owner/name",
  "studyability": { "studyable": false, "category": "awesome-list", "reason": "MCP 서버 링크를 모아 둔 목록으로 설치해서 쓰는 코드가 아님", "checkedAt": "2026-09-18" },
  "researchedAt": "2026-09-18T06:05:00+09:00"
}
```

이 판정은 DailyBundle의 `studyabilityUpdates`에 담겨 Registry에 저장되고, 이후 실행에서 자동으로 제외된다.
호출 측은 `study-candidate-selector`의 `markNotStudyable`로 다음 대기 후보를 올린다.
애매하면 `studyable: true`로 두고 조사를 진행한다.

## 2단계: 조사

아래 순서로 확인하고, **확인한 자료는 전부 `sources`에 등록한다.**

| 순서 | 대상 | 용도 |
|---|---|---|
| 1 | README (기본 브랜치) | 목적, 설치, 최소 예제, 라이선스 |
| 2 | 공식 Documentation / 사이트 | 구조, 주요 기능, 제약 |
| 3 | 최근 Release 3개 | 버전, 날짜, 주요 변경 |
| 4 | 최근 Issues / Discussions | 반복되는 문의·제약 |
| 5 | 논문·공식 블로그 | 배경 설명이 필요한 경우 |

### 출처 규칙

- `sources[]`의 `id`는 `s1`, `s2` … 순서로 붙인다. `type`은 `readme` / `docs` / `website` / `release` / `issues` / `discussions` / `code` / `paper` / `blog`.
- `architecture`, `keyFeatures`, `gettingStarted`, `recentReleases`, `communitySignals`, `facts`, `limitations`의 **모든 항목에 `sourceIds`를 단다.**
- 실제로 읽은 페이지만 등록한다. 존재하지 않는 URL을 만들어 내지 않는다.
- 확인하지 못한 내용은 `openQuestions`에 문장으로 남긴다. 추측해서 채우지 않는다.
- 숫자·버전·날짜는 원문 그대로 옮긴다. 반올림하거나 어림하지 않는다.

## 출력 계약

`resources/research-note.example.json` 형식, `resources/schemas/research-note.schema.json` 스키마를 따른다.
Study 대상이면 `summary`, `problem`, `keyFeatures`(1개 이상), `facts`(3개 이상), `sources`(2개 이상), `openQuestions`가 필수다.

## 3단계: 검사 (필수)

```bash
node scripts/validate.mjs research-note.json
```

- `ok: false`면 `errors`를 고쳐 다시 실행한다. 출처 없는 주장, 없는 `sourceIds`, 중복 `id`, 스키마 위반을 잡는다.
- `warnings`는 참고용이다 (README만 사용, 참조되지 않은 출처, 사실 3개 미만 등). 가능하면 보완한다.

## 규칙

- 문체 가공, 의견, 비유, 사용자 문체를 넣지 않는다 (→ `my-writing-style`).
- Markdown을 만들지 않는다 (→ `study-writer`).
- `studyability` 형식: `resources/schemas/registry.schema.json`의 `#/$defs/studyability`
