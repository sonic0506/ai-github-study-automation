# Jev Chat Assistant 설치와 첫 사용

> APK 설치, 판단 키 설정, 권한 세 가지, 판단 API를 직접 호출해 보는 가장 작은 예제, 소스 빌드, 설치할 때 자주 겪는 문제를 다룹니다.

## 설치

필요 조건은 **Android 11 이상, ARM64(`arm64-v8a`) 기기**입니다. iOS는 지원하지 않습니다.

**방법 1. 저장소의 서명된 release APK 설치(권장)**

저장소 `apk/` 폴더에 서명된 release 패키지가 있고, 이전 버전은 GitHub Releases에 있습니다. PC에 `adb`가 있다면 다음과 같이 설치합니다.

```bash
git clone https://github.com/jev-chat/jev-chat-jarvis.git
cd jev-chat-jarvis
adb install -r apk/jev-assistant-v1.4-release.apk
```

휴대폰 브라우저로 APK 파일을 직접 받아 설치해도 됩니다. 이 경우 "출처를 알 수 없는 앱 설치" 허용이 필요합니다.

**방법 2. 소스에서 빌드**

JDK 17과 Android SDK(platform 35, build-tools 35)가 필요합니다.

```bash
./gradlew assembleDebug
# 결과: app/build/outputs/apk/debug/app-debug.apk

# release 빌드는 저장소 밖에 둔 서명 설정 파일 경로를 환경 변수로 지정
JEV_KEYSTORE_PROPS=/path/to/jev-release.properties ./gradlew assembleRelease
```

`main` 브랜치에는 v1.4 이후의 변경(Vercel·OpenCode Zen 판단 프리셋, 대화 바인딩 수정 등)이 들어가 있습니다. 이 기능이 필요하면 직접 빌드해야 하고, 저장소의 APK는 v1.4 기준이라는 점을 기억해 둡니다.

---

## 기본 설정

### 1. 판단 키 넣기

앱 → 설정(设置) → "인터페이스(接口)"에는 카드가 세 장 있습니다.

| 카드 | 하는 일 | 비워 두면 |
|---|---|---|
| 판단 인터페이스(判断接口) | Jev에게 7개 판단 질문과 순위 질문을 보냄 | 필수. 키가 없으면 분석이 시작되지 않음 |
| 답장 인터페이스(回复接口) | OpenAI 호환 모델로 후보 3개 생성 | 판단 카드의 키를 물려받고, 주소·모델은 기본값(OpenRouter, `deepseek/deepseek-chat-v3.1`) 사용 |
| 시각 인터페이스(视觉接口) | 이미지 입력 모델 연결 테스트 | 답장 → 판단 순서로 키를 물려받음. 일상 분석 경로에서는 쓰지 않음 |

가장 간단한 설정은 **판단 카드에 OpenRouter API 키 하나만 넣는 것**입니다. 새로 설치하면 판단 경로 기본값이 OpenRouter이므로 나머지 두 카드는 비워 둬도 됩니다. 각 카드에는 연결 테스트 버튼이 따로 있습니다.

판단 카드의 프리셋은 다음과 같습니다(`main` 기준).

| 프리셋 | 기본 주소 | 기본 모델 | 실제 호출 경로 |
|---|---|---|---|
| OpenRouter (기본값) | `https://openrouter.ai/api` | `typesafe/jev-1.13` | `/alpha/decisions` |
| 博查 Jev | `https://jev.bocha.cn` | `bocha-jev-v1` | `/v1/systemone` |
| TypeSafe 직결 | `https://api.typesafe.ai` | `jev-latest` | `/v1/systemone` |
| Vercel | `https://ai-gateway.vercel.sh/typesafe` | `typesafe-ai/jev` | `/v1/systemone` |
| OpenCode Zen | `https://opencode.ai/zen` | `jev-1.13` | `/v1/systemone` |
| 사용자 지정 | 직접 입력 | 직접 입력 | 입력한 전체 URL 그대로 |

博查 Jev는 v1.4에서 추가되었고, Vercel과 OpenCode Zen은 아직 릴리스되지 않은 `main`에만 있습니다. 博查 Jev는 "기간 한정 무료"로 안내되지만 무료 기간은 바뀔 수 있으니 사용 전에 해당 서비스에서 직접 확인합니다.

### 2. 권한 세 가지 켜기

앱 첫 화면의 안내를 따라 다음을 켭니다.

1. **접근성**: 메시지를 읽고 입력창을 채우는 데 필요합니다.
2. **다른 앱 위에 표시**: 분석 오버레이를 띄우는 데 필요합니다.
3. **자동 시작 + 배터리 제한 해제**: 샤오미 / HyperOS에서는 사실상 필수입니다. 켜지 않으면 시스템이 백그라운드를 얼려 메시지를 못 읽습니다.

### 3. 분석 옵션 확인

설정의 분석 항목에서 다음을 정합니다.

- **관계 설명**: 기본값은 "상대는 나의 연인"이라는 중국어 문장입니다. 대화 상대 대부분이 동료라면 반드시 바꿉니다. 이 문장이 모든 판단의 전제가 됩니다.
- **자동 분석**: 켜면 상대가 보낸 메시지가 최신일 때 자동으로 분석하고, 끄면 플로팅 버튼을 눌렀을 때만 분석합니다.
- **대화 화이트리스트**: 지정한 제목이 포함된 대화에서만 동작하게 합니다. 비워 두면 지원 앱의 모든 대화가 대상입니다.

