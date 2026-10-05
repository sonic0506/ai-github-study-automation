# Hypit 활용 예시 ① 참고 영상 복제와 변형

> 잘 된 숏폼 광고 하나를 참고 영상으로 넣어 우리 제품 버전으로 복제하고, 승인된 소재를 재사용해 훅만 다른 변형을 싸게 만드는 과정을 다룹니다.

## 예제 1. 참고 영상을 우리 제품 버전으로 복제하기

### 요구사항

> 팟캐스트 형식의 크레아틴 광고 숏폼(약 18초)이 반응이 좋았다. 같은 구성(두 사람의 대화, 화자별 자막, 제품을 건네는 순간, 라이프스타일 몽타주)을 유지하면서 우리 브랜드의 비타민 제품으로 바꾸고, 한국어로 만들고 싶다. 생성 비용은 영상 한 편당 3달러 이내로 한다.

### 구현

에이전트에게 참고 영상, 제품 사진, 목표를 함께 전달합니다.

```text
/hypit 이 영상을 참고해 줘: ./refs/creatine-podcast.mp4
제품 사진은 ./assets/vitamin-bottle.png 이야.
두 사람이 대화하는 팟캐스트 구성과 제품을 건네는 장면은 유지하고,
크레아틴 대신 우리 비타민 제품으로 바꿔서 한국어로 만들어 줘.
HypiHub 계정을 쓰고, 생성 비용은 3달러 이내로 해 줘.
```

에이전트는 Skill의 절차에 따라 먼저 참고 영상을 "이해"합니다. 음성이 있는 영상이므로 단어 단위 대본을 먼저 뽑습니다.

```bash
hypit transcribe refs/creatine-podcast.mp4 --language en \
  --to references/creatine-podcast/transcript.json
```

그다음 대본과 프레임 그리드를 함께 보며 "무엇이 시선을 붙잡는가"를 기록합니다. 이 내용은 대화가 끝나도 남도록 프로젝트 파일에 저장됩니다.

```text
creatine-ad/
├── references/creatine-podcast/
│   ├── source.mp4
│   ├── transcript.json        # 단어 단위 전사 (증거)
│   ├── ANALYSIS.md            # 전체 구조와 왜 먹히는지에 대한 해석
│   └── TIMELINE.md            # 어떤 단어에서 무엇이 등장·퇴장하는지
├── productions/vitamin-ko/
│   ├── BRIEF.md               # 사용자 목표, 바꿀 것, 합의한 예산
│   ├── TREATMENT.md           # 에이전트의 연출안
│   ├── PROGRESS.md            # 현재 진행 상황, 활성 Build id
│   ├── authors/main.svml
│   ├── recipes/visual.svs
│   └── runs/reference.svrun
├── assets/vitamin-bottle.png
├── hypit.runtime.json
└── package.json
```

연출안이 정해지면 에이전트는 SVML을 작성합니다. 복제의 핵심은 **참고 영상의 "단어와 화면의 관계"를 새 대사에 옮기는 것**입니다. 예를 들어 참고 영상에서 제품이 "creatine"이라는 단어에 맞춰 등장했다면, 새 Script에서는 같은 역할을 하는 문장에 앵커를 둡니다.

```svml
<!-- productions/vitamin-ko/authors/main.svml (발췌) -->
<script id="story">
  <hook>
    <COACH> 너 요즘 왜 이렇게 피곤해 보여? || @{problem}매일 야근에 커피만 마시지?@{/problem}
  </hook>
  <handoff>
    <COACH> @{product}이거 하나만 먹어.@{/product} || <비타민D | 비타민 디>랑 마그네슘이 같이 들었어.
    <STUDENT> 진짜 이것만 먹으면 돼?
  </handoff>
  <payoff>
    <STUDENT> @{montage}한 달 뒤, 아침이 달라졌어.@{/montage}
  </payoff>
</script>

<media:Image id="bottle" src="../../../assets/vitamin-bottle.png"/>
<!-- 제품 사진을 참조 이미지로 넘겨 출연자가 실제 병을 건네는 테이크를 생성 -->
<seedance:ReferenceVideo id="handoff-take" model="mini"
  prompt={handoff-direction} duration="6" generate-audio="true">
  <seedance:Reference image={coach-portrait.image} person-reference="true"/>
  <seedance:Reference image={bottle} person-reference="false"/>
</seedance:ReferenceVideo>

<!-- 제품 클로즈업은 "이거 하나만 먹어"라고 말하는 구간에 맞춰 등장 -->
<media-track:Track id="product-card" timeline={speech.timeline} canvas={vertical}>
  <media-track:Item image={bottle} during={story.selection.product}
    frame={card-frame} appearance={recipes.media.card} motion={recipes.motion.card}/>
</media-track:Track>
```

