# CC Switch 활용 예시 ② 다른 회사 모델을 도구 안에서 쓰기

> 로컬 라우팅으로 Claude Code에서 GPT 모델을, Codex에서 Claude 모델을 쓰는 방법과, 4.0의 집계 모드로 여러 공급자의 모델을 한 모델 목록에서 고르는 방법을 다룹니다.

CC Switch는 브라우저나 앱 화면에 들어가는 라이브러리가 아니므로, 여기서는 **"AI 코딩 도구가 LLM API의 클라이언트로서 어떤 요청을 보내는가"**를 클라이언트 관점으로 봅니다. 도구는 저마다 정해진 형식으로만 요청을 보내기 때문에, 다른 형식의 모델을 쓰려면 중간에서 바꿔 줄 무언가가 필요합니다.

| 도구 | 도구가 보내는 형식 | 연결하고 싶은 공급자 형식 | 필요한 것 |
|---|---|---|---|
| Claude Code | Anthropic Messages (`/v1/messages`) | OpenAI Responses, Chat Completions, Gemini | 로컬 라우팅 |
| Codex | OpenAI Responses (`/v1/responses`) | Anthropic Messages, Chat Completions | 로컬 라우팅 |
| Claude Desktop | Anthropic Messages | Claude가 아닌 모델 | 모델 매핑(내부적으로 로컬 라우팅) |

## 활용할 수 있는 기능

- **API 형식 지정**: 공급자 편집의 고급 옵션에서 Upstream Format(API 형식)을 고릅니다. 도구와 형식이 다르면 카드에 "라우팅 필요" 표시가 붙습니다.
- **모델 매핑**: Claude Code의 Haiku·Sonnet·Opus 역할과 기본 대체 모델(Default fallback model)을 공급자의 실제 모델 이름에 연결합니다.
- **OAuth 인증 센터(Beta)**: ChatGPT, GitHub Copilot, xAI 계정으로 로그인해 구독을 공급자처럼 씁니다.
- **집계 모드(4.0)**: Claude Code와 Codex의 모델 선택기에 여러 공급자의 모델을 함께 올립니다.
- **요청 로그**: 사용량 화면의 요청 로그에서 "요청한 모델 → 실제 모델"과 오류를 요청 단위로 봅니다.

---

## 실제 예제 1. Claude Code에서 GPT 모델 쓰기

### 공급자 추가

Claude Code 페이지에서 공급자를 추가하고 사용자 설정(Custom)을 고른 뒤 다음처럼 입력합니다.

| 항목 | 값 | 이유 |
|---|---|---|
| API Endpoint | `https://gpt-gateway.example.com` | 서비스 루트만 입력. 라우팅이 `/v1/responses`를 붙임 |
| API Key | 게이트웨이 키 | CC Switch 안에만 저장되고 live 파일에는 들어가지 않음 |
| API Format | `OpenAI Responses API (Requires routing)` | 게이트웨이가 Chat만 지원하면 `OpenAI Chat Completions` |
| Auth Field | `ANTHROPIC_AUTH_TOKEN` (기본값 유지) | 업스트림에 `Authorization: Bearer <키>`를 보냄 |
| Default fallback model | `gpt-5.6` (게이트웨이 문서 기준) | 비워 두면 Claude 모델명이 그대로 업스트림에 가서 오류 |
| Sonnet / Opus / Haiku | 주 모델 / 주 모델 / 빠르고 저렴한 모델 | Haiku는 백그라운드 작업에 쓰임 |

Auth Field를 `ANTHROPIC_API_KEY`로 바꾸면 `x-api-key` 헤더를 보내게 되어, 대부분의 OpenAI 호환 게이트웨이에서 401이나 403이 납니다.

ChatGPT 구독이 있다면 API 키 대신 Claude Code 페이지의 `Codex` 프리셋에서 "Sign in with ChatGPT"로 장치 코드 로그인을 하는 방법도 있습니다. 이 경우 로그인 정보는 `~/.cc-switch/codex_oauth_auth.json`에 저장되고 Codex CLI 자체의 로그인과는 별개입니다. 다만 구독을 공식 클라이언트 밖에서 쓰는 것이므로 계정에 적용되는 약관을 직접 확인해야 합니다.

