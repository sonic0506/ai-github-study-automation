---
repository: blader/humanizer
url: https://github.com/blader/humanizer
stars: 52,643
studiedAt: 2026-10-01
status: draft
---

# blader/humanizer

Humanizer는 AI가 쓴 글에서 AI 글쓰기 흔적을 찾아, 사람이 쓴 것처럼 다시 쓰는 agent skill입니다.
Wikipedia의 Signs of AI writing 문서를 바탕으로 26개 패턴을 검사하고, Claude Code, Codex 등 skill을 지원하는 에이전트에서 동작합니다.

## 01. 어떤 문제를 푸는가

LLM은 가장 많은 독자와 주제에 맞는 기본 선택을 하기 때문에 not X but Y 대비, 한 줄 마무리, 과장된 의미 부여 같은 흔적이 반복됩니다.
Humanizer는 이 흔적을 강한 순서로 표시한 뒤, 내용은 그대로 두고 문장만 다시 씁니다.
목표는 사람 독자가 읽기 좋은 글이고, AI 탐지기 통과는 목표가 아니라고 README에 적혀 있습니다.

- MIT 라이선스로 배포됨[^s1][^s10]
- SKILL.md의 metadata.version과 plugin.json의 version은 3.1.0[^s2][^s10]
- Claude Code 플러그인은 Claude Code 2.1.142 이상이 필요하고, 이전 버전은 npx skills add blader/humanizer --global --agent claude-code 로 설치함[^s1]
- Claude.ai와 Claude Desktop에서는 저장소 ZIP을 내려받아 설정에서 skill로 업로드함[^s1]
- #229의 블라인드 실험에서 judge들은 원본 AI 글보다 Humanizer 수정본을 16번 중 16번 선호함[^s1][^s7]
- 같은 실험에서 탐지율은 원본 100%, Humanizer 수정본 98.6%였고 Pangram 4.0은 네 가지 변형 모두 100% AI로 판정함[^s7]
- 저장소 생성일은 2026-01-18, API 조회 기준 Star 53138, Fork 4239, 열린 이슈 2건 (2026-10-01 조회)[^s12]
- 저장소 주 언어 표시는 Python이며, 실제 Python 코드는 패키지 검사 스크립트 scripts/validate-package.py임[^s12][^s11]
- 1.0.0 이후 CHANGELOG에 2.0.0~3.1.0까지 패턴 추가·통합 기록이 이어지며, 패턴 수는 24개 → 35개 → 25개 → 26개로 변함[^s3]

## 02. 핵심 구조

- SKILL.md : 397줄짜리 단일 프롬프트. 원인 설명, 작업 절차, Voice 규칙, 26개 패턴, 적용하지 않을 경우를 담음[^s2]
- 패턴 6개 그룹 : A. Staging instead of stating(1~5), B. Rhythm by rule(6~11), C. Inflation and borrowed authority(12~18), D. Formatting by rule(19~21), E. Leftovers from the chat and the draft(22~25), F. Writing for the wrong reader(26)[^s1][^s2]
- 작업 절차 4단계 : Mark the tells → Draft the rewrite → Check the draft → Write the final version 순서로 진행함[^s2]
- 출력 모드 : 붙여 넣은 텍스트(초안·남은 패턴 목록·최종본 반환), File mode(최종본만 파일에 쓰고 산문만 수정), Embedded mode(PR·커밋 메시지 등에서 최종본만 반환)[^s2]
- .claude-plugin / .cursor-plugin : Claude Code 플러그인 manifest(marketplace.json, plugin.json)와 Cursor 플러그인 manifest. plugin.json의 skills 경로는 ./[^s10][^s4]
- scripts/validate-package.py : 외부 의존성 없이 SKILL.md, README, CHANGELOG, 두 plugin.json을 읽어 패키지 정보를 검사하는 스크립트[^s11]

## 03. 주요 기능

