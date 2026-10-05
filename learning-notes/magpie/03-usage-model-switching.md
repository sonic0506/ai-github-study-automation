# magpie 활용 예시 ① 에이전트별 모델 전환과 비용 관리

> 회사·개인 설정을 Profile로 오가고, Claude Code의 보조 작업만 저렴한 모델로 돌리고, 리셀러(relay)의 실제 가격으로 비용을 계산하는 과정을 다룹니다.

## 예제 1. 회사 설정과 개인 설정을 한 번에 바꾸기

### 요구사항

> 낮에는 회사 Anthropic API 키로 Claude Code를, 회사가 계약한 LLM 리셀러(relay)로 Codex를 쓴다. 밤에는 개인 ChatGPT 구독으로 Codex를, 개인 DeepSeek 키로 Claude Code를 쓴다. 매번 설정 파일 두 개를 고치지 않고 한 번에 바꾸고 싶다. 회사 키가 개인 작업에 쓰이면 안 된다.

### 구현

먼저 공급자를 모두 등록합니다. 회사 리셀러처럼 Preset에 없는 곳은 이름과 base URL로 추가합니다.

```bash
magpie provider add anthropic sk-ant-...                     # 회사 Anthropic 키
magpie provider add "Corp Relay" \
  url=https://llm-relay.corp.example.com/v1 \
  key=sk-corp-... models=gpt-5.5 id=corp-relay               # 회사 리셀러
magpie provider add deepseek sk-...                          # 개인 DeepSeek 키
# 개인 ChatGPT 구독은 Codex에 로그인되어 있으면 codex/ 공급자로 이미 보인다
```

회사 설정을 만들고 Profile로 저장합니다.

```bash
magpie claude anthropic/claude-sonnet-5
magpie codex corp-relay/gpt-5.5
magpie codex effort medium
magpie save work
```

개인 설정도 같은 방식으로 저장합니다.

```bash
magpie claude deepseek/deepseek-chat
magpie codex codex/gpt-5.5
magpie codex effort high
magpie save personal
```

이제 전환은 한 줄입니다.

```bash
magpie use work        # 출근
magpie use personal    # 퇴근
magpie profiles        # 저장된 Profile 목록
```

앱에서는 화면 아래쪽의 Profile 칩을 클릭하면 같은 일이 일어나고, *+ save current*로 현재 상태를 저장합니다.

### 실행 흐름

```text
개발자: magpie use personal
 ↓
magpie: profiles.json에서 "personal" 읽기
 ↓
Claude Code: settings.json의 model · env 키만 수정 (주석·다른 설정 보존)
Codex: config.toml의 model · effort · 공급자 키만 수정
 ↓
개발자: 각 에이전트 새 세션 시작 (Codex는 재시작)
 ↓
Gateway: deepseek/ · codex/ 요청을 각 공급자로 전달, 회사 키는 사용되지 않음
```

### 코드 설명

1. **공급자 키는 Profile에 들어가지 않습니다.** Profile은 "어떤 에이전트가 어떤 `provider/model`을 쓰는가"만 저장합니다. 키는 `providers.json` 한곳에만 있으므로, Profile을 바꿔도 키가 섞이지 않습니다.
2. **모델 이름에 공급자가 들어갑니다.** `corp-relay/gpt-5.5`와 `codex/gpt-5.5`는 같은 모델이라도 다른 경로입니다. 이름만 보고 어느 계정으로 비용이 나가는지 알 수 있습니다.
3. **effort도 Profile에 포함됩니다.** 회사에서는 비용을 위해 `medium`, 개인 구독에서는 `high`처럼 reasoning 강도까지 함께 바꿉니다.

### 왜 이렇게 사용하는가?

설정 파일을 손으로 바꾸면 "회사 키를 개인 프로젝트에 쓰는" 실수가 생기기 쉽고, 되돌릴 때 원래 값을 잊기도 합니다. Profile은 **에이전트 전체 상태를 하나의 이름으로 다루게** 해 줍니다. 에이전트가 하나 늘어나도 Profile만 다시 저장하면 됩니다.

---

## 예제 2. Claude Code의 보조 작업만 저렴한 모델로

### 요구사항

> Claude Code의 메인 대화는 Claude Sonnet으로 유지하고 싶다. 하지만 파일 요약, 제목 생성 같은 가벼운 보조 호출(haiku 계층)까지 비싼 모델이 처리할 필요는 없다. 보조 작업만 DeepSeek의 빠른 모델로 돌려 비용을 줄이고 싶다.

### 구현

```bash
magpie claude anthropic/claude-sonnet-5            # 메인 모델
magpie claude haiku deepseek/deepseek-v4-flash      # haiku 계층만 따로
magpie claude                                       # 현재 설정 확인
```