### 로컬 라우팅 켜기

설정의 로컬 라우팅에서 라우팅 마스터 스위치를 켜고(기본 주소 `127.0.0.1:15721`), 라우팅을 적용할 앱 목록에서 Claude Code만 켭니다. 4.0에서는 Claude Code 페이지 상단의 직결 / 라우팅 / 집계 탭에서도 모드를 바꿀 수 있습니다.

라우팅을 처음 켠 뒤에는 **새 터미널 세션에서 Claude Code를 다시 시작**해야 합니다. Claude Code가 시작할 때 주소를 읽기 때문입니다. 그다음부터는 라우팅 안에서 공급자를 바꿔도 재시작이 필요 없습니다.

### 확인

```bash
# 1) 로컬 라우팅 서비스가 떠 있는지
curl -s http://127.0.0.1:15721/health
#   {"status":"healthy","timestamp":"..."}

# 2) Claude Code 설정이 로컬 라우팅을 가리키는지
grep -E '"ANTHROPIC_(BASE_URL|AUTH_TOKEN|API_KEY)"' ~/.claude/settings.json
#   "ANTHROPIC_BASE_URL": "http://127.0.0.1:15721",
#   "ANTHROPIC_AUTH_TOKEN": "PROXY_MANAGED",

# 3) Claude Code와 같은 형식으로 한 번 요청 (실제 토큰이 소모됨)
curl -s http://127.0.0.1:15721/v1/messages \
  -H 'content-type: application/json' \
  -H 'anthropic-version: 2023-06-01' \
  -H 'authorization: Bearer PROXY_MANAGED' \
  -d '{"model":"claude-sonnet-5","max_tokens":64,
       "messages":[{"role":"user","content":"한 문장으로 자기소개 해줘"}]}'
```

1. **`/health`**: 라우팅 서비스가 살아 있는지 봅니다. 응답이 없으면 마스터 스위치가 꺼져 있거나 포트가 다른 것입니다. 로컬 라우팅은 들어오는 요청의 인증 값을 검사하지 않고 실제 키를 붙여 보내므로, 이 포트는 반드시 `127.0.0.1`에만 열어 둬야 합니다.
2. **live 설정**: 주소는 로컬, 인증 값은 자리표시자 `PROXY_MANAGED`입니다. 실제 게이트웨이 키는 이 파일에 없습니다.
3. **요청 시험**: Claude Code처럼 Anthropic Messages 형식으로 보냅니다. `claude-sonnet-5`는 라우팅 모드에서 Claude Code 설정에 쓰이는 고정 별칭이고, CC Switch가 모델 매핑에 따라 `gpt-5.6` 같은 실제 모델로 바꿔 Responses 형식으로 보낸 뒤, 응답을 다시 Messages 형식으로 돌려줍니다. 응답 JSON이 `"type":"message"` 형태로 오면 변환이 동작한 것입니다.

Claude Code 안에서는 새 세션에서 `/model` 메뉴를 열면 매핑한 표시 이름이 보입니다. 사용량 화면의 요청 로그에서 요청마다 "요청한 모델 → 실제 모델"을 확인할 수 있습니다.

### 알아 둘 동작

- **컨텍스트는 200K 기준으로 관리됩니다.** 라우팅된 공급자는 Claude Code가 기본 200K 창을 기준으로 자동 압축합니다. 업스트림 창이 더 커도 200K 이후는 쓰이지 않고, 모델 매핑의 `1M` 체크는 업스트림이 정말 100만 토큰을 지원할 때만 켭니다.
- **thinking은 추론 강도로 바뀝니다.** Claude Code의 thinking 설정은 GPT의 `reasoning.effort`로 변환됩니다.
- **도구 호출, 이미지, PDF도 변환 대상입니다.** 다만 웹 검색처럼 업스트림이 해당 기능을 지원해야 동작하는 것도 있습니다.
- **비용은 추정치입니다.** 토큰 수는 정확하지만 달러 금액은 공개 API 가격으로 환산한 값이라 실제 청구액과 다를 수 있습니다.

---

## 실제 예제 2. Codex에서 Claude 모델 쓰기

