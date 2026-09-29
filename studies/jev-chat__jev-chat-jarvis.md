---
repository: jev-chat/jev-chat-jarvis
url: https://github.com/jev-chat/jev-chat-jarvis
stars: 6886
studiedAt: 2026-09-29
status: draft
---

# jev-chat/jev-chat-jarvis

Jev 聊天助手는 Android 휴대폰에서 지금 보고 있는 채팅을 읽고, 상대의 의도를 판단한 뒤 답장 후보를 입력창에 채워 주는 대화 보조 앱입니다.
판단은 TypeSafe의 Jev 모델, 답장 초안은 별도 생성 모델이 맡고, 전송 버튼은 항상 사용자가 누릅니다.

## 01. 어떤 문제를 푸는가

대부분의 답장 도구는 모델에게 바로 답장 문장을 쓰게 합니다.
이 프로젝트는 먼저 판단 모델로 상대의 의도와 위험도를 정하고, 그 결과를 근거로 답장을 쓰게 하는 순서를 택합니다.

- 해결 대상 : 채팅 중 상대의 진짜 의도, 위험 등급, 바로 답해야 하는지를 파악하고 답장 후보를 받는 일[^s1]
- 비침투 방식 : hook, 패키지 변조, 앱 API·계정 호출, 데이터베이스 읽기를 하지 않고 시스템 접근성 서비스로 화면에 보이는 대화만 읽음[^s1]
- 전송 권한 : 답장은 입력창에 채우기만 하고 자동 전송하지 않음. 송금·홍바오·수금은 다루지 않음[^s1]
- 데이터 경계 : 분석 시 채팅 텍스트와 사용자가 켠 배경 정보만 사용자가 설정한 모델 서비스로 전송됨. 작성자는 중계 서버를 운영하지 않음[^s1][^s4]
- 공식 사이트는 chatjevs.com. Android v1.4, Windows v0.1.11, macOS v0.6.0을 안내하며 iOS는 지원하지 않음[^s5]
- 라이선스는 MIT, 기본 브랜치는 main, 주 언어는 Kotlin[^s2]
- 2026-09-21 생성, Star 6,886개, Fork 1,174개, 열린 이슈 28건 (2026-09-29 조회 기준, PR 포함 값)[^s2]

## 02. 핵심 구조

처리 흐름은 수집 → 판단 → 답장 → 입력의 네 단계입니다.
수집만 앱마다 다르고 나머지 단계는 공통으로 동작합니다.

- 수집 : 앱 하나당 어댑터 하나. 서비스가 전면 앱 패키지명으로 어댑터를 고르고, 어댑터는 현재 창을 「제목 + 메시지 목록」으로 바꿈[^s1]
- 판단 : Jev가 선택·점수·참/거짓만 답함. 모든 질문을 한 번의 요청으로 보내며 약 1초에 돌아온다고 함. 지식베이스가 맞으면 state에 `background` 와 `history` 가 실림[^s1]
- 답장 : 생성 모델이 후보 3개를 쓰고 Jev가 순위를 매김. 프롬프트가 지식베이스와 모순되는 사실을 만들지 않도록 요구함[^s1]
- 입력 : `ACTION_SET_TEXT` 로 채우고, 실패하면 클립보드 + `ACTION_PASTE` 로 대체함[^s1]
- Jev : TypeSafe의 첫 System One 모델. 텍스트 생성 대신 타입이 있는 답·확률·신뢰도를 돌려줌[^s6]
- Jev 질문 유형 : Choice(목록에서 선택), Score(기준 대비 점수), Noul(0–1 사이 참 여부). 모든 질문을 같은 state에 대해 병렬·독립으로 평가한다고 함[^s6]

어댑터 규약과 디렉터리는 README의 개발 안내에 정리되어 있습니다.

