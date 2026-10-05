# Jev Chat Assistant 활용 예시 ② 새 채팅 앱 어댑터 추가

> Android 앱(클라이언트) 개발자 관점에서, 아직 지원하지 않는 채팅 앱을 어댑터 하나로 붙이는 과정과 그때 놓치기 쉬운 지점을 다룹니다.

이 프로젝트에서 "클라이언트"는 휴대폰에 설치되는 앱 그 자체입니다. 클라이언트 쪽에서 가장 자주 하는 확장 작업은 새 채팅 앱 지원이고, 커뮤니티 PR도 대부분 어댑터 추가입니다.

## 활용할 수 있는 기능

- **`ChatAppAdapter` 인터페이스**: 패키지 이름과 `extract(root, res)` 하나만 구현하면 됩니다.
- **세 갈래 반환 규약**: `null`(채팅 창 아님) / 빈 메시지(채팅 창이지만 본문 없음, OCR로 넘김) / 메시지 있음(정상).
- **공통 도우미**: 상단 액션 바에서 제목을 찾는 `findTitleInActionBar`, 시간 문자열 판별 등.
- **OCR 연계**: 트리에 본문이 없으면 `bubbleRects`에 말풍선 좌표를 담아 말풍선 단위 OCR을 받을 수 있습니다.
- **대화 바인딩과 안전한 입력**: 분석 결과와 입력창 쓰기가 원래 대화에만 적용되도록 서비스가 확인합니다.

---

## 실제 예제

가상의 메신저 `com.example.talk`를 지원한다고 가정합니다. 아래 리소스 id는 설명을 위한 예시이며, 실제 앱에서는 반드시 직접 덤프해서 확인해야 합니다.

### 1단계. 트리 덤프로 앱이 무엇을 노출하는지 확인

대상 앱의 대화 화면을 띄운 상태에서 PC에서 실행합니다.

```bash
adb shell uiautomator dump /sdcard/window.xml
adb pull /sdcard/window.xml
# 리소스 id와 텍스트만 훑어보기
grep -oE 'resource-id="[^"]*"|text="[^"]*"' window.xml | sort | uniq -c | sort -rn | head -40
```

여기서 확인할 것은 네 가지입니다.

| 확인 항목 | 왜 필요한가 |
|---|---|
| 메시지 본문 노드에 고정 id가 있는가 | 있으면 id로 본문만 골라내 시간·닉네임·시스템 안내를 자연스럽게 걸러 냄 |
| 본문이 `text`에 있는가, `content-desc`에 있는가, 아예 없는가 | X처럼 `content-desc`에 있거나, 飞书처럼 없어서 OCR이 필요한 경우가 있음 |
| "지금 대화 화면이다"를 증명할 노드가 무엇인가 | QQ·X는 앱 전체가 Activity 하나라 Activity 이름으로는 판단할 수 없음. 보통 입력창이 기준 |
| 발신자를 어떻게 구분하는가 | 좌우 위치, 아바타 열, "나" 라벨, 읽음 표시 등 앱마다 다름 |

### 2단계. 어댑터 작성

덤프 결과 본문은 `id/msg_text`, 제목은 `id/chat_title`, 입력창은 `id/input_box`이고, 내 말풍선은 오른쪽에 붙는다고 가정합니다.