haiku 계층을 다시 메인 모델에 따르게 하려면 빈 값을 줍니다.

```bash
magpie claude haiku ""
```

### 실행 흐름

```text
Claude Code: 메인 대화 → model = anthropic/claude-sonnet-5 → Gateway → Anthropic (통과)
Claude Code: 보조 호출 → haiku 계층 모델 = deepseek/deepseek-v4-flash → Gateway → DeepSeek
 ↓
magpie usage: 같은 세션 안에서도 모델별로 토큰·비용이 나뉘어 기록
```

### 코드 설명

1. **Claude Code는 계층별 모델 변수를 가집니다.** magpie는 `settings.json`의 `env` 블록에 계층별 모델을 따로 씁니다. 메인 모델을 바꾸면, 메인을 따라가던 계층은 같이 바뀌고 따로 지정한 계층은 그대로 유지됩니다.
2. **계층마다 공급자가 달라도 됩니다.** 모든 요청이 게이트웨이를 거치므로, 한 에이전트 안에서 메인은 Anthropic, 보조는 DeepSeek처럼 섞을 수 있습니다.

### 왜 이렇게 사용하는가?

에이전트의 보조 호출은 횟수가 많아서, 단가가 낮아도 합치면 비용이 큽니다. 품질이 중요한 메인 대화는 그대로 두고 **보조 호출만 바꾸면 체감 품질은 유지하면서 비용을 줄일 수 있습니다.** 실제로 줄었는지는 아래 예제 3의 사용량 장부로 확인합니다.

---

## 예제 3. 리셀러의 실제 가격으로 비용 보기

### 요구사항

> 회사 리셀러는 GPT 모델을 정가의 20% 할인으로 판다. 그런데 `magpie usage`의 비용은 정가 기준으로 나온다. 실제 청구 금액에 가까운 숫자로 에이전트별 비용을 보고 싶다.

### 구현

```bash
# 현재 어떤 가격으로 계산되고 있는지, 그 가격이 어디서 왔는지
magpie model price corp-relay/gpt-5.5

# input, output, cache read, cache write (USD / 100만 토큰)
magpie model price corp-relay/gpt-5.5 1.00,8.00,0.10,0

# 그 공급자의 모든 모델에 같은 규칙을 주려면 <provider>/* 형식을 쓴다
magpie model prices                    # 직접 지정한 가격 목록

magpie usage 7d                        # 에이전트·모델·계정별 토큰과 비용
magpie usage --csv 30d > usage.csv     # 요청 단위 CSV
```

### 실행 흐름

```text
요청 발생 → 사용량 장부에 토큰 수(입력·출력·캐시 읽기·캐시 쓰기·reasoning) 기록
 ↓
magpie usage 실행 (읽는 시점에 가격 적용)
 ↓
가격 찾기 순서:
  1. 이 모델에 지정한 가격 (corp-relay/gpt-5.5)
  2. 공급자 전체 가격 (corp-relay/*)
  3. 공급자 자체 카탈로그의 가격
  4. models.dev의 모델 제작사 정가
 ↓
에이전트 · 모델 · 계정별 추정 비용 출력
```

### 코드 설명

1. **가격 네 개를 모두 받습니다.** 하나라도 빠지면 그 부분의 비용이 0으로 계산되어 전체가 과소 추정되기 때문입니다. `0`은 "무료"라는 가격이고, 가격이 없다는 뜻이 아닙니다.
2. **가격은 "공급자 하나의 요금"입니다.** 같은 모델이라도 공급자가 다르면 가격도 따로 갖습니다. 그래서 `corp-relay/gpt-5.5`의 가격을 바꿔도 `openai/gpt-5.5`의 가격은 그대로입니다.
3. **읽을 때 다시 계산합니다.** 장부에는 토큰 수만 저장되고 가격은 조회할 때 적용되므로, 가격을 바꾸면 과거 기록의 비용도 다시 계산됩니다. 결과는 청구 금액이 아니라 **추정치**입니다.

### 왜 이렇게 사용하는가?

리셀러나 할인 요금제를 쓰면 정가 기준 비용은 실제와 크게 다릅니다. 가격을 공급자 단위로 지정해 두면 "보조 작업을 DeepSeek으로 돌린 뒤 비용이 얼마나 줄었는가" 같은 질문에 실제에 가까운 숫자로 답할 수 있습니다. 구독 공급자의 비용은 같은 양을 API로 썼을 때의 환산값이므로, 구독료와 직접 비교할 때는 이 점을 감안해야 합니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② 내 코드에서 게이트웨이 쓰기 →](04-usage-gateway-clients.md)