방향만 반대입니다. Codex 페이지에서 Anthropic 형식 공급자를 추가하고 API 형식을 `Anthropic Messages`로 지정한 뒤, 로컬 라우팅에서 Codex를 켭니다. Codex는 계속 Responses 형식으로 보내고, CC Switch가 Messages로 바꿔 전달합니다.

Codex는 Claude Code와 달리 **모델이 바뀌는 전환 뒤에 재시작이 필요**합니다. Codex CLI가 모델 목록(catalog)을 시작할 때 한 번 읽기 때문입니다. 4.0은 실행 중인 Codex가 오래된 목록을 쓰고 있으면 배너로 알려 주고, CLI 백그라운드 서비스는 버튼으로 다시 시작할 수 있게 합니다.

---

## 실제 예제 3. 집계 모드로 여러 공급자의 모델을 한 목록에 (4.0)

라우팅 모드는 "요청을 공급자 한 곳으로" 보냅니다. 다른 공급자의 모델을 쓰려면 라우팅 대상을 바꿔야 했습니다. 4.0의 집계 모드는 여러 공급자를 목록에 "추가"해 두면, 그 모델들이 Claude Code나 Codex의 모델 선택기에 함께 나타나게 합니다.

1. Claude Code(또는 Codex) 페이지의 집계 탭에서 안내 문구를 통해 집계 모드에 들어가며 기본 공급자를 고릅니다. 모델을 지정하지 않은 요청은 기본 공급자로 갑니다.
2. 다른 공급자 카드에서 "추가"를 누릅니다. 각 공급자의 모델이 `Kimi K3 (Kimi For Coding)`처럼 공급자 이름이 붙은 채로 목록에 올라갑니다.
3. 목록이 바뀌면 Claude Code를 다시 시작합니다(모델 목록을 시작 때 한 번 받아 오기 때문입니다).
4. 세션 안에서 `/model`로 다른 공급자의 모델을 고르면 그 요청은 바로 그 공급자로 갑니다.

내부적으로는 모델 ID에 공급자 접두사가 붙습니다. Claude Code에는 `ccs-claude-<키>--<모델>`, Codex에는 `ccs-<키>/<모델>` 형태로 게시되고, 로컬 라우팅은 접두사를 보고 공급자를 고릅니다.

집계 모드에는 **장애 조치가 없습니다.** 고른 모델의 공급자가 실패하면 그대로 실패합니다. 또 세션 중간에 다른 공급자의 모델로 바꾸면 새 모델이 프롬프트 캐시를 처음부터 만들어야 하므로, 바꾼 직후 첫 요청의 비용이 눈에 띄게 높아집니다.

---

## 실제 서비스에서는

> 개발자가 Claude Code로 결제 모듈을 리팩터링하다가, 큰 테스트 파일 생성은 저렴한 모델에 맡기고 싶어집니다. 집계 모드에서 `/model`로 Coding Plan 공급자의 모델을 고르면, Claude Code는 `ccs-claude-...` 모델 ID로 `127.0.0.1:15721/v1/messages`에 요청을 보내고, CC Switch는 접두사를 보고 그 공급자에게 요청을 넘깁니다. 테스트 생성이 끝나면 다시 `/model`로 기본 모델에 돌아오고, 사용량 화면에서 두 공급자의 토큰과 추정 비용을 나눠서 확인합니다.

이 구조의 장점은 **도구를 바꾸지 않고 모델만 바꾼다**는 것입니다. 익숙한 Claude Code의 Hook, 서브에이전트, 권한 설정을 그대로 쓰면서 작업 성격에 맞는 모델을 고를 수 있습니다. 반대로, 모델마다 도구 호출 방식과 thinking 처리가 달라서 변환 과정에서 미묘한 차이가 생길 수 있다는 점은 감안해야 합니다. 중요한 작업이라면 처음 쓰는 조합을 작은 작업으로 먼저 시험해 보는 것이 좋습니다.

라우팅이 요청을 어떻게 받아서 어디로 보내는지, 실패하면 어떻게 되는지는 [로컬 라우팅 깊이 보기](07-local-routing.md)에서 다룹니다.

---

[← 활용 예시 ① 공급자 전환과 프로젝트 구성](03-usage-provider-switching.md) · [목차](README.md) · [활용 예시 ③ 팀 배포와 운영 →](05-usage-team-ops.md)
