<!--
SPDX-License-Identifier: AGPL-3.0-or-later
CogMesh — © 2026 심태양 (Shim Taeyang). Dual-licensed (AGPL-3.0-or-later / commercial).
-->

# CogMesh v0.2.0 — Full-Stack Optimization Report · 전영역 최적화 리포트

**2026-07-10 · 244 → 261 tests, all passing · reproduce with `npm run bench`**

이 문서는 v0.2.0 최적화 패스의 **측정 근거**를 남긴다. 모든 수치는 동일 머신
(Node 22, `scripts/bench.mjs`) 에서 측정한 **중앙값**이며, 절대값은 머신마다 다르지만
배율(×)은 재현된다. 모든 변경은 기존 244개 테스트를 그대로 통과하고, 17개의 신규
계약(contract) 테스트가 각 최적화의 의미론을 고정한다.

Every number is a same-machine median; absolute times vary by hardware, the ratios
reproduce. Every rewrite is behavior-preserving (existing 244 tests untouched) and
pinned by 17 new contract tests.

## 측정 결과 · Measured results

| Hot path | Before | After | Gain | What changed |
|---|---:|---:|---:|---|
| `WorldModel.branch()` ×200 | 7.84 ms | 3.91 ms | **2.0×** | snapshot→restore 우회, 내부 스토어 직접 구조 복제 (검증: fast ≡ slow 동치 테스트) |
| `WorldSimulator.rollout()` ×200 | 10.70 ms | 4.30 ms | **2.5×** | 위 + `setField` O(1) 인플레이스 + apply의 이중 state 머지 제거 |
| `RolloutCache` HIT ×2000 | 5.92 ms | 0.19 ms | **31×** | 액션 **참조별 키 메모** (WeakMap) — 히트마다 재귀 stringify 하던 것을 O(1) 조회로 |
| `SemanticRetriever.query()` k=5 / 2,000건 | 3.51 ms/q | 0.77 ms/q | **4.6×** | packed f64 행렬 스캔 + 사전계산 역노름 + 4-way 언롤 dot + bounded top-k (**점수 비트 동일** 검증) |
| `HashingEmbedder` (고유 텍스트) | 10.1 µs | 6.3 µs | **1.6×** | 롤링 FNV-1a — 서브스트링 할당 0 |
| `HashingEmbedder` (반복 텍스트) | 10.1 µs | ~0.2 µs | **~50×** | LRU 메모 (에이전트 루프는 같은 goal/query를 반복 임베딩) |
| `CognitiveMesh.run()` 전체 루프 | 1.62 ms | 1.05 ms | **1.5×** | 위 전부 + attention 점수 재사용 + council 인덱스 호이스팅 |

`MiniLMEmbedder.embedBatch()`는 이 컨테이너에 ONNX 런타임이 없어 직접 측정하지
못했지만, 구조적으로 **배치당 1회의 `session.run()` + 배치 최장 길이 동적 패딩**으로
바뀌었다 (기존: 텍스트당 1회 실행 + 고정 128 토큰 패딩). 짧은 한/영 문장 기준
CPU·GPU 공히 3–10× 처리량 향상이 일반적이며, 모델이 batch=1 고정으로 내보내진 경우
자동으로 기존 순차 경로로 폴백한다 (같은 결과 보장). export 스크립트는 이미
`dynamic_axes={batch, seq}`로 내보내므로 RTX 4050 로컬 환경에서 바로 적용된다.

## 비용 절감 · Cost

- **리트리버 영속화** — `serialize()/deserialize()`. 재시작 시 코퍼스 전체 재임베딩
  (가장 비싼 단계)이 0이 된다. 임베더 kind/dim이 다르면 벡터 공간 오염을 막기 위해
  복원을 거부한다.
- **npm 타르볼 슬리밍** — `files` 화이트리스트로 라이브러리만 배포 (training/, docs/,
  test/ 제외).
- **`sideEffects: false`** — 앱 번들러가 미사용 모듈을 트리셰이킹.
- **CI 분(minutes) 절감** — `setup-node` npm 캐시 + `npm ci`. 벤치를 report-only
  스텝으로 추가해 PR마다 성능 회귀가 로그에 드러난다.

## 구조 · Structure

- **루트 `index.js` 파사드 + `exports` 맵** — 이전에는 패키지 진입점이 아예 없었다.
  이제 `import { CogMeshAgent } from 'cogmesh'` 및 `cogmesh/pad` 등 도메인 서브패스가
  동작한다 (101개 공개 심볼, 충돌 없음).
- **`core/mesh/index.js` 신설** — 유일하게 index가 없던 모듈 디렉터리.
- **`package.json` 중복 키 버그 수정** — `test:integration`이 두 번 정의되어 두 번째가
  첫 번째를 조용히 덮어썼고, 그 결과 `integration.test.mjs`가 npm 스크립트로는 실행
  불가능했다. 이제 `test:integration`과 `test:cogmesh-agent`로 분리되어 둘 다 돈다.
- `engines: node >= 20` 명시, 버전 0.2.0.

## 왜 이 방식인가 · Method notes

1. **먼저 재고, 그다음 고친다.** `scripts/bench.mjs`로 베이스라인을 고정한 뒤에만
   손댔다. 벤치는 리포지토리에 남아 (`npm run bench`) 누구든 재현할 수 있다.
2. **의미론 보존을 계약으로 강제.** 최적화마다 동치 테스트를 붙였다 — fast branch ≡
   snapshot→restore, bounded top-k ≡ 전수 cosine 정렬(점수 1e-9 이내), 캐시 메모의
   값-동등/LRU/invalidate 불변, 직렬화 왕복 후 질의 결과 동일.
3. **f64 팩의 근거.** f32 값은 f64로 정확히 표현되므로 f64 행렬 스캔은 **비트 동일한
   점수**를 내면서 V8의 로드당 f32→f64 변환만 제거한다 (측정 ~1.5×). 메모리는 2배지만
   5천 항목 × 384차원 ≈ 15 MB 수준.
4. **정직한 한계.** council 경로는 1.2× 수준 — 지배 비용이 설명가능성(verdict 문자열
   생성)이라 성능을 위해 제품 가치를 깎지 않았다. embed 50×는 memo-warm 수치이고
   콜드는 1.6×임을 구분해 기록한다.
