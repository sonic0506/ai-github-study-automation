---
repository: hypit-ai/hypit
url: https://github.com/hypit-ai/hypit
stars: 11044
studiedAt: 2026-09-20
status: draft
---

# hypit-ai/hypit

Hypit은 Claude Code, Codex 같은 코딩 에이전트에게 영상을 만드는 언어와 실행 시스템을 주는 오픈소스 프로젝트입니다.
참고 영상을 넣으면 에이전트가 촬영분, 자막, B-roll, 효과까지 포함한 워크플로 전체를 복제하고, 그 워크플로를 편집 가능한 코드로 남깁니다.

## 01. 어떤 문제를 푸는가

영상 생성 도구는 대개 한 번 렌더링한 MP4를 내놓고 끝납니다. 호스트나 문구를 바꾸려면 처음부터 다시 만들어야 합니다.
Hypit은 구성 요소를 초 단위 타임코드가 아니라 단어에 묶어, 바뀌는 부분만 다시 생성하는 방식으로 이 문제를 다룹니다.

- 해결 대상 : 영상을 일회성 렌더 결과물로만 다루어 변형·재실행이 어려운 문제[^s1]
- 접근 : 워크플로를 편집 가능하고 다시 실행할 수 있는 composition으로 저장하고, 기존 소재는 재사용하며 바뀌는 부분만 생성함[^s1]
- 앵커 : 촬영분, 자막, B-roll, 효과를 초가 아닌 단어에 고정함[^s1]
- 진입 경로 : 영상 복제가 가장 빠른 길이지만 템플릿에서 시작하거나 설명만으로 워크플로를 새로 쓰는 것도 가능함[^s1]
- 생성 모델은 선택 사항임. 자막, 모션 그래픽, 코드 렌더링 비주얼만으로 생성 모델 호출 없이 영상을 만들 수 있음[^s1]
- 라이선스는 Apache 2.0 변형인 Hypit Open Source License, 주 언어는 TypeScript, 기본 브랜치는 main, 공식 사이트는 hypit.ai[^s2][^s3]
- 2026-07-29 생성, Star 11,044개, Fork 1,334개, 열린 이슈 7건 (2026-09-20 조회 기준)[^s2]

## 02. 핵심 구조

Hypit은 영상이 요구하는 것과 그것을 채우는 코드·서비스를 분리합니다.
새 그래픽, 모델, API는 패키지로 공급되고 프로젝트가 그것을 선택하며, 실행 시스템이 의존성 그래프를 돌립니다.[^s8]

- Author component : 작성자 입력을 미디어 요청, 시각 동작, 그래프 출력으로 바꿈. Source의 import로 선택함[^s8]
- Model : 정확한 생성 요청과 출력을 정의함. Source의 import로 선택함[^s8]
- Provider Endpoint : 지원하는 요청을 API나 로컬 도구로 실행함. Runtime Profile에서 선택함[^s8]
- Credential store : Endpoint가 쓰는 자격 증명을 이름으로 해석함. Runtime Profile에서 선택함[^s8]
- Result repository : 프로젝트의 Build 기록과 산출 파일을 보관함. 기본 위치는 `.hypit/results`[^s7][^s8]
- Distribution : 실행 파일과 공식 패키지를 공급함. 설치된 `@hypit/hypit` 릴리스가 담당함[^s8]

실행은 Source → Run → Runtime → Output 순서로 나뉩니다.

- Source : 작업 내용을 기술함. Skill 설명에 따르면 SVML, SVS, SVRun 형식을 작성함[^s7][^s9]
- Run : Target과 Candidate를 고름[^s7]
- Runtime Profile : `hypit.runtime.json` 에 Provider Endpoint, 자격 증명 참조, binding을 둠. 비밀값은 Profile과 Source 밖에 둠[^s7]
- Build : 선택된 그래프와 설정으로 한 번 실행하는 단위. Worker가 실행을 소유하므로 터미널을 닫아도 취소되지 않음[^s7]
- Core는 자신이 영상을 만든다는 것을 모른 채 의존성을 계획하고 진행함. 새 component나 Provider는 같은 패키지 인터페이스로 동작을 공급함[^s7]

