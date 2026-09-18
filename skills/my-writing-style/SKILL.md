---
name: my-writing-style
description: github-researcher가 만든 Research Note를 사용자의 글쓰기 스타일(설명은 합니다체, 정리는 개조식, 인사말·이모티콘 없음)로 변환한다. Study 초안의 문체를 맞출 때 사용한다. 새로운 조사나 사실 추가는 하지 않는다.
---

# my-writing-style

Research Note의 **사실은 그대로 두고 표현만** 사용자의 문체로 바꾸는 Skill.

## 리소스

| 파일 | 내용 |
|---|---|
| `resources/style-guide.md` | 어조·문장·구조·용어 규칙 (사용자 글 6편에서 추출) |
| `resources/anti-patterns.md` | 쓰지 않는 표현 목록 |
| `resources/sample-output.md` | 규칙을 적용했을 때 나와야 하는 형태 |
| `resources/examples/*.md` | 사용자가 직접 쓴 원본 글 (스터디 3편 + 블로그 3편) |

## 절차

1. `style-guide.md`와 `anti-patterns.md`를 읽는다.
2. 감이 잡히지 않으면 `examples/`에서 같은 유형의 글을 한 편 읽는다.
3. Research Note의 텍스트 필드만 다시 쓴다.
   - 설명 문단 → 합니다체 / 핵심 정리·목록 → 개조식(`~함`, `~음`, 명사형)
   - 정의는 `- 용어 : 설명` 형태
   - 인사말, 맺음 인사, 이모티콘, 근황 이야기는 넣지 않는다
4. `anti-patterns.md`의 표현이 남아 있는지 직접 확인한다.

## 변경 금지

- `sources`, URL, 숫자, 버전, 날짜, 저장소 이름
- `studyability` 판정 결과
- Research Note에 없는 사실 추가 (표현만 바꾼다)

## 출력

입력 Research Note와 같은 구조의 JSON. 텍스트 필드에만 문체가 적용된다.
