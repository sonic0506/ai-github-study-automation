# Hypit 활용 예시 ② SVML 직접 작성

> 에이전트에게 모두 맡기지 않고 개발자가 SVML·SVS를 직접 읽고 고치는 관점에서, 자막 연출을 다듬는 방법과 생성 모델 없이 코드만으로 영상을 만드는 방법을 다룹니다.

Hypit은 브라우저나 앱에서 import하는 클라이언트 라이브러리가 아니므로, 여기서는 "에이전트가 만든 소스를 사람이 직접 다루는 로컬 작업"을 클라이언트 관점으로 봅니다. 에이전트가 작성한 SVML도 결국 평범한 텍스트이기 때문에, 구조를 이해하면 작은 수정은 직접 하는 편이 빠르고 비용도 들지 않습니다.

## 활용할 수 있는 기능

| 기능 | 명령 / 요소 | 용도 |
|---|---|---|
| 어휘 확인 | `hypit vocabulary` | 설치된 패키지가 제공하는 요소·속성·출력 이름 확인 (빈 프로젝트에서도 번들 패키지 표시) |
| 정적 검증 | `hypit check <file.svml>` | import, 타입, 그래프 간선 검증. 외부 호출 없음 |
| 대사 길이 측정 | `hypit measure main.svml --segment hook --language ko --pace normal` | 생성 요청 전에 테이크 길이(초) 추정 |
| 실행 계획 | `hypit plan <file.svrun>` | 이번 Run이 실제로 실행할 작업과 외부 요청 목록 |
| 미리보기·편집 | `hypit studio --run <file.svrun>` | 브라우저에서 타임라인 확인, 지원되는 속성 편집, `#comments`로 시점별 피드백 |
| 자막 | `@hypit/caption-fine@1` | 카라오케 강조, 화자별 스타일, 구간별 스타일 교체 |
| 오버레이 | `@hypit/media-track@1`, `@hypit/typography-track@1`, `@hypit/screen-overlay@1` | B-roll, 텍스트, 플래시·비네트 같은 화면 효과 |

## 실제 예제 1. 자막 연출 다듬기

에이전트가 만든 팟캐스트 클립의 자막을 다음처럼 바꾸고 싶다고 가정합니다.

- 기본 자막은 흰색, 말하는 단어만 노란 박스로 강조(카라오케)
- 코치와 학생의 자막 색을 다르게
- 제품을 소개하는 구간에서는 자막을 화면 위쪽으로 이동
- "음..." 같은 군말은 소리로는 남기고 자막에서는 숨김

**Script 수정** (대사 원문은 그대로 두고 표시만 조정)

```svml
<script id="story">
  <handoff>
    <COACH> < | 음>@{product}이거 하나만 먹어.@{/product} ||
            비타민D{keyword}랑 마그네슘이 같이 들었어.
    <STUDENT> 진짜 이것만 먹으면 돼?
  </handoff>
</script>
```

**스타일 정의** (`recipes/visual.svs`)

```svs
<?svml using="@hypit/svs@1"?>

<sheet version="1">
  caption.base {
    stack-order: 70; x: 0.08; y: 0.74; width: 0.84;
    size: 60; line-height: 1; align: center;
    fill: #FFFFFF; background: #09090BCC; padding: 16 24; radius: 18;
    karaoke: current; karaoke-transition: step;
    active-box: current;
  }
  caption.coach   { stack-order: 70; x: 0.08; y: 0.74; width: 0.84; size: 60; align: center; fill: #73FBD3; }
  caption.student { stack-order: 70; x: 0.08; y: 0.74; width: 0.84; size: 60; align: center; fill: #FFD166; }
  caption.top     { stack-order: 70; x: 0.08; y: 0.12; width: 0.84; size: 60; align: center; fill: #FFFFFF; }
</sheet>
```

**자막 Track** (`authors/main.svml`)