저장소는 pnpm 워크스페이스 모노레포입니다.

- `packages/` : 워크스페이스 패키지. caption, ranking, seedance, whisperx, provider-hypihub, studio 등 130개 이상의 디렉터리가 있음[^s6][^s16]
- `docs/` : VitePress 문서 사이트, `examples/` : 실행 가능한 예제 소스, `services/` : 로컬 미디어·전사 서비스, `test/` : 경계 테스트[^s6]
- `skills/hypit/` : 에이전트용 Skill의 원본. 실행 파일과는 별도 채널로 갱신됨[^s5][^s11]

## 03. 주요 기능

- 영상 복제 : 참고 영상을 넣으면 스크립트 분해가 아니라 촬영분·자막·B-roll·효과가 포함된 워크플로 전체를 얻음[^s1]
- 변형 생성 : composition과 기존 소재를 재사용하고 바뀌는 부분만 생성해 워크플로 하나에서 여러 변형을 만듦[^s1]
- 교체 가능한 컴포넌트 : 자막을 건드리지 않고 호스트를 바꿈. 라이브러리를 쓰거나 fork하거나 직접 작성함[^s1]
- 단어 정렬 : 음성이 있는 참고 영상은 WhisperX가 단어와 타이밍을 제공해 화면과 대사를 연결함[^s4]
- 모델 서비스 : HypiHub가 호스팅 WhisperX와 이미지·영상·음성 모델을 한 계정으로 제공함. 자체 키나 로컬 모델도 Provider로 연결함[^s1][^s4]
- 비용 합의 : 유료 작업 전에 에이전트가 계정, 계획, 요금이나 추정 비용을 설명하고 범위와 예산에 합의한 뒤 진행함[^s4]
- Studio : 완성 영상의 타임라인을 보고 지원되는 속성을 편집함. Comments로 특정 시점에 피드백을 남김[^s4][^s5]
- 렌더링 : 예제는 64개 headless Chromium 프로세스로 동시 렌더링함[^s1]
- 예제 비용 : 20초 축구 티어 리스트 $1.15, 18초 팟캐스트 클립 $1.07, 26초 길거리 인터뷰 $1.09[^s1]
- 용도로 제시된 것 : 유료 소셜 광고 변형, 바이럴 클론, TikTok Shop 영상, AI UGC, 팟캐스트 클립, 코드 렌더링 영상, 다국어 버전[^s1]

## 04. 시작하기

Skill을 설치하면 에이전트가 첫 사용 시 `@hypit/hypit` 실행 파일을 찾거나 설치를 도와줍니다.
저장소를 clone할 필요는 없고, 영상 프로젝트는 어디에 두어도 됩니다.[^s1][^s4]

```bash
# Skill 설치 (전역)
npx skills add hypit-ai/hypit -g
```

```bash
# 실행 파일 설치 또는 갱신
npm install -g @hypit/hypit@0.2.8
```

에이전트 세션에서 `/hypit` 으로 요청합니다.

```text
/hypit Clone this video: /path/to/video.mp4, and replace the ranking content with a comparison of Hypit (official website: hypit.ai) with other AI video products.
```

```text
/hypit Make a ranking video that puts Hypit in S tier.
```

Runtime을 직접 준비할 때의 명령은 다음과 같습니다.

```bash
# 프로젝트 경로 확인과 Runtime Profile 초기화
hypit paths
hypit runtime init
# 로컬 미디어 처리 준비와 Worker 시작
hypit runtime up --endpoint media.local
hypit runtime status
# HypiHub 계정 연결
hypit auth status hypihub.default
hypit auth login hypihub.default
# Build 실행과 관찰
hypit build build.svrun --follow
hypit status <build-id> --watch
```

설치와 명령은 공식 README와 문서 기준입니다.[^s1][^s4][^s7][^s11]

(Skill과 실행 파일은 갱신 채널이 다릅니다. `hypit version --check` 로 실행 파일 버전을 확인하고, Skill은 `npx skills add hypit-ai/hypit -g` 를 다시 실행해 갱신합니다.)

