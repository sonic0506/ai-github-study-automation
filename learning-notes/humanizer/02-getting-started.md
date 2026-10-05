# Humanizer 설치와 첫 사용

> 사용하는 에이전트별 설치 방법, 프로젝트 단위 설치, 가장 간단한 첫 실행, 설치할 때 자주 헷갈리는 부분을 다룹니다.

## 설치

Humanizer는 빌드나 의존성이 없는 Skill이므로, 설치는 "`SKILL.md`를 에이전트가 찾는 위치에 두는 것"입니다. 쓰는 에이전트에 맞는 방법 하나를 고르면 됩니다.

**방법 1. Claude Code 플러그인 (Claude Code 2.1.142 이상)**

```text
/plugin marketplace add blader/humanizer
/plugin install humanizer@humanizer
```

저장소 자체가 마켓플레이스(`.claude-plugin/marketplace.json`)이자 플러그인(`.claude-plugin/plugin.json`)입니다. `plugin.json`의 `"skills": ["./"]`가 저장소 루트의 `SKILL.md`를 가리킵니다. 플러그인으로 설치하면 명령 이름에 네임스페이스가 붙어 `/humanizer:humanizer`가 됩니다.

**방법 2. Skills CLI (Codex, 이전 버전 Claude Code, 기타 에이전트)**

```bash
# Codex
npx skills add blader/humanizer --global --agent codex

# Claude Code 2.1.142 미만
npx skills add blader/humanizer --global --agent claude-code
```

```bash
pnpm dlx skills add blader/humanizer --global --agent codex
```

`skills`는 Vercel Labs가 관리하는 범용 Skill 설치 CLI입니다. 저장소를 받아 각 에이전트의 Skill 폴더에 `SKILL.md`를 넣어 줍니다. 이 방법으로 설치하면 명령 이름은 `/humanizer`입니다.

**방법 3. Skills CLI가 지원하는 모든 에이전트에 한 번에**

```bash
npx skills add blader/humanizer --global --agent '*'
```

Gemini CLI, GitHub Copilot, Windsurf 등 Skills CLI가 아는 에이전트 전부에 설치됩니다. 실제로 쓰지 않는 에이전트에도 들어가므로, 보통은 쓰는 에이전트만 지정하는 편이 관리하기 쉽습니다.

**방법 4. Claude.ai와 Claude Desktop**

GitHub에서 **Code → Download ZIP**으로 저장소를 내려받아 설정의 Skill 업로드 화면에 올립니다. 2.11.2부터 저장소 안에 symlink가 없어서 GitHub가 만들어 주는 소스 ZIP을 그대로 올리면 됩니다. 예전 글에 나오는 별도 `humanizer-skill.zip` 릴리스 파일은 이제 쓰지 않습니다.

**방법 5. Skills CLI가 모르는 에이전트**

`SKILL.md` 한 파일을 그 에이전트의 Skill 폴더에 복사합니다. Humanizer의 기능은 이 파일 하나에 모두 들어 있습니다.

---

## 기본 설정

Humanizer에는 환경 변수나 설정 파일이 없습니다. 정할 것은 **설치 범위** 하나입니다.

```bash
# 전역 설치: 내 모든 프로젝트에서 사용
npx skills add blader/humanizer --global --agent claude-code

# 프로젝트 설치: --global을 빼면 현재 저장소에만 설치
npx skills add blader/humanizer --agent claude-code
```

프로젝트 설치는 팀 저장소에 Skill을 커밋해 팀원 모두가 같은 버전을 쓰게 할 때 유용합니다. 팀 단위로 쓰는 방법은 [활용 예시 ③ 팀 글쓰기 흐름에 넣기](05-usage-team-workflow.md)에서 다룹니다.

설치가 되었는지는 Skill 목록으로 확인합니다.

```bash
npx skills list
```

```text
/plugin list humanizer@humanizer
```

---

## 가장 간단한 예제

에이전트를 열고 다음을 입력합니다.