```kotlin
// app/src/main/java/com/jev/probe/capture/ChatAppAdapter.kt 에 추가
class ExampleTalkAdapter : ChatAppAdapter {
    override val pkg = "com.example.talk"

    override fun extract(root: AccessibilityNodeInfo, res: Resources): ChatSnapshot? {
        val width = res.displayMetrics.widthPixels
        val bubbles = ArrayList<Triple<Int, Int, String>>() // top, centerX, text
        var title: String? = null
        var hasInput = false

        val stack = ArrayDeque<AccessibilityNodeInfo>().apply { addLast(root) }
        var guard = 0
        while (stack.isNotEmpty() && guard < 5000) { // 비정상적으로 큰 트리 방어
            guard++
            val node = stack.removeLast()
            val id = node.viewIdResourceName
            val text = node.text?.toString()
            when (id) {
                BUBBLE_ID -> if (!text.isNullOrBlank()) {
                    val b = Rect(); node.getBoundsInScreen(b)
                    bubbles.add(Triple(b.top, b.centerX(), text))
                }
                TITLE_ID -> if (title == null && !text.isNullOrBlank()) title = text
                INPUT_ID -> hasInput = true
            }
            for (i in node.childCount - 1 downTo 0) node.getChild(i)?.let { stack.addLast(it) }
        }

        if (!hasInput) return null                                  // 대화 화면이 아님
        if (bubbles.isEmpty()) return ChatSnapshot(title, emptyList()) // 대화 화면이지만 본문 없음
        bubbles.sortBy { it.first }
        val msgs = bubbles.map { (_, cx, t) -> Msg(if (cx > width / 2) "me" else "other", t) }
        return ChatSnapshot(title, msgs)
    }

    companion object {
        private const val BUBBLE_ID = "com.example.talk:id/msg_text"
        private const val TITLE_ID = "com.example.talk:id/chat_title"
        private const val INPUT_ID = "com.example.talk:id/input_box"
    }
}
```

### 3단계. 서비스에 등록

```kotlin
// ChatCaptureService.kt
private val adapters = listOf(
    QQAdapter(), XAdapter(), FeishuAdapter(), ExampleTalkAdapter()
).associateBy { it.pkg }
```

### 4단계. 입력창 채우기 경로 추가

README는 "어댑터를 등록하면 판단·후보·오버레이·입력은 손대지 않아도 된다"고 안내하지만, 2026-09-25에 병합된 대화 바인딩 수정 이후 `main` 기준으로는 **입력창 탐색이 앱별 화이트리스트**입니다. 등록만 하면 분석과 후보 표시는 되지만, 후보를 눌렀을 때 입력창에 쓰지 않고 클립보드 복사로 끝납니다.

```kotlin
// ChatCaptureService.inputFor(...) 안의 when 에 분기 추가
val input = when (token.target.pkg) {
    "com.tencent.mobileqq" -> root.findAccessibilityNodeInfosByViewId("com.tencent.mobileqq:id/input").firstOrNull()
    "com.ss.android.lark" -> root.findAccessibilityNodeInfosByViewId("com.ss.android.lark:id/kb_rich_text_content").firstOrNull()
    "com.twitter.android" -> findEditable(root)
    "com.example.talk" -> root.findAccessibilityNodeInfosByViewId("com.example.talk:id/input_box").firstOrNull()
    else -> null // 검증하지 않은 앱은 클립보드 복사만 허용
}
```

### 코드 설명

1. **반환값 세 갈래를 정확히 지킵니다.** 입력창이 없으면 `null`, 입력창은 있는데 본문을 못 찾으면 빈 목록입니다. 대화 목록 화면의 검색창 같은 편집 가능한 노드를 "대화 화면"으로 오인하면, 목록 화면에서 OCR이 계속 돌아가는 버그가 생깁니다(실제로 WeChat 어댑터에서 있었던 문제입니다).
2. **id로 본문만 골라냅니다.** 본문 id가 있으면 시간, 닉네임, "OOO님이 입장했습니다" 같은 안내 문구가 자동으로 빠집니다. id가 없는 앱이라면 X 어댑터처럼 클래스, 너비, 구분자 패턴을 조합해 걸러야 합니다.
3. **발신자 판단은 앱 구조에 맞춥니다.** 여기서는 중심 x좌표로 나눴지만, 긴 메시지는 중심이 화면 반대편으로 넘어갈 수 있습니다. QQ 어댑터가 "말풍선의 어느 가장자리가 아바타 열에 붙어 있는가"로 판단하는 이유입니다.
4. **`guard`로 순회 횟수를 제한합니다.** 접근성 이벤트는 초당 여러 번 들어오고 순회는 메인 스레드에서 일어납니다. 끝없는 트리 순회는 스크롤 끊김과 플로팅 버튼 소실로 이어집니다.
5. **입력창은 정확한 id로 찾습니다.** 화면의 아무 편집 가능한 노드나 쓰면 검색창이나 다른 입력란에 답장이 들어갈 수 있습니다. `findEditable`도 편집 가능한 노드가 둘 이상이면 포기하고 클립보드로 넘깁니다.