---

## 가장 간단한 예제

앱을 켜기 전에, 앱이 판단 경로로 보내는 요청을 직접 한 번 보내 보면 구조가 바로 이해됩니다. TypeSafe 직결 형식(`POST /v1/systemone`)으로 질문 두 개를 보냅니다.

```bash
curl -s https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<'EOF'
{
  "model": "jev-latest",
  "state": {
    "chat": {
      "relationship": "The other person is my team lead.",
      "messages": [
        { "from": "other", "text": "보고서 오늘 안에 되죠?" },
        { "from": "me", "text": "네 거의 다 했습니다" },
        { "from": "other", "text": "지난번처럼 밤 11시에 주면 곤란해요." }
      ],
      "latest_from": "other"
    }
  },
  "questions": {
    "literal_question": {
      "type": "noul",
      "instructions": "Is the other person's latest message meant purely literally, with no subtext?"
    },
    "best_action": {
      "type": "choice",
      "instructions": "What type of next action is best? Ignore timing. Choose only the action type.",
      "criteria": {
        "apologize": "Lead with a sincere apology for a real mistake already identified.",
        "give_commitment": "Give a concrete promise, deadline, or arrangement they asked for.",
        "explain": "Explain what happened or why.",
        "acknowledge": "Show you heard them, without new facts, an apology, or a plan."
      }
    }
  }
}
EOF
```

1. **무엇을 생성하는가**: 문장이 아니라 질문 ID별 답이 담긴 `answers` 객체를 돌려받습니다. `literal_question`은 `{"type":"noul","noul":0.2}`처럼 참일 확률이, `best_action`은 `{"type":"choice","choice":"give_commitment","probabilities":{...},"confidence":0.8}`처럼 선택과 확률이 옵니다(수치는 예시입니다).
2. **어떤 값을 전달하는가**: `state`에는 판단 대상 데이터(최근 메시지와 관계), `questions`에는 우리가 이름 붙인 질문들을 넣습니다. 질문 ID(`best_action` 등)는 모델 추론에 쓰이지 않고 응답의 키로만 쓰입니다.
3. **Jev가 무엇을 처리하는가**: `state`를 한 번 읽고 모든 질문을 서로 독립적으로, 병렬로 평가합니다. 질문을 늘려도 응답 시간이 거의 늘지 않는 이유입니다.
4. **어떤 결과를 반환하는가**: 응답에는 `answers` 외에 실제로 답한 모델의 버전 ID(`model`)와 토큰 사용량(`usage`)이 함께 옵니다. 앱은 이 값을 오버레이의 의도 문구, 위험 배지 색, 신뢰도 표시로 바꿉니다.

OpenRouter를 통해 같은 모델을 쓸 때는 주소가 `https://openrouter.ai/api/alpha/decisions`, 모델이 `typesafe/jev-1.13`이고 본문 구조는 같습니다. 앱 안에서는 이 차이를 판단 카드의 프리셋이 처리합니다.

이제 휴대폰에서 QQ나 X 다이렉트 메시지를 열고 상대가 보낸 메시지가 있는 대화로 들어가면, 약 1초 정도 뒤에 플로팅 버튼 색이 위험 등급에 맞게 바뀌고 패널에 판단과 후보 3개가 나타납니다. 후보를 누르면 입력창에 채워지고, "채웠습니다. 확인 후 직접 전송하세요"라는 안내가 뜹니다.

---

## 설치할 때 주의할 점

- **debug와 release를 섞어 설치하지 않습니다.** 서명이 달라 덮어쓰기 설치가 실패합니다. debug를 지우면 키와 설정도 함께 지워지므로 다시 입력해야 합니다.
- **업데이트 후 접근성을 껐다 켭니다.** v1.3에서 접근성 서비스의 스크린샷 기능이 추가되어, 서비스가 다시 연결되어야 캡처가 동작합니다. 업데이트 뒤 반응이 없으면 가장 먼저 이것을 확인합니다.
- **샤오미 / HyperOS는 재설치하면 오버레이 권한이 초기화됩니다.** 첫 화면 안내로 다시 켭니다.
- **영어 README와 실제 기본값이 다를 수 있습니다.** 영어 README에는 새 설치 기본값이 博查 Jev라고 적혀 있지만, 코드와 중국어 README·CHANGELOG 기준 새 설치의 판단 기본값은 OpenRouter입니다. v1.4 초기에 博查를 기본으로 넣었다가 되돌렸고, 키를 입력한 적 없이 博查로 자동 설정된 경우만 한 번 OpenRouter로 되돌리는 마이그레이션이 코드에 있습니다.
- **OpenRouter 키만으로 바로 되지 않을 수 있습니다.** OpenRouter 계정에 크레딧을 충전하지 않으면 Jev 호출이 거절된다는 사용자 보고가 있습니다. 연결 테스트에서 오류가 나면 오류 메시지의 HTTP 상태 코드부터 확인합니다(401은 키 문제, 422는 요청 형식 문제, 429·529는 혼잡).
- **ARM64가 아닌 기기와 에뮬레이터**: x86 에뮬레이터에는 ML Kit 네이티브 라이브러리가 포함되지 않아 설치나 OCR이 실패할 수 있습니다. 실기기에서 확인합니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 대화 분석과 지식베이스 →](03-usage-chat-analysis.md)