- 어댑터 추가 : `capture/ChatAppAdapter.kt` 에 `ChatAppAdapter` 를 구현하고 `capture/ChatCaptureService.kt` 의 `adapters` 에 한 줄 추가함. 판단·후보·오버레이·입력 코드는 건드리지 않음[^s1]
- 반환 규약 : `null` 은 채팅 창이 아님, 빈 메시지 목록은 채팅 창이지만 트리에 본문이 없음. 후자일 때만 OCR 대체 경로가 돎[^s1]
- 기존 어댑터 : QQ는 노드 id로 본문·제목을 찾고, X는 Compose 노드의 content-desc를 파싱하고, 飞书는 말풍선 사각형을 OCR함[^s1]
- 디렉터리 : `app/` (Kotlin, 전통 View), `capture/` (수집·`ocr/`), `jev/` (Jev 클라이언트·질문 세트), `overlay/`, `core/` (`core/kb/` 지식베이스), `tools/jev/` (질문 세트·보정 스크립트, Python), `apk/` (서명된 release 패키지)[^s1]

## 03. 주요 기능

- 판단 결과 : 상대의 진짜 의도, 위험 등급(1–9), 상대가 원하는 것, 바로 답해야 하는지, 최선의 행동을 한 번에 줌. 신뢰도 포함[^s1]
- 답장 후보 : 구어체 후보 3개를 쓰고 판단 모델이 「가장 적합」 순으로 정렬해 비율을 보여 줌. 오버레이에서 복사 또는 입력창 채우기[^s1]
- 지원 앱 : QQ Android(9.3.50 그룹 채팅 실측), X 다이렉트 메시지(12.25 중국어 UI 실측), 飞书(OCR 대체, 실기기 검증). 그 밖의 앱은 「截屏识别一次」 수동 OCR[^s1]
- 지식베이스 : 노트(제목·내용·태그·상시 포함)와 연락처(이름·별칭·관계·메모). 상시 노트는 항상, 나머지는 태그·제목이 대화 제목이나 최근 6개 메시지에 나올 때만 최대 5개 포함됨[^s1]
- 채팅 기록 : 「记录聊天历史（只存本机）」 옵션은 기본 꺼짐. 켜면 최근 N개(기본 30)를 싣고 화면에 이미 보인 부분은 뺌[^s1]
- 기록 보관 : 연락처당 최대 300개, 파일은 `filesDir/kb/logs/<연락처>.json`[^s4]
- 3개 인터페이스 : 판단·답장·시각 인터페이스의 주소·키·모델을 따로 설정함. 답장·시각을 비워 두면 판단 인터페이스 설정을 물려받음[^s1]
- 판단 인터페이스 프리셋 : OpenRouter, 博查 Jev, TypeSafe 직결, Vercel, OpenCode Zen, 사용자 지정. 답장 기본 모델은 `deepseek/deepseek-chat-v3.1`[^s1]
- 호환 프로토콜 : 博查 Jev, Vercel, OpenCode Zen 프리셋은 모두 TypeSafe와 같은 `POST /v1/systemone`, 요청 본문 `{model, state, questions}` 를 씀[^s3]
- OCR 대체 : 접근성 트리에 본문이 없으면 화면을 캡처해 ML Kit 중국어 오프라인 모델로 인식함. 이미지를 업로드하지 않고 Google 서비스가 필요 없음. 빈도 제한과 실패 백오프가 있음[^s1]
- 전송 데이터 : 판단·답장 인터페이스에는 현재 창 최근 10개 메시지와 방향, 관계 설명, 켜 둔 지식베이스·기록이 감. 시각 인터페이스는 설정 화면의 「测试视觉」 에서 1×1 흰색 테스트 이미지만 보냄[^s4]

## 04. 시작하기

Android 11 이상, ARM64(`arm64-v8a`) 기기만 지원합니다.[^s1]
저장소 `apk/` 에 서명된 release 패키지가 있고, 과거 버전은 Releases에서 받을 수 있습니다.[^s1]

```bash
# 저장소를 받은 뒤 release APK 설치
git clone https://github.com/jev-chat/jev-chat-jarvis.git
cd jev-chat-jarvis
adb install -r apk/jev-assistant-v1.4-release.apk
```

설치 후 설정은 다음 순서입니다.[^s1]

- 키 입력 : 앱 → 设置 → 「接口」 의 판단 인터페이스 칸에 OpenRouter API Key만 넣으면 나머지 두 칸은 이 키를 물려받음
- 권한 1 : 접근성 (1.3 이상으로 올린 뒤에는 접근성을 한 번 껐다 켜야 캡처 기능이 동작함)
- 권한 2 : 다른 앱 위에 표시 (분석 오버레이)
- 권한 3 : 자동 시작 + 절전 제한 해제 (샤오미 / HyperOS는 필수. 안 하면 백그라운드가 얼어 메시지를 못 읽음)