에이전트는 생성 전에 비용을 확인하고 사용자와 합의합니다.

```bash
hypit plan productions/vitamin-ko/runs/reference.svrun
hypit pricing productions/vitamin-ko/runs/reference.svrun
```

```text
# 대화 예시 (모델 구성과 금액은 설명을 위한 가정입니다)
에이전트: HypiHub 계정으로 GPT Image 2 이미지 3장, Seedance 2 Mini 720p 테이크 4개(총 22초),
WhisperX 정렬 4회를 요청합니다. 공개 요금 기준 약 1.3달러이며, 테이크 길이가 확정되기 전이라
정렬 비용은 추정치입니다. 이 범위로 진행할까요?
사용자: 좋아, 진행해.
```

합의가 끝나면 Build를 제출합니다.

```bash
hypit build productions/vitamin-ko/runs/reference.svrun --title vitamin-v1 --follow
```

### 실행 흐름

```text
사용자: /hypit + 참고 영상 + 제품 사진 + 목표
 ↓
에이전트: transcribe → 프레임 그리드 확인 → ANALYSIS.md, TIMELINE.md 기록
 ↓
에이전트: BRIEF.md(목표·예산), TREATMENT.md(연출안) 작성 → 사용자에게 방향 설명
 ↓
에이전트: Script·프롬프트·컴포넌트를 main.svml로 작성 → hypit check
 ↓
에이전트: hypit plan · pricing → 사용자 예산 승인
 ↓
Worker: 출연자 이미지 생성 → 테이크 생성(제품 참조) → 정규화 → WhisperX 정렬
 ↓
Worker: Timeline 조립 → 자막·제품 카드·몽타주 Track 계산 → Film 합성 → HyperFrames 렌더
 ↓
에이전트: 결과 영상을 직접 보고 검수 → Studio Comments 링크 전달
```

### 코드 설명

1. **참고 영상의 대사를 그대로 번역하지 않습니다.** Skill은 에이전트에게 컷, 그림, 등장, 소리가 "무엇에 반응하는지"를 찾아 새 대사와 의도에 맞게 다시 만들라고 지시합니다. 그래서 `problem`, `product`, `montage` 같은 앵커 이름이 연출 의도를 그대로 드러냅니다.
2. **Dual Text로 표기와 발음을 나눕니다.** 자막에는 "비타민D"가, 음성 생성에는 "비타민 디"가 들어가서 TTS가 이상하게 읽는 일을 줄입니다.
3. **`person-reference`를 반드시 적습니다.** 0.2.8부터 Seedance의 모든 이미지·영상 참조는 이 값이 필요하고, 없으면 생성 전에 실패합니다. 사람 얼굴 참조는 `true`, 제품 사진은 `false`입니다.
4. **비용 합의가 절차에 들어 있습니다.** `pricing`은 요금을 읽을 뿐 승인하지 않습니다. 로그인 성공이나 잔액도 승인이 아닙니다. 사용자가 계정·범위·예산에 동의한 내용은 `BRIEF.md`에 기록되고, 그 범위를 넘는 변경은 다시 묻습니다.

### 왜 이렇게 사용하는가?

참고 영상을 "비슷하게 만들어 줘"라고만 하면 겉모습은 닮았지만 왜 그 영상이 먹혔는지는 놓치기 쉽습니다. Hypit의 흐름은 **분석(ANALYSIS) → 목표(BRIEF) → 연출안(TREATMENT) → 소스(SVML)**를 파일로 남기기 때문에, 사람이 중간에 방향을 확인할 수 있고 다음 대화나 다른 팀원이 작업을 이어받을 수 있습니다. 결과물은 MP4가 아니라 다시 실행할 수 있는 프로젝트입니다.

