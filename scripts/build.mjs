// Builds the GitHub profile: assets/*.svg (dark + light) and README.md.
//
//   node scripts/build.mjs          (set GITHUB_TOKEN for the contribution calendar)
//
// Node 18+, no dependencies. Runs daily in .github/workflows/profile.yml.
//
// Design: native to GitHub rather than a copy of the portfolio. GitHub's own
// typeface (Mona Sans, variable width), Primer colours, Universe-style glow,
// and GitHub metaphors: a README file header, a Copilot ghost-text
// completion, pinned-repo cards with live stars/forks, a contribution
// heatmap redrawn from the real calendar, and posts as a `git log`.
//
// GitHub strips CSS/JS from READMEs, so every visual is an SVG image: fonts
// are subset per file and embedded, text that must fit uses textLength, and
// all motion is CSS/SMIL inside the SVG (switched off for reduced motion).

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../profile.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const DATA_FILE = path.join(ASSETS, 'data.json');
const W = 1200; // full-width SVGs; GitHub scales them to the column
const CARD_W = 590; // pinned cards, two per row

// Primer-based palettes (GitHub's own design tokens, lightly tuned).
const THEMES = {
  dark: {
    canvas: '#0d1117', subtle: '#151b23', inset: '#010409', border: '#3d444d', borderMuted: '#262c36',
    fg: '#f0f6fc', fg2: '#d1d7e0', muted: '#9198a1', link: '#4493f8', green: '#3fb950', purple: '#ab7df8',
    pink: '#f778ba', string: '#a5d6ff', keyword: '#ff7b72', btn: '#238636', onBtn: '#ffffff',
    heat: ['#151b23', '#033a16', '#196c2e', '#2ea043', '#56d364'], glow: 0.32
  },
  light: {
    canvas: '#ffffff', subtle: '#f6f8fa', inset: '#f6f8fa', border: '#d1d9e0', borderMuted: '#e4e8ec',
    fg: '#1f2328', fg2: '#393f46', muted: '#59636e', link: '#0969da', green: '#1a7f37', purple: '#8250df',
    pink: '#bf3989', string: '#0a3069', keyword: '#cf222e', btn: '#1f883d', onBtn: '#ffffff',
    heat: ['#eff2f5', '#aceebb', '#4ac26b', '#2da44e', '#116329'], glow: 0.16
  }
};

// One variable file per family covers every weight/width a file uses.
const FONTS = {
  sans: { css: 'Mona+Sans:wdth,wght@100..125,400..850', name: 'Mona Sans', stack: "'Mona Sans','Segoe UI','Helvetica Neue',Arial,sans-serif" },
  mono: { css: 'Martian+Mono:wght@400', name: 'Martian Mono', stack: "'Martian Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" }
};

// Language colours as GitHub (linguist) shows them.
const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c',
  Java: '#b07219', Python: '#3572A5', EJS: '#a91e50', 'Jupyter Notebook': '#DA5B0B', Shell: '#89e051',
  C: '#555555', 'C++': '#f34b7d', Go: '#00ADD8', PHP: '#4F5D95', Vue: '#41b883', Dockerfile: '#384d54'
};

const EASE = 'cubic-bezier(.2,.8,.2,1)';

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Rough advance widths (em) for wrapping and fit checks; generous on purpose.
const measure = (font, size, str, stretch = 100) => {
  if (font === 'mono') return String(str).length * size * 0.66 * (stretch / 100);
  let em = 0;
  for (const ch of String(str)) {
    if (/[A-Z]/.test(ch)) em += 0.69;
    else if (/[a-z]/.test(ch)) em += 0.56;
    else if (/[0-9]/.test(ch)) em += 0.62;
    else if (ch === ' ') em += 0.27;
    else em += 0.36;
  }
  return em * size * (stretch / 100);
};
const wrap = (size, str, maxW, maxLines = 99, stretch = 100) => {
  const lines = [];
  let cur = '';
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measure('sans', size, next, stretch) > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}…`;
  }
  return lines;
};
// textLength attribute only when the estimate says the text would overflow.
const fit = (font, size, str, maxW, stretch = 100) =>
  (measure(font, size, str, stretch) > maxW ? `textLength="${Math.round(maxW)}" lengthAdjust="spacingAndGlyphs"` : '');

const ago = (date) => {
  const days = Math.max(0, Math.round((Date.now() - new Date(date)) / 86400000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months} month${months > 1 ? 's' : ''} ago` : `${Math.round(months / 12)} year(s) ago`;
};
const shortSha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 7);
const repoName = (url) => (url ? url.replace(/\/+$/, '').split('/').pop() : '');

// ---------------------------------------------------------------- fonts

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const fontCache = new Map();

// Variable @font-face rules subset to exactly `chars`, base64-embedded.
// On failure returns '' and the SVG falls back to system fonts.
const fontFaces = (family, chars) => {
  const glyphs = [...new Set(chars)].filter((c) => c.trim()).sort().join('');
  if (!glyphs) return Promise.resolve('');
  const key = `${family}:${glyphs}`;
  if (!fontCache.has(key)) {
    fontCache.set(key, (async () => {
      try {
        const url = `https://fonts.googleapis.com/css2?family=${FONTS[family].css}&text=${encodeURIComponent(`${glyphs} `)}&display=block`;
        const css = await (await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })).text();
        const blocks = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]);
        const rules = await Promise.all(blocks.map(async (b) => {
          const src = (b.match(/src:\s*url\(([^)]+)\)/) || [])[1];
          if (!src) return '';
          const weight = (b.match(/font-weight:\s*([^;]+);/) || [])[1] || '400';
          const stretch = (b.match(/font-stretch:\s*([^;]+);/) || [])[1] || '100%';
          const buf = Buffer.from(await (await fetch(src, { signal: AbortSignal.timeout(15000) })).arrayBuffer());
          return `@font-face{font-family:'${FONTS[family].name}';font-weight:${weight};font-stretch:${stretch};src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`;
        }));
        return rules.join('');
      } catch (e) {
        console.warn(`  ⚠ font ${family}: ${e.message} (using system fonts)`);
        return '';
      }
    })());
  }
  return fontCache.get(key);
};