개발 환경은 Node.js 22.15 이상과 pnpm 10.33.x가 필수이고, Python 3.10~3.13, uv, ffmpeg/ffprobe, Chromium은 로컬 Build를 돌릴 때만 필요합니다.[^s6]

```bash
# 저장소 개발 시
corepack enable
pnpm install --frozen-lockfile
pnpm check   # tsc --noEmit
pnpm test    # Node test runner
```

## 05. 최근 변화

2026-09-18과 09-19 이틀 사이에 v0.2.6부터 v0.2.9까지 네 번 릴리스되었습니다.

- v0.2.9 (2026-09-19)[^s10]
    - 정수가 아닌 프레임 레이트에서 AAC 꼬리 보존, still frame domain 보존
    - snapshot의 HTML URL을 capture처럼 처리하고 잘못된 `--studio` base 거부
    - PixVerse C1 모델과 reference 모드 추가, HypiHub에서 PixVerse 제공
- v0.2.8 (2026-09-19)[^s11]
    - Seedance가 모든 이미지·영상 reference에 `person-reference` boolean을 요구함. 값이 없으면 생성 전에 실패함
    - 기존 Source는 각 시각 `Reference` 에 `person-reference="true"` 또는 `"false"` 를 추가해야 함. FrameVideo는 `first-frame-person-reference`, `last-frame-person-reference` 를 씀
- v0.2.7 (2026-09-18)[^s12]
    - PixVerse V6 모델 패키지 추가
    - Studio 로컬 변경 보안 강화, UTF-8 비밀값 입력, 복구 가능한 Worker 시작
- v0.2.6 (2026-09-18)[^s13]
    - 자막 타이밍 : 인접 Word 창이 한 프레임 겹쳐 중국어 자막이 거의 모든 전환에서 겹치던 문제 수정
    - 최종 mux 단언 : AAC가 임의 샘플 수를 담지 못해 정상 mux를 거부하던 문제를 인코더 지연 허용으로 수정
    - Wan 2.7 이미지 모델 추가, README의 Runtime Profile 예제를 복사해 쓸 수 있게 수정

## 06. 커뮤니티에서 반복되는 주제

이슈는 대부분 만든 지 하루 안에 닫히고, 열린 이슈는 7건입니다.

- 렌더링 정합성 : picture track을 추가하면 Cue 사이 자막이 섞이는 문제가 열려 있음[^s14]
- ffmpeg 버전 : `-frames:v` 가 30000/1001, 60000/1001에서 마지막 AAC 패킷을 버리는 문제, still video 프레임 수 단언이 ffmpeg 6.1.6·7.x·9.0.1에서 실패하던 문제가 보고되고 닫힘[^s14]
- 경로 보안 : snapshot이 로컬 HTML의 디렉터리 밖 파일을 읽던 문제, 상대 CredentialStore 경로가 Host 상태 루트를 벗어나던 문제가 보고되고 닫힘[^s14]
- Windows·WSL : ffmpeg 조회가 PATHEXT의 cmd/bat shim을 무시하던 문제, WSL에서 OAuth 로그인이 Windows 대신 `xdg-open` 을 쓰던 문제가 보고되고 닫힘[^s14]
- 문서 : HypiHub README의 Runtime Profile 예제가 유효한 `hypit.runtime.json` 이 아니던 문제가 보고되고 닫힘[^s14]

## 07. 실제 개발에서 어떻게 쓰는가

Skill 문서는 에이전트에게 감독이자 제작자 역할을 부여합니다.
참고 영상을 보고, 프레임을 살피고, 대사를 시간에 맞춰 읽은 뒤 무엇이 시선을 붙드는지 찾아 새 작품에 옮기라고 지시합니다.[^s9]

