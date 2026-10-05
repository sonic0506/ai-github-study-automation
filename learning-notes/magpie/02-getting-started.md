# magpie 설치와 첫 사용

> 설치 방법을 고르는 기준, 첫 공급자 등록, 에이전트 모델을 바꾸고 되돌리는 가장 간단한 흐름, 설치할 때 자주 겪는 문제를 다룹니다.

## 설치

magpie는 Go로 작성된 단일 바이너리입니다. 데스크톱 앱을 포함한 빌드는 약 30MB(macOS 다운로드는 15MB 정도)이고, 터미널 전용 빌드도 있습니다(2026년 10월 기준).

**방법 1. 설치 스크립트(권장)**

```bash
curl -fsSL https://usemagpie.ai/install.sh | sh
```

macOS·Windows·Linux용 앱을 [usemagpie.ai](https://usemagpie.ai)에서 직접 내려받아도 됩니다. Linux에서는 WebKitGTK 4.1이 설치되어 있으면 데스크톱 앱이, 없으면 터미널 전용 명령이 설치됩니다.

방화벽 안이거나 GitHub에 접근하기 어려운 환경이라면 프록시나 미러를 지정합니다. 미러를 써도 다운로드 파일의 SHA-256은 usemagpie.ai에서 받아 검증합니다.

```bash
curl -fsSL https://usemagpie.ai/install.sh | sh -s -- --proxy http://127.0.0.1:7890
```

**방법 2. 소스에서 설치**

```bash
go install github.com/yetone/magpie@latest
```

데스크톱 앱까지 직접 빌드하려면 저장소를 받아 `make build`(cgo와 플랫폼 webview 필요) 또는 `make cli`(터미널 전용, cgo 없이 크로스 컴파일)를 씁니다. Linux 앱 빌드에는 `libgtk-3-dev`와 `libwebkit2gtk-4.1-dev`가 필요합니다.

**방법 3. Docker (서버·NAS용)**

```bash
docker run -d --name magpie \
  -p 127.0.0.1:3425:3425 -p 127.0.0.1:3430:3430 \
  -v magpie-config:/config \
  ghcr.io/yetone/magpie:latest
```

Docker 이미지는 터미널 전용 바이너리를 nonroot로 실행하는 서버용입니다. 개발자 PC에 설치된 에이전트를 찾아 설정해 주는 기능은 없으므로, 개인 PC에서는 방법 1을 쓰고 Docker는 공유 게이트웨이를 띄울 때 씁니다. 자세한 구성은 [팀 공유 게이트웨이와 운영](05-usage-shared-gateway.md)에서 다룹니다.

설치된 앱은 백그라운드에서 새 버전을 받아 두었다가 재시작하거나 종료할 때 설치합니다. 터미널에서는 `magpie update`로 같은 일을 합니다.

## 기본 설정

처음 할 일은 공급자 하나를 등록하는 것입니다.

```bash
magpie                                  # 앱 실행: 창 + 메뉴 막대 아이콘
magpie ls                               # 감지된 에이전트와 현재 설정 확인

magpie provider add deepseek sk-...     # Preset 공급자는 키만
magpie provider test deepseek           # 각 API로 작은 요청을 보내 지연 시간 확인
magpie models                           # 에이전트가 볼 카탈로그
```

앱에서는 *Providers* 탭의 *Add provider*를 누르고 Preset 타일을 고른 뒤 키를 붙여 넣으면 됩니다. 이미 Claude Code나 Codex에 로그인해 있다면, 별도 등록 없이 그 구독이 `signed in as ...` 공급자로 나타납니다.

자주 쓰는 환경 변수는 다음과 같습니다.

```bash
export MAGPIE_ADDR=127.0.0.1:3425   # 게이트웨이 주소 (기본값)
export MAGPIE_DEBUG=1               # 게이트웨이가 변환하는 내용을 터미널에 출력
export DO_NOT_TRACK=1               # 하루 한 번 보내는 사용자 수 집계 끄기 (MAGPIE_NO_STATS=1도 가능)
```

## 가장 간단한 예제

Claude Code의 모델을 DeepSeek으로 바꿨다가 되돌려 봅니다.

```bash
magpie claude deepseek/deepseek-chat    # 1. 모델 변경
claude                                  # 2. 새 세션 시작
magpie usage today                      # 3. 사용량 확인
magpie claude default                   # 4. 원래 설정으로 복귀
```

1. **무엇을 생성하는가**: magpie가 `~/.claude/settings.json`에 게이트웨이 주소(`ANTHROPIC_BASE_URL`), 토큰(`ANTHROPIC_AUTH_TOKEN=magpie`), 모델 이름을 씁니다. 원래 있던 값은 `stash.json`에 보관합니다. 에이전트 이름은 `cc`, `oc`, `gem`처럼 앞부분만 써도 인식합니다.
2. **어떤 값을 전달하는가**: Claude Code는 평소처럼 Anthropic Messages API로 요청을 보내지만, 목적지가 `127.0.0.1:3425`이고 모델 이름이 `deepseek/deepseek-chat`입니다.
3. **magpie가 무엇을 처리하는가**: 게이트웨이가 DeepSeek 공급자를 찾아 저장된 키로 요청을 전달합니다. DeepSeek이 Anthropic 형식을 제공하면 그대로 통과하고, 아니면 변환합니다. 토큰과 추정 비용은 사용량 장부에 기록됩니다.
4. **어떤 결과를 반환하는가**: Claude Code는 DeepSeek 모델의 응답을 받습니다. `magpie claude default`를 실행하면 magpie가 넣은 키를 지우고 보관해 둔 원래 값을 복원합니다.

같은 일을 앱에서는 Claude Code 행의 모델 값을 클릭하고 목록에서 고르는 것으로 합니다. 터미널 화면이 편하다면 `magpie tui`에서 방향키로 에이전트와 필드를 고르고 `↵`로 선택합니다.

---

## 설치할 때 주의할 점

- **실행 중인 에이전트는 바로 바뀌지 않습니다.** 에이전트는 시작할 때 설정을 읽으므로, 이미 열린 세션은 새 세션을 열 때까지 이전 모델을 씁니다. 특히 Codex는 모델 목록도 시작할 때 읽으므로 전환 후 재시작해야 합니다.
- **게이트웨이가 꺼져 있으면 연결된 에이전트가 동작하지 않습니다.** 에이전트 설정이 `127.0.0.1:3425`를 가리키고 있으므로, magpie 앱(또는 `magpie serve`)이 실행 중이어야 합니다. 로그인할 때 자동 실행하려면 `magpie autostart on`을 씁니다.
- **셸 환경 변수의 키는 쓰지 않습니다.** `DEEPSEEK_API_KEY`가 셸에 있어도 `magpie provider add`로 직접 등록해야 합니다.
- **Windows·Linux 빌드는 서명되지 않았습니다.** Windows SmartScreen이 첫 실행 전에 경고할 수 있습니다. macOS 빌드는 서명·공증되어 있습니다.
- **개발 빌드는 실제 설정을 건드리지 않게 분리합니다.** 소스를 고쳐 `make dev`로 실행할 때는 `HOME=/tmp/magpie-home XDG_CONFIG_HOME=/tmp/magpie-home/.config make dev`처럼 임시 홈을 지정해야 실제 에이전트 설정이 바뀌지 않습니다. 개발 빌드는 게이트웨이 포트도 `127.0.0.1:3426`으로 따로 씁니다.
- **Docker에서 포트를 모든 인터페이스에 열지 않습니다.** 공유 설정 전의 게이트웨이는 어떤 키든 받으므로 `-p 3425:3425`는 호스트 방화벽을 넘어 노출될 수 있습니다. 반드시 `127.0.0.1:`을 붙여 publish합니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 에이전트별 모델 전환과 비용 관리 →](03-usage-model-switching.md)