```svml
<import as="fonts" from="@hypit/fonts-open@1"/>
<import as="caption-fine" from="@hypit/caption-fine@1"/>

<!-- 한국어 글리프가 있는 폰트를 Fallback으로 명시한다. 시스템 폰트로 대체되지 않는다 -->
<fonts:Stack id="caption-font" family="inter" weight="700" style="normal" emoji="color">
  <fonts:Fallback family="noto-sans-kr" weight="700" style="normal"/>
</fonts:Stack>

<caption-fine:Style id="base"    recipe={recipes.caption.base}    font={caption-font}/>
<caption-fine:Style id="coach"   recipe={recipes.caption.coach}   font={caption-font}/>
<caption-fine:Style id="student" recipe={recipes.caption.student} font={caption-font}/>
<caption-fine:Style id="top"     recipe={recipes.caption.top}     font={caption-font}/>

<caption-fine:Track id="captions" document={story.caption} timeline={speech.timeline}>
  <caption-fine:Use style={base}/>
  <caption-fine:Use role="COACH" style={coach}/>
  <caption-fine:Use role="STUDENT" style={student}/>
  <!-- 나중에 적은 Use가 그 구간 안에서 앞의 스타일을 덮어쓴다 -->
  <caption-fine:Use during={story.selection.product} style={top}/>
</caption-fine:Track>
```

수정 후에는 생성 작업 없이 검증과 미리보기만 합니다.

```bash
hypit check authors/main.svml
hypit studio --run runs/final.svrun     # 기존 테이크를 재사용하는 Run으로 연다
```

### 동작 설명

1. **`< | 음>`은 왼쪽(표시)이 비어 있는 Dual Text입니다.** "음"은 발음되고 정렬에도 쓰이지만 자막에는 나타나지 않습니다. 대사를 지우면 생성 프롬프트까지 바뀌지만, 이 방식은 자막만 바꿉니다.
2. **`{keyword}`는 단어 속성입니다.** 타이밍에는 영향을 주지 않고, 자막 패밀리가 그 단어를 다르게 칠할 때 역할 정보로 씁니다.
3. **Use는 위에서 아래로 겹쳐 적용됩니다.** 기본 스타일 → 화자별 스타일 → 구간별 스타일 순으로 덮어쓰고, `role`은 화자로, `during`은 시간으로 거릅니다.
4. **`||`가 자막 덩어리(Cue)를 끊습니다.** 줄바꿈은 소스의 개행이 아니라 Recipe의 레이아웃 규칙이 정합니다. Segment가 끝나는 곳도 자동으로 Cue 경계가 됩니다.

Studio의 타임라인에는 Segment, Word, Selection, Moment가 함께 표시됩니다. `product` 구간의 경계를 드래그하면 Studio가 **Script 안 마커 위치를 고쳐 씁니다.** 그래서 같은 Selection을 쓰는 자막·B-roll·효과가 모두 함께 움직입니다.

## 실제 예제 2. 생성 모델 없이 코드로만 만드는 영상

말하는 출연자 없이 텍스트와 그래픽만으로 8초짜리 공지 영상을 만듭니다. 생성 API를 호출하지 않으므로 HypiHub 계정이 없어도 로컬 렌더링만으로 완성됩니다.

```svml
<!-- notice.svml -->
<?svml using="@hypit/markup@1"?>

<svml>
  <import as="time" from="@hypit/timeline-author@1"/>
  <import as="space" from="@hypit/spatial@1"/>
  <import as="fonts" from="@hypit/fonts-open@1"/>
  <import as="text" from="@hypit/typography-track@1"/>
  <import as="film" from="@hypit/film@1"/>
  <import as="render" from="@hypit/render-hyperframes@1"/>
  <import as="recipes" source="./notice.svs"/>

  <!-- 테이크가 없는 Timeline: 길이를 직접 정한다 -->
  <time:Clock id="clock" frame-rate="30"/>
  <time:Timeline id="animation" clock={clock} end="8s"/>

  <space:Canvas id="vertical" width="1080" height="1920"/>
  <!-- right, bottom은 여백이 아니라 절대 위치. 가운데 80%는 left 10%, right 90% -->
  <space:Frame id="title-frame" within={vertical} left="10%" top="40%" right="90%" bottom="60%"/>

  <fonts:Stack id="title-font" family="inter" weight="900" style="normal">
    <fonts:Fallback family="noto-sans-kr" weight="900" style="normal"/>
  </fonts:Stack>
  <text:Style id="title-style" recipe={recipes.text.title} font={title-font}/>

  <text:Track id="titles" timeline={animation.timeline}>
    <text:Area id="headline" placement={title-frame} style={title-style} during="program">
      10월 정기 점검 안내
    </text:Area>
  </text:Track>

  <film:Film id="main" canvas={vertical} timeline={animation.timeline} appearance={recipes.film.vertical}>
    <film:Track source={titles.track}/>
  </film:Film>
  <render:Video id="final" composition={main.composition} timeline={animation.timeline}/>
</svml>
```