- 작업 구조 : 작품을 시간에 따라 변하는 객체와 관계로 이해하고, Timeline 하나와 canvas 하나 위에 Take를 배치함[^s9]
- 컴포넌트 경계 : 좌표된 레이아웃과 모션은 한 scene을 공유하고, 독립적인 기여는 peer로 둠. 일회성 scene도 정상적인 제작 작업으로 봄[^s9]
- 클론 방식 : 컷, 그림, 등장, 소리가 무엇에 반응하는지 찾아 대상의 단어와 의도에 맞게 그 관계를 다시 만듦[^s9]
- 소재 방향 : 이미지 프롬프트를 쓰기 전에 Image direction 문서와 선택한 Kit을 먼저 읽도록 함. 일반적인 프롬프트 능력만으로는 부족하다고 명시함[^s9]
- 사용자 참여 : 목표, 개인 정보, 서비스 연결, 큰 준비 작업, 지출에 관한 선택은 사용자에게 맡김[^s9]

에이전트 환경과 관련한 안내는 다음과 같습니다.[^s5]

- 터미널, 데스크톱 앱, 브라우저 모두 진입점이 될 수 있음. 중요한 것은 프로젝트 파일 접근, 실행 환경, 결과를 보여 줄 방법임
- 원격 에이전트는 소재를 그 환경에 올려야 하고, 원격 머신의 localhost 주소는 내 컴퓨터의 미리보기 주소가 아님
- 프로젝트와 생성 소재는 대화나 임시 세션이 끝나도 접근 가능해야 함. 검토와 내보내기는 별도 행동임
- OpenAgents가 에이전트 진입 측 파트너로 소개됨

2026-09-16의 외부 글은 단어 앵커의 효과를 "문장을 고치면 자막 타이밍이 스스로 재배치되고, 내레이터를 바꿔도 자막은 그대로"로 정리합니다.[^s15]
같은 글은 타인의 콘텐츠를 대량으로 복제할 때 독창성, 초상권 동의, 플랫폼 스팸 정책 문제가 생긴다고 지적합니다.[^s15]

## 08. 한계와 주의점

- 라이선스 조건 : 자기 조직용 상업 사용과 단일 테넌트 배포는 허용되지만, 멀티 테넌트 서비스나 SaaS 제공, 유료 재배포는 서면 허가가 필요함. CLI와 run report의 이름·로고·저작권 표시를 제거하거나 수정할 수 없음[^s3]
- 산출물 소유 : 생성한 영상·오디오·이미지·manifest는 사용자 소유이며 상업 사용에도 조건이 없음. 다만 서드파티 모델 제공자의 약관은 별도로 적용됨[^s3]
- Hypit 자체는 무료지만 코딩 에이전트와 모델 서비스는 각자 계정과 요금이 있음. Skill이나 실행 파일 설치에 생성 크레딧은 포함되지 않음[^s1][^s4]
- 실패한 서비스 요청은 다른 계정을 조용히 선택하지 않음. Provider의 README에서 설정을 읽어야 함[^s7]
- 로컬 추론 준비는 큰 다운로드를 요구할 수 있어 호스팅 실행과 비교해 경로를 먼저 정하라고 안내함[^s7]
- Build 실행 분리는 보안 샌드박스가 아니며, 컴포넌트가 나중에 읽는 파일의 동결 사본도 아님[^s7]
- `doctor` 는 생성 요청을 보내지 않으므로, 저장된 자격 증명이나 도달 가능한 카탈로그가 모든 요청의 성공을 보장하지는 않음[^s7]
- 기여 조건 : 제작자가 라이선스를 더 엄격하게 또는 느슨하게 바꿀 수 있고, 기여 코드는 클라우드 사업을 포함한 상업 목적에 쓰일 수 있음[^s3]

## 09. 더 알아볼 것

- SVML, SVS, SVRun 각 형식의 문법과 예제 파일 구조는 이번 조사에서 확인하지 못했습니다.
- HypiHub의 모델별 요금과 무료 크레딧 범위는 확인하지 못했습니다.
- HyperFrames 렌더러가 어떤 방식으로 HTML을 프레임으로 캡처하는지는 확인하지 못했습니다.
- 지원 플랫폼 링크(yt-dlp 패키지가 있음)로 참고 영상을 내려받을 때의 제약은 확인하지 못했습니다.
- Studio에서 편집 가능한 속성의 범위와 저장 방식은 확인하지 못했습니다.
- `person-reference` 요구가 Seedance 외 다른 영상 모델에도 적용되는지는 확인하지 못했습니다.
- Star 11,044개의 24시간 증가량은 리포트 기준 +814이며, 조사 시점 API 값과 리포트 값(10,902)이 다릅니다.

