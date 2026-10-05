# Hypit 설치와 첫 사용

> Skill과 실행 파일을 설치하는 방법, 영상 프로젝트의 기본 설정(Runtime Profile과 계정 연결), 가장 간단한 첫 실행, 설치할 때 자주 겪는 문제를 다룹니다.

## 설치

필요한 것은 다음과 같습니다.

| 도구 | 버전 | 필요한 경우 |
|---|---|---|
| Skill을 지원하는 코딩 에이전트 | Claude Code, Codex 등 | 에이전트로 작업할 때 |
| Node.js | 22.15 이상 | `hypit` 실행 파일 |
| ffmpeg / ffprobe | 최신 안정 버전 | 로컬 미디어 처리와 렌더링 |
| Chrome / Chromium | `hypit runtime up`이 내려받음 | 로컬 HyperFrames 렌더링 |
| Python 3.10~3.13, uv | - | 로컬 WhisperX·OpenCV를 쓸 때만 |

**1단계. Skill 설치**

```bash
npx skills add hypit-ai/hypit -g
```

이 명령은 에이전트가 읽을 `hypit` Skill(연출 지식, SVML 문법, 런타임 사용법)을 전역으로 설치합니다. Hypit 저장소를 clone할 필요는 없습니다.

**2단계. 실행 파일 설치**

Skill을 설치한 뒤 에이전트에게 처음 요청하면, 에이전트가 `hypit` 실행 파일이 있는지 확인하고 없으면 설치를 도와줍니다. 직접 설치하려면 버전을 고정해서 설치합니다.

```bash
npm install -g @hypit/hypit@0.2.17
```

```bash
pnpm add -g @hypit/hypit@0.2.17
```

```bash
hypit --version
hypit version --check   # 최신 릴리스와 비교
```

Skill과 실행 파일은 **업데이트 채널이 다릅니다.** 실행 파일은 npm으로, Skill은 `npx skills update hypit -g`로 따로 갱신합니다. 어느 쪽을 업데이트해도 기존 영상 프로젝트 파일은 자동으로 바뀌지 않습니다.

## 기본 설정

영상 프로젝트 폴더를 만들고 그 안에서 명령을 실행합니다. Hypit은 **현재 위치에서 가장 가까운 `package.json`이 있는 폴더**를 프로젝트 경계로 봅니다. 없으면 현재 폴더가 프로젝트입니다.

```bash
mkdir creatine-ad && cd creatine-ad
npm init -y                # 프로젝트 경계를 명확히 하기 위해 권장
hypit paths                # Hypit이 인식한 프로젝트·Runtime·Result 경로 확인
hypit runtime init         # hypit.runtime.json 생성 + .hypit/runtime 에 선택 기록
```

`runtime init`은 HypiHub(호스팅 생성·WhisperX)와 로컬 미디어 처리·렌더링이 들어 있는 시작용 Profile을 만듭니다. 설치, 로그인, 실행은 하지 않습니다. 실제로 쓸 서비스를 고른 다음에 그 서비스만 준비합니다.

**로컬 미디어 처리 준비**

```bash
hypit runtime up --endpoint media.local   # 필요한 프로그램 준비 + Worker 시작
hypit runtime status
```

**생성 서비스 계정 연결 (HypiHub를 고른 경우)**

```bash
hypit auth status hypihub.default
hypit auth login hypihub.default          # 브라우저 OAuth 로그인
```

**설정 점검**

```bash
hypit doctor                               # 유료 요청 없이 설정·자격 증명·환경 점검
```

`doctor`는 생성 요청을 보내지 않습니다. 그래서 "자격 증명이 있다"와 "모든 요청이 성공한다"는 다른 이야기입니다. 경고도 오류만큼 주의해서 읽어야 합니다.

마지막으로 생성물과 실행 데이터가 커밋되지 않도록 `.gitignore`를 둡니다.

```text
.hypit/
output/
```

## 가장 간단한 예제

에이전트(Claude Code 등)를 영상 프로젝트 폴더에서 열고 다음을 입력합니다.

