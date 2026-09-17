# Study 적합성 판정 기준

"설치하거나 실행해서 쓰는 소프트웨어인가?"가 핵심 질문이다.

## Study 대상 (`studyable: true`)

| category | 설명 | 예 |
|---|---|---|
| `library` | 코드에서 import 해서 쓰는 패키지 | LLM SDK, 벡터 검색 라이브러리 |
| `framework` | 애플리케이션 구조를 제공 | 에이전트 프레임워크, RAG 프레임워크 |
| `tool` | CLI·개발 도구·서버 | MCP 서버, 코딩 에이전트 CLI, 평가 도구 |
| `application` | 바로 실행하는 앱 | 셀프호스팅 챗 UI, 워크플로 자동화 앱 |
| `model` | 모델 가중치·학습/추론 코드 | 오픈 모델 저장소 |
| `platform` | 여러 구성 요소를 묶은 플랫폼 | LLMOps 플랫폼 |

## Study 대상 아님 (`studyable: false`)

| category | 설명 | 판단 신호 |
|---|---|---|
| `awesome-list` | 링크·프로젝트 목록 | 이름에 awesome, README 대부분이 링크 목록 |
| `tutorial` | 따라 하는 예제·실습 모음 | 노트북/챕터 나열, "learn", "from scratch" 교재형 |
| `course` | 강의 커리큘럼 | 주차·레슨 구성 |
| `interview-guide` | 면접 대비 자료 | interview 태그, 질문·답변 정리 |
| `documentation` | 문서·블로그·지식 모음 | 코드 없이 Markdown 위주 |
| `other` | 위에 없는 비소프트웨어 (프롬프트 모음, 데이터셋 목록 등) | 이유를 `reason`에 구체적으로 |

## 애매한 경우

- 예제 코드가 많지만 패키지로 배포되는 경우 → `library` (Study 대상)
- 목록형이지만 자체 실행 도구를 포함한 경우 → 도구 쪽으로 판단
- 확신이 없으면 Study 대상으로 두고 조사한다. 제외는 명확할 때만 한다.
