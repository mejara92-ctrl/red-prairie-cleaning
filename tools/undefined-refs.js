/* ROUND 52: every function a page calls must actually exist.
   Run from the repo root:  node tools/undefined-refs.js

   WHY THIS EXISTS. Round 52 deleted a large amount of two-tier machinery
   from /call. One of those deletions used a start/end marker pair whose
   end marker sat further down the file than intended, so it took out four
   neighbouring functions -- cmpServices, cmpRecurring, cmpScope and
   cmpObjections -- along with the intended target. The file still parsed,
   check-prices.py still passed, and a grep for the deleted TIER symbols
   found nothing, because the missing functions had nothing to do with
   tiers. It surfaced only when a browser actually rendered the CSR rail
   and threw "cmpObjections is not defined".

   A syntax check cannot catch this and neither can a grep for known-bad
   names. This walks the other way round: collect every identifier the page
   CALLS, collect every identifier it DEFINES (plus the engine's and the
   browser's), and report calls with no definition anywhere. */
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const scripts = html => (html.match(/<script>([\s\S]*?)<\/script>/g) || [])
  .map(b => b.replace(/^<script>/, '').replace(/<\/script>$/, '')).join('\n;\n');

/* Comments hold deliberate references to deleted functions -- that is how
   round 52 documents what it removed -- so they are stripped before
   anything is matched. String literals are deliberately NOT stripped; see
   the note on the camelCase filter below for why that turned out to be the
   safer choice. */
const BUILTIN = new Set(['if','for','while','switch','catch','return','typeof','function',
  'else','do','new','delete','void','in','of','case','throw','await','yield','try','with',
  'Number','String','Boolean','Array','Object','Math','JSON','Date','RegExp','Error','Set',
  'Map','Promise','parseInt','parseFloat','isNaN','encodeURIComponent','decodeURIComponent',
  'setTimeout','setInterval','clearTimeout','clearInterval','fetch','alert','require',
  'console','document','window','localStorage','sessionStorage','navigator','history',
  'location','Intl','Symbol','WeakMap','requestAnimationFrame','cancelAnimationFrame',
  'structuredClone','queueMicrotask','URL','URLSearchParams','AbortController','gtag',
  'dataLayer','FormData','Headers','Request','Response','Image','Audio','CustomEvent','Event',
  'requestIdleCallback','cancelIdleCallback','Blob','Function','IntersectionObserver',
  'MutationObserver','ResizeObserver','matchMedia','getComputedStyle','btoa','atob',
  'isFinite','Infinity','NaN','undefined','arguments','this','super','Proxy','Reflect',
  'BigInt','globalThis','performance','crypto','TextEncoder','TextDecoder']);

const defsIn = src => {
  const d = new Set();
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) d.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) d.add(m[1]);
  /* Parameters count as definitions: a callback invoked as fn() inside the
     function it was passed to is not an undefined reference. */
  for (const m of src.matchAll(/(?:function\s*[\w$]*\s*|\)\s*=>|^)\(([^)]*)\)\s*(?:\{|=>)/gm))
    for (const part of m[1].split(','))
      { const n = part.trim().replace(/[=:].*$/, '').replace(/^\.\.\./, '').trim();
        if (/^[A-Za-z_$][\w$]*$/.test(n)) d.add(n); }
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) d.add(m[1]);
  return d;
};

/* DEFINITIONS are collected from source with only COMMENTS removed, and
   CALLS from source with strings removed as well. The asymmetry is
   deliberate and it is the safe direction: an over-eager string strip can
   only cause this to miss a call, never to invent one. A guard that cries
   wolf gets switched off, and the thing it is really here to catch -- a
   function that vanished wholesale -- shows up either way. */
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
                        .replace(/(?<![:\w])\/\/[^\n]*/g, ' ');
const shared = new Set([...defsIn(decomment(R('js/rp-pricing-engine.js'))),
                        ...defsIn(decomment(R('js/rp-messages.js')))]);
/* Object-literal methods on RP_MSG / rpState are reached as properties, not
   bare identifiers, so they never appear as calls we check. */

let fails = 0;
for (const page of ['book/index.html', 'call/index.html']) {
  const raw = scripts(R(page));
  const defined = new Set([...shared, ...defsIn(decomment(raw))]);
  const src = decomment(raw);
  const missing = new Map();
  for (const m of src.matchAll(/(^|[^.\w$'"`])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[2];
    if (BUILTIN.has(name) || defined.has(name)) continue;
    /* ONLY camelCase names are considered: lowercase first letter, at least
       one capital later. Every function in this codebase is named that way
       (rpFinalPrice, cmpObjections, renderTierSheet), and no English word
       in customer-facing copy is -- which is what makes it safe to scan a
       source that still contains its string literals. Trying to strip the
       strings instead was the first approach and it was worse: template
       literals here nest interpolations several levels deep, and a strip
       aggressive enough to handle them silently swallowed real call sites,
       so the guard reported all-clear on a file with a function missing.

       THE KNOWN GAP, stated rather than hidden: an all-lowercase helper
       (render, save, load, esc) will never be flagged, because a name like
       that is indistinguishable from prose. Those are small, heavily-used
       functions whose loss breaks the page on first render; the ones worth
       catching here are the big camelCase ones that only run on a
       particular screen. */
    if (!/^[a-z_$][\w$]*[A-Z]/.test(name)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    if (!missing.has(name)) missing.set(name, line);
  }
  if (missing.size) {
    fails += missing.size;
    console.log(`${page}: ${missing.size} call(s) with no definition`);
    for (const [n, l] of missing) console.log(`  ${n}()  (first seen around line ${l} of the page's inline script)`);
  } else {
    console.log(`${page}: every function it calls is defined`);
  }
}
console.log(fails ? `\n${fails} UNDEFINED REFERENCE(S)` : '\nNo undefined references.');
process.exit(fails ? 1 : 0);