// One SVG document; text goes through doc.t()/doc.m() so the builder knows
// which glyphs to embed.
class Doc {
  constructor(theme) {
    this.theme = theme;
    this.c = THEMES[theme];
    this.used = { sans: '', mono: '' };
    this.n = 0;
  }
  t(str) { this.used.sans += str; return esc(str); }
  m(str) { this.used.mono += str; return esc(str); }
  id(p) { this.n += 1; return `${p}${this.n}`; }
  async render({ width = W, height, title, body, css = '' }) {
    const faces = (await Promise.all(Object.keys(this.used).map((f) => fontFaces(f, this.used[f])))).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${faces}
.s{font-family:${FONTS.sans.stack}}.m{font-family:${FONTS.mono.stack}}
@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.up{animation:up .8s ${EASE} both}
@keyframes blurin{from{opacity:0;filter:blur(8px)}to{opacity:1;filter:none}}
.blurin{animation:blurin 1s ${EASE} both}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.pulse{animation:pulse 2s ease-in-out infinite}
${css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
${body}
</svg>`;
  }
}

const delay = (ms) => `style="animation-delay:${ms}ms"`;

// Blue → purple → pink, the Copilot/Universe gradient. Repeats so it can slide.
const gradientDef = (d, id, { x2 = 600, slide = false } = {}) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${x2}" y2="0" spreadMethod="repeat">
  <stop offset="0" stop-color="${d.c.link}"/><stop offset=".33" stop-color="${d.c.purple}"/><stop offset=".66" stop-color="${d.c.pink}"/><stop offset="1" stop-color="${d.c.link}"/>
  ${slide ? `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${x2} 0" dur="9s" repeatCount="indefinite"/>` : ''}
</linearGradient>`;

// Drifting, blurred colour orbs clipped to a card.
const orbs = (d, clipId, w, h, spots) => `<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70"/></filter>
<g clip-path="url(#${clipId})" filter="url(#soft)" opacity="${d.c.glow}">
${spots.map(([cx, cy, r, color, dx, dy, dur]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"><animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy};0 0" dur="${dur}s" repeatCount="indefinite"/></circle>`).join('\n')}
</g>`;

// Simple geometric icons (16px grid), stroked in the current colour.
const ICON = {
  repo: (x, y, color) => `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.5h9.5v11H4.5A1.5 1.5 0 0 1 3 12V2.5Z"/><path d="M3 11.5A1.5 1.5 0 0 1 4.5 10h8"/><path d="M6 13.5v2l1.25-.9 1.25.9v-2"/></g>`,
  fork: (x, y, color) => `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"><circle cx="4" cy="3" r="1.6"/><circle cx="12" cy="3" r="1.6"/><circle cx="8" cy="13" r="1.6"/><path d="M4 4.6v1.4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4.6M8 8v3.4"/></g>`,
  star: (x, y, color) => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 3.2 : 7.2;
      return `${(8 + r * Math.cos(a)).toFixed(2)},${(8.4 + r * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
    return `<g transform="translate(${x} ${y})"><polygon points="${pts}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/></g>`;
  },
  pin: (x, y, color) => `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 1.5l5 5-2.5 1-3 3 .5 3-1.5 1.5-6-6L3.5 7.5l3 .5 3-3 0-3.5Z"/><path d="M5 11l-3.5 3.5"/></g>`,
  graph: (x, y, color) => `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 1.5v13h13"/><path d="M4 10l3-3 2.5 2.5L14 5"/></g>`,
  commit: (x, y, color) => `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M1 8h4M11 8h4"/></g>`,
  pulse: (x, y, color) => `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8h3l2-5 4 10 2-5h3"/></g>`,
  arrow: (x, y, color) => `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 11.5l7-7M6 4.5h5.5V10"/></g>`
};

// ---------------------------------------------------------------- components

// Hero: a README "file" with a Copilot-style ghost-text completion.
const hero = async (theme, data, avatar) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 470;
  const role = data.role;

  // Copilot line: typed prefix, ghost suggestion streams in, Tab, accepted.
  const size = 19;
  const key = 'focus';
  const typed = '"full-stack products';
  const ghost = ' with React, Node.js and MongoDB",';
  const full = `${key}: ${typed}${ghost}`;
  const lineX = 112;
  const lineY = 410;
  const fullW = Math.round(full.length * size * 0.66);
  const typedLen = `${key}: ${typed}`.length;
  const typedW = Math.round(fullW * (typedLen / full.length));
  const DUR = 10;
  const steps = 9;
  const ghostW = fullW - typedW;
  // The suggestion streams in chunk by chunk (12%-36% of the loop), waits for
  // Tab, then disappears at 48% when the accepted line takes its place.
  const widths = [0, ...Array.from({ length: steps }, (_, i) => Math.round((ghostW * (i + 1)) / steps)), 0, 0];
  const times = [0, ...Array.from({ length: steps }, (_, i) => +(0.12 + (0.24 * i) / (steps - 1)).toFixed(3)), 0.48, 1];
  const tokens = (k, s, rest) => `<tspan fill="${c.keyword}">${d.m(k)}</tspan><tspan fill="${c.fg2}">${d.m(': ')}</tspan><tspan fill="${c.string}">${d.m(s)}</tspan>${rest ? `<tspan fill="${c.string}">${d.m(rest)}</tspan>` : ''}`;

  const name = config.name;
  const nameSize = 92;
  const nameMax = W - 240 - 40;

  const body = `<defs>
<clipPath id="card"><rect width="${W}" height="${H}" rx="22"/></clipPath>
<clipPath id="av"><circle cx="112" cy="190" r="56"/></clipPath>
<clipPath id="ghostclip"><rect x="${lineX + typedW}" y="${lineY - 26}" height="40" width="0"><animate attributeName="width" values="${widths.join(';')}" keyTimes="${times.join(';')}" dur="${DUR}s" repeatCount="indefinite" calcMode="discrete"/></rect></clipPath>
${gradientDef(d, 'g', { slide: true })}
${gradientDef(d, 'ring', { x2: 140 })}
<pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="${c.border}" stroke-width="1"/></pattern>
<radialGradient id="fade" cx=".75" cy=".2" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="gridmask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
</defs>
<rect width="${W}" height="${H}" rx="22" fill="${c.subtle}"/>
${orbs(d, 'card', W, H, [[980, 60, 210, c.purple, -120, 60, 19], [760, 380, 180, c.link, 140, -40, 23], [1160, 360, 160, c.pink, -80, -70, 17]])}
<rect width="${W}" height="${H}" fill="url(#grid)" mask="url(#gridmask)" opacity=".55" clip-path="url(#card)"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="22" fill="none" stroke="${c.border}"/>

<!-- file header, like a README on GitHub -->
${ICON.repo(32, 30, c.muted)}
<text x="58" y="44" class="m" font-size="13" fill="${c.muted}">${d.m(config.user)}<tspan fill="${c.muted}"> / </tspan><tspan fill="${c.fg}">${d.m('README.md')}</tspan></text>
<circle cx="${W - 158}" cy="40" r="4.5" fill="${c.green}" class="pulse"/>
<text x="${W - 32}" y="44" text-anchor="end" class="m" font-size="12" fill="${c.muted}">${d.m('synced daily')}</text>
<line x1="0" y1="72" x2="${W}" y2="72" stroke="${c.borderMuted}"/>

<!-- avatar with a rotating gradient ring -->
<g class="up">
  <circle cx="112" cy="190" r="63" fill="none" stroke="url(#ring)" stroke-width="3.5" stroke-dasharray="290 106" stroke-linecap="round">
    <animateTransform attributeName="transform" type="rotate" from="0 112 190" to="360 112 190" dur="12s" repeatCount="indefinite"/>
  </circle>
  ${avatar ? `<image href="${avatar}" x="56" y="134" width="112" height="112" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>` : `<circle cx="112" cy="190" r="56" fill="${c.border}"/>`}
</g>

<g class="up" ${delay(120)}>
  <text x="208" y="170" class="m" font-size="14" fill="${c.muted}">${d.m(`@${config.user}`)}</text>
  <text x="204" y="250" class="s" font-size="${nameSize}" font-weight="850" font-stretch="125%" letter-spacing="-2" fill="url(#g)" ${fit('sans', nameSize, name, nameMax, 125)}>${d.t(name)}</text>
</g>

<g class="up" ${delay(260)}>
  <rect x="208.5" y="276.5" width="${Math.round(measure('mono', 13, `${role ? `${role.role} @ ${role.company}` : config.role} · ${config.location}`)) + 44}" height="30" rx="15" fill="${c.canvas}" fill-opacity=".6" stroke="${c.border}"/>
  <circle cx="226" cy="291.5" r="4" fill="${c.green}"/>
  <text x="238" y="296" class="m" font-size="13" fill="${c.fg2}">${d.m(`${role ? `${role.role} @ ${role.company}` : config.role} · ${config.location}`)}</text>
</g>

<!-- editor strip with the ghost-text completion -->
<g class="up" ${delay(400)}>
  <rect x="40.5" y="352.5" width="${W - 81}" height="88" rx="12" fill="${c.inset}" fill-opacity="${theme === 'dark' ? 0.75 : 0.9}" stroke="${c.border}"/>
  <text x="62" y="380" class="m" font-size="12" fill="${c.muted}">${d.m('1')}</text>
  <text x="62" y="${lineY}" class="m" font-size="12" fill="${c.muted}">${d.m('2')}</text>
  <text x="${lineX}" y="380" class="m" font-size="13" fill="${c.muted}">${d.m('// what I build')}</text>
  <!-- ghost suggestion (muted), revealed chunk by chunk -->
  <g clip-path="url(#ghostclip)"><text x="${lineX}" y="${lineY}" class="m" font-size="${size}" font-style="italic" fill="${c.muted}" textLength="${fullW}" lengthAdjust="spacing">${d.m(full)}</text></g>
  <!-- typed prefix -->
  <text x="${lineX}" y="${lineY}" class="m" font-size="${size}" textLength="${typedW}" lengthAdjust="spacing">${tokens(key, typed)}</text>
  <!-- accepted line -->
  <text x="${lineX}" y="${lineY}" class="m" font-size="${size}" textLength="${fullW}" lengthAdjust="spacing" opacity="0">${tokens(key, typed, ghost)}
    <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.46;.49;.94;1" dur="${DUR}s" repeatCount="indefinite"/></text>
  <!-- Tab hint -->
  <g opacity="0">
    <rect x="${lineX + fullW + 14}" y="${lineY - 19}" width="46" height="26" rx="6" fill="none" stroke="${c.border}"/>
    <text x="${lineX + fullW + 37}" y="${lineY - 1}" text-anchor="middle" class="m" font-size="12" fill="${c.fg2}">${d.m('Tab')}</text>
    <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.37;.39;.46;.48;1" dur="${DUR}s" repeatCount="indefinite"/>
  </g>
  <rect x="${lineX + typedW + 1}" y="${lineY - 18}" width="2" height="22" fill="${c.link}">
    <animate attributeName="x" values="${lineX + typedW + 1};${lineX + typedW + 1};${lineX + fullW + 2};${lineX + fullW + 2};${lineX + typedW + 1}" keyTimes="0;.47;.49;.94;1" dur="${DUR}s" repeatCount="indefinite" calcMode="discrete"/>
    <animate attributeName="opacity" values="1;0;1" dur="1.1s" repeatCount="indefinite" calcMode="discrete"/>
  </rect>
</g>`;

  return d.render({
    height: H,
    title: `${name} (@${config.user}). ${role ? `${role.role} at ${role.company}, ${config.location}. ` : ''}Builds full-stack products with React, Node.js and MongoDB.`,
    body
  });
};

// Insights strip: contributions sparkline, repos, problems, language bar.
const insights = async (theme, data) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 214;
  const cellW = W / 4;
  const gh = data.github || {};
  const cells = [];
  const cell = (i, label, value, sub, extra = '') => `<g class="up" ${delay(i * 90)}>
  <text x="${i * cellW + 32}" y="48" class="m" font-size="11" letter-spacing="1.4" fill="${c.muted}">${d.m(label.toUpperCase())}</text>
  ${value != null ? `<text x="${i * cellW + 30}" y="116" class="s blurin" ${delay(200 + i * 120)} font-size="56" font-weight="800" font-stretch="112%" letter-spacing="-1.5" fill="${c.fg}">${d.t(String(value))}</text>` : ''}
  ${sub ? `<text x="${i * cellW + 32}" y="146" class="s" font-size="15" fill="${c.muted}">${d.t(sub)}</text>` : ''}
  ${extra}
</g>`;

  // 1. contributions + monthly sparkline
  const months = gh.months || [];
  let spark = '';
  if (months.length > 1) {
    const max = Math.max(1, ...months);
    const x0 = 32;
    const x1 = cellW - 32;
    const pts = months.map((v, i) => [x0 + ((x1 - x0) * i) / (months.length - 1), 196 - (v / max) * 30]);
    const dPath = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    spark = `<path d="${dPath}" fill="none" stroke="url(#g)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="draw"/>
  <circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="4" fill="${c.pink}" class="pulse"/>`;
  }
  cells.push(cell(0, 'Contributions · 12 mo', gh.contributions ?? '—', 'on GitHub this year', spark));
  cells.push(cell(1, 'Public repositories', gh.repos ?? '—', `building in public since ${gh.since || 2022}`));
  cells.push(cell(2, 'Problems solved', data.badge?.number || '150+', 'LeetCode + HackerRank'));

  // 4. language bar, GitHub-style
  const langs = gh.languages || [];
  const total = langs.reduce((s, l) => s + l.count, 0) || 1;
  const bx = 3 * cellW + 32;
  const bw = cellW - 64;
  let acc = 0;
  const segs = langs.map((l) => {
    const w = (l.count / total) * bw;
    const seg = `<rect x="${(bx + acc).toFixed(1)}" y="78" width="${Math.max(0, w - 2).toFixed(1)}" height="10" rx="3" fill="${LANG_COLORS[l.name] || c.muted}"/>`;
    acc += w;
    return seg;
  }).join('');
  const legend = langs.slice(0, 4).map((l, i) => {
    const lx = bx + (i % 2) * (bw / 2);
    const ly = 124 + Math.floor(i / 2) * 30;
    return `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${LANG_COLORS[l.name] || c.muted}"/><text x="${lx + 16}" y="${ly}" class="s" font-size="14" font-weight="600" fill="${c.fg2}">${d.t(l.name)}<tspan font-weight="400" fill="${c.muted}">${d.t(` ${Math.round((l.count / total) * 100)}%`)}</tspan></text>`;
  }).join('');
  cells.push(cell(3, 'Languages · by repo', null, null, `<g class="grow">${segs}</g>${legend}`));

  return d.render({
    height: H,
    title: `Insights: ${gh.contributions ?? ''} contributions in the last year, ${gh.repos ?? ''} public repositories, ${data.badge?.number || '150+'} problems solved. Top languages: ${langs.slice(0, 4).map((l) => l.name).join(', ')}.`,
    body: `<defs>${gradientDef(d, 'g', { x2: cellW })}</defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="${c.subtle}" stroke="${c.border}"/>
${[1, 2, 3].map((i) => `<line x1="${i * cellW}" y1="24" x2="${i * cellW}" y2="${H - 24}" stroke="${c.borderMuted}"/>`).join('')}
${cells.join('\n')}`,
    css: `@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}.draw{stroke-dasharray:1;animation:draw 1.8s ${EASE} .4s both}
@keyframes grow{from{transform:scaleX(0)}to{transform:none}}.grow{transform-box:fill-box;transform-origin:left;animation:grow 1.2s ${EASE} .5s both}`
  });
};

// Contribution heatmap drawn from the real calendar, columns popping in.
const heatmap = async (theme, data) => {
  const d = new Doc(theme);
  const c = d.c;
  const days = data.github?.calendar || [];
  const H = 270;
  if (!days.length) {
    return d.render({
      height: 120,
      title: 'Contribution calendar unavailable',
      body: `<rect x=".5" y=".5" width="${W - 1}" height="119" rx="18" fill="${c.subtle}" stroke="${c.border}"/><text x="40" y="66" class="s" font-size="17" fill="${c.muted}">${d.t('Contribution calendar shows up after the next scheduled build.')}</text>`
    });
  }
  const cell = 16;
  const gap = 4.2;
  const x0 = 82;
  const y0 = 104;
  const first = new Date(days[0][0]);
  const offset = first.getUTCDay(); // calendar weeks start on Sunday
  let rects = '';
  let monthLabels = '';
  let lastMonth = -1;
  const css = [];
  const cols = Math.ceil((days.length + offset) / 7);
  for (let col = 0; col < cols; col++) css.push(`.w${col}{animation-delay:${col * 16}ms}`);
  days.forEach(([date, , level], i) => {
    const pos = i + offset;
    const col = Math.floor(pos / 7);
    const row = pos % 7;
    const x = x0 + col * (cell + gap);
    const y = y0 + row * (cell + gap);
    rects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell}" height="${cell}" rx="4" fill="${c.heat[level] || c.heat[0]}" class="hc w${col}"/>`;
    const m = new Date(date).getUTCMonth();
    if (row === 0 && m !== lastMonth && col < cols - 2) {
      monthLabels += `<text x="${x.toFixed(1)}" y="${y0 - 14}" class="s" font-size="13" fill="${c.muted}">${d.t(new Date(date).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }))}</text>`;
      lastMonth = m;
    }
  });
  const last = days.length - 1 + offset;
  const lx = x0 + Math.floor(last / 7) * (cell + gap);
  const ly = y0 + (last % 7) * (cell + gap);
  const total = data.github?.contributions ?? days.reduce((s, x) => s + x[1], 0);
  const legendX = W - 40 - (5 * (cell + gap)) - 44;

  return d.render({
    height: H,
    title: `${total} contributions in the last year`,
    body: `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="18" fill="${c.subtle}" stroke="${c.border}"/>
<text x="40" y="50" class="s" font-size="19" font-weight="650" fill="${c.fg}">${d.t(`${total} contributions`)}<tspan font-weight="400" fill="${c.muted}">${d.t(' in the last year')}</tspan></text>
<text x="${legendX - 10}" y="49" text-anchor="end" class="s" font-size="12" fill="${c.muted}">${d.t('Less')}</text>
${c.heat.map((h, i) => `<rect x="${legendX + i * (cell + gap)}" y="36" width="${cell}" height="${cell}" rx="4" fill="${h}"/>`).join('')}
<text x="${legendX + 5 * (cell + gap) + 6}" y="49" class="s" font-size="12" fill="${c.muted}">${d.t('More')}</text>
${monthLabels}
${['Mon', 'Wed', 'Fri'].map((t, i) => `<text x="40" y="${y0 + (1 + i * 2) * (cell + gap) + 12}" class="s" font-size="12" fill="${c.muted}">${d.t(t)}</text>`).join('')}
${rects}
<rect x="${lx - 3}" y="${ly - 3}" width="${cell + 6}" height="${cell + 6}" rx="6" fill="none" stroke="${c.green}" stroke-width="1.5" class="pulse"/>`,
    css: `@keyframes hc{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:none}}.hc{transform-box:fill-box;transform-origin:center;animation:hc .45s ${EASE} both}\n${css.join('')}`
  });
};

// Section heading, GitHub h2 style: icon, title, hairline underneath.
const heading = async (theme, icon, text, hint) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 82;
  return d.render({
    height: H,
    title: text,
    body: `<defs>${gradientDef(d, 'g', { x2: 44 })}</defs>
<g class="up">
  <rect x=".75" y="20.75" width="38.5" height="38.5" rx="10" fill="none" stroke="url(#g)" stroke-width="1.5"/>
  ${ICON[icon](12, 32, c.fg)}
  <text x="56" y="50" class="s" font-size="28" font-weight="700" font-stretch="110%" letter-spacing="-.4" fill="${c.fg}">${d.t(text)}</text>
  ${hint ? `<text x="${W}" y="48" text-anchor="end" class="m" font-size="12" fill="${c.muted}">${d.m(hint)}</text>` : ''}
</g>
<line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="${c.borderMuted}"/>`
  });
};

// Pinned-repo card with live language / stars / forks.
const pinCard = async (theme, p, repo, index) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 172;
  const w = CARD_W;
  const hue = [c.link, c.purple, c.pink, c.green][index % 4];
  const title = p.title;
  const lang = repo?.language;
  const desc = wrap(15.5, p.what, w - 56, 2);
  const pill = p.status ? p.status : (repo ? 'Public' : 'Private');
  const pillW = measure('mono', 11, pill) + 22;
  let fx = 24;
  const foot = [];
  if (lang) {
    foot.push(`<circle cx="${fx + 6}" cy="${H - 31}" r="6" fill="${LANG_COLORS[lang] || c.muted}"/><text x="${fx + 18}" y="${H - 26}" class="s" font-size="13.5" fill="${c.muted}">${d.t(lang)}</text>`);
    fx += 28 + measure('sans', 13.5, lang);
  }
  // Like GitHub's pinned cards: stars/forks only when there are some.
  if (repo?.stars) {
    foot.push(`${ICON.star(fx, H - 40, c.muted)}<text x="${fx + 21}" y="${H - 26}" class="s" font-size="13.5" fill="${c.muted}">${d.t(String(repo.stars))}</text>`);
    fx += 42 + measure('sans', 13.5, String(repo.stars));
  }
  if (repo?.forks) {
    foot.push(`${ICON.fork(fx, H - 40, c.muted)}<text x="${fx + 21}" y="${H - 26}" class="s" font-size="13.5" fill="${c.muted}">${d.t(String(repo.forks))}</text>`);
    fx += 42 + measure('sans', 13.5, String(repo.forks));
  }
  if (!lang && p.stack?.length) {
    foot.push(`<text x="${fx}" y="${H - 26}" class="s" font-size="13.5" fill="${c.muted}">${d.t(p.stack.slice(0, 3).join(' · '))}</text>`);
  }
  const live = p.url ? `<text x="${w - 46}" y="${H - 26}" text-anchor="end" class="m" font-size="12" fill="${c.link}">${d.m('live')}</text>${ICON.arrow(w - 42, H - 40, c.link)}` : '';