```text
/hypit Make a 15-second ranking video that ranks three protein supplements, in Korean, vertical 9:16.
```

1. **무엇을 생성하는가**: 에이전트가 Brief(사용자 목표)와 Treatment(연출안)를 프로젝트에 기록하고, Script·생성 프롬프트·랭킹 보드 컴포넌트 배치를 `.svml`로, 스타일을 `.svs`로, 실행 대상을 `.svrun`으로 작성합니다.
2. **어떤 값을 전달하는가**: 요청 문장, 선택한 서비스 계정, 그리고 Script에서 측정한 대사 길이(`hypit measure`)가 생성 요청의 입력이 됩니다.
3. **Hypit이 무엇을 처리하는가**: 에이전트는 `hypit plan`과 `hypit pricing`으로 어떤 모델을 몇 번 호출하고 얼마가 드는지 보여 주고, **사용자가 계정·범위·예산에 동의해야** `hypit build`를 실행합니다. Worker가 이미지·영상 생성, WhisperX 정렬, 자막·그래픽 합성, 렌더링을 순서대로 진행합니다.
4. **어떤 결과를 반환하는가**: Build Result에 최종 영상과 중간 Output(생성 이미지, 테이크, 정렬 결과)이 남습니다. 에이전트는 `hypit get`으로 MP4를 내보내고, `hypit studio`로 타임라인을 열어 직접 확인·수정할 수 있게 안내합니다.

에이전트 없이 CLI만으로 같은 과정을 진행할 수도 있습니다.

```bash
hypit check main.svml                         # 그래프·타입 검증 (외부 호출 없음)
hypit plan build.svrun                         # 실행될 작업과 준비 상태 확인
hypit pricing build.svrun                      # 요청별 요금 확인
hypit build build.svrun --title first-cut --follow
hypit get <build-id> --output final.video --to output/final.mp4
```

`check`와 `plan`은 외부 서비스를 호출하지 않으므로 몇 번을 실행해도 비용이 들지 않습니다. 실제로 작업을 제출하는 명령은 `build`뿐입니다.

---

## 설치할 때 주의할 점

- **Skill과 실행 파일 버전을 함께 확인합니다.** Skill만 최신이고 실행 파일이 예전 버전이면, Skill이 안내하는 문법(예: 0.2.0의 `@{name}` 마커)을 실행 파일이 이해하지 못할 수 있습니다. 문제가 생기면 `hypit version --check`부터 확인합니다.
- **`^0.1.x` 범위는 0.2로 올라가지 않습니다.** 프로젝트 로컬로 설치했다면 `npm install --save-exact @hypit/hypit@<버전>`처럼 의도적으로 올려야 합니다.
- **0.2.14는 npm에 없습니다.** CI 문제로 배포되지 않았고, 0.2.15에 그 변경이 모두 들어 있습니다.
- **로컬 WhisperX는 다운로드가 큽니다.** ASR 모델과 언어별 정렬 모델을 받아야 하므로, 처음에는 호스팅 전사(HypiHub)와 비교해서 경로를 정하는 편이 좋습니다. 준비만 하려면 `hypit programs prepare --endpoint whisperx.local`을 씁니다.
- **원격 에이전트에서는 미리보기 주소가 다릅니다.** 원격 머신의 `localhost:5179`(Studio 기본 포트)는 내 컴퓨터의 주소가 아닙니다. 그 환경의 포트 포워딩이나 파일 전달 기능을 써야 합니다.
- **자격 증명은 소스와 Profile 밖에 둡니다.** API 키를 `.svml`이나 `hypit.runtime.json`에 직접 쓰지 말고 `hypit auth login <endpoint>`나 환경 변수 Credential Store로 연결합니다.
- **Windows에서는 WSL 경로와 ffmpeg shim 문제가 보고된 적이 있습니다.** 대부분 수정되었지만, 처음 설치 후에는 `hypit doctor`로 ffmpeg와 브라우저 준비 상태를 확인합니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 참고 영상 복제와 변형 →](03-usage-video-clone.md)
