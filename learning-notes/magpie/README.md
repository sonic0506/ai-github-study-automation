# magpie

> PC에 설치된 여러 AI 코딩 에이전트(Claude Code, Codex, Gemini CLI, OpenCode 등)의 모델 설정을 한 화면에서 바꾸고, 로컬 게이트웨이 하나로 모든 에이전트를 어떤 모델 공급자에든 연결해 주는 Go 기반 데스크톱·CLI 도구입니다.

## 문서 목차

이 문서는 magpie가 무엇이고 언제 쓰는지를 다루는 입구입니다. 주제별 내용은 아래 문서로 이어집니다.

1. [핵심 개념과 동작 구조](01-core-concepts.md)
2. [설치와 첫 사용](02-getting-started.md)
3. [활용 예시 ① 에이전트별 모델 전환과 비용 관리](03-usage-model-switching.md)
4. [활용 예시 ② 내 코드에서 게이트웨이 쓰기](04-usage-gateway-clients.md)
5. [활용 예시 ③ 팀 공유 게이트웨이와 운영](05-usage-shared-gateway.md)
6. [장단점과 대안 비교](06-comparison.md)
7. [게이트웨이 내부: 변환·라우팅·Fallback](07-gateway-routing.md)
8. [주의할 점과 FAQ](08-pitfalls-faq.md)

---

## 30초 요약

| 항목 | 내용 |
|---|---|
| 무엇인가? | 에이전트 설정 파일 편집기 + 로컬 LLM 게이트웨이(`127.0.0.1:3425`)를 하나로 묶은 메뉴 막대 앱·TUI·CLI |
| 왜 사용하는가? | 에이전트마다 다른 설정 파일과 API 형식을 일일이 맞추지 않고, "Codex는 DeepSeek로, Claude Code는 Kimi로"를 클릭 한 번으로 바꾸기 위해 |
| 해결하는 문제 | 에이전트별로 흩어진 모델 설정, 에이전트가 쓰는 API와 공급자가 제공하는 API의 불일치, 여러 구독·키의 사용량 관리 |
| 주요 사용처 | 에이전트 모델 전환, 저렴한 모델로 비용 절감, 구독(Claude·ChatGPT·Copilot) 공유, 여러 키·계정 라우팅, 사용량·비용 추적 |
| 핵심 개념 | Agent, Provider, `provider/model` 카탈로그, Gateway(통과·변환), Routing group, Profile, Library |
| Client 사용 | O (개발자 PC에서 메뉴 막대 앱·TUI·CLI로 실행. 직접 만든 스크립트도 게이트웨이 사용 가능) |
| Server 사용 | △ (Docker 이미지로 NAS·사내 서버에 띄워 여러 컴퓨터가 공유하는 게이트웨이로 사용. 애플리케이션 서버에 import하는 라이브러리는 아님) |
| 대표 대안 | 설정 파일 직접 편집, CC Switch, claude-code-router, LiteLLM Proxy, OpenRouter |

- **설정 파일을 수술하듯 고친다**: 바꾸는 키 하나만 수정하고 주석·순서·들여쓰기를 보존하며, 쓰기는 atomic으로 처리합니다.
- **모든 에이전트가 하나의 엔드포인트를 본다**: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Gemini API를 모두 받아서, 공급자가 같은 API를 쓰면 그대로 통과시키고 다르면 스트리밍·tool call·reasoning까지 변환합니다.
- **로그인한 구독을 공급자로 쓴다**: Claude Code, Codex(ChatGPT), Copilot 등에 로그인해 두면 그 구독이 다른 에이전트에서도 쓸 수 있는 공급자로 나타납니다.
- **여러 키·계정·모델을 하나로 묶는다**: Routing group이 남은 할당량, 사용량, 캐시 유지 여부를 보고 요청을 나눠 보내고, 실패하면 다음 후보로 넘깁니다.
- **실제 모델 목록을 쓴다**: 공급자에게 직접 모델 목록을 물어보고 models.dev 카탈로그로 이름·reasoning 단계·가격을 보완하므로, 새 모델이 나와도 업데이트 없이 선택지에 나타납니다.

---

## 어떤 도구인가?

AI 코딩 에이전트를 두세 개 이상 쓰다 보면 다음과 같은 일이 생깁니다.