  return d.render({
    width: w,
    height: H,
    title: `${title}: ${p.what}.${lang ? ` ${lang}.` : ''}${repo ? ` ${repo.stars} stars, ${repo.forks} forks.` : ''}`,
    body: `<defs><clipPath id="cc"><rect width="${w}" height="${H}" rx="16"/></clipPath>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter></defs>
<rect width="${w}" height="${H}" rx="16" fill="${c.subtle}"/>
<g clip-path="url(#cc)" filter="url(#soft)" opacity="${c.glow * 0.9}"><circle cx="${w - 40}" cy="10" r="90" fill="${hue}"><animate attributeName="r" values="80;105;80" dur="${8 + index}s" repeatCount="indefinite"/></circle></g>
<rect x=".5" y=".5" width="${w - 1}" height="${H - 1}" rx="16" fill="none" stroke="${c.border}"/>
<g class="up" ${delay(index * 70)}>
  ${ICON.repo(22, 25, c.muted)}
  <text x="48" y="39" class="s" font-size="19" font-weight="650" fill="${c.link}" ${fit('sans', 19, title, w - 120 - pillW)}>${d.t(title)}</text>
  <rect x="${w - 24 - pillW + 0.5}" y="22.5" width="${pillW}" height="24" rx="12" fill="${p.status ? hue : 'none'}" fill-opacity="${p.status ? 0.16 : 0}" stroke="${p.status ? hue : c.border}"/>
  <text x="${w - 24 - pillW / 2}" y="38.5" text-anchor="middle" class="m" font-size="11" fill="${p.status ? hue : c.muted}">${d.m(pill)}</text>
  ${desc.map((ln, i) => `<text x="24" y="${80 + i * 23}" class="s" font-size="15.5" fill="${c.fg2}">${d.t(ln)}</text>`).join('')}
  ${foot.join('')}
  ${live}
</g>`
  });
};