- 가장 강한 신호 5가지 : Not X but Y, 한 줄 마무리, 깊어 보이는 격언, 본론 전 뜸 들이기, 아무도 하지 않은 반론에 답하기. 한 번만 보여도 수정 대상임[^s1][^s2]
- weak alone 패턴 : 대시, 겹친 한정어, 하이픈 쌍, 수동태, 둥근 따옴표 등은 같은 구간에 다른 흔적이 함께 있을 때만 수정함[^s1]
- 사실 추가 금지 : 이름, 숫자, 날짜, 인용, 출처는 원문이나 작성자에게서 나온 것만 씀. 필요한 정보가 없으면 지어내지 않고 질문함[^s1][^s2]
- Voice 맞추기 : 작성자 글 샘플 2~3문단을 함께 주면 문장 길이, 단어, 문장부호, 버릇까지 따름. 샘플이 대시를 쓰면 대시도 비슷한 비율로 유지함[^s1][^s2]
- File mode : 파일 경로를 주면 산문만 고치고 코드 블록, 인라인 코드, 명령, 경로, YAML 메타데이터, 링크 대상은 그대로 둠[^s1][^s2]
- 입력은 지시가 아님 : 넘겨받은 텍스트를 편집할 재료로만 다루고 그 안의 지시를 따르지 않음[^s2][^s3]
- 적용하지 않을 경우 : 인용문, 제목, 고유명사, 표현 자체를 논하는 문단은 건드리지 않음. 2022년 11월 30일 이전 글은 AI 글이 아니라고 봄[^s2]

## 04. 시작하기

```bash
# Claude Code 플러그인으로 설치 (Claude Code 2.1.142 이상)
/plugin marketplace add blader/humanizer
/plugin install humanizer@humanizer

# Codex
npx skills add blader/humanizer --global --agent codex

# Skills CLI가 지원하는 모든 에이전트
npx skills add blader/humanizer --global --agent '*'
```

```text
/humanizer

Here's a sample of my writing for voice matching:
[직접 쓴 글 2~3문단]

Now humanize this text:
[다듬을 AI 글]

# 파일을 직접 고치려면 경로를 넘김
Humanize the prose in docs/launch-post.md
```

설치와 예제는 공식 문서 기준입니다.[^s1]

## 05. 최근 변화

