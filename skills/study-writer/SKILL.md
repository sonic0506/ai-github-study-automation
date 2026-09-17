---
name: study-writer
description: 스타일이 적용된 Research Note를 Study Markdown 문서와 Pull Request 본문으로 만든다. 선정된 AI GitHub Repository의 Study 초안을 작성할 때 사용한다. 조사를 새로 하지 않고 Research Note의 사실만 사용한다.
---

# study-writer

> 상태: **골격(Phase 2)**

## 입력
- 스타일 적용된 Research Note (JSON), RepositoryInfo, StudyCandidate

## 템플릿
- `resources/study.md` — Study 본문
- `resources/study-pr.md` — PR 본문

## 출력 (DailyBundle.studyDrafts[] 항목)
```json
{ "repository": "owner/name", "branch": "study/owner__name", "path": "studies/owner__name.md",
  "title": "[Study] owner/name", "markdown": "...", "prBody": "..." }
```
- `branch`, `path`는 `owner/name`을 **소문자**로 바꾸고 `/`를 `__`로 바꿔 만든다. 예: `Acme-AI/Agent-Kit` → `study/acme-ai__agent-kit`, `studies/acme-ai__agent-kit.md` (구현: `src/core/slug.ts`)
- 모든 사실 문장은 Research Note의 `sources`로 각주 링크를 단다.
