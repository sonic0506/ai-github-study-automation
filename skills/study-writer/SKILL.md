---
name: study-writer
description: 스타일이 적용된 Research Note를 Study Markdown 문서와 Pull Request 본문으로 만든다. 선정된 AI GitHub Repository의 Study 초안을 작성할 때 사용한다. 조사를 새로 하지 않고 Research Note의 사실만 사용한다.
---

# study-writer

**결정적(deterministic) Skill.** 문서 조립은 `scripts/render.mjs`가 한다.
문장은 `my-writing-style`을 거친 Research Note의 것을 그대로 쓴다.

## 입력

```json
{
  "date": "2026-09-18",
  "note": { "...": "my-writing-style 을 거친 Research Note" },
  "repository": { "repository": "owner/name", "url": "...", "stars": 114886, "delta24h": 320 },
  "candidate": { "priority": 52.41, "reasons": ["growth_24h: +320 stars"] }
}
```

`templates`를 넘기면 번들된 `resources/study.md`, `resources/study-pr.md` 대신 사용한다.

## 실행

```bash
node scripts/render.mjs input.json > study-draft.json
```

## 출력 (DailyBundle의 `studyDrafts[]` 항목)

```json
{ "repository": "owner/name", "branch": "study/owner__name", "path": "studies/owner__name.md",
  "title": "[Study] owner/name", "markdown": "...", "prBody": "..." }
```

- `branch`, `path`는 `owner/name`을 **소문자**로 바꾸고 `/`를 `__`로 바꿔 만든다. 예: `Browser-Use/Browser-Use` → `study/browser-use__browser-use`
- 스크립트가 만들어 주므로 직접 조합하지 않는다.

## 문서 구성 (`resources/study.md`)

| 섹션 | 출처 |
|---|---|
| frontmatter | repository, url, stars, studiedAt, status: draft |
| 어떤 문제를 푸는가 | `problem` + `facts` |
| 핵심 구조 / 주요 기능 | `architecture`, `keyFeatures` |
| 시작하기 | `gettingStarted` (설치 명령 + 최소 예제) |
| 최근 변화 | `recentReleases` |
| 커뮤니티에서 반복되는 주제 | `communitySignals` |
| 한계와 주의점 | `limitations` |
| 더 알아볼 것 | `openQuestions` |
| 참고 자료 | `sources` + 각주 정의 |

- 비어 있는 섹션은 통째로 빠지고, 남은 섹션에 번호가 다시 매겨진다 (01, 02 …).
- 출처가 있는 항목에는 `[^s1]` 각주가 붙는다.

## 규칙

- Research Note에 없는 문장을 추가하지 않는다. 문체를 다시 손보지 않는다.
- 스크립트가 오류를 내면(저장소 불일치, Study 대상 아님, 필수 항목 없음) 입력을 고쳐 다시 실행한다.
- 출력 Markdown을 직접 수정하지 않는다. 형식을 바꾸려면 `resources/study.md` 템플릿을 고친다.