## 참고 자료

- [Hypit README (main)](https://github.com/hypit-ai/hypit/blob/main/README.md) (readme)
- [Repository 메타데이터 (GitHub API)](https://api.github.com/repos/hypit-ai/hypit) (code)
- [Hypit Open Source License](https://github.com/hypit-ai/hypit/blob/main/LICENSE) (code)
- [Quickstart for Agent users](https://github.com/hypit-ai/hypit/blob/main/docs/quickstart.md) (docs)
- [Use Hypit in your Agent](https://github.com/hypit-ai/hypit/blob/main/docs/guide/agents.md) (docs)
- [Development Guide](https://github.com/hypit-ai/hypit/blob/main/docs/guide/develop.md) (docs)
- [Runtime](https://github.com/hypit-ai/hypit/blob/main/docs/guide/runtime.md) (docs)
- [Packages and Extension](https://github.com/hypit-ai/hypit/blob/main/docs/guide/packages.md) (docs)
- [skills/hypit/SKILL.md](https://github.com/hypit-ai/hypit/blob/main/skills/hypit/SKILL.md) (code)
- [Release v0.2.9](https://github.com/hypit-ai/hypit/releases/tag/v0.2.9) (release)
- [Release v0.2.8](https://github.com/hypit-ai/hypit/releases/tag/v0.2.8) (release)
- [Release v0.2.7](https://github.com/hypit-ai/hypit/releases/tag/v0.2.7) (release)
- [Release v0.2.6](https://github.com/hypit-ai/hypit/releases/tag/v0.2.6) (release)
- [Issues (최근 생성순)](https://github.com/hypit-ai/hypit/issues?q=is%3Aissue+sort%3Acreated-desc) (issues)
- [Hypit: Clone Any Viral Video With AI Agents (The Menon Lab)](https://themenonlab.blog/blog/hypit-clone-viral-video-ai-agents) (blog)
- [packages/ 디렉터리](https://github.com/hypit-ai/hypit/tree/main/packages) (code)

[^s1]: [Hypit README (main)](https://github.com/hypit-ai/hypit/blob/main/README.md)
[^s2]: [Repository 메타데이터 (GitHub API)](https://api.github.com/repos/hypit-ai/hypit)
[^s3]: [Hypit Open Source License](https://github.com/hypit-ai/hypit/blob/main/LICENSE)
[^s4]: [Quickstart for Agent users](https://github.com/hypit-ai/hypit/blob/main/docs/quickstart.md)
[^s5]: [Use Hypit in your Agent](https://github.com/hypit-ai/hypit/blob/main/docs/guide/agents.md)
[^s6]: [Development Guide](https://github.com/hypit-ai/hypit/blob/main/docs/guide/develop.md)
[^s7]: [Runtime](https://github.com/hypit-ai/hypit/blob/main/docs/guide/runtime.md)
[^s8]: [Packages and Extension](https://github.com/hypit-ai/hypit/blob/main/docs/guide/packages.md)
[^s9]: [skills/hypit/SKILL.md](https://github.com/hypit-ai/hypit/blob/main/skills/hypit/SKILL.md)
[^s10]: [Release v0.2.9](https://github.com/hypit-ai/hypit/releases/tag/v0.2.9)
[^s11]: [Release v0.2.8](https://github.com/hypit-ai/hypit/releases/tag/v0.2.8)
[^s12]: [Release v0.2.7](https://github.com/hypit-ai/hypit/releases/tag/v0.2.7)
[^s13]: [Release v0.2.6](https://github.com/hypit-ai/hypit/releases/tag/v0.2.6)
[^s14]: [Issues (최근 생성순)](https://github.com/hypit-ai/hypit/issues?q=is%3Aissue+sort%3Acreated-desc)
[^s15]: [Hypit: Clone Any Viral Video With AI Agents (The Menon Lab)](https://themenonlab.blog/blog/hypit-clone-viral-video-ai-agents)
[^s16]: [packages/ 디렉터리](https://github.com/hypit-ai/hypit/tree/main/packages)