```text
/humanizer

오늘은 Next.js의 캐싱에 대해 깊이 알아보겠습니다. 지금부터 꼭 알아야 할 내용을 정리해 드립니다.
Next.js의 캐싱은 단순한 성능 최적화가 아니라, 애플리케이션 설계의 핵심입니다.
요청 메모이제이션, 데이터 캐시, 라우터 캐시가 함께 동작하며, 이는 빠르고 안정적이며 확장 가능한 앱을 만드는 열쇠입니다.
이것이 바로 캐싱을 제대로 알아야 하는 이유입니다.
```

1. **무엇을 생성하는가**: 에이전트가 `SKILL.md`를 읽고 이 텍스트에 대한 1차 초안, 아직 남은 패턴의 짧은 목록, 최종본을 만듭니다.
2. **어떤 값을 전달하는가**: `/humanizer` 뒤에 붙인 텍스트 전체가 편집 대상입니다. 샘플이나 파일 경로를 주지 않았으므로 붙여넣기 모드로 동작하고, 글의 종류(기술 설명)에 맞춰 중립적인 목소리를 고릅니다.
3. **Humanizer가 무엇을 처리하는가**: "깊이 알아보겠습니다 / 정리해 드립니다"(§4 뜸 들이기), "단순한 ~가 아니라 ~의 핵심"(§1, §3), "빠르고 안정적이며 확장 가능한"(§6 3개 나열), "이것이 바로 ~ 이유입니다"(§2 한 줄 마무리)를 표시합니다. 그다음 원문에 있던 사실(세 가지 캐시가 함께 동작한다)만 남기고 다시 씁니다.
4. **어떤 결과를 반환하는가**: 최종본은 대략 다음과 같은 모양이 됩니다.

```text
Next.js는 여러 층에서 데이터를 캐시합니다. 같은 렌더링 안의 중복 요청을 합치는 요청 메모이제이션,
서버 요청 사이에 결과를 보관하는 데이터 캐시, 브라우저에서 방문한 화면을 기억하는 라우터 캐시입니다.
```

같은 요청을 자연어로 해도 됩니다. `"이 글에서 AI 티 나는 부분 좀 고쳐줘: ..."`처럼 요청이 Skill 설명과 맞으면 에이전트가 Humanizer를 스스로 고릅니다. 다만 확실히 적용하고 싶을 때는 슬래시 명령이 안전합니다.

---

## 설치할 때 주의할 점

- **한 에이전트에는 한 가지 방법만 씁니다.** Claude Code에 플러그인과 Skills CLI를 모두 설치하면 `/humanizer`와 `/humanizer:humanizer` 두 개가 생기고, 업데이트할 때 한쪽만 갱신되어 버전이 갈릴 수 있습니다.
- **Claude Code 버전을 확인합니다.** 플러그인 방식은 2.1.142 이상이 필요합니다. 그보다 오래된 버전에서는 Skills CLI의 `--agent claude-code`를 씁니다.
- **명령 이름은 설치 방법에 따라 다릅니다.** 플러그인은 `/humanizer:humanizer`, Skills CLI와 수동 설치는 `/humanizer`입니다. 문서나 팀 가이드에 적을 때는 팀이 쓰는 방식 기준으로 적습니다.
- **Skill 파일은 하나만 있어야 합니다.** 수동으로 복사하다가 `humanizer/humanizer/SKILL.md`처럼 한 단계 더 들어가거나, 예전 `skills/humanizer/` symlink 구조를 함께 복사하면 에이전트가 찾지 못하거나 두 번 인식할 수 있습니다.
- **README의 설치 목록이 바뀌었습니다.** 3.1.0 README는 Cursor와 OpenCode 설치 안내를 뺐습니다. 저장소에 `.cursor-plugin/plugin.json`은 있지만, 이 두 에이전트에서 쓰는 방법은 README가 아니라 Skills CLI 지원 여부를 기준으로 확인하는 것이 좋습니다.

---

[← 핵심 개념과 동작 구조](01-core-concepts.md) · [목차](README.md) · [활용 예시 ① 블로그·공지 글 다듬기 →](03-usage-blog-post.md)