### 순수 로직은 따로 떼어 테스트

노드 트리는 단위 테스트에서 만들기 번거롭습니다. X 어댑터의 `content-desc` 파싱처럼 문자열 규칙이 있다면 순수 함수로 분리해 JVM 테스트로 확인하는 편이 좋습니다.

```kotlin
// app/src/test/java/com/jev/probe/capture/ExampleTalkParseTest.kt
package com.jev.probe.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ExampleTalkParseTest {
    // 예: "보낸이：본문。오후 3:20" 형태를 (보낸이, 본문)으로 나누는 순수 함수
    private fun parse(desc: String): Pair<String, String>? {
        val cut = desc.indexOf('：').takeIf { it > 0 } ?: return null
        val body = desc.substring(cut + 1).substringBeforeLast('。').trim()
        return desc.substring(0, cut).trim() to body
    }

    @Test fun splitsSenderAndBody() {
        assertEquals("민수" to "내일 봐요", parse("민수：내일 봐요。오후 3:20"))
    }

    @Test fun rejectsRowWithoutSeparator() {
        assertNull(parse("오늘"))
    }
}
```

저장소에는 이미 `ConversationSessionTest`, `GuardedInputWriterTest`가 같은 방식으로 기기 없이 실행되는 테스트로 들어가 있습니다.

---

## 실제 서비스에서는

> 사용자가 새로 지원한 메신저에서 대화방에 들어가면, 접근성 이벤트마다 어댑터가 트리를 순회해 최근 메시지를 만들고, 서명이 바뀌었고 마지막 메시지가 상대 것이면 800ms 뒤 분석이 시작됩니다. 사용자가 후보를 누르면 서비스는 "분석을 시작한 그 대화가 아직 화면에 있는지"를 패키지·창 id·제목·메시지 서명으로 다시 확인한 뒤, 3단계에서 등록한 입력창 id로만 글자를 씁니다.

어댑터 작업에서 실제로 시간을 많이 쓰는 곳은 코드가 아니라 **기기와 앱 버전별 차이**입니다.

- 앱 업데이트로 리소스 id가 바뀌면 어댑터가 조용히 `null`을 반환합니다. 기존 어댑터의 주석처럼 "어떤 버전, 어떤 기기, 어떤 해상도에서 검증했는지"를 남겨 두면 원인 추적이 빨라집니다.
- 시스템 언어에 따라 `content-desc`의 구분자와 시간 표기가 다릅니다. X 어댑터는 중국어 UI(`：`, `上午`/`下午`, `Read`)만 실기기 검증되었고 영어 UI는 대체 처리만 있습니다.
- 앱이 연결 중에 잠깐 띄우는 임시 제목("연결 중…")을 대화 제목으로 받아들이면 기록이 엉뚱한 연락처에 쌓입니다. 서비스에는 이런 임시 제목을 걸러 내는 목록이 있으므로, 새 앱에도 그런 문구가 있는지 확인합니다.
- 일부 앱은 접근성 서비스의 트리 읽기나 화면 캡처를 감지해 막거나 계정 제한을 걸 수 있습니다. WeChat이 그런 사례로, 이 프로젝트는 결국 WeChat 지원을 완전히 중단했습니다. 새 앱을 붙이기 전에 그 앱의 이용 약관과 자동화 정책을 먼저 확인하는 것이 좋습니다.

---

[← 활용 예시 ① 대화 분석과 지식베이스](03-usage-chat-analysis.md) · [목차](README.md) · [활용 예시 ③ 서버에서 판단 API 활용 →](05-usage-judge-api.md)