// One post as a commit in `git log --graph`.
const commitRow = async (theme, post, index, count) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 84;
  const head = index === 0;
  const sha = shortSha(post.externalUrl);
  const when = ago(post.createdAt);
  const tags = (post.tags || []).slice(0, 2);
  const tagHues = [c.purple, c.link, c.pink];
  let tx = W - 24 - measure('mono', 12, when) - 18;
  const pills = tags.map((t, i) => {
    const tw = measure('sans', 12.5, t) + 22;
    tx -= tw + 8;
    const hue = tagHues[i % tagHues.length];
    return `<rect x="${tx.toFixed(1)}" y="${H / 2 - 12}" width="${tw.toFixed(1)}" height="24" rx="12" fill="${hue}" fill-opacity=".14" stroke="${hue}" stroke-opacity=".5"/><text x="${(tx + tw / 2).toFixed(1)}" y="${H / 2 + 4.5}" text-anchor="middle" class="s" font-size="12.5" font-weight="600" fill="${hue}">${d.t(t)}</text>`;
  }).join('');
  const titleX = head ? 252 : 150;
  const titleMax = tx - titleX - 20;
  return d.render({
    height: H,
    title: `${post.title}, published ${when}${post.readTime ? `, ${post.readTime}` : ''}.`,
    body: `<line x1="36" y1="${index === 0 ? H / 2 : 0}" x2="36" y2="${index === count - 1 ? H / 2 : H}" stroke="${c.border}" stroke-width="2"/>
<g class="up" ${delay(index * 110)}>
  <circle cx="36" cy="${H / 2}" r="8" fill="${head ? c.green : c.canvas}" stroke="${head ? c.green : c.link}" stroke-width="2.5"/>
  ${head ? `<circle cx="36" cy="${H / 2}" r="13" fill="none" stroke="${c.green}" stroke-opacity=".5" class="pulse"/>` : ''}
  <text x="66" y="${H / 2 + 5}" class="m" font-size="13" fill="${c.link}">${d.m(sha)}</text>
  ${head ? `<rect x="140.5" y="${H / 2 - 12.5}" width="100" height="25" rx="12.5" fill="none" stroke="${c.green}"/><text x="190.5" y="${H / 2 + 4.5}" text-anchor="middle" class="m" font-size="11" fill="${c.green}">${d.m('HEAD → main')}</text>` : ''}
  <text x="${titleX}" y="${H / 2 + 7}" class="s" font-size="19.5" font-weight="600" fill="${c.fg}" ${fit('sans', 19.5, post.title, titleMax)}>${d.t(post.title)}</text>
  ${pills}
  <text x="${W - 24}" y="${H / 2 + 5}" text-anchor="end" class="m" font-size="12" fill="${c.muted}">${d.m(when)}</text>
</g>
<line x1="64" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}" stroke="${c.borderMuted}"/>`
  });
};

