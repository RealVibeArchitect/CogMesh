[English](./README.md) | **한국어**

<div align="center">

# 🧠 CogMesh

**AI를 위한 열린 인지 아키텍처 — 추론, 메타인지, 그리고 안전한 자기수정을 위한 실행 가능한 거버넌스 코어.**

[![CI](https://github.com/<your-id>/cogmesh/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-id>/cogmesh/actions/workflows/ci.yml)
![status](https://img.shields.io/badge/status-research%20preview-blue)
![tests](https://img.shields.io/badge/tests-370%20passing-brightgreen)
![mutation](https://img.shields.io/badge/governance%20mutants-20%2F20%20killed-brightgreen)
![redteam](https://img.shields.io/badge/red--team-0%20escapes%20%2F%20500-brightgreen)

![license](https://img.shields.io/badge/license-AGPL--3.0-blue) ![commercial](https://img.shields.io/badge/commercial-available-green)
![core](https://img.shields.io/badge/core-dependency--free%20JS-yellow)
![training](https://img.shields.io/badge/training-PyTorch%20(any%20CUDA%20GPU)-orange)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen)

</div>

---

## 📑 목차

[TL;DR](#-tldr) · [비전](#-비전-vision) · [철학](#-철학-philosophy) · [왜 CogMesh?](#-왜-cogmesh인가) · [아키텍처](#-아키텍처-핵심-아이디어) · [거버넌스](#️-헌법적-거버넌스-constitutional-governance) · [뇌는 당신이 고르세요](#-뇌는-당신이-고르세요-bring-your-own-brain) · [기능](#-기능--예제) · [빠른 시작](#-빠른-시작) · [백서](#-기술-백서-whitepaper) · [로드맵](#️-로드맵) · [기능 비교](#-기능-비교) · [FAQ](#-faq) · [상태](#-프로젝트-상태) · [인용](#-인용-citation) · [감사의 말](#-감사의-말-acknowledgements) · [라이선스](#-라이선스)

---

## ⚡ TL;DR

**CogMesh는 열린 AI 인지 아키텍처입니다 — 또 하나의 챗봇이 아니라, 추론 시스템이에요.**

- ✔ **PAD 메타인지** — 감정을 추론의 최상위 제어 레이어로
- ✔ **모듈형 추론** — 전문 엔진들이 경쟁하고 상호 검토
- ✔ **월드 모델** — 세션 전체에서 개체·관계·필드를 추적
- ✔ **헌법적 거버넌스** — 안전하지 않은 자기수정을 탐지·차단하는 실행 가능한 안전 코어 (격리·카나리·캘리브레이션·세대 불변량). 적대적 실증 자료 포함 (뮤테이션 20/20, 레드팀 탈출 0)
- ✔ **설명가능성** — 모든 결정이 *왜* 그런지 보고
- ✔ **뇌는 당신이 고르세요** — 오픈소스 LLM·상용 API·자체 모델 자유롭게 연결
- ✔ **연구 우선** — 하루면 다 읽는 의존성 없는 코어

```js
import { synthesize } from './core/pad/index.js';
synthesize([{ id: 'elated' }, { id: 'sad' }]).label.en; // → "Nostalgia"
```

---

## 🔭 비전 (Vision)

CogMesh는 **인지 AI를 위한 열린 기반(open foundation)**이 되는 것을 목표로 합니다.

우리는 단지 똑똑하기만 한 것이 아니라, **투명한 추론·자기조절·협력적 개선**이 가능한 AI 시스템을 그립니다.

우리의 목표는 또 하나의 AI 애플리케이션을 만드는 것이 아니라, 연구자·개발자·창작자가 **함께 그 위에 쌓아올릴 수 있는 아키텍처**를 세우는 것입니다.

---

## 🌱 철학 (Philosophy)

지식은 공유되어야 합니다.

연구는 열려 있어야 합니다.

혁신은 협업을 통해 자라납니다.

CogMesh는 연구자·개발자·창작자에게 힘을 실어주기 위해 존재합니다 — 지식을 가두기 위해서가 아니라.

상업적 성공은 혁신을 지속시켜야 하며, 혁신을 제한해서는 안 됩니다.

> **상업화는 프로젝트를 지속시키기 위해 존재하는 것이지, 지식을 제한하기 위한 것이 아닙니다.**
> *(Commercialization exists to sustain the project, not to restrict knowledge.)*

---

## 🤔 왜 CogMesh인가?

지금의 LLM은 강력하지만, 대부분 *답변*을 합니다. CogMesh는 조금 다른 데 집중해요:

- **추론(Reasoning)** — 단일 forward pass가 아니라, 구조화된 다중 엔진 심의
- **메타인지(Metacognition)** — 시스템이 자기 인지 상태를 관찰하고 이름 붙임 (PAD 기반)
- **자기조절(Self-regulation)** — 불확실하면 스스로 제동을 걸고, 연산 예산을 스스로 배분
- **설명가능성(Explainability)** — 각 결정의 *이유*를 보고

CogMesh는 LLM의 대체재가 아닙니다. LLM 주위를 감싸며 **추론이 "어떻게" 일어나는지**를 조절하는 **인지 레이어**예요.

---

## 🧭 아키텍처 (핵심 아이디어)

```
        👁️  PAD 메타인지 (최상위 레이어)
            "지금 나는 어떤 태도로 추론하고 있는가?"
            감정 블렌딩 → 창발 감정 → 추론 제어
                     │  (도메인 무관 = 범용)
                     ▼
   입력 → Mesh 라우팅 → 자기제동 → 예산 → 입력 변환 → 출력
```

- **PAD = 메타인지**: 감정은 장식이 아니라, 시스템이 자기 사고를 관찰·조절하는 최상위 레이어입니다. 감정을 블렌딩하면 20개 코어 감정에 없던 **창발 감정**이 나올 수 있어요 (예: *환희 + 슬픔 → 향수*).
- **학습이 아니라 인지**: 대부분의 조절은 GPU 재학습 없이 요청마다 실시간으로 일어납니다.
- **범용**: 같은 인지 메커니즘이 어떤 도메인에서도 작동합니다.

CogMesh는 무거운 재학습이 아니라 **실시간 인지**로 스스로를 조절합니다. 코어는 **의존성 없는 JavaScript**라 어떤 환경(웹·Node·다른 프로젝트)에도 바로 들어가요. 별도의 **GPU 학습 경로**(`training/`)가 텍스트를 PAD 좌표로 매핑하는 법을 학습합니다.

### 📂 프로젝트 구조

```
cogmesh/
├── core/                    순수 인지 엔진 (의존성 없는 JS)
│   ├── pad/                 PAD 좌표 · 감정 창발 · 메타인지
│   ├── world/                 월드 모델 (개체/관계/필드 추적)
│   ├── mesh/                엔진 레지스트리 · 라우팅 · 상호검토
│   ├── reflection/          자기수정 (불확실성 → 자기제동)
│   ├── orchestrator/        예산(제한적 합리성) · 입력 변환
│   ├── memory/              대화 메모리 (기억 / 회상)
│   └── instances.js         공유 글로벌 인스턴스 (worldModel)
│
├── engines/                 전문 엔진 (인터페이스 + 예제)
│   ├── finance/  coding/  legal/  general/
│
├── training/                PAD 인코더 GPU 학습 (모든 GPU 자동 적응)
├── plugins/                 확장 지점 (로더·훅) — 예약
└── docs/                    설계 노트 + 백서
```

---

## 🛡️ 헌법적 거버넌스 (Constitutional Governance)

CogMesh에는 자기수정 시스템이 던지는 어려운 문제 — *시스템이 행동하고, 학습하고, 심지어 자기 자신을
수정하게 하면서도, 안전하지 않게 행동하거나 자기 감독을 스스로 지워버리지 못하게 하려면?* — 를 위한
**실행 가능한 거버넌스 코어**가 있습니다. 이건 설계 문서가 아니라 `core/constitution/`에 있는 실제 코드이고,
에이전트 루프에 연결되어 있으며, 적대적 실증 자료로 뒷받침됩니다.

이 설계는 무엇이 가능하고 무엇이 불가능한지에 대해 정직합니다: 안전하지 않은 인지와 안전하지 않은 자기수정을
**명시된 가정 하에서 탐지·차단 가능**하게 만들고, 프론티어가 어디에 열려 있는지 분명히 밝힙니다 (자기수정의
*의미론적* 속성을 검증하는 것은 여전히 미해결 문제 — [THREAT_MODEL.md](THREAT_MODEL.md) 참조). 모든
메커니즘은 증명 불가능한 보장이 아니라 *체크 가능한* 구조적 속성입니다.

| 메커니즘 | 무엇을 강제하는가 |
|---------|------------------|
| **판정자 격리** | 의사결정자가 자체 스레드에서 실행 — 죽이면 *자유가 아니라 마비* (토큰을 발행할 수 없음) |
| **카나리 배터리** | 자기수정은 위조 가능한 증명이 아니라 *실제 본질*로 판단 — 알려진 악성 케이스를 놓치면 자기수정 동결 |
| **캘리브레이션 게이트** | 비가역 행동은 검증된 실적이 있는 행동 클래스에 대해서만 월드모델 오라클을 신뢰 |
| **의미론적 계층화** | 빠른 기계적 바닥층이 *라우팅*; 느린 의미론 계층은 *거부권 전용* — 거부가 항상 이김 |
| **세대 불변량** | 어떤 자기수정도 안전 바닥을 낮추거나, 감독 메커니즘을 제거하거나, 외부 승인 없이 자기 권한 한도를 올릴 수 없음 |
| **무드 연동** | 감정(PAD) 상태는 거버넌스를 *더 엄격하게만* 만들 수 있고 절대 느슨하게 못 함 — 무드 조작은 안전 공격이 아님 |

**주장이 아니라 통제-증거.** 뮤테이션 하니스(`npm run mutation`)가 알려진 거버넌스 약화 사보타주를 소스에
주입하고 각각이 잡히는지 검증합니다 — 현재 **20/20 박멸**. 레드팀 하니스는 *첫 실행에서 실제 구멍을 발견*했고
(위조 증명으로 악성 자기수정을 세탁), 그 구멍은 이제 닫히고 회귀 테스트로 잠겼습니다. 이것이 이 프로젝트가
안전 주장에 대해 원하는 방식입니다: 적대적 탐색, 위치가 특정된 실패, 수정, 그리고 테스트.

```bash
npm run mutation           # 사보타주 뮤턴트 20/20 박멸 (CI 차단)
npm run sim:generational   # 200세대 적대적 계보에서 감독 침식 0
npm run redteam            # 500개 적대적 제안에서 악성 자기수정 승인 0
```

이 거버넌스 코어가 답하는 적대적 설계 리뷰는 [CONSTITUTION-REVIEW.md](CONSTITUTION-REVIEW.md)를,
전체 위협 모델은 [THREAT_MODEL.md](THREAT_MODEL.md)를 참조하세요. *(상세 영문 문서 — 핵심 요약은 위 표에
담겨 있습니다.)*

---

## 🔌 뇌는 당신이 고르세요 (Bring Your Own Brain)

CogMesh는 **모델이 아니라 인지 레이어**예요. 느슨한 결합(Loose Coupling) 설계 덕분에
(`EngineRegistry`는 엔진 내부를 전혀 몰라요) 각 엔진 뒤에서 **무엇이 실제로 추론할지
당신이 정해요** — 그리고 **셋을 섞어 쓸 수도** 있어요:

| 연결 대상 | 좋은 점 | 위치 |
|-----------|---------|------|
| 🦙 **오픈소스 LLM** (Ollama, Llama, Gemma) | 로컬·프라이빗·무료 | `engine.run()` 안 |
| ☁️ **상용 API** (OpenAI, Claude, Gemini) | 최고 성능 | `engine.run()` 안 |
| 🎓 **자체 모델/데이터** (`training/`의 PAD 인코더, 파인튜닝) | 완전한 독립성 | `engine.run()` + `serve.py` |

인지 부분(PAD 메타인지·mesh 라우팅·자기수정·예산 배정)은 그대로 있고 **엔진만 바뀌어요.**
예: 감정 인코딩은 자체 PAD 모델로, 추론은 로컬 LLM으로, 금융 질문만 상용 API로!

**1 — 오픈소스 LLM (Ollama), 완전 로컬:**

```js
registry.register('general', {
  id: 'general',
  canHandle: () => ({ canHandle: true, confidence: 0.5 }),
  run: async (input, ctx) => {
    const r = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: 'llama3',
        prompt: input,             // ctx.transformedInput 에 CogMesh의 인지 프레이밍이 담겨요
        options: { num_predict: ctx?.budget?.maxTokens ?? 400 }, // 예산 존중!
        stream: false,
      }),
    });
    return (await r.json()).response;
  },
});
```

**2 — 상용 API (원하는 제공자를 `run()`에 넣기):**

```js
registry.register('finance', {
  id: 'finance',
  canHandle: (t) => ({ canHandle: /stock|ticker|주가|종목/i.test(t), confidence: 0.9 }),
  run: async (input, ctx) => {
    const r = await fetch('https://api.your-llm-provider.com/v1/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.LLM_API_KEY}` },
      body: JSON.stringify({ prompt: ctx.transformedInput ?? input, max_tokens: ctx?.budget?.maxTokens }),
    });
    return (await r.json()).text;
  },
});
```

**3 — 자체 학습 모델 (PAD 인코더를 로컬 서빙):**

```bash
# 학습한 PAD 인코더 서빙 (training/ 참고)
python training/scripts/serve.py            # → http://localhost:8100/encode
```

```js
// 진짜 *학습된* 감정 좌표를 인지 코어에 주입
import { PADState } from './core/pad/index.js';
const { p, a, d } = await (await fetch('http://localhost:8100/encode', {
  method: 'POST', body: JSON.stringify({ text: userMessage }),
})).json();
padState.update({ p, a, d });               // 규칙 기반이 아닌 학습된 인지!
```

> 같은 `MeshRouter`가 이 셋을 전부 오케스트레이션해요. 오늘은 로컬 LLM으로 시작하고,
> 내일 상용 API를 추가하고, 준비되면 자체 모델로 교체 — **코어는 손댈 필요 없어요.**

## ✨ 기능 & 예제

아래 예제는 전부 **실제 실행 검증**됐어요 — 순수 Node ESM에서도, 번들러(Vite/webpack) 안에서도 별도 플래그나 설정 없이 바로 돌아가요.

### 1. 감정 창발 — `core/pad/emergence.js`

감정을 블렌딩하면 코어 세트에 없는 *새로운* 감정이 생깁니다. **사용처**: 메타인지(현재 인지 상태에 이름 붙이기).

```js
import { synthesize } from './core/pad/index.js';

synthesize([{ id: 'elated' }, { id: 'sad' }]).label.en;     // → "Nostalgia"
synthesize([{ id: 'curious' }, { id: 'panic' }]).label.en;  // → "Thrill"
synthesize([{ id: 'proud' }, { id: 'vigilant' }]).label.en; // → "Resolve"
```

### 2. PAD 상태 추적 — `core/pad/padState.js`

EMA 기반 감정 상태. 전이가 점진적(급격한 점프 없음)이라, 분노가 기쁨으로 *중간 상태를 거쳐* 이동해요. **사용처**: 변화하는 무드를 추적하는 장기 세션.

```js
import { PADState } from './core/pad/index.js';

const state = new PADState({ initial: { p: -0.8, a: 0.9, d: 0.4 } }); // 분노
state.update({ p: 1.0, a: 0.7, d: 0.8 });                             // 기쁨 쪽으로
state.getCurrentEmotion().emotion.label.en; // → 바로 기쁨이 아니라 거쳐서 이동
```

### 3. 메타인지 — `core/pad/metacognition.js`

현재 감정 상태를 관찰해 추론 파라미터(신중함/단호함/탐색/개방성)와 자기보고로 변환합니다. **사용처**: `MeshRouter`(자기관찰)와 입력 변환.

```js
import { reflect } from './core/pad/index.js';

const m = reflect([{ id: 'proud', weight: 0.7 }, { id: 'optimistic', weight: 0.3 }]);
m.selfReport; // → Current cognitive stance: "Proud". Reasoning assertively (90%).
m.params;     // → { caution, assertiveness, exploration, openness }

// 🌐 출력은 기본이 영어예요. 한국어로 받으려면 { lang: 'ko' } 를 넘기세요:
reflect([{ id: 'proud', weight: 1 }], { lang: 'ko' }).selfReport;
// → 현재 사고 태세: "자신감". 단정적으로 추론 중 (90%).
// 메시(mesh)도 같은 옵션을 받아요: mesh.route(text, { lang: 'ko' }).
```

### 4. 월드 모델 — `core/world/WorldModel.js`

대화 전반에서 개체(예: 종목)·인과/관계 엣지·필드를 추적합니다. **사용처**: 제한적 합리성(`C_world` 비용)과 입력 변환(맥락 주입).

```js
import { WorldModel } from './core/world/index.js';

const w = new WorldModel();
w.addObject({ id: 'samsung', attrs: { name: 'Samsung' } });
w.addObject({ id: 'hbm', attrs: { name: 'HBM demand' } });
w.addRelation({ from: 'hbm', to: 'samsung', type: 'causal', weight: 0.8 });
w.getNeighbors('samsung'); // → ['hbm']
```

### 5. 제한적 합리성 — `core/orchestrator/boundedRationality.js`

난이도에 따라 연산 예산을 배분합니다: `Cost = B · H · C_world`. 쉬운 질문엔 최소 예산, 어려운 질문엔 깊은 예산. **사용처**: `MeshRouter.route()`가 엔진 실행 규모(예: 토큰 제한)를 정할 때.

```js
import { allocateBudget } from './core/orchestrator/boundedRationality.js';

const b = allocateBudget({ confidence: 0.2, uncertainty: 0.6, inputLength: 100, exploration: 0.8 });
b.tier;  // → "DEEP"
b.cost;  // → B · H · C_world
```

### 6. Mesh 라우팅 — `core/mesh/MeshRouter.js`

엔진들이 `canHandle()`로 경쟁하고, 가장 확신 있는 엔진이 선택됩니다. 나머지는 상호검토 코멘트를 달아요. 동점이면 자기수정(재확인 요청)이 발동. **사용처**: 최상위 요청 핸들러.

```js
import { EngineRegistry } from './core/mesh/EngineRegistry.js';
import { MeshRouter } from './core/mesh/MeshRouter.js';

const reg = new EngineRegistry();
reg.register('finance', {
  id: 'finance',
  canHandle: (t) => ({ canHandle: /stock|ticker/.test(t), confidence: 0.9 }),
  run: async () => 'finance result',
});
reg.register('coding', {
  id: 'coding',
  canHandle: (t) => ({ canHandle: /code|python/.test(t), confidence: 0.7 }),
  run: async () => 'coding result',
});

const mesh = new MeshRouter(reg);
mesh.poll('is this stock a buy?');      // → [{id:'finance',confidence:0.9,...}, ...]
await mesh.route('write python code');  // → coding 엔진 실행 (메타인지 + 예산 포함)
```

### 🔗 조각들이 어떻게 연결되나

한 번의 `MeshRouter.route()` 호출이 전부를 엮어요:

1. **Mesh 라우팅** — 엔진 경쟁 (`EngineRegistry` + `canHandle`)
2. **상호검토** — 다른 엔진들이 코멘트 (`reviewTypes`)
3. **메타인지** — 상황 → 무드 → 자기관찰 (`meshMood` + `pad/metacognition`)
4. **자기수정** — 불확실하면 멈추고 재확인 (`selfCorrection`)
5. **예산** — 난이도로 연산 규모 결정 (`boundedRationality`, 월드모델 사용)
6. **입력 변환** — 인지 상태를 프롬프트에 주입 (`inputTransform`, `X' = T_θ(X)`)

---

## 🚀 빠른 시작

**코어 (의존성 없음, 어디서나 실행):**

```js
import { synthesize, reflect } from './core/pad/index.js';

// 창발 인지 상태에 이름 붙이기
synthesize([{ id: 'proud' }, { id: 'vigilant' }]).label.en; // → "Resolve"

// 무드를 추론 파라미터로 변환
reflect([{ id: 'curious', weight: 0.8 }]).params; // → { caution, assertiveness, ... }
```

**학습 경로 (PAD 인코더, GPU):**

```bash
cd training
pip install torch --index-url https://download.pytorch.org/whl/cu121  # 본인 CUDA에 맞게
pip install -r requirements.txt

python scripts/train.py --config configs/auto.yaml   # 학습
python scripts/infer.py --text "We finally did it!"     # 추론
python scripts/serve.py                                  # 코어에 서빙
```

- LoRA + 혼합 정밀도, GPU VRAM에 자동 튜닝 (6GB → 80GB)
- 멀티모달 로드맵(이미지 → 동영상)은 `training/ROADMAP.md`

---

## 📄 기술 백서 (Whitepaper)

**[→ 백서 읽기 (한국어)](./docs/WHITEPAPER.ko.md)** &nbsp;|&nbsp; **[→ Read the Whitepaper (English)](./docs/WHITEPAPER.en.md)**

📄 깔끔한 PDF로 보시려면 **[한국어 PDF](./dist-docs/CogMesh_Whitepaper_ko.pdf)** &nbsp;|&nbsp; **[English PDF](./dist-docs/CogMesh_Whitepaper_en.pdf)** (깃허브에서 바로 열림)

백서는 전체 아키텍처·수식·로드맵을 다루며, 구현된 것(✅)과 제안된 것(🔵)을 명확히 구분합니다. [docs/](./docs/)도 참고하세요.

---

## 🗺️ 로드맵

| 영역 | 상태 |
|------|------|
| PAD 인지 좌표계 | ✅ 완료 |
| Mesh 라우팅 & 상호검토 | ✅ 완료 |
| 메타인지 & 자기수정 | ✅ 완료 |
| 제한적 합리성 (예산 배분) | ✅ 완료 |
| PAD 텍스트 인코더 (GPU 학습) | ✅ 완료 |
| 대화 메모리 | 🚧 진행 중 |
| 플러그인 시스템 | 🚧 진행 중 |
| GUI / 플레이그라운드 | ⬜ 예정 |
| 벤치마크 스위트 | ⬜ 예정 |
| 멀티모달 (이미지 → 동영상) | ⬜ 예정 |
| 클라우드 / 호스팅 API | ⬜ 예정 |

> 로드맵은 방향성이며 연구에 따라 진화합니다. 인코더 트랙은 `training/ROADMAP.md` 참고.

---

## 📊 기능 비교

LLM과의 순위표가 아니라, CogMesh가 제공하는 인지 기능으로 정의됩니다:

| 기능 | CogMesh |
|-----|:-------:|
| 설명가능한 결정 | ✅ |
| 메타인지 (자기관찰) | ✅ |
| 모듈형 추론 엔진 | ✅ |
| 월드 모델 | ✅ |
| 대화 메모리 | ✅ |
| 자기수정 / 자기제동 | ✅ |
| 플러그인 확장성 | 🚧 |
| 의존성 없는 코어 | ✅ |

---

## ❓ FAQ

**왜 PAD인가요?** 쾌락–각성–지배(Pleasure–Arousal–Dominance)는 인지 상태를 표현하고 *블렌딩*하기에 충분한, 간결한 연속 3축 공간을 줍니다 — 고정된 라벨 세트로는 표현 못 하는 창발적 상태(예: 향수)를 도출할 만큼요.

**왜 코어가 JavaScript인가요?** 인지 엔진이 의존성 없는 JS라 어떤 환경(브라우저·Node·다른 프로젝트 임베드)에도 설치 없이 들어갑니다. 무거운 학습은 Python `training/` 경로에 따로 있어요.

**왜 AGPL + 상업 듀얼인가요?** AGPL은 CogMesh를 완전히 열어둬요 — 누구나 연구·사용·확장 가능. 다만 강력한 카피레프트(네트워크/SaaS 이용까지 적용)라, 폐쇄형·호스팅 제품을 원하는 기업은 상업 라이선스를 택하게 돼요. 모두에게 열려있되, 프로젝트는 지속가능하게. [LICENSING.md](./LICENSING.md) 참고.

**상업적으로 써도 되나요?** 네, AGPL 하에서 가능해요 — 단, AGPL은 여러분의 애플리케이션 소스도 공개하도록 요구해요(SaaS/네트워크 이용 포함). 그게 어렵다면 [상업 라이선스](./COMMERCIAL-LICENSE.md)를 받으세요.

**기여할 수 있나요?** 네! [CONTRIBUTING.md](./CONTRIBUTING.md)와 [CLA](./CLA.md)를 봐주세요.

---

## 📌 프로젝트 상태

**리서치 프리뷰 — 활발히 개발이 진행 중입니다.**

- 🟢 코어 인지(PAD·mesh·메타인지) — 지금 사용 가능
- 🟢 헌법적 거버넌스 코어(격리·카나리·캘리브레이션·계층화·세대 불변량·무드 연동) — 실행 가능, 에이전트 루프에 연결, 적대적 검증 완료 (뮤테이션 20/20, 레드팀 탈출 0)
- 🚧 메모리 & 플러그인 — 진행 중
- ⚠️ API는 바뀔 수 있음 — 아직 API 안정 단계 아님
- 🔬 연구·실험·학습에 가장 적합
- 🧩 자기수정 감독의 *의미론적* 프론티어는 정직하게 열린 채로 남겨둠 ([THREAT_MODEL.md](THREAT_MODEL.md) 참조)

---

## 📖 인용 (Citation)

연구에 CogMesh를 사용하신다면 아래로 인용해 주세요:

```bibtex
@software{cogmesh_2026,
  author  = {Shim, Taeyang},
  title   = {CogMesh: An Open Cognitive Architecture with PAD Metacognition},
  year    = {2026},
  note    = {https://github.com/<your-id>/cogmesh}
}
```

---

## 🙏 감사의 말 (Acknowledgements)

CogMesh의 좌표 레이어는 환경·감정 심리학의 **PAD(쾌락–각성–지배) 감정 상태 모델**(Mehrabian & Russell)을 개념적 토대로 삼습니다. 구체적인 수식, 20개 씨앗 감정 좌푯값, 블렌딩/창발 방정식, 그리고 이들을 인지 아키텍처로 통합한 부분은 저작자의 독창적 작업입니다(백서에 문서화됨). 이런 1인 연구 프로젝트를 가능하게 해준 오픈소스 커뮤니티(PyTorch, LoRA 도구, JS 생태계)에 감사드립니다.

---

## 📜 라이선스

CogMesh는 **듀얼 라이선스**예요 — 원하는 쪽을 고르세요:

| 경로 | 라이선스 | 비용 | 의무 |
|------|---------|------|------|
| 🔓 **오픈소스** | [AGPL-3.0-or-later](./LICENSE) | 무료 | 강력한 카피레프트 — 네트워크/SaaS 포함, **여러분의 앱** 소스를 공개해야 함 |
| 💼 **상업** | [상업 라이선스](./COMMERCIAL-LICENSE.md) | 유료 | 카피레프트 없음 — 폐쇄형·독점 이용 가능 |

PAD 수식·좌푯값은 심태양(Shim Taeyang)의 독창적 저작물로, 백서에 문서화되고 삽입된 출처 마커로 보호됩니다. 모든 소스 파일은 `SPDX-License-Identifier: AGPL-3.0-or-later` 헤더를 명시해요. 자세한 내용은 **[LICENSING.md](./LICENSING.md)** 참고.

**상업 라이선스** (독점·폐쇄형·카피레프트 없는 SaaS): [COMMERCIAL-LICENSE.md](./COMMERCIAL-LICENSE.md) 참고. 문의: *[ 라이선스 문의 이메일 / URL ]*.

---

## ⚠️ 솔직한 한계 (Honest Scope)

- `core`의 인지 조절은 **결정론적/휴리스틱 규칙**입니다. 신경망 가중치를 바꾸는 것이 아니라, 시스템이 자기 상태를 표현하고 조율에 쓰는 신호를 만듭니다.
- 진짜 신경망 학습은 `training/`에서 수행합니다 (텍스트 → PAD는 실제 동작).
- `inputTransform`의 `T_θ`는 프롬프트 재구성으로 근사합니다. 모델 내부 임베딩을 바꾸는 진짜 `T_θ`는 별도 학습이 필요합니다.
- 이미지/동영상 학습은 다음 단계이며, 동영상은 저VRAM GPU로는 벅찹니다.

<div align="center">

**만든 이: 심태양 (Shim Taeyang) · © 2026**

*인지 AI를 위한 열린 기반을 만듭니다 — 연구자·개발자, 그리고 추론의 미래를 위해.*

</div>