(debug 패키지를 설치한 적이 있으면 서명이 달라 먼저 삭제해야 하고, 삭제하면 키와 설정도 지워집니다.)

직접 빌드하려면 JDK 17과 Android SDK(platform 35 / build-tools 35)가 필요합니다.[^s1]

```bash
# debug 빌드 (결과: app/build/outputs/apk/debug/app-debug.apk)
./gradlew assembleDebug
# release 빌드 (저장소 밖 서명 properties 경로를 JEV_KEYSTORE_PROPS 로 지정)
./gradlew assembleRelease
```

새 채팅 앱을 붙일 때는 먼저 대상 앱이 접근성 트리에 무엇을 노출하는지 확인합니다.[^s1]

```bash
# 현재 화면의 UI 트리 덤프
adb shell uiautomator dump
```

## 05. 최근 변화

저장소가 2026-09-21에 만들어졌고, v1.0부터 v1.4까지 사흘 안에 나왔습니다.[^s2][^s3]

- v1.4 (2026-09-23)[^s3][^s7]
    - 판단 인터페이스에 「博查 Jev」 추가. 주소 `https://jev.bocha.cn`, 모델 `bocha-jev-v1` 자동 입력, 현재 기간 한정 무료
    - 지원 범위를 QQ / X / 飞书와 임의 앱의 「截屏识别一次」 로 조정
    - QQ / 飞书의 비채팅 화면(대화 목록 등)에서 플로팅 볼이 안 보이던 문제, 飞书 OCR 결과가 비었을 때 플로팅 볼이 안 보이던 문제 수정
- v1.3 (2026-09-22)[^s3][^s8]
    - 판단 / 답장 / 시각 3개 인터페이스를 따로 설정하고 각각 연결 테스트
    - 지식베이스 + 연관 문맥, OCR 대체 추가
    - 설치 패키지가 약 12 MB에서 약 25 MB로 늘고 arm64만 지원
- v1.2 (2026-09-21 CHANGELOG, GitHub Release는 2026-09-22 게시)[^s3][^s9]
    - X(Twitter) 다이렉트 메시지 지원. 중국어 UI만 검증
- 미출시 : 판단 인터페이스에 「Vercel」 (`https://ai-gateway.vercel.sh/typesafe`, `typesafe-ai/jev`)과 「OpenCode Zen」 (`https://opencode.ai/zen`, `jev-1.13`) 프리셋 추가. `jev-1.13` 은 출력 무료, 입력 $0.042/M이며 한 번 판단에 약 1000 입력 token이라고 함[^s3]

(v1.4 Release 본문은 博查 Jev가 첫 번째이고 새 설치의 기본값이라고 적었지만, CHANGELOG와 README는 두 번째 위치이고 새 설치 기본값은 OpenRouter라고 적습니다.)[^s1][^s3][^s7]

## 06. 커뮤니티에서 반복되는 주제

열린 이슈는 대부분 오버레이가 사라지는 문제와 기기별 호환성에 몰려 있습니다.
법적 문제를 지적하는 이슈도 있습니다.