const footer = async (theme) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 300;
  const line = "Let's build something together.";
  return d.render({
    height: H,
    title: `${line} Say hello at ${config.site}.`,
    body: `<defs><clipPath id="card"><rect width="${W}" height="${H}" rx="22"/></clipPath>${gradientDef(d, 'g', { x2: W, slide: true })}</defs>
<rect width="${W}" height="${H}" rx="22" fill="${c.subtle}"/>
${orbs(d, 'card', W, H, [[160, 300, 220, c.purple, 120, -40, 18], [1050, 0, 220, c.link, -120, 60, 21], [620, 330, 160, c.pink, -90, -30, 15]])}
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="21" fill="none" stroke="url(#g)" stroke-width="2"/>
<g class="up">
  <text x="48" y="78" class="m" font-size="12" letter-spacing="1.4" fill="${c.muted}">${d.m('$ git commit -m "hello"')}</text>
  <text x="46" y="148" class="s" font-size="58" font-weight="850" font-stretch="118%" letter-spacing="-1.6" fill="${c.fg}" ${fit('sans', 58, line, W - 96, 118)}>${d.t(line)}</text>
  <text x="48" y="190" class="s" font-size="19" fill="${c.fg2}">${d.t('Questions, collaborations or just a hello: my inbox is open.')}</text>
</g>
<g class="up" ${delay(200)}>
  <rect x="48" y="220" width="196" height="46" rx="10" fill="${c.btn}"/>
  <text x="146" y="249" text-anchor="middle" class="s" font-size="16" font-weight="650" fill="${c.onBtn}">${d.t('Say hello →')}</text>
  <rect x="256.5" y="220.5" width="${Math.round(measure('mono', 13, config.site.replace(/^https?:\/\//, ''))) + 40}" height="45" rx="10" fill="${c.canvas}" fill-opacity=".5" stroke="${c.border}"/>
  <text x="276" y="248" class="m" font-size="13" fill="${c.fg2}">${d.m(config.site.replace(/^https?:\/\//, ''))}</text>
</g>`
  });
};