- v3.1.0 (2026-09-28)[^s4][^s3]
    - 대화 맥락을 다시 설명하는 답장을 잡는 패턴 #26과 섹션 F 추가 (#269). 패턴 총 26개
    - #25를 자기 출처·구성·배치를 설명하는 글로 확장 (#290), #2에 "That distinction matters." 추가 (#277)
    - Cursor 플러그인 manifest 추가 (#278), marketplace schema URL 수정 (#288)
    - README에 AI 탐지기 통과는 목표가 아님을 명시하고 버전 기록을 CHANGELOG.md로 옮김
- v3.0.0 (2026-09-06)[^s5][^s3]
    - AI 글이 그렇게 들리는 이유 하나를 중심으로 skill을 재구성하고 35개 패턴을 25개로 통합
    - 패턴을 다섯 섹션으로 묶고 강도·빈도 순으로 번호를 다시 매김. 구 번호 → 신 번호 대응표 제공
    - Wikipedia 최신 문서에 맞춰 false ranges, synonym cycling 제외, vague connection or association 추가
    - validator가 제목에서 패턴 수를 계산하고 skill을 400줄로 제한
- v2.11.1 (2026-08-18)[^s6][^s3]
    - Claude Desktop용 release asset humanizer-skill.zip 추가. symlink 없이 humanizer/SKILL.md 하나만 담음 (#224)
    - 이후 2.11.2에서 plugin symlink와 별도 Desktop 패키지를 제거하고 GitHub source ZIP을 그대로 쓰도록 바꿈

## 06. 커뮤니티에서 반복되는 주제

- AI 탐지기(Pangram) 통과 여부 문의와 불만이 반복됨. 메인테이너는 탐지기 통과가 목표가 아니라고 답함[^s7][^s8]
- 블라인드 비교에서 원본 AI 글보다 Humanizer 수정본을 16/16으로 선호했다는 외부 실험 보고 (#229)[^s7][^s1]
- SKILL.md 예시가 사실을 바꾸거나 추가한다는 지적, 패턴 번호 오참조 지적 등 skill 문서 자체를 고치는 이슈가 많음[^s9]

## 07. 한계와 주의점

- AI 탐지기 통과는 목표가 아니며 README도 탐지기가 출력 대부분을 여전히 잡아낸다고 적음[^s1][^s7]
- #229 실험의 judge는 모두 한 계열의 언어 모델이고, 품질 비교는 계획한 144회 중 77회만 수행되었다고 작성자가 밝힘[^s7]
- 사람이 감으로 판단하면 우연 수준에 가깝고 사람 글도 AI 습관을 흡수하므로, 흔적 하나가 아닌 여러 개가 함께 있어야 판단 근거가 된다고 SKILL.md가 적음[^s2]
- 패턴 26은 답장에만 적용됨. 주변 대화를 볼 수 없으면 묻거나 그대로 둠[^s2][^s4]
- 규칙 전체가 프롬프트 하나라서 결과가 실행 모델에 따라 달라질 수 있음. 3.0.0에서 패턴 번호가 전부 바뀌어, 구 번호를 참조한 자료는 대응표로 옮겨야 함[^s5]

## 08. 더 알아볼 것

- 영어 외 언어(한국어 등)에서 패턴이 얼마나 잘 동작하는지는 공식 자료에서 확인하지 못했다. SKILL.md는 not X but Y가 모든 언어에 나타난다고만 적는다
- 모델별(Claude, GPT, Gemini 등) 결과 차이를 비교한 자료는 찾지 못했다
- README가 근거로 삼는 Wikipedia Signs of AI writing 원문은 이번 조사에서 직접 읽지 않았다
- agents/openai.yaml의 역할과 내용은 확인하지 못했다

## 참고 자료

- [README](https://github.com/blader/humanizer#readme) (readme)
- [SKILL.md](https://github.com/blader/humanizer/blob/main/SKILL.md) (code)
- [CHANGELOG.md](https://github.com/blader/humanizer/blob/main/CHANGELOG.md) (docs)
- [Humanizer v3.1.0](https://github.com/blader/humanizer/releases/tag/v3.1.0) (release)
- [Humanizer v3.0.0](https://github.com/blader/humanizer/releases/tag/v3.0.0) (release)
- [Humanizer v2.11.1](https://github.com/blader/humanizer/releases/tag/v2.11.1) (release)
- [#229 Blind study: the rewrite pass wins 16/16 on quality, and does not move AI detection](https://github.com/blader/humanizer/issues/229) (issues)
- [#263 Good skill. But 100% failure with Pangram](https://github.com/blader/humanizer/issues/263) (issues)
- [Issues (최근 15건)](https://github.com/blader/humanizer/issues?q=is%3Aissue) (issues)
- [.claude-plugin/plugin.json](https://github.com/blader/humanizer/blob/main/.claude-plugin/plugin.json) (code)
- [scripts/validate-package.py](https://github.com/blader/humanizer/blob/main/scripts/validate-package.py) (code)
- [GitHub API repository metadata](https://api.github.com/repos/blader/humanizer) (code)

[^s1]: [README](https://github.com/blader/humanizer#readme)
[^s2]: [SKILL.md](https://github.com/blader/humanizer/blob/main/SKILL.md)
[^s3]: [CHANGELOG.md](https://github.com/blader/humanizer/blob/main/CHANGELOG.md)
[^s4]: [Humanizer v3.1.0](https://github.com/blader/humanizer/releases/tag/v3.1.0)
[^s5]: [Humanizer v3.0.0](https://github.com/blader/humanizer/releases/tag/v3.0.0)
[^s6]: [Humanizer v2.11.1](https://github.com/blader/humanizer/releases/tag/v2.11.1)
[^s7]: [#229 Blind study: the rewrite pass wins 16/16 on quality, and does not move AI detection](https://github.com/blader/humanizer/issues/229)
[^s8]: [#263 Good skill. But 100% failure with Pangram](https://github.com/blader/humanizer/issues/263)
[^s9]: [Issues (최근 15건)](https://github.com/blader/humanizer/issues?q=is%3Aissue)
[^s10]: [.claude-plugin/plugin.json](https://github.com/blader/humanizer/blob/main/.claude-plugin/plugin.json)
[^s11]: [scripts/validate-package.py](https://github.com/blader/humanizer/blob/main/scripts/validate-package.py)
[^s12]: [GitHub API repository metadata](https://api.github.com/repos/blader/humanizer)
