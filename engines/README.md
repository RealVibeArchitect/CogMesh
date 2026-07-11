# engines/

Specialist 엔진들이 사는 곳입니다. 각 엔진은 특정 도메인(finance, coding, legal, …)의
요청을 처리하고, `core/mesh`의 `EngineRegistry`에 등록되어 협력합니다.

> ⚠️ 이 저장소는 **순수 코어**입니다. 무거운 실제 구현(외부 API·데이터 파이프라인)은
> 포함하지 않고, **엔진 인터페이스 규격과 최소 예시**만 제공합니다.
> 여러분의 도메인 엔진을 이 규격에 맞춰 꽂으면 코어가 그대로 조율해 줍니다.

## 엔진 인터페이스 규격

```js
export const myEngine = {
  id: 'finance',                 // 고유 식별자
  name: 'My Finance Engine',
  version: 'v1',

  // 이 입력을 처리할 수 있는가? (Mesh 경쟁에 사용)
  canHandle(input) {
    return { canHandle: Boolean, confidence: 0..1, detail: {} };
  },

  // 실제 처리 (LLM 호출 등). ctx.budget에 계산 예산이 전달됨.
  async run(input, ctx) {
    return { /* 결과 */ };
  },

  // (선택) 다른 엔진의 답변을 자기 관점에서 리뷰 (상호검증)
  review(input, primaryResult, ctx) {
    return { relevance: 0..1, note: string|null, flags: [] };
  },
};
```

## 등록

```js
import { engineRegistry } from '../core/mesh/EngineRegistry.js';
import { myEngine } from './finance/index.js';

engineRegistry.register(myEngine.id, myEngine, { version: myEngine.version });
```

## 폴더

| 폴더 | 도메인 | 상태 |
|---|---|---|
| `finance/` | 금융 분석 | 예시 인터페이스 |
| `coding/`  | 코딩 지원 | 예시 인터페이스 |
| `legal/`   | 법률 | 자리 (구조만) |
| `general/` | 범용 폴백 | 자리 (구조만) |

각 폴더의 `index.js` 예시를 참고해 실제 엔진을 구현하세요.
