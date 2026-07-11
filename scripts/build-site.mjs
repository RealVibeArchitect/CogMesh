// SPDX-License-Identifier: AGPL-3.0-or-later
// CogMesh — © 2026 심태양 (Shim Taeyang).
// Dual-licensed: GNU AGPL-3.0-or-later (see /LICENSE) OR a commercial license
// (see /COMMERCIAL-LICENSE.md). The PAD formulae, coordinate values, and algorithms
// herein are original works of the author (see the CogMesh Technical Whitepaper).
// This program is free software: redistribute/modify under the AGPL; it comes with
// NO WARRANTY. If you run a modified version over a network, the AGPL requires you to
// offer its complete source to users.

// scripts/build-site.mjs
// CogMesh documentation-site builder
//
// docs/*.md (markdown sources) → site/*.html (web docs)
// Markdown is the single source of truth; this script generates the HTML.
//
// Features: responsive layout · dark/light mode · TOC · Mermaid diagrams · KaTeX math
//
// Usage: node scripts/build-site.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const SITE = path.join(ROOT, 'site');

// Documents to include in the site (in display order)
const PAGES = [
  { file: 'WHITEPAPER.en.md',  title: 'Whitepaper (EN)' },
  { file: 'WHITEPAPER.ko.md',  title: 'Whitepaper (KO)' },
];

// --- Markdown renderer (math/diagrams kept verbatim) ---
const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
md.use(anchor, { permalink: anchor.permalink.headerLink() });

