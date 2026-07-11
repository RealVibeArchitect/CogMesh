# 문서 빌드 가이드

**마크다운(`docs/WHITEPAPER.*.md`)이 유일한 원본입니다.** HTML·DOCX·PDF는 여기서 생성합니다.

## HTML 웹문서 (site/)

```bash
npm install
npm run docs:site    # docs/WHITEPAPER.{en,ko}.md → site/*.html
```

반응형·다크모드·목차·Mermaid 다이어그램·KaTeX 수식. `site/index.html`을 브라우저로 열면 됩니다.

## DOCX / PDF 공식 논문 (dist-docs/)

```bash
npm run docs:docx    # → dist-docs/CogMesh_Whitepaper_{en,ko}.docx (영어·한국어 모두)

# PDF는 LibreOffice로 (두 언어 모두 변환):
soffice --headless --convert-to pdf --outdir dist-docs dist-docs/CogMesh_Whitepaper_en.docx
soffice --headless --convert-to pdf --outdir dist-docs dist-docs/CogMesh_Whitepaper_ko.docx
```

> 팁: 블록 수식 `$$...$$`은 별도 줄로 두면 pandoc이 워드 수식으로 정확히 변환합니다.
>
> ⚠️ **한국어 PDF 주의:** `.ko` PDF를 만들 땐 반드시 `WHITEPAPER.ko.md`에서
> 한국어 docx를 먼저 생성하세요. 한글이 깨지면 시스템에 CJK 폰트(예: `Noto Sans CJK KR`)가
> 설치돼 있는지 확인하세요 (`fc-list | grep -i "CJK KR"`).

## 동기화 규칙

1. 수정은 **마크다운에서만**.
2. `npm run docs:site`로 HTML 재생성.
3. `npm run docs:docx`로 논문 재생성.
4. 한국어(.ko)·영어(.en) 두 언어를 함께 유지.
