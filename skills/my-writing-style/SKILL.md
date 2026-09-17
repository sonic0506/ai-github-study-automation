---
name: my-writing-style
description: github-researcher가 만든 Research Note를 사용자의 글쓰기 스타일(어조, 문장 길이, 구조, 금지 표현)로 변환한다. Study 초안의 문체를 맞출 때 사용한다. 새로운 조사나 사실 추가는 하지 않는다.
---

# my-writing-style

> 상태: **골격(Phase 2)** — 스타일 리소스는 사용자가 채운다.

## 리소스
- `resources/style-guide.md` — 어조, 문장 규칙, 구조 선호
- `resources/anti-patterns.md` — 쓰지 않는 표현/패턴
- `resources/examples/*.md` — 사용자가 직접 쓴 예시 글 (few-shot)

## 절차
1. 세 리소스를 모두 읽는다.
2. Research Note의 사실·숫자·출처는 **그대로 유지**하고 표현만 바꾼다.
3. `anti-patterns.md`에 해당하는 표현이 없는지 스스로 점검한다.

## 출력
- 입력 Research Note와 같은 구조의 JSON. 텍스트 필드만 스타일이 적용된다.
- `sources`, 숫자, 버전, URL은 변경 금지.
