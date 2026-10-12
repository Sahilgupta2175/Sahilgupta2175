// Builds the GitHub profile: assets/*.svg (dark + light) and README.md.
//
//   node scripts/build.mjs
//
// Node 18+, no dependencies. Runs daily in .github/workflows/profile.yml.
// Design: the portfolio's v3 look (ink/ivory, hairlines, one lime accent).
// GitHub strips CSS/JS from READMEs, so every visual lives in SVG images:
// fonts are subset per file and embedded (images can't load web fonts), text
// that must fit uses textLength, and all motion is CSS/SMIL inside the SVG.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import config from '../profile.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const DATA_FILE = path.join(ASSETS, 'data.json');
const W = 1200; // every SVG is 1200 wide; GitHub scales it to the column

const THEMES = {
  dark: {
    bg: '#000000', surface: '#0B0C09', surface2: '#14160F', line: '#22251C', line2: '#363A2C',
    text: '#EEEDE6', text2: '#B4B2A8', muted: '#8A887F', accent: '#C8F169', ink: '#C8F169', onAccent: '#000000'
  },
  light: {
    bg: '#F3F2EC', surface: '#FBFAF6', surface2: '#E9E8E0', line: '#D9D7CD', line2: '#BDBBAF',
    text: '#0B0C09', text2: '#3A3C33', muted: '#5E6055', accent: '#C8F169', ink: '#4F6128', onAccent: '#000000'
  }
};

const FONTS = {
  display: { css: 'Bricolage+Grotesque', weight: 800, name: 'Bricolage Grotesque', stack: "'Bricolage Grotesque','Arial Black','Helvetica Neue',Arial,sans-serif" },
  body: { css: 'Hanken+Grotesk', weight: 400, name: 'Hanken Grotesk', stack: "'Hanken Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif" },
  mono: { css: 'JetBrains+Mono', weight: 400, name: 'JetBrains Mono', stack: "'JetBrains Mono',SFMono-Regular,Menlo,Consolas,monospace" }
};

const EASE = 'cubic-bezier(.2,.8,.2,1)';

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Rough advance widths (in em) used only to wrap text and decide when a line
// needs textLength to fit. Deliberately generous so estimates err wide.
const WIDTHS = {
  display: { upper: 0.68, lower: 0.56, digit: 0.6, space: 0.26, other: 0.36 },
  body: { upper: 0.66, lower: 0.52, digit: 0.56, space: 0.27, other: 0.34 },
  mono: { upper: 0.6, lower: 0.6, digit: 0.6, space: 0.6, other: 0.6 }
};
const measure = (font, size, str, letterSpacing = 0) => {
  const t = WIDTHS[font];
  let em = 0;
  for (const ch of String(str)) {
    if (/[A-Z]/.test(ch)) em += t.upper;
    else if (/[a-z]/.test(ch)) em += t.lower;
    else if (/[0-9]/.test(ch)) em += t.digit;
    else if (ch === ' ') em += t.space;
    else em += t.other;
  }
  return em * size + letterSpacing * Math.max(0, String(str).length - 1);
};
const wrap = (font, size, str, maxW, maxLines = 99) => {
  const lines = [];
  let cur = '';
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && measure(font, size, next) > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return lines;
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).toUpperCase();

// ---------------------------------------------------------------- fonts

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const fontCache = new Map();

// @font-face rules with the font subset to exactly `chars`, base64-embedded.
// On any failure returns '' and the SVG falls back to system fonts.
const fontFaces = async (family, weight, chars) => {
  const glyphs = [...new Set(chars)].filter((c) => c.trim()).sort().join('');
  if (!glyphs) return '';
  const key = `${family}:${weight}:${glyphs}`;
  if (fontCache.has(key)) return fontCache.get(key);
  const job = (async () => {
    try {
      const url = `https://fonts.googleapis.com/css2?family=${FONTS[family].css}:wght@${weight}&text=${encodeURIComponent(glyphs + ' ')}&display=block`;
      const css = await (await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })).text();
      const faces = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\(([^)]+)\)\s*format\('woff2'\)/g)];
      const rules = await Promise.all(faces.map(async ([, weight, src]) => {
        const buf = Buffer.from(await (await fetch(src, { signal: AbortSignal.timeout(15000) })).arrayBuffer());
        return `@font-face{font-family:'${FONTS[family].name}';font-weight:${weight};src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`;
      }));
      return rules.join('');
    } catch (e) {
      console.warn(`  ⚠ font ${family} ${weight}: ${e.message} (using system fonts)`);
      return '';
    }
  })();
  fontCache.set(key, job);
  return job;
};