## 예제 2. 승인된 소재를 재사용해 훅만 다른 변형 만들기

### 요구사항

> 첫 버전에서 몽타주와 제품 건네는 장면은 마음에 든다. 첫 문장(훅)만 세 가지로 바꿔 A/B 테스트를 하고 싶다. 바뀌지 않는 장면은 다시 생성하지 않는다.

### 구현

먼저 첫 Build에서 어떤 Output이 남았는지 확인합니다.

```bash
hypit builds
hypit history handoff-take.video
hypit inspect bld_20261001T091200000Z_0000000001 --verbose
```

새 변형용 소스는 훅 Segment의 대사만 바꾸고, 변형마다 별도 Run을 둡니다. 핵심은 Run에서 **바뀌지 않는 테이크를 이전 Build의 Output으로 지정**하는 것입니다.

```svml
<!-- productions/vitamin-ko/runs/hook-b.svrun -->
<?svml using="@hypit/run-markup@1"?>

<svrun version="1">
  <author source="../authors/hook-b.svml"/>
  <target output="final.video"/>

  <!-- v1에서 승인한 테이크와 이미지를 그대로 사용 -->
  <build-record id="v1-handoff"
    build="bld_20261001T091200000Z_0000000001" output="handoff-take.video"/>
  <build-record id="v1-payoff"
    build="bld_20261001T091200000Z_0000000001" output="payoff-take.video"/>
  <build-record id="v1-coach"
    build="bld_20261001T091200000Z_0000000001" output="coach-portrait.image"/>

  <satisfy output="handoff-take.video" candidate="v1-handoff"/>
  <satisfy output="payoff-take.video" candidate="v1-payoff"/>
  <satisfy output="coach-portrait.image" candidate="v1-coach"/>
</svrun>
```

```bash
hypit plan productions/vitamin-ko/runs/hook-b.svrun    # 훅 테이크 1개만 생성 요청에 남는지 확인
hypit build productions/vitamin-ko/runs/hook-b.svrun --title hook-b --follow
```

### 코드 설명

1. **재사용은 `build + output` 주소로만 일어납니다.** Hypit은 "이름이 같으니 같은 결과겠지"라고 추론하지 않습니다. 소스에서 Output 이름을 바꿨다면 `build-record`에는 옛 이름을, `satisfy`에는 새 이름을 적습니다.
2. **어떤 Output을 고르느냐가 다시 계산할 범위를 정합니다.** 생성된 테이크(`handoff-take.video`)를 재사용하면 정규화와 WhisperX 정렬은 다시 실행됩니다. 정렬이 끝난 SemanticTake를 재사용하면 그 단계까지 건너뜁니다. 자막·합성·렌더는 Timeline이 바뀌었으므로 항상 다시 계산됩니다.
3. **파일은 복사되지 않습니다.** 새 Result는 이전 Result의 파일을 가리키는 forward 참조만 기록하므로, 변형을 100개 만들어도 같은 영상 파일이 100번 저장되지 않습니다.
4. **`plan`으로 비용을 먼저 확인합니다.** 재사용이 의도대로 연결되었다면 plan의 외부 요청 목록에는 새 훅 테이크 하나만 남습니다.

### 왜 이렇게 사용하는가?

생성 모델은 같은 입력에도 매번 다른 결과를 냅니다. 암묵적 캐시가 있으면 "왜 이번에는 출연자 얼굴이 바뀌었지?" 같은 혼란이 생기고, 캐시가 없으면 매번 전체 비용을 냅니다. Hypit은 **사람이 승인한 결과를 Run 파일에 명시적으로 고정**하는 방식을 택했습니다. 덕분에 변형 영상의 비용은 바뀐 장면 수에 비례하고, 어떤 소재를 재사용했는지가 Git 커밋에 그대로 남습니다.

---

[← 설치와 첫 사용](02-getting-started.md) · [목차](README.md) · [활용 예시 ② SVML 직접 작성 →](04-usage-svml-authoring.md)