// ---------------------------------------------------------------- data

const getJSON = async (url, headers = {}) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'profile-builder', ...headers }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
};

const loadData = async () => {
  const prev = await readFile(DATA_FILE, 'utf8').then(JSON.parse).catch(() => ({}));
  const data = { ...prev };
  const api = config.api;
  const token = process.env.GITHUB_TOKEN;
  const auth = token ? { Authorization: `Bearer ${token}` } : {};

  const sources = {
    role: async () => {
      const list = await getJSON(`${api}/api/experience`);
      const cur = list.find((e) => /present/i.test(e.period || '') && e.employmentType === 'Full-time')
        || list.find((e) => /present/i.test(e.period || ''));
      return cur ? { role: cur.role, company: cur.company, location: cur.location || '' } : null;
    },
    badge: async () => {
      const a = await getJSON(`${api}/api/about`);
      return a?.badgeNumber ? { number: a.badgeNumber, text: a.badgeText } : null;
    },
    posts: async () => (await getJSON(`${api}/api/blogs?limit=${config.postsToShow}`))
      .map(({ title, externalUrl, readTime, createdAt, tags }) => ({ title, externalUrl, readTime, createdAt, tags: (tags || []).slice(0, 3) })),
    github: async () => {
      const u = await getJSON(`https://api.github.com/users/${config.user}`, auth);
      const repos = await getJSON(`https://api.github.com/users/${config.user}/repos?per_page=100&type=owner`, auth);
      const own = repos.filter((r) => !r.fork);
      const langCount = {};
      const hidden = new Set(config.hideLanguages || []);
      own.forEach((r) => { if (r.language && !hidden.has(r.language)) langCount[r.language] = (langCount[r.language] || 0) + 1; });
      const out = {
        repos: u.public_repos,
        since: new Date(u.created_at).getFullYear(),
        avatarUrl: u.avatar_url,
        languages: Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count })),
        repoStats: Object.fromEntries(repos.map((r) => [r.name.toLowerCase(), { stars: r.stargazers_count, forks: r.forks_count, language: r.language }]))
      };
      if (token) {
        const r = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json', 'User-Agent': 'profile-builder' },
          body: JSON.stringify({
            query: 'query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}}}',
            variables: { u: config.user }
          }),
          signal: AbortSignal.timeout(20000)
        });
        const cal = (await r.json())?.data?.user?.contributionsCollection?.contributionCalendar;
        if (cal) {
          const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
          out.contributions = cal.totalContributions;
          out.calendar = cal.weeks.flatMap((w) => w.contributionDays.map((day) => [day.date, day.contributionCount, LEVEL[day.contributionLevel] ?? 0]));
          // Last 12 calendar months, oldest first, for the sparkline.
          const byMonth = {};
          out.calendar.forEach(([date, count]) => { byMonth[date.slice(0, 7)] = (byMonth[date.slice(0, 7)] || 0) + count; });
          out.months = Object.keys(byMonth).sort().slice(-12).map((k) => byMonth[k]);
        }
      } else {
        // Without a token keep the last good calendar (if any).
        Object.assign(out, { contributions: prev.github?.contributions, calendar: prev.github?.calendar, months: prev.github?.months });
      }
      return out;
    }
  };

  for (const [key, fn] of Object.entries(sources)) {
    try {
      data[key] = await fn();
      console.log(`  ✓ ${key}`);
    } catch (e) {
      console.warn(`  ⚠ ${key}: ${e.message} (keeping last value)`);
    }
  }
  data.updatedAt = new Date().toISOString();
  return data;
};