- Claude Code의 모델을 바꾸려면 `~/.claude/settings.json`의 `env` 블록을 고쳐야 합니다.
- Codex는 `~/.codex/config.toml`에 `[model_providers.*]` 테이블을 추가해야 하고, 바꾼 뒤에는 재시작해야 합니다.
- OpenCode는 `opencode.jsonc`, Goose는 `config.yaml`, Gemini CLI는 `settings.json`과 `.env`를 따로 씁니다.
- Codex는 OpenAI Responses API로 말하는데, 쓰고 싶은 공급자는 Chat Completions나 Anthropic Messages API만 제공하는 경우가 많습니다. 형식이 다르면 그대로는 연결이 안 됩니다.
- Claude 구독은 Claude Code에서만, ChatGPT 구독은 Codex에서만 쓸 수 있습니다.

magpie는 이 일을 **한 화면으로 모으는 도구**입니다. 앱을 열면 PC에 설치된 에이전트와 각 에이전트에 지금 설정된 모델이 목록으로 나오고, 값을 클릭해 모델을 고르면 끝입니다. README도 "그게 앱의 전부"라고 설명합니다.

기술적으로 보면 magpie는 두 부분으로 이루어져 있습니다.

1. **설정 편집기**: 40여 종 에이전트(2026년 10월 기준)의 설정 파일 형식(JSON, JSONC, TOML, YAML, `.env`)을 알고 있어서, 모델을 바꿀 때 필요한 키만 정확히 고칩니다. magpie가 덮어쓴 원래 값은 따로 보관(`stash.json`)해 두었다가 되돌릴 때 복원합니다.
2. **로컬 게이트웨이**: `http://127.0.0.1:3425`에서 네 가지 LLM API를 받아 실제 공급자에게 전달합니다. 에이전트는 공급자의 키나 URL을 알 필요 없이 이 주소 하나만 바라보고, 모델은 `deepseek/deepseek-chat`처럼 `provider/model` 형식으로 고릅니다.