```svs
<?svml using="@hypit/svs@1"?>

<sheet version="1">
  film.vertical { background: #0B1020; }
  text.title {
    stack-order: 90; size: 88; align: center;
    fill: #FFFFFF; tracking: -1;
  }
</sheet>
```

`notice.svrun`은 `notice.svml`을 가리키고 Target이 `final.video`인 최소 Run입니다([핵심 개념](01-core-concepts.md#1-소스-세-가지-svml--svs--svrun)의 예제와 같은 형태).

```bash
hypit runtime up --endpoint media.local     # 로컬 렌더 준비
hypit check notice.svml
hypit build notice.svrun --follow
```

### 동작 설명

1. **Timeline에 테이크가 없으면 `end`가 필수입니다.** 빈 시간을 채우는 기본 영상은 만들어지지 않고, 배경은 Film Recipe의 `background` 색이 됩니다.
2. **오디오 Track이 없으면 무음 영상이 나옵니다.** 배경 음악이 필요하면 오디오 파일을 `media:Audio`로 선언하고 사운드 Track으로 Film에 추가합니다.
3. **폰트는 패키지에 포함된 정확한 파일로 렌더링됩니다.** 렌더링 머신의 시스템 폰트를 찾지 않으므로, 어느 컴퓨터에서 렌더링해도 같은 결과가 나옵니다. 대신 한국어처럼 기본 폰트에 없는 글자는 Fallback을 직접 지정해야 합니다.
4. **복잡한 애니메이션은 프로젝트 컴포넌트로 만듭니다.** 다이어그램이 움직이거나 채팅 말풍선이 하나씩 올라오는 장면은 HTML/CSS 기반 컴포넌트를 TypeScript로 작성해 프로젝트의 `packages/`에 둡니다. 이벤트 시점은 초·프레임으로 적어도 되고, 말하는 영상이라면 Script의 Moment를 받을 수도 있습니다.

## 실제 서비스에서는

> 마케터가 에이전트와 함께 만든 광고 클립을 Studio의 Comments 화면(`#comments`)에서 보면서 "7초 지점 제품 카드가 너무 늦게 나와요"라고 시점별 코멘트를 남깁니다. 코멘트는 프로젝트의 `FEEDBACK.json`에 저장되고, 에이전트는 그 파일을 읽어 `product` Selection의 시작 마커를 한 단어 앞으로 옮긴 뒤 기존 테이크를 재사용하는 Run으로 다시 렌더링합니다. 생성 모델 호출은 한 번도 일어나지 않고, 변경 내역은 Script 한 줄의 diff로 Git에 남습니다.

이 관점에서 Hypit의 가치는 **"영상 편집을 코드 리뷰처럼 다룰 수 있다"**는 데 있습니다. 자막 색, 등장 시점, 레이아웃 같은 결정이 모두 텍스트 diff로 남고, 렌더링은 결정적으로 재현됩니다. 반대로 비결정적인 생성 결과는 Build Result에 고정해 두고 재사용합니다. 다만 Studio에서 편집할 수 있는 속성의 범위는 각 컴포넌트의 Studio Companion이 정하므로, 모든 값이 화면에서 바로 수정되지는 않습니다.

---

[← 활용 예시 ① 참고 영상 복제와 변형](03-usage-video-clone.md) · [목차](README.md) · [활용 예시 ③ 팀·운영·실전 적용 →](05-usage-team-runtime.md)