// One SVG document. Text goes through doc.t(font, str, weight) so the builder
// embeds exactly the glyphs (and weights) each file uses.
class Doc {
  constructor(theme) {
    this.c = THEMES[theme];
    this.used = {};
    this.ids = 0;
  }
  t(font, str, weight = FONTS[font].weight) {
    const key = `${font}:${weight}`;
    this.used[key] = (this.used[key] || '') + str;
    return esc(str);
  }
  id(prefix) {
    this.ids += 1;
    return `${prefix}${this.ids}`;
  }
  async render({ height, title, body, css = '' }) {
    const faces = (await Promise.all(Object.entries(this.used).map(([key, chars]) => {
      const [font, weight] = key.split(':');
      return fontFaces(font, weight, chars);
    }))).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>${faces}
.d{font-family:${FONTS.display.stack}}.b{font-family:${FONTS.body.stack}}.m{font-family:${FONTS.mono.stack}}
@keyframes rise{from{opacity:0;transform:translateY(36px)}to{opacity:1;transform:none}}
.rise{animation:rise .9s ${EASE} both}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
.pulse{animation:pulse 2s ease-in-out infinite}
${css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
${body}
</svg>`;
  }
}

const delay = (ms) => `style="animation-delay:${ms}ms"`;

// Rounded tile with a hairline border.
const tile = (d, x, y, w, h, fill = d.c.surface) =>
  `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="22" fill="${fill}" stroke="${d.c.line}"/>`;

const eyebrow = (d, x, y, str, color = d.c.muted, anchor = 'start') =>
  `<text x="${x}" y="${y}" class="m" font-size="13" letter-spacing="1.6" fill="${color}" text-anchor="${anchor}">${d.t('mono', str.toUpperCase())}</text>`;

// Odometer: each digit column rolls a full turn and lands on its digit. The
// resting (no-animation) state already shows the final number, so reduced
// motion or a blocked animation still reads correctly.
const odometer = (d, x, baseline, size, value, start = 0) => {
  const str = String(value ?? '');
  const colW = size * 0.62;
  const lh = size * 1.05;
  let out = '';
  let css = '';
  let cx = x;
  [...str].forEach((ch, i) => {
    if (!/[0-9]/.test(ch)) {
      out += `<text x="${cx}" y="${baseline}" class="d" font-weight="800" font-size="${size}" fill="${d.c.ink}">${d.t('display', ch)}</text>`;
      cx += measure('display', size, ch);
      return;
    }
    const digit = Number(ch);
    // Index 0 (resting) is the target; the animation starts at the last index
    // (a 0 one full turn earlier) and rolls up through the digits to it.
    const seq = [...Array.from({ length: digit + 1 }, (_, k) => digit - k), ...Array.from({ length: 10 }, (_, k) => 9 - k)];
    const clip = d.id('od');
    const anim = d.id('roll');
    const travel = (seq.length - 1) * lh;
    css += `@keyframes ${anim}{from{transform:translateY(-${travel}px)}to{transform:none}}.${anim}{animation:${anim} 1.6s ${EASE} ${start + i * 120}ms both}`;
    out += `<clipPath id="${clip}"><rect x="${cx}" y="${baseline - size * 0.82}" width="${colW}" height="${size * 1.02}"/></clipPath>
<g clip-path="url(#${clip})"><g class="${anim}">${seq.map((n, k) => `<text x="${cx + colW / 2}" y="${baseline + k * lh}" text-anchor="middle" class="d" font-weight="800" font-size="${size}" fill="${d.c.text}">${d.t('display', String(n))}</text>`).join('')}</g></g>`;
    cx += colW;
  });
  return { svg: out, css, width: cx - x };
};

// ---------------------------------------------------------------- components

const hero = async (theme, data) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 600;
  const L = 56;
  const R = W - 56;

  // Name: two words pushed to the edges, sized by textLength so it fits
  // whatever font the viewer ends up with.
  const size = 158;
  const first = config.name.split(' ')[0].toUpperCase();
  const last = config.name.split(' ').slice(1).join(' ').toUpperCase();
  const w1 = Math.round(measure('display', size, first) * 0.9);
  const w2 = Math.round(measure('display', size, `${last}.`) * 0.9);
  const nameY = 300;
  const word = (fill, stroke) => `
    <g class="rise" ${delay(120)}><text x="${L}" y="${nameY}" textLength="${w1}" lengthAdjust="spacingAndGlyphs" class="d" font-weight="800" font-size="${size}" fill="${fill}" ${stroke}>${d.t('display', first)}</text></g>
    <g class="rise" ${delay(300)}><text x="${R}" y="${nameY}" text-anchor="end" textLength="${w2}" lengthAdjust="spacingAndGlyphs" class="d" font-weight="800" font-size="${size}" fill="${fill}" ${stroke}>${d.t('display', last)}<tspan fill="${stroke ? 'none' : c.ink}">${d.t('display', '.')}</tspan></text></g>`;

  // The "lens": a circle sweeping across the name shows it as an outline,
  // the same idea as the cursor lens on the site.
  const sweep = `<animateTransform attributeName="transform" type="translate" values="-200 0;-200 0;${W + 200} 0" keyTimes="0;0.35;1" dur="7s" repeatCount="indefinite"/>`;
  const lensY = nameY - size * 0.36;

  const role = data.role;
  const pill = role ? `Now at ${role.company} · ${role.role}` : 'Available for new opportunities';
  const pillW = measure('mono', 14, pill) + 60;
  const taglineLines = wrap('body', 26, config.tagline, 640);

  const body = `
<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
<mask id="hole"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="0" cy="${lensY}" r="118" fill="#000">${sweep}</circle></mask>
<mask id="lens"><rect width="${W}" height="${H}" fill="#000"/><circle cx="0" cy="${lensY}" r="118" fill="#fff">${sweep}</circle></mask>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="28" fill="${c.bg}" stroke="${c.line}"/>
<clipPath id="card"><rect width="${W}" height="${H}" rx="28"/></clipPath>
<rect width="${W}" height="${H}" filter="url(#grain)" clip-path="url(#card)" opacity="${theme === 'dark' ? 0.07 : 0.1}"/>

${eyebrow(d, L, 66, `Portfolio · ${new Date().getFullYear()}`)}
${eyebrow(d, W / 2, 66, config.role, c.muted, 'middle')}
${eyebrow(d, R, 66, config.location, c.muted, 'end')}
<line x1="${L}" y1="90" x2="${R}" y2="90" stroke="${c.line}"/>

<g mask="url(#hole)">${word(c.text, '')}</g>
<g mask="url(#lens)">${word('none', `stroke="${c.ink}" stroke-width="2.5"`)}</g>
<circle cx="0" cy="${lensY}" r="118" fill="none" stroke="${c.ink}" stroke-opacity=".35" stroke-dasharray="4 8">${sweep}</circle>

<g class="rise" ${delay(520)}>
${taglineLines.map((ln, i) => `<text x="${L}" y="${384 + i * 36}" class="b" font-size="26" fill="${c.text2}">${d.t('body', ln)}</text>`).join('\n')}
</g>

<g class="rise" ${delay(700)}>
  <rect x="${L + 0.5}" y="${H - 104.5}" width="${pillW}" height="44" rx="22" fill="none" stroke="${c.line2}"/>
  <circle cx="${L + 26}" cy="${H - 82}" r="5" fill="${c.accent}" class="pulse"/>
  <text x="${L + 42}" y="${H - 77}" class="m" font-size="14" fill="${c.text2}">${d.t('mono', pill)}</text>
</g>

<g class="rise" ${delay(820)}>
  ${eyebrow(d, R - 26, H - 76, 'Scroll', c.muted, 'end')}
  <rect x="${R - 1}" y="${H - 110}" width="1" height="56" fill="${c.line2}"/>
  <rect x="${R - 1}" y="${H - 110}" width="1" height="56" fill="${c.text}" class="cue"/>
</g>`;

  return d.render({
    height: H,
    title: `${config.name}. ${config.role}. ${config.tagline}${role ? ` Now at ${role.company} as ${role.role}.` : ''}`,
    body,
    css: `@keyframes cue{0%{transform:scaleY(0);transform-origin:top}45%{transform:scaleY(1);transform-origin:top}55%{transform:scaleY(1);transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}
.cue{transform-box:fill-box;animation:cue 2.2s cubic-bezier(.7,0,.3,1) infinite}`
  });
};

const bento = async (theme, data, avatar) => {
  const d = new Doc(theme);
  const c = d.c;
  const G = 16;
  const col = (W - 3 * G) / 4; // 288
  const rowH = 210;
  const x = (i) => i * (col + G);
  const y = (i) => i * (rowH + G);
  let css = '';
  const parts = [];

  // A slow light drifting behind the grid stands in for the site's cursor spotlight.
  parts.push(`<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="0" cy="300" r="420">
  <stop offset="0" stop-color="${c.accent}" stop-opacity="${theme === 'dark' ? 0.12 : 0.22}"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/>
  <animate attributeName="cx" values="-300;${W + 300};-300" dur="16s" repeatCount="indefinite"/>
  <animate attributeName="cy" values="200;700;200" dur="11s" repeatCount="indefinite"/>
</radialGradient>`);
  const glowTile = (tx, ty, tw, th, i) => `<g class="rise" ${delay(i * 70)}>${tile(d, tx, ty, tw, th)}<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="22" fill="url(#glow)"/>`;

  // Intro (2x2)
  {
    const tx = x(0);
    const tw = col * 2 + G;
    const role = data.role;
    const pill = role ? `Now at ${role.company}` : 'Available for new opportunities';
    const headline = 'MERN developer who ships real products, not just repos.';
    const lines = wrap('display', 46, headline, tw - 64);
    const hl = new Set(['real', 'products,']);
    const lineSvg = lines.map((ln, i) => `<text x="${tx + 32}" y="${150 + i * 50}" class="d" font-weight="600" font-size="46" letter-spacing="-1" fill="${c.text}">${ln.split(' ').map((w) => (hl.has(w) ? `<tspan fill="${c.ink}" font-weight="800">${d.t('display', w)}</tspan>` : d.t('display', w, 600))).join(' ')}</text>`).join('');
    const sub = `${role ? `${role.role} at ${role.company}${role.location ? `, ${role.location}` : ''}. ` : ''}${config.education}.`;
    const subLines = wrap('body', 18, sub, tw - 64, 3);
    parts.push(`${glowTile(tx, 0, tw, rowH * 2 + G, 0)}
  <rect x="${tx + 32.5}" y="32.5" width="${measure('mono', 13, pill) + 54}" height="36" rx="18" fill="none" stroke="${c.line2}"/>
  <circle cx="${tx + 54}" cy="51" r="4.5" fill="${c.accent}" class="pulse"/>
  <text x="${tx + 68}" y="56" class="m" font-size="13" fill="${c.text2}">${d.t('mono', pill)}</text>
  ${lineSvg}
  ${subLines.map((ln, i) => `<text x="${tx + 32}" y="${rowH * 2 + G - 32 - (subLines.length - 1 - i) * 28}" class="b" font-size="18" fill="${c.text2}">${d.t('body', ln)}</text>`).join('')}
</g>`);
  }

  // Photo (1x2): fades from grey into colour and back, like the site's hover.
  {
    const tx = x(2);
    const th = rowH * 2 + G;
    const clip = d.id('ph');
    parts.push(`<g class="rise" ${delay(70)}>
  <clipPath id="${clip}"><rect x="${tx}" y="0" width="${col}" height="${th}" rx="22"/></clipPath>
  <filter id="sat"><feColorMatrix type="saturate" values="0"><animate attributeName="values" values="0;0;1;1;0" keyTimes="0;.4;.55;.9;1" dur="12s" repeatCount="indefinite"/></feColorMatrix></filter>
  <image href="data:image/jpeg;base64,${avatar}" x="${tx}" y="0" width="${col}" height="${th}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})" filter="url(#sat)"/>
  <rect x="${tx + 0.5}" y=".5" width="${col - 1}" height="${th - 1}" rx="22" fill="none" stroke="${c.line}"/>
  <rect x="${tx + 12}" y="${th - 60}" width="${col - 24}" height="48" rx="14" fill="${c.bg}" fill-opacity=".78"/>
  <text x="${tx + 26}" y="${th - 30}" class="b" font-weight="600" font-size="15" fill="${c.text}">${d.t('body', config.name, 600)}</text>
  <text x="${tx + col - 26}" y="${th - 30}" text-anchor="end" class="m" font-size="11" fill="${c.text2}">${d.t('mono', data.role?.company || 'GLA University')}</text>
</g>`);
  }

  // Problems solved (odometer)
  {
    const tx = x(3);
    const badge = data.badge?.number || '150+';
    const o = odometer(d, tx + 24, 132, 64, badge, 300);
    css += o.css;
    parts.push(`${glowTile(tx, 0, col, rowH, 2)}
  ${eyebrow(d, tx + 24, 40, 'LeetCode + HackerRank')}
  ${o.svg}
  <text x="${tx + 24}" y="166" class="b" font-size="15" fill="${c.text2}">${d.t('body', String(data.badge?.text || 'Problems solved').replace(/\n/g, ' ').toLowerCase())}</text>
  <rect x="${tx + 24}" y="182" width="${col - 48}" height="4" rx="2" fill="${c.line}"/>
  <rect x="${tx + 24}" y="182" width="${col - 48}" height="4" rx="2" fill="${c.accent}" class="bar"/>
</g>`);
    css += `@keyframes bar{from{transform:scaleX(0)}to{transform:none}}.bar{transform-box:fill-box;transform-origin:left;animation:bar 1.6s ${EASE} 300ms both}`;
  }

  // GitHub (odometer)
  {
    const tx = x(3);
    const ty = y(1);
    const gh = data.github || {};
    const o = odometer(d, tx + 24, ty + 132, 64, gh.repos ?? '–', 500);
    css += o.css;
    const sub = gh.contributions ? `${gh.contributions} contributions this year` : `on GitHub since ${gh.since || '2022'}`;
    parts.push(`${glowTile(tx, ty, col, rowH, 3)}
  ${eyebrow(d, tx + 24, ty + 40, 'GitHub')}
  ${o.svg}
  <text x="${tx + 24}" y="${ty + 166}" class="b" font-size="15" fill="${c.text2}">${d.t('body', 'public repositories')}</text>
  <text x="${tx + 24}" y="${ty + 188}" class="m" font-size="12" fill="${c.muted}">${d.t('mono', sub)}</text>
</g>`);
  }

  // Right now (current work from the admin panel)
  {
    const ty = y(2);
    const tw = col * 2 + G;
    const items = (data.now || []).slice(0, 2);
    let rows = '';
    if (!items.length) {
      rows = `<text x="24" y="${ty + 100}" class="b" font-size="17" fill="${c.muted}">${d.t('body', 'Heads down on something new. More soon.')}</text>`;
    }
    items.forEach((it, i) => {
      const ry = ty + 66 + i * 70;
      const status = (it.status || 'Building').toUpperCase();
      const sw = measure('mono', 11, status) + 22;
      const desc = wrap('body', 14, it.description || '', tw - sw - 80, 1)[0] || '';
      rows += `<line x1="24" y1="${ry}" x2="${tw - 24}" y2="${ry}" stroke="${c.line}"/>
  <rect x="24" y="${ry + 18}" width="${sw}" height="24" rx="12" fill="${i === 0 ? c.accent : c.surface2}"/>
  <text x="${24 + sw / 2}" y="${ry + 34}" text-anchor="middle" class="m" font-size="11" letter-spacing="1" fill="${i === 0 ? c.onAccent : c.text2}">${d.t('mono', status)}</text>
  <text x="${24 + sw + 16}" y="${ry + 29}" class="b" font-weight="600" font-size="17" fill="${c.text}">${d.t('body', it.title, 600)}</text>
  <text x="${24 + sw + 16}" y="${ry + 50}" class="b" font-size="14" fill="${c.muted}">${d.t('body', desc)}</text>`;
    });
    parts.push(`${glowTile(0, ty, tw, rowH, 4)}
  ${eyebrow(d, 24, ty + 40, 'Right now')}
  ${eyebrow(d, tw - 24, ty + 40, `${items.length} active`, c.muted, 'end')}
  ${rows}
</g>`);
  }

  // Latest post
  {
    const tx = x(2);
    const ty = y(2);
    const tw = col * 2 + G;
    const post = (data.posts || [])[0];
    const lines = post ? wrap('display', 30, post.title, tw - 64, 2) : ['Writing on Hashnode'];
    parts.push(`${glowTile(tx, ty, tw, rowH, 5)}
  ${eyebrow(d, tx + 24, ty + 40, 'Latest post · Hashnode', c.ink)}
  ${lines.map((ln, i) => `<text x="${tx + 24}" y="${ty + 92 + i * 36}" class="d" font-weight="600" font-size="30" letter-spacing="-.5" fill="${c.text}">${d.t('display', ln, 600)}</text>`).join('')}
  ${post ? `<text x="${tx + 24}" y="${ty + rowH - 28}" class="m" font-size="12" fill="${c.muted}">${d.t('mono', `${fmtDate(post.createdAt)} · ${post.readTime || ''}`)}</text>` : ''}
</g>`);
  }

  // Stack chips (full width), height grows with the number of rows.
  const sy = y(3);
  let cx = 24;
  let cy = sy + 64;
  const chips = [];
  for (const s of config.stack) {
    const cw = measure('mono', 15, s) + 30;
    if (cx + cw > W - 24) {
      cx = 24;
      cy += 46;
    }
    chips.push(`<rect x="${cx + 0.5}" y="${cy + 0.5}" width="${cw}" height="36" rx="18" fill="none" stroke="${c.line2}"/><text x="${cx + cw / 2}" y="${cy + 23}" text-anchor="middle" class="m" font-size="15" fill="${c.text}">${d.t('mono', s)}</text>`);
    cx += cw + 8;
  }
  const stackH = cy - sy + 36 + 26;
  parts.push(`${glowTile(0, sy, W, stackH, 6)}
  ${eyebrow(d, 24, sy + 40, 'Stack')}
  ${eyebrow(d, W - 24, sy + 40, 'Each project lists what it was built with', c.muted, 'end')}
  ${chips.join('')}
</g>`);

  const H = sy + stackH;
  return d.render({
    height: H,
    title: `At a glance: ${data.role ? `${data.role.role} at ${data.role.company}. ` : ''}${data.badge?.number || '150+'} problems solved. ${data.github?.repos ?? ''} public repositories. Stack: ${config.stack.join(', ')}.`,
    body: parts.join('\n'),
    css
  });
};

const sectionTitle = async (theme, text, count) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 150;
  return d.render({
    height: H,
    title: text,
    body: `<g class="rise">
  <text x="4" y="112" class="d" font-weight="800" font-size="96" letter-spacing="-4" fill="${c.text}">${d.t('display', text)}${count != null ? `<tspan class="m" dx="14" dy="-58" font-weight="400" font-size="20" letter-spacing="0" fill="${c.ink}">${d.t('mono', `(${count})`)}</tspan>` : ''}</text>
</g>
<line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="${c.line2}"/>`
  });
};

// One clickable row (project or post).
const row = async (theme, { index, lead, title, sub, right, status, arrow = true }) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 124;
  const titleX = 92;
  const maxTitle = 820;
  const tSize = 50;
  const est = measure('display', tSize, title) * 0.95;
  const fit = est > maxTitle ? `textLength="${maxTitle}" lengthAdjust="spacingAndGlyphs"` : '';
  const chipW = status ? measure('mono', 11, status.toUpperCase()) + 22 : 0;
  return d.render({
    height: H,
    title: `${title}. ${sub}`,
    body: `<g class="rise" ${delay(index * 80)}>
  <text x="6" y="66" class="m" font-size="13" fill="${c.muted}">${d.t('mono', lead)}</text>
  <text x="${titleX}" y="70" class="d" font-weight="600" font-size="${tSize}" letter-spacing="-1.6" fill="${c.text}" ${fit}>${d.t('display', title, 600)}</text>
  <text x="${titleX}" y="102" class="b" font-size="17" fill="${c.muted}">${d.t('body', wrap('body', 17, sub, 900, 1)[0] || '')}</text>
  ${status ? `<rect x="${W - 76 - chipW}" y="${H / 2 - 13}" width="${chipW}" height="26" rx="13" fill="${c.accent}"/><text x="${W - 76 - chipW / 2}" y="${H / 2 + 4}" text-anchor="middle" class="m" font-size="11" letter-spacing="1" fill="${c.onAccent}">${d.t('mono', status.toUpperCase())}</text>`
    : `<text x="${W - 80}" y="${H / 2 + 4}" text-anchor="end" class="m" font-size="12" letter-spacing="1.2" fill="${c.text2}">${d.t('mono', right.toUpperCase())}</text>`}
  ${arrow ? `<circle cx="${W - 28}" cy="${H / 2}" r="21.5" fill="none" stroke="${c.line2}"/>
  <path d="M${W - 34} ${H / 2 + 6}l12-12m-9 0h9v9" fill="none" stroke="${c.text}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="nudge"/>` : ''}
</g>
<line x1="0" y1="${H - 1}" x2="${W}" y2="${H - 1}" stroke="${c.line2}"/>`,
    css: `@keyframes nudge{0%,80%,100%{transform:none}88%{transform:translate(3px,-3px)}}.nudge{animation:nudge 4s ${EASE} ${1200 + index * 300}ms infinite}`
  });
};

const footer = async (theme) => {
  const d = new Doc(theme);
  const c = d.c;
  const H = 330;
  const size = 168;
  const tw = Math.round(measure('display', size, "LET'S TALK.") * 0.9);
  return d.render({
    height: H,
    title: `Let's talk. Say hi at ${config.site}.`,
    body: `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="28" fill="${c.accent}"/>
<g class="rise">
  <text x="48" y="196" textLength="${Math.min(tw, W - 96)}" lengthAdjust="spacingAndGlyphs" class="d" font-weight="800" font-size="${size}" fill="${c.onAccent}">${d.t('display', "LET'S TALK.")}</text>
</g>
<g class="rise" ${delay(200)}>
  <text x="52" y="270" class="m" font-size="16" fill="${c.onAccent}">${d.t('mono', `Say hi at ${config.site.replace(/^https?:\/\//, '')}`)}</text>
  <circle cx="${W - 84}" cy="262" r="32" fill="${c.onAccent}"/>
  <path d="M${W - 95} 273l22-22m-16 0h16v16" fill="none" stroke="${c.accent}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="nudge"/>
</g>`,
    css: `@keyframes nudge{0%,80%,100%{transform:none}88%{transform:translate(4px,-4px)}}.nudge{animation:nudge 3s ${EASE} 1.2s infinite}`
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
    now: async () => (await getJSON(`${api}/api/current-work`))
      .map(({ title, description, status, link }) => ({ title, description, status, link })),
    badge: async () => {
      const a = await getJSON(`${api}/api/about`);
      return a?.badgeNumber ? { number: a.badgeNumber, text: a.badgeText } : null;
    },
    posts: async () => (await getJSON(`${api}/api/blogs?limit=${config.postsToShow}`))
      .map(({ title, externalUrl, readTime, createdAt, tags }) => ({ title, externalUrl, readTime, createdAt, tags: (tags || []).slice(0, 3) })),
    github: async () => {
      const u = await getJSON(`https://api.github.com/users/${config.user}`, auth);
      const out = { repos: u.public_repos, since: new Date(u.created_at).getFullYear() };
      if (token) {
        const r = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json', 'User-Agent': 'profile-builder' },
          body: JSON.stringify({ query: 'query($u:String!){user(login:$u){contributionsCollection{contributionCalendar{totalContributions}}}}', variables: { u: config.user } }),
          signal: AbortSignal.timeout(20000)
        });
        const j = await r.json();
        out.contributions = j?.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions;
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

// ---------------------------------------------------------------- README

const pic = (base, alt) =>
  `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/${base}-dark.svg"><img src="assets/${base}-light.svg" width="100%" alt="${esc(alt)}"></picture>`;
const linked = (href, inner) => (href ? `<a href="${esc(href)}">${inner}</a>` : inner);

const readme = (data, projectRows, postRows) => `<!-- Generated by scripts/build.mjs from profile.config.mjs and live data. Edit those, not this file. -->
<div align="center">

${pic('hero', `${config.name}, ${config.role}. ${config.tagline}`)}

${pic('glance', `At a glance: ${data.role ? `${data.role.role} at ${data.role.company}, ` : ''}${data.badge?.number || '150+'} problems solved, ${data.github?.repos ?? ''} public repositories, current work and latest post.`)}

${pic('title-work', 'Selected work')}
${projectRows.map(({ base, href, alt }) => linked(href, pic(base, alt))).join('\n')}

${pic('title-writing', 'Writing')}
${postRows.map(({ base, href, alt }) => linked(href, pic(base, alt))).join('\n')}

<sub><a href="https://sahilxdev.hashnode.dev">All posts on Hashnode →</a></sub>

${pic('title-activity', 'Activity')}

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/${config.user}/${config.user}/output/github-snake-dark.svg">
  <img src="https://raw.githubusercontent.com/${config.user}/${config.user}/output/github-snake.svg" width="100%" alt="Contribution graph being eaten by a snake">
</picture>

${linked(`${config.site}/#contact`, pic('footer', `Let's talk. Say hi at ${config.site}.`))}

${config.links.map(([label, href]) => `<a href="${esc(href)}">${esc(label)}</a>`).join(' &nbsp;·&nbsp; ')}

<sub>Updated ${new Date(data.updatedAt).toUTCString().replace(/:\d\d GMT$/, ' UTC')} from my portfolio's admin panel, Hashnode and GitHub.</sub>

</div>
`;

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
  const avatar = (await readFile(path.join(ASSETS, 'avatar.jpg'))).toString('base64');

  console.log('Rendering SVGs');
  await both('hero', (t) => hero(t, data));
  await both('glance', (t) => bento(t, data, avatar));
  await both('title-work', (t) => sectionTitle(t, 'Selected work', config.projects.length));
  await both('title-writing', (t) => sectionTitle(t, 'Writing'));
  await both('title-activity', (t) => sectionTitle(t, 'Activity'));
  await both('footer', (t) => footer(t));

  const projectRows = [];
  for (const [i, p] of config.projects.entries()) {
    const base = `project-${i + 1}`;
    await both(base, (t) => row(t, {
      index: i,
      lead: String(i + 1).padStart(2, '0'),
      title: p.title,
      sub: `${p.what} · ${p.stack.join(', ')}`,
      right: p.url ? 'Live' : 'Repo',
      status: p.status,
      arrow: Boolean(p.url || p.repo)
    }));
    projectRows.push({ base, href: p.url || p.repo, alt: `${p.title}: ${p.what}. Built with ${p.stack.join(', ')}.` });
  }

  const postRows = [];
  for (const [i, post] of (data.posts || []).entries()) {
    const base = `post-${i + 1}`;
    await both(base, (t) => row(t, {
      index: i,
      lead: fmtDate(post.createdAt).slice(0, 6),
      title: post.title,
      sub: (post.tags || []).map((tag) => `#${tag}`).join('  '),
      right: post.readTime || 'Read'
    }));
    postRows.push({ base, href: post.externalUrl, alt: `${post.title} (${post.readTime || 'blog post'})` });
  }

  await writeFile(path.join(ROOT, 'README.md'), readme(data, projectRows, postRows));
  console.log(`Done: README.md + ${2 * (6 + projectRows.length + postRows.length)} SVGs in assets/`);
};

main().catch((e) => {
  console.error('Build failed:', e);
  process.exit(1);
});