UI는 세 가지입니다. 메뉴 막대 패널(일반 창으로도 열림), 터미널 버전 `magpie tui`, 그리고 스크립트에서 쓰는 CLI가 같은 기능을 제공합니다. 데스크톱 앱은 [Wails](https://wails.io)로 시스템 webview를 써서 별도 런타임을 번들하지 않으며, macOS·Linux·Windows를 지원합니다.

magpie는 2026년 9월 23일에 공개된 매우 새로운 프로젝트이고, MIT 라이선스로 배포됩니다. 저장소 기여의 대부분은 제작자 yetone 한 사람이 하고 있습니다(2026년 10월 기준).

### 주요 사용 사례

- **에이전트 모델 전환**: `magpie claude moonshot/kimi-k2.5`처럼 명령 한 줄로 Claude Code를 Kimi 모델로 바꿉니다.
- **비싼 모델과 싼 모델 나눠 쓰기**: Claude Code의 메인 모델은 그대로 두고, 보조 작업에 쓰는 haiku 계층만 저렴한 모델로 돌립니다.
- **구독 공유**: ChatGPT 구독으로 로그인한 Codex의 모델을 OpenCode나 Pi에서 씁니다.
- **여러 계정·키 라우팅**: 같은 모델을 제공하는 공급자 여러 개를 Routing group으로 묶어, 한 곳이 할당량을 다 쓰면 다음 곳으로 넘어가게 합니다.
- **직접 만든 도구에서 사용**: OpenAI·Anthropic SDK의 base URL만 게이트웨이로 바꿔 사내 스크립트에서 같은 카탈로그를 씁니다.
- **사용량·비용 추적**: 에이전트·모델·구독 계정별 토큰과 추정 비용을 `magpie usage`로 확인합니다.

주요 용어는 [핵심 개념과 동작 구조](01-core-concepts.md)에서 자세히 다룹니다.

---

## 어떤 문제를 해결하는가?

```text
요구사항: Claude Code와 Codex를 쓰는데, 작업에 따라 DeepSeek·Kimi·GLM 같은 다른 모델로 바꿔 쓰고 싶다
 ↓
일반적인 구현: 에이전트마다 설정 파일을 열어 base URL, 키, 모델 이름을 직접 고친다
 ↓
문제 발생: 파일 형식이 제각각이고, API 형식이 안 맞는 조합은 연결이 안 되며, 원래 설정으로 되돌리기 어렵다
 ↓
magpie로 해결: 설정 키만 정확히 고치고, 모든 에이전트를 로컬 게이트웨이에 연결해 API 변환을 맡긴다
```

### 상황 예시

혼자 일하는 개발자가 낮에는 회사 프로젝트를 Claude Code(회사가 준 Anthropic API 키)로, 밤에는 개인 프로젝트를 Codex(개인 ChatGPT 구독)로 작업합니다. 최근 DeepSeek 모델이 저렴하고 쓸 만하다고 해서, 단순 리팩터링이나 테스트 작성은 DeepSeek으로 돌려 보고 싶습니다.

### 일반적인 구현 방식

Claude Code를 DeepSeek의 Anthropic 호환 엔드포인트로 바꾸려면 `settings.json`을 직접 고칩니다.

```json
// ~/.claude/settings.json : 손으로 고친 경우
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "sk-deepseek-...",
    "ANTHROPIC_MODEL": "deepseek-chat",
    "ANTHROPIC_SMALL_FAST_MODEL": "deepseek-chat"
  }
}
```

Codex도 DeepSeek으로 바꾸려면 `config.toml`에 공급자 테이블을 추가해야 합니다. 그런데 최근 Codex는 Responses API(`wire_api = "responses"`)를 기준으로 동작하고, DeepSeek을 비롯한 많은 공급자는 Chat Completions나 Anthropic Messages 형식만 제공합니다.

```toml
# ~/.codex/config.toml : 손으로 고친 경우
model = "deepseek-chat"
model_provider = "deepseek"

[model_providers.deepseek]
name = "DeepSeek"
base_url = "https://api.deepseek.com/v1"
env_key = "DEEPSEEK_API_KEY"
# Codex가 기대하는 API와 DeepSeek이 제공하는 API가 달라 그대로는 동작하지 않는다
```

### 이 방식에서 발생하는 문제

- **에이전트마다 다른 형식**: JSON, TOML, YAML, `.env`를 각각 알아야 하고, 키 이름도 에이전트마다 다릅니다.
- **API 불일치**: 에이전트가 말하는 API와 공급자가 제공하는 API가 다르면 중간 변환 서버를 따로 띄워야 합니다.
- **되돌리기 어려움**: 회사 키로 돌아가려면 원래 값을 기억해 두었다가 다시 써야 합니다. 주석이나 다른 설정을 실수로 지우기도 쉽습니다.
- **키가 여기저기 흩어짐**: 공급자 키가 각 에이전트 설정 파일에 복사되어 남습니다.
- **구독이 에이전트에 묶임**: ChatGPT 구독은 Codex에서만, Claude 구독은 Claude Code에서만 쓸 수 있습니다.
- **사용량이 흩어짐**: 어떤 에이전트가 어느 공급자에서 얼마를 썼는지 한곳에서 볼 수 없습니다.

### magpie를 사용하면

같은 요구사항이 명령 몇 줄로 끝납니다. 설치와 호출 방법은 [설치와 첫 사용](02-getting-started.md)에서 다룹니다.

```bash
magpie provider add deepseek sk-...          # 키는 magpie에만 저장
magpie claude deepseek/deepseek-chat         # Claude Code → 게이트웨이 → DeepSeek
magpie codex deepseek/deepseek-chat          # Codex도 같은 모델로 (Responses → Chat 변환)
magpie claude default                        # 원래 설정으로 복귀
```

- 에이전트 설정 파일에는 게이트웨이 주소와 magpie 토큰만 들어가고, 실제 공급자 키는 magpie의 `providers.json`(권한 0600)에만 있습니다.
- Codex가 보낸 Responses API 요청은 게이트웨이가 DeepSeek이 이해하는 형식으로 변환합니다.
- magpie가 덮어쓴 원래 값은 보관되어 있다가 되돌릴 때 복원됩니다.

> **핵심:** 에이전트별 설정 파일 편집과 API 형식 변환을 개발자가 직접 관리하는 대신, magpie가 **설정 키만 정확히 고치는 편집기와 모든 API를 받아 주는 로컬 게이트웨이**로 처리해 줍니다.

---

## 왜 주목받고 있는가?

magpie는 공개 후 2주가 안 되어 GitHub Star 4,800개, Fork 340개를 넘겼습니다(2026년 10월 기준). 주목받는 이유는 다음과 같습니다.

**에이전트와 모델이 동시에 늘어났습니다.** 코딩 에이전트는 Claude Code, Codex, Gemini CLI를 넘어 OpenCode, Pi, Goose, Crush, Kimi Code, Droid 등으로 늘었고, 모델 공급자도 DeepSeek, Kimi, GLM, Qwen, MiniMax 같은 저렴한 선택지가 많아졌습니다. "에이전트 × 모델" 조합이 폭발하면서 이 조합을 관리하는 계층이 필요해졌습니다.

**API 표준이 세 갈래로 나뉘었습니다.** OpenAI는 Responses API로 옮겨 가고, Anthropic은 Messages API를, Google은 Gemini API를 씁니다. 에이전트는 보통 그중 하나만 말하므로, 중간에서 변환해 주는 게이트웨이의 가치가 커졌습니다.

**개발자 PC에 맞춘 경험입니다.** LiteLLM 같은 게이트웨이는 서버에 띄우고 YAML로 설정하는 방식이 기본입니다. magpie는 메뉴 막대 앱으로 시작해서, "어떤 에이전트가 설치되어 있는지 자동으로 찾고 클릭으로 바꾸는" 데스크톱 경험에 집중합니다.

**구독을 다른 에이전트에서도 쓸 수 있습니다.** 이미 비용을 내고 있는 Claude·ChatGPT·Copilot 구독을 다른 에이전트에서 쓸 수 있다는 점이 큰 관심을 받았습니다. 다만 공급자 약관과 계정 정지 위험이 함께 따르므로 [주의할 점과 FAQ](08-pitfalls-faq.md)를 꼭 확인해야 합니다.

**개발 속도가 매우 빠릅니다.** 릴리스 전용 저장소(`yetone/magpie-releases`)에 공개 후 2주 동안 900개가 넘는 릴리스가 올라왔고(2026년 10월 4일 v0.1.928), 하루에도 수십 번 새 버전이 나옵니다. 새 에이전트나 공급자 지원 요청이 빠르게 반영되는 대신, 동작이 자주 바뀐다는 뜻이기도 합니다.

설정 파일 직접 편집이나 다른 도구와의 항목별 차이는 [장단점과 대안 비교](06-comparison.md)에 정리했습니다.

---

## 언제 사용하면 좋은가?

- **코딩 에이전트를 두 개 이상 쓰는 경우**: 에이전트마다 다른 설정 형식을 외울 필요가 없고, 한 화면에서 전체 상태를 볼 수 있습니다.
- **모델을 자주 바꿔 가며 비교하는 경우**: 새 모델이 나올 때마다 같은 작업을 여러 모델로 돌려 보는 사람에게는 전환 비용이 거의 0이 됩니다.
- **에이전트의 API와 쓰고 싶은 모델의 API가 다른 경우**: Codex를 Responses API가 없는 공급자에 붙이거나, Gemini CLI를 다른 공급자 모델로 돌리는 조합은 게이트웨이 변환 없이는 어렵습니다.
- **구독과 API 키를 여러 개 갖고 있는 경우**: Routing group으로 할당량이 남은 쪽부터 쓰고, 다 쓰면 다음으로 넘기는 운영이 자동화됩니다.
- **회사·개인 설정을 오가는 경우**: Profile로 모든 에이전트 설정을 이름으로 저장하고 한 번에 바꿉니다.
- **에이전트 사용 비용을 한곳에서 보고 싶은 경우**: 모든 호출이 게이트웨이를 거치므로 에이전트·모델·계정별 사용량이 한 장부에 쌓입니다.

---

## 언제 사용하지 않는 것이 좋은가?

- **에이전트 하나, 모델 하나만 쓰는 경우**: Claude Code를 Anthropic 모델로만 쓴다면 바꿀 것이 없습니다. 로컬 게이트웨이라는 중간 계층만 하나 늘어납니다.
  > 예: 회사에서 Claude Code + 회사 API 키만 쓰는 개발자는 `settings.json` 그대로가 가장 단순합니다.
- **설정 파일을 사람이 직접 통제해야 하는 환경**: magpie는 에이전트 설정 파일을 직접 고칩니다. 설정을 Git으로 관리하거나 MDM으로 배포하는 조직이라면, 도구가 파일을 바꾸는 것 자체가 문제가 될 수 있습니다.
- **변화가 적은 안정적인 도구가 필요한 경우**: 아직 0.1.x 버전이고 하루에 수십 번 릴리스가 나옵니다. 자동 업데이트로 동작이 바뀌는 것이 부담스러운 환경에는 맞지 않습니다.
- **서버 애플리케이션의 LLM 게이트웨이가 필요한 경우**: 서비스 트래픽을 처리하는 프로덕션 게이트웨이라면 LiteLLM Proxy나 클라우드 게이트웨이처럼 그 용도로 설계된 도구가 적합합니다. magpie의 서버 모드는 "여러 개발자 PC가 공유하는 게이트웨이"에 가깝습니다.
- **구독 공유에 따른 약관·계정 위험을 감수할 수 없는 경우**: 구독 로그인을 다른 에이전트에서 쓰는 기능은 공급자 정책에 따라 제한되거나 계정이 정지될 수 있습니다. 회사 계정이라면 API 키 공급자만 쓰는 편이 안전합니다.
- **보안 검토 없이 서명되지 않은 바이너리를 쓸 수 없는 경우**: macOS 빌드는 서명·공증되어 있지만 Windows와 Linux 빌드는 아직 서명되지 않았습니다.

---

## 한눈에 정리

| 항목 | 내용 |
|---|---|
| 라이브러리 | magpie (GitHub `yetone/magpie`, 사이트 usemagpie.ai) |
| 주요 목적 | 여러 코딩 에이전트의 모델 설정을 한 곳에서 바꾸고, 하나의 로컬 게이트웨이로 모든 공급자에 연결 |
| 해결하는 문제 | 에이전트별로 다른 설정 형식, 에이전트와 공급자의 API 불일치, 흩어진 키·구독·사용량 |
| 핵심 개념 | Agent, Provider, `provider/model`, Gateway(통과·변환), Signed-in 구독, Routing group, Profile, Library |
| 주요 사용처 | 모델 전환, 비용 절감, 구독 공유, 여러 키·계정 라우팅, 사용량 추적 |
| Client 활용 | 메뉴 막대 앱·TUI·CLI로 에이전트 설정 관리, 직접 만든 스크립트에서 OpenAI·Anthropic SDK로 게이트웨이 사용 |
| Server 활용 | Docker 이미지로 NAS·사내 서버에 공유 게이트웨이 운영, gateway key와 사용 한도, OTLP 내보내기 |
| 장점 | 설정 키만 고치는 편집, 4개 API 상호 변환, 실제 모델 목록, 라우팅·Fallback, 통합 사용량 장부 |
| 단점 | 매우 잦은 변경, 구독 공유의 약관·정지 위험, 변환 과정의 호환성 문제, 1인 중심 개발 |
| 추천 상황 | 에이전트 여러 개와 모델·공급자 여러 개를 오가며 쓰는 개인·소규모 팀 |
| 비추천 상황 | 에이전트·모델 하나만 쓰는 경우, 설정을 중앙에서 통제하는 조직, 프로덕션 서비스 게이트웨이 |
| 대표 대안 | 설정 파일 직접 편집, CC Switch, claude-code-router, LiteLLM Proxy, OpenRouter |

---

## 핵심 정리

### 한 문장으로

> magpie는 에이전트마다 흩어진 모델 설정과 서로 다른 API 형식 문제를 **설정 키만 정확히 고치는 편집기와 네 가지 API를 상호 변환하는 로컬 게이트웨이**로 해결하기 위한 데스크톱·CLI 도구입니다.

### 이것만 기억하기

1. **왜 사용하는가?**
   - 여러 코딩 에이전트의 모델을 설정 파일을 직접 열지 않고 한 화면에서 바꾸고, 어떤 에이전트든 어떤 공급자 모델에든 붙이기 위해서입니다.

2. **어떤 문제를 해결하는가?**
   - 에이전트마다 다른 설정 형식, 에이전트와 공급자의 API 불일치, 원래 설정으로 되돌리기 어려운 문제, 흩어진 키·구독·사용량 문제입니다.

3. **어떻게 동작하는가?**
   - 에이전트 설정 파일에는 게이트웨이 주소와 `provider/model` 이름만 쓰고, 게이트웨이가 요청을 받아 공급자가 같은 API를 쓰면 통과, 다르면 변환해서 전달합니다. Routing group이 여러 키·계정·모델 중 누구에게 보낼지 정합니다.

4. **실제 프로젝트에서는 어디에 사용하는가?**
   - 개인 PC의 에이전트 모델 전환과 비용 절감, 직접 만든 스크립트의 LLM 호출, 소규모 팀이 공유하는 사내 게이트웨이와 사용량 관리에 씁니다.

5. **언제 사용하지 않는가?**
   - 에이전트와 모델을 하나만 쓰는 경우, 설정 파일을 중앙에서 통제해야 하는 조직, 안정성이 중요한 프로덕션 서비스 게이트웨이에는 맞지 않습니다.

6. **비슷한 기술과 가장 큰 차이는 무엇인가?**
   - 설정 전환 도구(CC Switch)와 게이트웨이(LiteLLM, claude-code-router)의 역할을 하나로 합쳐, **설치된 에이전트를 찾아 설정을 고치는 일과 API 변환을 함께** 한다는 점입니다. 대신 변화가 매우 빠르고 구독 공유에는 약관 위험이 따르므로, 쓰는 기능을 좁혀서 쓰는 것이 좋습니다.

---

[핵심 개념과 동작 구조 →](01-core-concepts.md)