- 오버레이 소실 : 「悬浮窗长时间消失，无法自动恢复」 (#20), 「悬浮窗」 (#28), 삼성 S26U에서 오버레이를 눌러도 반응이 없다는 이슈(#14), 荣耀 Magic7 MagicOS10 이슈(#37)[^s10]
- #20 댓글 : 백그라운드 상주·절전 해제 후에도 앱 전환 뒤 오버레이가 돌아오지 않아 접근성 설정을 다시 해야 했다는 보고. 메인테이너 답변은 확인되지 않음[^s14]
- 실기기 장시간 사용 보고(#18) : vivo V2156FA, Android 11, v1.3에서 7가지 문제를 정리함[^s12]
    - 캡처 중 접근성 서비스 호출이 메인 스레드를 막아 플로팅 볼이 13.4초 사라짐
    - 자기 패널 다시 그리기에 접근성 이벤트로 반응하는 자기 호출 루프
    - 1초 안에 트리 읽기 결과가 세 번 바뀌어 새 대화로 잘못 인식함
    - 메인 스레드 트리 순회로 목록 스크롤 중 터치가 먹지 않음
    - 메인테이너(eatmoreduck)는 v1.3→v1.4 변경과 열린 PR #22, #45, #48/#49와 겹쳐 현재 main에 깔끔히 적용할 수 없다고 답함
- Vercel 연동 오류(#17) : v1.3, Android 16에서 `https://ai-gateway.vercel.sh/v1/evaluate` 로 사용자 지정 요청 시 HTTP 400. 앱이 보내는 `"noul"` 을 Vercel 네이티브 엔드포인트가 받지 않음. 우회는 `https://ai-gateway.vercel.sh/typesafe/v1/systemone` 사용, 이후 내장 프리셋 추가 계획이 제시됨[^s11]
- 법률 문제(#31) : 상대방 동의 없이 상대의 채팅을 수집·분석하는 것은 개인정보 보호 규정 위반이라는 댓글이 이어짐. 확인한 범위에서 메인테이너 답변은 없음[^s13]
- 微信 관련 : 微信이 재시작된 뒤 캡처가 안 된다는 이슈(#52), 微信에서만 오버레이가 사라진다는 이슈(#36)가 열려 있음. README는 현재 버전에서 微信 Android 지원을 전면 중단했다고 밝힘[^s1][^s10]
- 기능 요청 : 캐릭터 설정·사용 장면·친밀도 추가(#15)[^s10]

## 07. 한계와 주의점

- 중국 ROM 백그라운드 동결 : 샤오미 / HyperOS는 상주·자동 시작·절전 해제를 모두 해도 프로세스를 죽일 수 있음. 채팅에서 다시 조작하면 복구된다고 함[^s1]
- 그룹 채팅 : 일대일로 분석하므로 「상대」와 관계 설정이 그룹 채팅에서 맞지 않음[^s1]
- 언어 : Jev의 주 학습 언어가 영어라 질문은 영어, 채팅 내용은 중국어로 둠. 실제 대화로 보정하기를 권함(`tools/jev/`)[^s1]
- X : 구분자 `：`, `上午 / 下午`, `Read` 는 중국어 UI 실측값. 영어 UI는 대체 처리만 있고 검증되지 않음[^s1]
- 지식베이스 검색 : 태그·제목 포함 여부로만 맞추며 의미 검색은 하지 않음[^s1]
- OCR : 시스템이 접근성 서비스의 캡처를 허용해야 함. `FLAG_SECURE` 창은 캡처 불가, 화면에 보이는 부분만 인식하고 오타가 있음[^s1]
- 패키지 크기 : README는 약 12 MB → 약 27 MB, CHANGELOG v1.3은 약 25 MB로 적어 값이 다름[^s1][^s3]
- 개인정보 : 이 앱은 「데이터 수집 0」 제품이 아니며, 보고 있는 채팅 텍스트를 제3자 모델 인터페이스로 보냄. 서비스 제공자의 처리 방식은 각 정책을 따름[^s4]
- 이용 조건 : QQ, X, 飞书 등의 이용 약관과 현지 법규를 지켜야 한다고 명시함[^s1]
- 브랜딩 : MIT로 상업 이용이 가능하지만 LICENSE와 NOTICE를 유지하고 출처를 적어야 하며, 「Jev 聊天助手」 「jev-chat」 이름이나 chatjevs.com 도메인으로 원작자 출품을 암시하면 안 됨[^s1]

## 08. 더 알아볼 것

- 위험 등급 범위가 README는 1–9, 공식 사이트는 0–9로 다릅니다. 실제 코드의 범위는 확인하지 못했습니다.[^s1][^s5]
- v1.4에서 새 설치의 판단 인터페이스 기본값이 OpenRouter인지 博查 Jev인지 문서끼리 다르며, 코드로 확인하지 못했습니다.
- 「약 1초」 판단 응답 시간은 README의 설명이며, TypeSafe 문서에는 구체적인 지연 수치가 없었습니다.[^s6]
- `jev/` 의 질문 세트 내용과 `tools/jev/` 보정 스크립트 사용법은 확인하지 못했습니다.
- 열린 PR #22, #45, #48/#49의 내용과 병합 여부는 확인하지 못했습니다.
- API의 열린 이슈 수(28건)는 PR을 포함한 값이며, 이슈 목록 페이지에는 19건이 표시되었습니다. Issues API는 403으로 조회하지 못했습니다.[^s2][^s10]
- Windows(`jev-chat-windows`)와 macOS(`jev-chat-jarvis-mac`) 저장소는 이번 조사 범위에 넣지 않았습니다.
- Star는 리포트 기준(2026-09-24) 5,206개, 24시간 증가 +1,525였고, 09-26에 6,504개, 조사 시점(2026-09-29) API 값은 6,886개로 리포트 대비 1,680개 많습니다.

## 참고 자료

- [Jev 聊天助手 README (main)](https://github.com/jev-chat/jev-chat-jarvis/blob/main/README.md) (readme)
- [Repository 메타데이터 (GitHub API)](https://api.github.com/repos/jev-chat/jev-chat-jarvis) (code)
- [CHANGELOG.md](https://github.com/jev-chat/jev-chat-jarvis/blob/main/CHANGELOG.md) (docs)
- [PRIVACY.md](https://github.com/jev-chat/jev-chat-jarvis/blob/main/PRIVACY.md) (docs)
- [Jev 聊天助手 공식 사이트](https://chatjevs.com) (website)
- [TypeSafe Docs (Jev)](https://docs.typesafe.ai/) (docs)
- [Release v1.4](https://github.com/jev-chat/jev-chat-jarvis/releases/tag/v1.4) (release)
- [Release v1.3](https://github.com/jev-chat/jev-chat-jarvis/releases/tag/v1.3) (release)
- [Release v1.2](https://github.com/jev-chat/jev-chat-jarvis/releases/tag/v1.2) (release)
- [열린 Issues](https://github.com/jev-chat/jev-chat-jarvis/issues) (issues)
- [Issue #17: 判断接口(Jev) 自定义模式下请求 Vercel AI Gateway 报错](https://github.com/jev-chat/jev-chat-jarvis/issues/17) (issues)
- [Issue #18: 真机持续使用发现的悬浮窗/自动行为问题与修复补丁](https://github.com/jev-chat/jev-chat-jarvis/issues/18) (issues)
- [Issue #31: 作者希望能对接一下法律法规，感觉很擦边了](https://github.com/jev-chat/jev-chat-jarvis/issues/31) (issues)
- [Issue #20: 悬浮窗长时间消失，无法自动恢复](https://github.com/jev-chat/jev-chat-jarvis/issues/20) (issues)

[^s1]: [Jev 聊天助手 README (main)](https://github.com/jev-chat/jev-chat-jarvis/blob/main/README.md)
[^s2]: [Repository 메타데이터 (GitHub API)](https://api.github.com/repos/jev-chat/jev-chat-jarvis)
[^s3]: [CHANGELOG.md](https://github.com/jev-chat/jev-chat-jarvis/blob/main/CHANGELOG.md)
[^s4]: [PRIVACY.md](https://github.com/jev-chat/jev-chat-jarvis/blob/main/PRIVACY.md)
[^s5]: [Jev 聊天助手 공식 사이트](https://chatjevs.com)
[^s6]: [TypeSafe Docs (Jev)](https://docs.typesafe.ai/)
[^s7]: [Release v1.4](https://github.com/jev-chat/jev-chat-jarvis/releases/tag/v1.4)
[^s8]: [Release v1.3](https://github.com/jev-chat/jev-chat-jarvis/releases/tag/v1.3)
[^s9]: [Release v1.2](https://github.com/jev-chat/jev-chat-jarvis/releases/tag/v1.2)
[^s10]: [열린 Issues](https://github.com/jev-chat/jev-chat-jarvis/issues)
[^s11]: [Issue #17: 判断接口(Jev) 自定义模式下请求 Vercel AI Gateway 报错](https://github.com/jev-chat/jev-chat-jarvis/issues/17)
[^s12]: [Issue #18: 真机持续使用发现的悬浮窗/自动行为问题与修复补丁](https://github.com/jev-chat/jev-chat-jarvis/issues/18)
[^s13]: [Issue #31: 作者希望能对接一下法律法规，感觉很擦边了](https://github.com/jev-chat/jev-chat-jarvis/issues/31)
[^s14]: [Issue #20: 悬浮窗长时间消失，无法自动恢复](https://github.com/jev-chat/jev-chat-jarvis/issues/20)
