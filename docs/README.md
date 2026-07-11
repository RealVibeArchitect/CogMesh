# CogMesh Documentation

**마크다운이 유일한 원본(single source of truth)** 입니다.
HTML(`site/`)과 DOCX/PDF(`dist-docs/`)는 여기서 생성됩니다.

## 📄 백서 (Whitepaper)

| 언어 | 문서 |
|---|---|
| 🇰🇷 한국어 | **[WHITEPAPER.ko.md](./WHITEPAPER.ko.md)** |
| 🇺🇸 English | **[WHITEPAPER.en.md](./WHITEPAPER.en.md)** |

백서 하나에 전체 아키텍처·수식·부록·로드맵이 통합되어 있습니다.
구현된 것(✅) / 뼈대(🟡) / 제안(🔵)을 정직하게 구분합니다.

## 형식 (3-way 동기화)

- **Markdown** (`docs/`) — 원본. 수동 편집은 여기서만.
- **HTML** (`site/`) — 반응형·다크모드·목차·Mermaid·KaTeX 수식.
- **DOCX/PDF** (`dist-docs/`) — 공식 문서·인쇄·발표용.

빌드 방법은 [BUILD.md](./BUILD.md) 참고.