// Turn ```mermaid code fences into <div class="mermaid">; leave $$…$$/$…$ for KaTeX
const defaultFence = md.renderer.rules.fence.bind(md.renderer.rules);
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.info.trim() === 'mermaid') {
    return `<div class="mermaid">${md.utils.escapeHtml(token.content)}</div>`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

// Rewrite .md links to .html (in-site navigation). e.g. WHITEPAPER.en.md → WHITEPAPER.en.html
function fixInternalLinks(html) {
  return html
    .replace(/href="\.\/(WHITEPAPER\.(?:en|ko))\.md"/g, 'href="$1.html"')
    .replace(/href="(WHITEPAPER\.(?:en|ko))\.md"/g, 'href="$1.html"')
    .replace(/href="\.\/([A-Z_]+)\.md"/g, 'href="$1.html"');
}

// Extract TOC (h2/h3)
function extractTOC(mdText) {
  const lines = mdText.split('\n');
  const toc = [];
  let inCode = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = /^(#{2,3})\s+(.+)$/.exec(line);
    if (m) {
      const level = m[1].length;
      const text = m[2].replace(/[#`*]/g, '').trim();
      const slug = text.toLowerCase()
        .replace(/[^\w\s가-힣-]/g, '')
        .replace(/\s+/g, '-');
      toc.push({ level, text, slug });
    }
  }
  return toc;
}

function pageHTML({ bodyHtml, toc, navHtml, title }) {
  const tocHtml = toc.map(t =>
    `<a class="toc-l${t.level}" href="#${t.slug}">${t.text}</a>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="ko" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · CogMesh</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>
:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--card:#161b22;--border:#30363d;--accent:#58a6ff;--accent2:#bc8cff}
[data-theme=light]{--bg:#ffffff;--fg:#1f2328;--muted:#656d76;--card:#f6f8fa;--border:#d0d7de;--accent:#0969da;--accent2:#8250df}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;line-height:1.7}
.layout{display:grid;grid-template-columns:240px 1fr 240px;max-width:1400px;margin:0 auto}
nav.side{position:sticky;top:0;height:100vh;overflow-y:auto;padding:1.5rem 1rem;border-right:1px solid var(--border)}
nav.side h1{font-size:1.1rem;margin:0 0 1rem}
nav.side a{display:block;color:var(--muted);text-decoration:none;padding:.35rem .5rem;border-radius:6px;font-size:.9rem}
nav.side a:hover{background:var(--card);color:var(--fg)}
nav.side a.active{color:var(--accent);font-weight:600}
main{padding:2.5rem 3rem;min-width:0;max-width:820px}
aside.toc{position:sticky;top:0;height:100vh;overflow-y:auto;padding:1.5rem 1rem;border-left:1px solid var(--border);font-size:.85rem}
aside.toc a{display:block;color:var(--muted);text-decoration:none;padding:.2rem 0}
aside.toc a:hover{color:var(--accent)}
aside.toc .toc-l3{padding-left:1rem;font-size:.8rem}
main h1{font-size:2rem;border-bottom:2px solid var(--border);padding-bottom:.4rem}
main h2{font-size:1.5rem;margin-top:2.5rem;border-bottom:1px solid var(--border);padding-bottom:.3rem}
main h3{font-size:1.2rem;margin-top:1.8rem;color:var(--accent2)}
main a{color:var(--accent)}
main code{background:var(--card);padding:.15em .4em;border-radius:5px;font-size:.88em}
main pre{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;overflow-x:auto}
main pre code{background:none;padding:0}
main table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.9rem}
main th,main td{border:1px solid var(--border);padding:.5rem .7rem;text-align:left}
main th{background:var(--card)}
main blockquote{border-left:4px solid var(--accent);margin:1rem 0;padding:.5rem 1rem;background:var(--card);border-radius:0 8px 8px 0;color:var(--muted)}
.mermaid{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;margin:1rem 0;text-align:center}
.themebtn{position:fixed;top:1rem;right:1rem;z-index:10;background:var(--card);border:1px solid var(--border);color:var(--fg);border-radius:20px;padding:.4rem .9rem;cursor:pointer;font-size:.85rem}
@media(max-width:1100px){.layout{grid-template-columns:1fr}nav.side,aside.toc{position:static;height:auto;border:none}main{padding:1.5rem}}
</style>
</head>
<body>
<button class="themebtn" onclick="toggleTheme()">🌓 Theme</button>
<div class="layout">
<nav class="side">
<h1>🧠 CogMesh</h1>
${navHtml}
<hr style="border-color:var(--border);margin:1rem 0">
<a href="https://github.com" style="font-size:.8rem">GitHub ↗</a>
</nav>
<main>
${bodyHtml}
</main>
<aside class="toc">
<div style="font-weight:600;margin-bottom:.5rem;color:var(--fg)">On this page</div>
${tocHtml}
</aside>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script>
function toggleTheme(){const h=document.documentElement;const t=h.getAttribute('data-theme')==='dark'?'light':'dark';h.setAttribute('data-theme',t);try{localStorage.setItem('theme',t)}catch(e){}initMermaid()}
(function(){try{const s=localStorage.getItem('theme');if(s)document.documentElement.setAttribute('data-theme',s)}catch(e){}})();
function initMermaid(){const dark=document.documentElement.getAttribute('data-theme')==='dark';mermaid.initialize({startOnLoad:false,theme:dark?'dark':'default'});document.querySelectorAll('.mermaid').forEach((el,i)=>{if(el.dataset.done){el.innerHTML=el.dataset.src;delete el.dataset.processed}el.dataset.src=el.dataset.src||el.textContent;});mermaid.run()}
document.addEventListener('DOMContentLoaded',()=>{
  renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false});
  initMermaid();
});
</script>
</body>
</html>`;
}

// --- build ---
if (!fs.existsSync(SITE)) fs.mkdirSync(SITE, { recursive: true });

const navHtml = PAGES.map(p => {
  const html = p.file.replace('.md', '.html');
  return `<a href="${html}">${p.title}</a>`;
}).join('\n');

for (const page of PAGES) {
  const src = path.join(DOCS, page.file);
  if (!fs.existsSync(src)) { console.warn(`⚠️ missing: ${page.file}`); continue; }
  const mdText = fs.readFileSync(src, 'utf-8');
  const toc = extractTOC(mdText);
  let bodyHtml = md.render(mdText);
  bodyHtml = fixInternalLinks(bodyHtml);

  const out = pageHTML({ bodyHtml, toc, navHtml, title: page.title });
  const outFile = path.join(SITE, page.file.replace('.md', '.html'));
  fs.writeFileSync(outFile, out, 'utf-8');
  console.log(`✅ ${page.file} → ${path.basename(outFile)} (${toc.length} TOC items)`);
}

// index.html = redirect to the English whitepaper
fs.writeFileSync(path.join(SITE, 'index.html'),
  `<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=WHITEPAPER.en.html"><a href="WHITEPAPER.en.html">Enter →</a>`,
  'utf-8');
console.log('✅ index.html (→ WHITEPAPER.en.html)');
console.log('\n🎉 site build complete! → site/');