const fetchAvatar = async (url) => {
  if (!url) return '';
  try {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}s=240`, { signal: AbortSignal.timeout(15000) });
    const type = r.headers.get('content-type') || 'image/png';
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  } catch {
    return '';
  }
};

// ---------------------------------------------------------------- README

const pic = (base, alt, width = '100%') =>
  `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/${base}-dark.svg"><img src="assets/${base}-light.svg" width="${width}" alt="${esc(alt)}"></picture>`;
const linked = (href, inner) => (href ? `<a href="${esc(href)}">${inner}</a>` : inner);

const readme = (data, cards, commits) => {
  const pairs = [];
  for (let i = 0; i < cards.length; i += 2) {
    pairs.push(cards.slice(i, i + 2).map(({ base, href, alt }) => linked(href, pic(base, alt, '49%'))).join(' '));
  }
  return `<!-- Generated by scripts/build.mjs from profile.config.mjs and live data. Edit those, not this file. -->
<div align="center">

${pic('hero', `${config.name} (@${config.user}). ${data.role ? `${data.role.role} at ${data.role.company}. ` : ''}Builds full-stack products with React, Node.js and MongoDB.`)}

${pic('insights', 'Insights: contributions, repositories, problems solved and top languages.')}

${pic('h-pinned', 'Pinned')}

${pairs.join('\n\n')}

${pic('h-activity', 'Contribution activity')}

${pic('heatmap', `${data.github?.contributions ?? ''} contributions in the last year`)}

${pic('h-writing', 'Writing')}

${commits.map(({ base, href, alt }) => linked(href, pic(base, alt))).join('\n')}

<sub><a href="https://sahilxdev.hashnode.dev">git log --all → read every post on Hashnode</a></sub>

${linked(`${config.site}/#contact`, pic('footer', `Let's build something together. Say hello at ${config.site}.`))}

${config.links.map(([label, href]) => `<a href="${esc(href)}">${esc(label)}</a>`).join(' &nbsp;·&nbsp; ')}

<sub>Synced ${new Date(data.updatedAt).toUTCString().replace(/:\d\d GMT$/, ' UTC')} from my portfolio's admin panel, Hashnode and the GitHub API.</sub>

</div>
`;
};

// ---------------------------------------------------------------- main

const both = async (base, make) => {
  for (const theme of ['dark', 'light']) {
    await writeFile(path.join(ASSETS, `${base}-${theme}.svg`), await make(theme));
  }
};

const main = async () => {
  await mkdir(ASSETS, { recursive: true });
  console.log('Fetching live data');
  const data = await loadData();
  await writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
  const avatar = await fetchAvatar(data.github?.avatarUrl);

  // Start from a clean slate so renamed/removed images don't linger.
  for (const f of await readdir(ASSETS)) if (f.endsWith('.svg')) await unlink(path.join(ASSETS, f));

  console.log('Rendering SVGs');
  await both('hero', (t) => hero(t, data, avatar));
  await both('insights', (t) => insights(t, data));
  await both('h-pinned', (t) => heading(t, 'pin', 'Pinned', `${config.projects.length} repositories`));
  await both('h-activity', (t) => heading(t, 'graph', 'Contribution activity', 'live from the GitHub API'));
  await both('h-writing', (t) => heading(t, 'commit', 'Writing', 'git log --oneline hashnode'));
  await both('heatmap', (t) => heatmap(t, data));
  await both('footer', (t) => footer(t));

  const stats = data.github?.repoStats || {};
  const cards = [];
  for (const [i, p] of config.projects.entries()) {
    const base = `pin-${i + 1}`;
    const repo = stats[repoName(p.repo).toLowerCase()];
    await both(base, (t) => pinCard(t, p, repo, i));
    cards.push({ base, href: p.url || p.repo, alt: `${p.title}: ${p.what}.` });
  }

  const posts = data.posts || [];
  const commits = [];
  for (const [i, post] of posts.entries()) {
    const base = `commit-${i + 1}`;
    await both(base, (t) => commitRow(t, post, i, posts.length));
    commits.push({ base, href: post.externalUrl, alt: `${post.title} (${post.readTime || 'blog post'})` });
  }

  await writeFile(path.join(ROOT, 'README.md'), readme(data, cards, commits));
  console.log(`Done: README.md + ${2 * (7 + cards.length + commits.length)} SVGs in assets/`);
};

main().catch((e) => {
  console.error('Build failed:', e);
  process.exit(1);
});
