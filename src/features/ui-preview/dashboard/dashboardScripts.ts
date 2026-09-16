/* eslint-disable */
// @ts-nocheck
/**
 * Ported from the original Balcore static prototype.
 * Holds the purely-visual widget behaviour (charts, counters, tickers, modal
 * micro-flows). Wallet connection, onboarding and the connected-address UI are
 * real React components and are NOT handled here.
 */
import { getTokenBalances } from "./data/balances";

let initedRoot: Element | null = null;
let teardown: Array<() => void> = [];

/**
 * Re-runnable entry point. The dashboard DOM is unmounted/remounted by React
 * (disconnect → reconnect, network switches), which drops every listener that
 * was bound to the old nodes. We therefore re-run the wiring whenever a fresh
 * dashboard root appears, and first undo the previous run's global listeners
 * and timers so nothing accumulates.
 */
export function initDashboardScripts() {
  const root = document.querySelector(".app");
  if (root && root === initedRoot) return;
  initedRoot = root;

  teardown.forEach((fn) => { try { fn(); } catch {} });
  teardown = [];

  const winAdd = window.addEventListener.bind(window);
  const docAdd = document.addEventListener.bind(document);
  const winInterval = window.setInterval.bind(window);

  window.addEventListener = function (type: any, fn: any, opts?: any) {
    winAdd(type, fn, opts);
    teardown.push(() => window.removeEventListener(type, fn, opts));
  } as typeof window.addEventListener;
  document.addEventListener = function (type: any, fn: any, opts?: any) {
    docAdd(type, fn, opts);
    teardown.push(() => document.removeEventListener(type, fn, opts));
  } as typeof document.addEventListener;
  window.setInterval = function (fn: any, ms?: any, ...args: any[]) {
    const id = winInterval(fn, ms, ...args);
    teardown.push(() => clearInterval(id));
    return id;
  } as typeof window.setInterval;

  try {
    runDashboardScripts();
  } finally {
    window.addEventListener = winAdd as typeof window.addEventListener;
    document.addEventListener = docAdd as typeof document.addEventListener;
    window.setInterval = winInterval as typeof window.setInterval;
  }
}

function runDashboardScripts() {


// count-up utility (respects reduced-motion) — reusable, exposed for view-triggered animations
window.__countUp = function(el){
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = parseFloat(el.dataset.countup);
  const prefix = el.dataset.prefix || '';
  if (!target){ return; }
  if (reduce){ el.textContent = prefix + target.toLocaleString(); return; }
  if (el.dataset.counting === '1') return; // avoid double-runs
  el.dataset.counting = '1';
  const DUR = 1100; let t0 = null;
  const ease = t => 1 - Math.pow(1 - t, 4);
  (function tick(ts){
    if(!t0) t0 = ts;
    const p = Math.min((ts - t0)/DUR, 1), e = ease(p);
    el.textContent = prefix + Math.round(target * e).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
    else { el.textContent = prefix + target.toLocaleString(); el.dataset.counting = '0'; }
  })(performance.now());
};
// run count-ups that are visible on initial load
(function(){
  document.querySelectorAll('[data-countup]').forEach(el=>{
    if (el.offsetParent !== null) window.__countUp(el);  // only if visible
  });
})();

// portfolio chart grows in + fees counter ticks
(function(){
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rect = document.getElementById('growRect');
  const dot = document.getElementById('tipDot');
  const counter = document.getElementById('feeCount');
  if (!rect) return;
  const TARGET = 52400, W = 620, DUR = 1800;
  if (reduce){ rect.setAttribute('width', W); if(dot) dot.setAttribute('opacity','1'); if(counter) counter.textContent = '+$' + TARGET.toLocaleString(); return; }
  let t0 = null;
  const ease = t => 1 - Math.pow(1 - t, 3);
  function frame(ts){
    if (!t0) t0 = ts;
    const p = Math.min((ts - t0) / DUR, 1), e = ease(p);
    rect.setAttribute('width', W * e);
    if (counter) counter.textContent = '+$' + Math.round(TARGET * e).toLocaleString();
    if (p < 1) requestAnimationFrame(frame); else if(dot) dot.setAttribute('opacity','1');
  }
  requestAnimationFrame(frame);
})();

// cycle rail: active node advances
(function(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const nodes = document.querySelectorAll('#rail .node');
  let i = 0;
  setInterval(()=>{
    nodes[i].classList.remove('on');
    i = (i + 1) % nodes.length;
    nodes[i].classList.add('on');
  }, 2400);
})();

// timeframe toggle — redraws the portfolio value curve + updates deposit/fees stats
(function(){
  const TF = {
    '1D':  { line:'M0 47 L13 50 L25 51 L38 51 L51 51 L63 51 L76 51 L89 51 L101 51 L114 51 L127 51 L139 49 L152 48 L164 46 L177 45 L190 47 L202 46 L215 43 L228 42 L240 40 L253 38 L266 34 L278 30 L291 32 L304 34 L316 34 L329 30 L342 29 L354 28 L367 30 L380 29 L392 29 L405 31 L418 33 L430 33 L443 32 L456 34 L468 37 L481 40 L493 38 L506 40 L519 43 L531 43 L544 44 L557 47 L569 50 L582 51 L595 48 L607 47 L620 48', end:48, dep:'$2,405,000', fees:13120, delta:'▲ +$4,820 today' },
    '1W':  { line:'M0 43 L11 42 L23 40 L34 39 L45 38 L56 37 L68 37 L79 36 L90 32 L101 33 L113 34 L124 30 L135 30 L147 27 L158 29 L169 27 L180 26 L192 23 L203 23 L214 22 L225 24 L237 24 L248 21 L259 21 L271 20 L282 22 L293 22 L304 23 L316 25 L327 30 L338 32 L349 29 L361 27 L372 27 L383 25 L395 25 L406 25 L417 26 L428 24 L440 23 L451 20 L462 19 L473 17 L485 18 L496 17 L507 14 L519 13 L530 12 L541 12 L552 12 L564 16 L575 17 L586 16 L597 15 L609 16 L620 16', end:16, dep:'$2,382,000', fees:13120, delta:'▲ +$13,120 this week' },
    '1M':  { line:'M0 44 L10 42 L20 40 L30 40 L39 39 L49 38 L59 38 L69 37 L79 35 L89 35 L98 36 L108 34 L118 36 L128 38 L138 38 L148 35 L157 37 L167 35 L177 36 L187 37 L197 35 L207 33 L217 34 L226 32 L236 32 L246 34 L256 33 L266 34 L276 32 L285 30 L295 31 L305 30 L315 30 L325 26 L335 26 L344 27 L354 28 L364 28 L374 27 L384 28 L394 30 L403 31 L413 30 L423 30 L433 29 L443 30 L453 28 L463 34 L472 31 L482 34 L492 36 L502 32 L512 29 L522 30 L531 27 L541 29 L551 29 L561 27 L571 28 L581 28 L590 29 L600 28 L610 28 L620 27', end:27, dep:'$2,332,720', fees:52400, delta:'▲ +$52,400 this month' },
    '6M':  { line:'M0 43 L25 43 L50 45 L74 42 L99 40 L124 41 L149 40 L174 37 L198 36 L223 33 L248 29 L273 29 L298 32 L322 33 L347 34 L372 31 L397 30 L422 25 L446 27 L471 24 L496 21 L521 25 L546 22 L570 26 L595 26 L620 28', end:28, dep:'$2,120,000', fees:214800, delta:'▲ +$214,800 · past 6 months' },
    '1Y':  { line:'M0 49 L12 47 L24 44 L36 47 L49 42 L61 42 L73 42 L85 42 L97 38 L109 39 L122 38 L134 41 L146 36 L158 40 L170 36 L182 39 L195 39 L207 41 L219 38 L231 35 L243 31 L255 33 L267 33 L280 29 L292 26 L304 21 L316 17 L328 18 L340 16 L353 18 L365 13 L377 16 L389 20 L401 22 L413 24 L425 27 L438 22 L450 21 L462 17 L474 19 L486 19 L498 14 L511 13 L523 16 L535 16 L547 11 L559 15 L571 10 L584 13 L596 17 L608 19 L620 23', end:23, dep:'$1,984,000', fees:397500, delta:'▲ +$397,500 · past year' },
    'All': { line:'M0 45 L9 44 L17 45 L26 43 L35 41 L44 42 L52 42 L61 42 L70 41 L79 40 L87 44 L96 42 L105 43 L114 42 L122 44 L131 43 L140 47 L148 49 L157 51 L166 51 L175 51 L183 49 L192 48 L201 43 L210 42 L218 41 L227 41 L236 40 L245 41 L253 42 L262 43 L271 42 L279 41 L288 37 L297 34 L306 33 L314 32 L323 33 L332 31 L341 27 L349 25 L358 28 L367 31 L375 36 L384 38 L393 37 L402 36 L410 35 L419 34 L428 32 L437 33 L445 31 L454 31 L463 32 L472 33 L480 28 L489 29 L498 30 L506 29 L515 31 L524 28 L533 27 L541 24 L550 25 L559 22 L568 21 L576 21 L585 24 L594 25 L603 29 L611 28 L620 28', end:28, dep:'$1,906,000', fees:512400, delta:'▲ +$512,400 all-time' }
  };
  const fill = document.getElementById('feeFillPath');
  const stroke = document.getElementById('feeStrokePath');
  const dot = document.getElementById('tipDot');
  const counter = document.getElementById('feeCount');
  const dep = document.getElementById('depCount');
  const deltaEl = document.getElementById('pfDelta');
  if (!fill || !stroke) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function apply(tf){
    const d = TF[tf]; if(!d) return;
    stroke.setAttribute('d', d.line);
    fill.setAttribute('d', d.line + ' L620 56 L0 56 Z');
    if (dot) dot.setAttribute('cy', d.end);
    if (dep) dep.textContent = d.dep;
    if (deltaEl && d.delta) deltaEl.innerHTML = d.delta + ' · <span class="mono">28.5% / yr</span>';
    if (!counter) return;
    if (reduce){ counter.textContent = '+$' + d.fees.toLocaleString(); return; }
    const from = parseInt((counter.textContent||'0').replace(/[^0-9]/g,'')) || 0;
    const DUR = 600; let t0 = null;
    const ease = t => 1 - Math.pow(1 - t, 3);
    (function step(ts){
      if(!t0) t0 = ts;
      const p = Math.min((ts - t0)/DUR, 1), e = ease(p);
      counter.textContent = '+$' + Math.round(from + (d.fees - from)*e).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  document.querySelectorAll('.pf-tf button').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.pf-tf button').forEach(x=>{x.classList.remove('on');x.setAttribute('aria-selected','false');});
      b.classList.add('on'); b.setAttribute('aria-selected','true');
      apply(b.dataset.tf);
    });
  });
})();

// countdown to next weekly settlement (Monday 23:00 UTC)
(function(){
  const el = document.getElementById('settleIn');
  function next(){
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    // advance to next Tuesday 00:00 UTC
    const day = d.getUTCDay(); // 0 Sun .. 6 Sat
    let add = (2 - day + 7) % 7;
    if (add === 0 && now >= d) add = 7;
    d.setUTCDate(d.getUTCDate() + add);
    return d;
  }
  function tick(){
    const ms = next() - new Date();
    const dd = Math.floor(ms/86400000), hh = Math.floor(ms%86400000/3600000), mm = Math.floor(ms%3600000/60000);
    el.innerHTML = 'Next fees in<br><span class="sf-time">' + (dd>0? dd+'d ' : '') + hh + 'h ' + mm + 'm</span>';
  }
  tick(); setInterval(tick, 30000);
  // mirror the payout countdown into the protocol cycle rail
  (function(){
    const el = document.getElementById('cycleNext'); if(!el) return;
    function ptick(){
      const ms = next() - new Date();
      const dd = Math.floor(ms/86400000), hh = Math.floor(ms%86400000/3600000), mm = Math.floor(ms%3600000/60000);
      el.textContent = 'in ' + (dd>0? dd+'d ' : '') + hh + 'h ' + mm + 'm';
    }
    ptick(); setInterval(ptick, 30000);
  })();
})();

// ---------- fee handling ----------
// The auto-compound toggle that lived here is GONE, not ported: v1 has no
// compound-or-claim setting. Settled yield waits in the bank until the holder
// calls claimYield() themselves, so a switch offering to reinvest it was
// advertising a capability the contracts do not have. OverviewView's
// <ClaimCard /> is the real control, on the real read.

// ---------- view switching + typed greeting ----------
(function(){
  const views = {
    overview: document.getElementById('viewOverview'),
    protocol: document.getElementById('viewProtocol'),
    activity: document.getElementById('viewActivity')
  };
  const h1 = document.getElementById('pageTitle');
  const sub = document.getElementById('pageSub');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // time-aware greeting — two-tone: muted prefix, violet name; live across day-part boundaries
  const partOf = h => h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  let partOfDay = partOf(new Date().getHours());
  let greetPrefix = partOfDay + ', ';
  let greetName = (window.__balcoreName || 'Josh');
  const buildGreeting = () => '<span class="greet-pre">' + greetPrefix + '</span><span class="greet-name">' + greetName + '</span>';
  setInterval(function(){
    const p = partOf(new Date().getHours());
    if (p !== partOfDay){
      partOfDay = p; greetPrefix = p + ', ';
      if (h1 && h1.querySelector('.greet-name')) h1.innerHTML = buildGreeting();
    }
  }, 60000);
  window.__setGreetName = function(name){
    if (!name) return;
    greetName = name;
    if (h1 && h1.querySelector('.greet-name')) h1.innerHTML = buildGreeting();  // re-render if greeting is on screen
  };
  const titles = { protocol: 'Protocol', activity: 'Activity' };
  let greeted = false; // type the greeting only the first time Overview shows

  function typeGreeting(done){
    h1.innerHTML = '<span class="greet-pre"></span><span class="greet-name"></span>';
    const pre = h1.querySelector('.greet-pre');
    const nm = h1.querySelector('.greet-name');
    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';
    h1.appendChild(cursor);
    const full = greetPrefix + greetName;
    let i = 0;
    (function tick(){
      if (i < full.length){
        (i < greetPrefix.length ? pre : nm).textContent += full[i++];
        setTimeout(tick, 45 + Math.random()*35);
      } else {
        setTimeout(()=>{ cursor.remove(); done && done(); }, 500);
      }
    })();
  }

  function show(name){
    Object.entries(views).forEach(([k,el])=>{ if(el) el.style.display = (k===name) ? '' : 'none'; });
    const isOverview = name === 'overview';
    const sysBar = document.getElementById('viewOverviewSys');
    const foot = document.getElementById('viewOverviewFoot');
    if (sysBar) sysBar.style.display = isOverview ? 'flex' : 'none';
    if (foot) foot.style.display = isOverview ? '' : 'none';

    // title: type the greeting on the first Overview view, set instantly otherwise
    if (h1 && sub) {
      if (isOverview && !greeted && !reduce){
        greeted = true;
        sub.classList.remove('show');
        typeGreeting(()=> sub.classList.add('show'));
      } else if (isOverview){
        h1.innerHTML = buildGreeting();
        greeted = true;
        sub.classList.add('show');
      } else {
        h1.textContent = titles[name] || name;
        greeted = true;
        sub.classList.remove('show');
      }
    }

    document.querySelectorAll('.nav-item[data-view]').forEach(a=> a.classList.toggle('active', a.dataset.view===name));
    window.__currentView = name;
    // #protoFees was the "Earned by LPs since launch" count-up. It held a
    // fabricated cumulative total; ProtocolView no longer renders it.
    window.scrollTo(0,0);
  }

  document.querySelectorAll('[data-view]').forEach(a=>{
    a.addEventListener('click', e=>{ e.preventDefault(); show(a.dataset.view); });
  });

  // kick off the greeting on load
  show('overview');
})();

// ---------- activity filters ----------
(function(){
  const btns = document.querySelectorAll('.act-filters button');
  const items = document.querySelectorAll('#viewActivity .act-item');
  const days = document.querySelectorAll('#viewActivity .act-day');
  const empty = document.getElementById('actEmpty');
  if (!btns.length) return;
  btns.forEach(b=>b.addEventListener('click',()=>{
    btns.forEach(x=>x.classList.remove('on')); b.classList.add('on');
    const f = b.dataset.afilter;
    let shown = 0;
    items.forEach(it=>{
      const match = (f === 'all') || (it.dataset.atype === f);
      it.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    // hide a day header if it has no visible items under it
    days.forEach(day=>{
      let vis = false, n = day.nextElementSibling;
      while (n && !n.classList.contains('act-day') && !n.classList.contains('act-empty')){
        if (n.classList.contains('act-item') && n.style.display !== 'none') vis = true;
        n = n.nextElementSibling;
      }
      day.style.display = vis ? '' : 'none';
    });
    empty.style.display = shown ? 'none' : '';
  }));
})();

// ---------- modals ----------
(function(){
  const ovD = document.getElementById('ovDeposit'), ovW = document.getElementById('ovWithdraw'), ovP = document.getElementById('ovPos'), ovS = document.getElementById('ovSwap');
  const navDeposit = document.getElementById('navDeposit');
  const navWithdraw = document.getElementById('navWithdraw');
  // set the active nav to a modal-opener; clears the page-view highlight
  function setModalActive(el){
    document.querySelectorAll('.nav-item').forEach(a=>a.classList.remove('active'));
    el.classList.add('active');
  }
  // restore the highlight to whatever real page the user is on
  function restoreNav(){
    document.querySelectorAll('.nav-item').forEach(a=>a.classList.remove('active'));
    const cur = window.__currentView || 'overview';
    const pageItem = document.querySelector('.nav-item[data-view="'+cur+'"]');
    if (pageItem) pageItem.classList.add('active');
  }
  // --- focus management: trap Tab inside the open dialog, restore focus on close ---
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const lastTrigger = new WeakMap();
  function visibleFocusables(ov){
    return Array.from(ov.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
  }
  function onTrapKey(e){
    if (e.key !== 'Tab') return;
    const ov = document.querySelector('.overlay.open');
    if (!ov) return;
    const items = visibleFocusables(ov);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !ov.contains(document.activeElement))){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onTrapKey, true);
  const open = ov => {
    lastTrigger.set(ov, document.activeElement);
    ov.classList.add('open'); document.body.style.overflow='hidden';
    const i = ov.querySelector('input');
    const target = i || visibleFocusables(ov)[0];
    if (target) target.focus();
  };
  const close = ov => {
    const wasOpen = ov.classList.contains('open');
    ov.classList.remove('open'); document.body.style.overflow='';
    if (ov === ovD || ov === ovW) restoreNav();
    if (wasOpen){
      const t = lastTrigger.get(ov);
      if (t && typeof t.focus === 'function' && document.contains(t)) t.focus();
    }
  };
  navDeposit.addEventListener('click',e=>{ e.preventDefault(); setModalActive(navDeposit); open(ovD); if (window.__balcoreDepChooser) window.__balcoreDepChooser(); });
  navWithdraw.addEventListener('click',e=>{ e.preventDefault(); setModalActive(navWithdraw); open(ovW); });
  document.getElementById('swapBtn').addEventListener('click',()=> open(ovS));
  const ovB = document.getElementById('ovBridge');
  document.getElementById('bridgeBtn').addEventListener('click',()=> open(ovB));
  const ovShare = document.getElementById('ovShare');
  const shareBtn = document.getElementById('shareViewAll');
  if (shareBtn && ovShare){ shareBtn.addEventListener('click',()=> open(ovShare)); ovShare.addEventListener('click',e=>{ if(e.target===ovShare) close(ovShare); }); ovShare.querySelector('[data-close]').addEventListener('click',()=>close(ovShare)); }
  // #ovBalBreak and its #balBreakLink trigger are both gone — the overlay was
  // deleted from Overlays.tsx (see the note there). Nothing to wire.
  const ovDepBreak = document.getElementById('ovDepBreak');
  const depDetailLink = document.getElementById('depDetailLink');
  if (depDetailLink && ovDepBreak){
    depDetailLink.addEventListener('click', ()=> open(ovDepBreak));
    ovDepBreak.addEventListener('click', e=>{ if(e.target===ovDepBreak) close(ovDepBreak); });
    ovDepBreak.querySelector('[data-close]').addEventListener('click', ()=> close(ovDepBreak));
  }
  const ovWallet = document.getElementById('ovWallet');
  const whTrigger = document.getElementById('whMiniCard');
  if (whTrigger && ovWallet){
    whTrigger.addEventListener('click', ()=> open(ovWallet));
    whTrigger.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(ovWallet); } });
    ovWallet.addEventListener('click', e=>{ if(e.target===ovWallet) close(ovWallet); });
    ovWallet.querySelector('[data-close]').addEventListener('click', ()=> close(ovWallet));
    ovWallet.querySelectorAll('.wl-dep').forEach(function(btn){ btn.addEventListener('click', function(){
      close(ovWallet); setModalActive(navDeposit); open(ovD); if (window.__balcoreDepDirect) window.__balcoreDepDirect('wallet');
      var pk = btn.dataset.pool;
      if (pk && pk!=='usdc'){ var mi = document.querySelector('#depPoolMenu .pool-menu-item[data-pool="'+pk+'"]'); if(mi) mi.click(); }
    }); });
  }
  [ovD,ovW,ovP,ovS,ovB].forEach(ov=>{
    ov.addEventListener('click',e=>{ if(e.target===ov) close(ov); });
    ov.querySelector('[data-close]').addEventListener('click',()=>close(ov));
  });
  addEventListener('keydown',e=>{ if(e.key==='Escape'){close(ovD);close(ovW);close(ovP);close(ovS);close(ovB);var _s=document.getElementById('ovShare'); if(_s) close(_s);var _w=document.getElementById('ovWallet'); if(_w) close(_w);var _db=document.getElementById('ovDepBreak'); if(_db) close(_db);} });

  // Bridge logic now lives in modals/BridgePanel.tsx (React + wagmi).
  // The #ovBridge overlay wrapper is still opened and closed above.

  // ---------- position detail: populate from the row's data attributes ----------
  const coinMap = {
    btc: '<span class="coin c-btc">₿</span><span class="coin c-usd">$</span>',
    tsla: '<span class="coin c-tsla">T</span><span class="coin c-usd">$</span>',
    gold: '<span class="coin c-gold">Au</span><span class="coin c-usd">$</span>'
  };
  const setTxt = (id,v) => { document.getElementById(id).textContent = v; };
  document.querySelectorAll('.pos [data-details]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const p = btn.closest('.pos');
      document.getElementById('posIc').innerHTML = coinMap[p.dataset.coins] || '';
      setTxt('posTitle', p.dataset.pair);
      setTxt('posHold', p.dataset.hold);
      setTxt('posValue', p.dataset.value);
      setTxt('posYield', p.dataset.yield);
      setTxt('posE7', p.dataset.e7);
      setTxt('posEall', p.dataset.eall);
      setTxt('posRange', p.dataset.range);
      setTxt('posRebal', p.dataset.rebal);
      const st = document.getElementById('posStatus');
      st.textContent = p.dataset.statusT;
      st.className = 'v ' + (p.dataset.status === 'rb' ? 'gold' : 'mint');
      open(ovP);
    });
  });
  // position actions route to the global deposit / withdraw flows
  document.getElementById('posAdd').addEventListener('click',()=>{ close(ovP); open(ovD); if (window.__balcoreDepDirect) window.__balcoreDepDirect('wallet'); });
  document.getElementById('posWd').addEventListener('click',()=>{ close(ovP); open(ovW); });

  const fmt = n => '$' + Math.round(n).toLocaleString();

  // ---- deposit + withdraw modals are REACT now ----
  // `modals/DepositPanel.tsx` and `modals/WithdrawPanel.tsx` own #ovDeposit and
  // #ovWithdraw end to end, on the real contracts via src/lib/balcore. What used
  // to live here -- DEP_POOLS / WD_POOLS with their invented prices, the equal
  // split at a hardcoded $63,200, the setTimeout "Confirm in wallet..." that
  // confirmed nothing, the ack overlay, the pool menus listing Tesla and Gold --
  // is gone rather than ported: every one of those was a claim the contracts do
  // not make.
  //
  // THIS FILE STILL OWNS, for both modals: open/close (the `.open` class), the
  // focus trap, and the nav highlight. It also still owns the BANK and EXCHANGE
  // on-ramp panels inside #ovDeposit, which are illustrative flows with no
  // contract behind them; React renders their markup and only toggles `display`,
  // so the listeners below still find them.
  //
  // The two globals the rest of this file calls to drive the deposit modal --
  // `window.__balcoreDepChooser()` and `window.__balcoreDepDirect(src)` -- are
  // unchanged in name and meaning; DepositPanel publishes them from React state.
  //
  // ONE CAPABILITY WAS DROPPED DELIBERATELY: the on-ramp trackers used to type an
  // amount into the deposit box for you. The box is React-controlled and reads
  // live wallet balances now, so they open the modal on the wallet tab and the
  // user enters the amount. Pre-filling from a mock counter would have meant
  // keeping the mock.

  // format an amount input with thous-separator commas as the user types (cursor-preserving)
  function fmtMoney(el, maxDec){
    if(!el) return;
    if(maxDec==null) maxDec=2;
    const sel = el.selectionStart;
    const digitsBefore = (el.value.slice(0, sel).match(/\d/g)||[]).length;
    let raw = el.value.replace(/[^\d.]/g,'');
    const dot = raw.indexOf('.');
    if(dot!==-1) raw = raw.slice(0,dot+1) + raw.slice(dot+1).replace(/\./g,'');
    let parts = raw.split('.'), ip = parts[0]||'', dp = parts[1];
    ip = ip.replace(/^0+(?=\d)/,'');
    let out = ip ? Number(ip).toLocaleString('en-US') : (raw.charAt(0)==='.' ? '0' : '');
    if(dp!==undefined) out = (out||'0') + '.' + dp.slice(0,maxDec);
    if(out===el.value) return;
    el.value = out;
    let pos=0, cnt=0;
    while(pos<out.length && cnt<digitsBefore){ if(/\d/.test(out.charAt(pos))) cnt++; pos++; }
    try{ el.setSelectionRange(pos,pos); }catch(e){}
  }

  // small confirmation that survives the modal closing
  let toastT = null;
  function toast(msg){   // looked up lazily: the toast element sits at the end of the app shell
    const el = document.getElementById('toast'), m = document.getElementById('toastMsg'); if(!el || !m) return;
    m.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=> el.classList.remove('show'), 3600);
  }

  // USDC that arrived through the deposit address and has not been deployed.
  // Still a front-end-only figure: v1 has no "idle balance held by Balcore".
  let BALC = 0;
  // Illustrative on-ramp arrivals that are not part of the on-chain balance read.
  let walletGain = 0;


  // ---- bank on-ramp amount (illustrative) ----
  const bankAmt = document.getElementById('bankAmt'), bankCta = document.getElementById('bankCta');
  const bankReceive = document.getElementById('bankReceive');
  function bankUpdate(){
    fmtMoney(bankAmt);
    const v = parseFloat((bankAmt.value||'').replace(/,/g,'')) || 0;
    // illustrative: ~1% blended on-ramp cost for bank transfer
    bankReceive.textContent = v ? '≈ ' + fmt(v*0.99) + ' USDC' : '—';
    if (v < 5){ bankCta.disabled = true; bankCta.textContent = v>0 ? 'Minimum $5' : 'Enter an amount'; return; }
    bankCta.disabled = false; bankCta.textContent = 'Continue on Coinbase · ' + fmt(v);
  }
  bankAmt.addEventListener('input', bankUpdate);
  document.querySelectorAll('#bankQuick button').forEach(b=>b.addEventListener('click',()=>{
    bankAmt.value = b.dataset.v; bankUpdate();
    document.querySelectorAll('#bankQuick button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  }));
  bankCta.addEventListener('click',()=>{
    if (bankCta.disabled) return;
    bankCta.disabled = true; bankCta.textContent = 'Opening Coinbase\u2026';
    const v = parseFloat((bankAmt.value||'').replace(/,/g,'')) || 0;
    // real build: create the Coinbase Onramp session here (destination = this wallet, USDC on Avalanche) and persist
    // the intent {amount, pool} server-side. The tracker below is what the user sees while the transfer is in flight.
    setTimeout(()=>{
      close(ovD);
      startIncoming({ source: 'bank', usd: v, pool: depPoolKey });
      toast('Bank transfer started. We\u2019ll let you know when it lands, then one tap deposits it.');
      bankAmt.value=''; bankUpdate();
      document.querySelectorAll('#bankQuick button').forEach(x=>x.classList.remove('on'));
    }, 1100);
  });

  // ---- weekly placement helper: first Tuesday 00:00 UTC placement whose Mon 23:00 UTC cutoff is still ahead of `ms` ----
  function placementAfter(ms){
    const d = new Date(ms);
    const plc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0,0,0));
    plc.setUTCDate(plc.getUTCDate() + (2 - plc.getUTCDay() + 7) % 7);
    if (plc.getTime() - 3600000 <= ms) plc.setUTCDate(plc.getUTCDate() + 7);
    return plc;
  }
  const dayStr = d => d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
  function paintBankPlacement(){
    const el = document.getElementById('bankPlacement');
    if (el) el.textContent = dayStr(placementAfter(Date.now() + 86400000)) + ' \u00b7 once you confirm';
  }
  paintBankPlacement();

  // ---- deposit from an exchange / another wallet ----
  // REMOVED with the UI it drove. The exchange tab used to show a hardcoded
  // deposit address, a QR and six network chips; #recvCopy, #exchCta, #recvNets
  // and .exch-from no longer exist, so EXCH_FROM / paintExch() had nothing left
  // to paint. The tab is a coming-soon state now — see DepositPanel.tsx,
  // #depExchPanel. startIncoming() stays: the bank flow and the ?incoming=
  // demo triggers below still use it.

  // ---- pending-withdrawal tracker ----
  const tracker = document.getElementById('wdTracker');
  const wtFill = document.getElementById('wtFill'), wtEta = document.getElementById('wtEta'), wtDate = document.getElementById('wtDate');
  const wtAmt = document.getElementById('wtAmt'), wtPair = document.getElementById('wtPair');
  const wtSteps = document.querySelectorAll('#wtSteps .wt-step');
  const wtKeep = document.getElementById('wtKeep'), wtClaim = document.getElementById('wtClaim'), wtActNote = document.getElementById('wtActNote');
  let trkReqAt = null, trkArrival = null, trkTimer = null;
  function nextSettle(fromMs){
    const now = new Date(fromMs);
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0,0,0));
    let add = (2 - d.getUTCDay() + 7) % 7; if (add===0) add=7; d.setUTCDate(d.getUTCDate()+add);
    if ((d - now) < 2*86400000) d.setUTCDate(d.getUTCDate()+7);   // standard cycle: at least a couple of days out
    return d.getTime();
  }
  function trkTick(){
    if (!trkReqAt) return;
    const now = Date.now(), total = trkArrival - trkReqAt, elapsed = Math.max(0, now - trkReqAt);
    const pct = Math.min(96, Math.max(8, elapsed/total*100));
    wtFill.style.width = pct + '%';
    const stage = pct < 42 ? 1 : (pct < 86 ? 2 : 3);   // 0 Requested · 1 Unwinding · 2 Settlement · 3 wallet
    wtSteps.forEach(function(s,i){ s.classList.toggle('done', i < stage); s.classList.toggle('on', i === stage); });
    const ms = Math.max(0, trkArrival - now), dd = Math.floor(ms/86400000), hh = Math.floor(ms%86400000/3600000);
    wtEta.textContent = ms <= 0 ? 'Arriving now' : 'Arrives in ~' + (dd>0? dd+'d ' : '') + hh + 'h';
    wtDate.textContent = 'by ' + new Date(trkArrival).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    const ready = ms <= 0;
    if (wtClaim){ wtClaim.disabled = !ready; wtClaim.classList.toggle('ready', ready); }
    if (wtActNote) wtActNote.textContent = ready
      ? 'Your funds are ready \u2014 claim them to your wallet, or put them back to keep earning.'
      : 'Changed your mind? Put it back any time before it settles and your liquidity keeps earning until then.';
  }
  function showTracker(amountUSD, poolName, tokenStr, reqAt){
    trkReqAt = reqAt || Date.now(); trkArrival = nextSettle(trkReqAt);
    wtAmt.textContent = fmt(amountUSD);
    wtPair.textContent = 'from ' + poolName + ' · ' + tokenStr;
    if (wtKeep) wtKeep.disabled = false; if (wtClaim){ wtClaim.textContent = 'Claim to wallet'; }
    tracker.hidden = false; trkTick(); clearInterval(trkTimer); trkTimer = setInterval(trkTick, 30000);
  }
  function endTracker(){ tracker.hidden = true; clearInterval(trkTimer); trkReqAt = null; }
  if (wtKeep) wtKeep.addEventListener('click', function(){
    if (wtActNote) wtActNote.textContent = '\u2713 Put back \u2014 your funds are earning again.';
    wtKeep.disabled = true; if (wtClaim) wtClaim.disabled = true;
    setTimeout(endTracker, 1400);
  });
  if (wtClaim) wtClaim.addEventListener('click', function(){
    if (wtClaim.disabled) return;
    wtClaim.textContent = 'Claimed \u2713'; wtClaim.disabled = true; if (wtKeep) wtKeep.disabled = true;
    if (wtActNote) wtActNote.textContent = '\u2713 Sent to your wallet.';
    setTimeout(endTracker, 1400);
  });
  // demo: ?pending shows an in-progress request (as if requested ~2.5 days ago)
  if (location.search.indexOf('pending') !== -1) showTracker(662500, 'Bitcoin / Dollar', '3.94 BTC + 331,000 USDC', Date.now() - 2.5*86400000);


  // ---- incoming deposit tracker ----
  // Two routes end here. Bank: lands in the user's wallet, one tap to deposit. Deposit address: lands as USDC in the
  // user's Balcore account, where they choose how much goes into a pool. Either way the tracker says at every stage
  // that nothing is earning until the money is in a pool.
  const IN_SRC = {
    bank:      { title:'Money on its way',                tag:'Bank transfer · via Coinbase', eta:'usually 1–3 business days', window:2*86400000, leadMs:86400000, landDelay:9000, via:'Via bank' },
    coinbase:  { title:'Watching for USDC from Coinbase',  eta:'usually lands in minutes', window:15*60000, leadMs:0, landDelay:7000, via:'Via Coinbase',  landsOn:'Avalanche' },
    robinhood: { title:'Watching for USDC from Robinhood', eta:'usually lands in minutes', window:15*60000, leadMs:0, landDelay:7000, via:'Via Robinhood', landsOn:'Polygon' },
    exchange:  { title:'Watching for your USDC',           eta:'usually lands in minutes', window:15*60000, leadMs:0, landDelay:7000, via:'Via exchange',  landsOn:'Base' }
  };
  const IN_STEPS = { bank:['Sent','In transit','Landed','Deposited'], hold:['Sent','Landed','To Avalanche','In Balcore'] };
  const DEMO_USDC = 2500;   // what "arrives" in the exchange demos (the real amount is whatever the chain shows)
  const IN_FEE = 0.99;      // same illustrative on-ramp cost used in bankUpdate
  const inT = document.getElementById('inTracker');
  const itTitle = document.getElementById('itTitle'), itWindow = document.getElementById('itWindow'), itKeep = document.getElementById('itKeep');
  const itAmt = document.getElementById('itAmt'), itPair = document.getElementById('itPair');
  const itFill = document.getElementById('itFill'), itEta = document.getElementById('itEta'), itDate = document.getElementById('itDate');
  const itSteps = document.querySelectorAll('#itSteps .wt-step'), itStepLabels = document.querySelectorAll('#itSteps .wt-step span:last-child');
  const itChange = document.getElementById('itChange'), itDeposit = document.getElementById('itDeposit'), itNote = document.getElementById('itActNote');
  const itMenu = document.getElementById('itMenu');
  const whMiniSub = document.querySelector('#whMiniCard .wh-mini-sub'), whMiniTotal = document.getElementById('whMiniTotal');
  let inIntent = null, inTimer = null, inLandTimer = null;
  const usdcStr = n => fmt(n).replace('$','') + ' USDC';
  const notEarning = txt => '<span class="wt-warn">Not earning yet</span> · ' + txt;
  const routeOf = () => (inIntent && inIntent.source !== 'bank' ? 'hold' : 'bank');

  // ---- USDC available in Balcore (arrived through the deposit address, not deployed) ----
  const balCard = document.getElementById('balCard'), balCardTotal = document.getElementById('balCardTotal'), balCardSub = document.getElementById('balCardSub');
  const balSend = document.getElementById('balSend'), balDeposit = document.getElementById('balDeposit');
  function paintBal(){
    if (balCard) balCard.hidden = BALC <= 0;
    if (balCardTotal) balCardTotal.textContent = fmt(BALC);
    if (balCardSub) balCardSub.textContent = 'USDC on Avalanche \u00b7 deposit it, hold it, or send it to your wallet';
    if (balSend) balSend.disabled = false;
    if (balDeposit) balDeposit.disabled = false;
  }
  // Opens the deposit modal on the wallet tab. It no longer TYPES the amount in:
  // the form is React-controlled and reads live wallet balances, so pre-filling
  // from this front-end-only counter would be putting a number the chain has
  // never seen into a box the chain is about to check.
  function openDepositFromBalance(){
    setModalActive(navDeposit); open(ovD);
    if (window.__balcoreDepDirect) window.__balcoreDepDirect('wallet');
  }
  if (balDeposit) balDeposit.addEventListener('click', openDepositFromBalance);
  // send the idle USDC back to the connected wallet (real build: a user-signed message the keeper submits)
  if (balSend) balSend.addEventListener('click', ()=>{
    if (BALC <= 0) return;
    const amt = BALC;
    balSend.disabled = true; if (balDeposit) balDeposit.disabled = true;
    if (balCardSub) balCardSub.textContent = 'Sending ' + usdcStr(amt) + ' to your wallet…';
    setTimeout(()=>{
      BALC = 0; paintBal(); walletGained(amt);
      if (whMiniSub) whMiniSub.textContent = usdcStr(amt) + ' just arrived from Balcore';
      if (inIntent && inIntent.stage === 'arrived') endIncoming();
      paintPortfolio();
    }, 1200);
  });

  function inLabels(){
    if (!inIntent) return;
    const r = routeOf();
    if (r === 'hold') itPair.textContent = (inIntent.usdc != null ? '≈ ' + usdcStr(inIntent.usdc) + ' · ' : '') + 'arrives as USDC in Balcore · you decide';
    else itPair.textContent = '≈ ' + usdcStr(inIntent.usdc) + ' · arrives in your wallet · you decide';
    if (r === 'hold') itDeposit.textContent = inIntent.stage === 'arrived' ? 'Deposit into a pool' : (inIntent.stage === 'done' ? 'Deposited ✓' : 'Arrives as USDC · you decide');
    else itDeposit.textContent = inIntent.stage === 'landed' ? 'Deposit into a pool' : (inIntent.stage === 'done' ? 'Deposited ✓' : 'Arrives in your wallet · you decide');
    if (pl && inIntent.stage !== 'done') itDeposit.title = 'Destination pool: ' + pl.name;
    if (itMenu) itMenu.querySelectorAll('.pool-menu-item').forEach(m => m.classList.toggle('on', m.dataset.pool === inIntent.pool));
  }
  function inSetSteps(stage){   // stage = the step currently 'on' (0-3); everything before it is done; 4 = all done
    itSteps.forEach((st,i)=>{ st.classList.toggle('done', i < stage); st.classList.toggle('on', i === stage); });
  }
  function inTick(){
    if (!inIntent || inIntent.stage !== 'transit') return;
    const src = IN_SRC[inIntent.source];
    const elapsed = Math.max(0, Date.now() - inIntent.sentAt);
    itFill.style.width = Math.min(88, Math.max(8, elapsed / src.window * 100)) + '%';
    inSetSteps(1);
    itEta.innerHTML = notEarning(src.eta);
    itDate.textContent = 'earliest placement ' + dayStr(placementAfter(inIntent.sentAt + src.leadMs));
  }
  // deposit-address routes: the USDC reached the address on some listed chain; the keeper is moving it to Avalanche
  function inForwarding(){
    if (!inIntent || inIntent.stage !== 'transit') return;
    const src = IN_SRC[inIntent.source];
    inIntent.stage = 'forwarding'; clearInterval(inTimer);
    if (inIntent.usdc == null) inIntent.usdc = DEMO_USDC;
    itAmt.textContent = fmt(inIntent.usdc);
    inSetSteps(2); itFill.style.width = '62%';
    itTitle.textContent = 'USDC landed on ' + src.landsOn;
    itEta.innerHTML = notEarning(src.landsOn === 'Avalanche' ? 'almost there' : 'moving to Avalanche via Circle, about a minute');
    itDate.textContent = usdcStr(inIntent.usdc) + ' on ' + src.landsOn;
    itNote.textContent = 'Nothing to do on your side. Once it is on Avalanche you can deposit it, hold it, or send it to your wallet.';
    inLabels(); paintPortfolio();
  }
  // deposit-address route: arrived as USDC in the user's Balcore account, waiting for a decision
  function inArrived(){
    if (!inIntent || inIntent.stage !== 'forwarding') return;
    inIntent.stage = 'arrived';
    inSetSteps(3); itFill.style.width = '100%';
    itTitle.textContent = 'USDC arrived in Balcore';
    itWindow.hidden = true; itKeep.hidden = false; itKeep.textContent = 'Got it';
    itEta.innerHTML = '<span class="wt-warn">Not earning yet</span> · available as USDC on Avalanche';
    itDate.textContent = 'next placement ' + dayStr(placementAfter(Date.now()));
    itChange.hidden = false; itChange.disabled = false; itChange.textContent = 'Send to wallet';
    itDeposit.disabled = false; itDeposit.classList.add('ready');
    itNote.textContent = 'It is yours to direct: deposit it into a pool in one tap, leave it as USDC, or send it back to your wallet.';
    inLabels();
    BALC += inIntent.usdc; paintBal(); paintPortfolio();
  }
  // bank route: landed in the connected wallet
  function inLanded(){
    if (!inIntent || inIntent.stage === 'landed' || inIntent.stage === 'done') return;
    inIntent.stage = 'landed'; clearInterval(inTimer);
    if (inIntent.usdc == null) inIntent.usdc = DEMO_USDC;
    itAmt.textContent = inIntent.usd != null ? fmt(inIntent.usd) : fmt(inIntent.usdc);
    inSetSteps(2); itFill.style.width = '96%';
    itTitle.textContent = 'Your money landed';
    itWindow.hidden = true; itKeep.hidden = false; itKeep.textContent = 'Keep in wallet';
    const plc = dayStr(placementAfter(Date.now()));
    itEta.innerHTML = '<span class="wt-warn">Landed · not earning until you deposit</span>';
    itDate.textContent = 'next placement ' + plc;
    itDeposit.disabled = false; itDeposit.classList.add('ready');
    itNote.textContent = 'Put any amount of it into a pool in one tap: it earns supply APY right away, then joins the ' + plc + ' placement. Or keep it in your wallet.';
    inLabels();
    walletGained(inIntent.usdc);
    if (whMiniSub){
      if (!whMiniSub.dataset.prev) whMiniSub.dataset.prev = whMiniSub.textContent;
      whMiniSub.textContent = usdcStr(inIntent.usdc) + ' just landed · not earning yet';
      whMiniSub.style.color = 'var(--gold)';
    }
    paintPortfolio();
  }
  // USDC that reached the connected wallet outside the on-chain balance read (illustrative on-ramp arrivals)
  function walletGained(usdc){
    walletGain += usdc;
    // The deposit form's wallet figures come from an on-chain balanceOf now, so
    // there is nothing here to repaint -- a real arrival shows up on its own.
    if (whMiniTotal){ const cur = parseFloat((whMiniTotal.textContent||'').replace(/[^0-9.]/g,'')) || 0; whMiniTotal.textContent = fmt(cur + usdc); }
  }
  // o = { source, usd (null when unknown), pool, sentAt, stage, demo }
  function startIncoming(o){
    if (!inT) return;
    clearInterval(inTimer); clearTimeout(inLandTimer);
    const source = IN_SRC[o.source] ? o.source : 'bank', src = IN_SRC[source];
    inIntent = { source: source, usd: o.usd == null ? null : o.usd, usdc: null, pool: o.pool || 'btc', sentAt: o.sentAt || Date.now(), stage: 'transit' };
    if (inIntent.usd != null) inIntent.usdc = source === 'bank' ? inIntent.usd * IN_FEE : inIntent.usd;   // exchange transfers arrive 1:1
    const r = routeOf();
    itAmt.textContent = inIntent.usd != null ? fmt(inIntent.usd) : 'USDC';
    itTitle.textContent = src.title; itWindow.hidden = false; itKeep.hidden = true;
    itWindow.textContent = r === 'bank' ? src.tag : 'Arrives as USDC in Balcore · any listed network';
    itStepLabels.forEach((el,i)=>{ el.textContent = IN_STEPS[r][i]; });
    itDeposit.disabled = true; itDeposit.classList.remove('ready');
    itChange.hidden = true; itChange.disabled = false; itChange.textContent = 'Send to wallet';
    itNote.textContent = r === 'hold'
      ? 'It will show up as available USDC in Balcore. Deposit it, hold it, or send it to your wallet, whenever you like. Nothing is earning until it is in a pool.'
      : 'The USDC lands in your own wallet. Nothing moves into a pool until you choose how much.';
    if (itMenu) itMenu.classList.remove('open');
    itChange.setAttribute('aria-expanded','false');
    inLabels(); inSetSteps(1); inT.hidden = false; inTick();
    inTimer = setInterval(inTick, 30000);
    if (o.stage === 'forwarding') inForwarding();
    else if (o.stage === 'landed') inLanded();
    else if (o.stage === 'arrived'){ inForwarding(); inArrived(); }
    else if (o.demo !== false){   // demo: the waits are compressed to seconds
      if (r === 'bank') inLandTimer = setTimeout(inLanded, src.landDelay);
      else inLandTimer = setTimeout(()=>{ inForwarding(); inLandTimer = setTimeout(inArrived, src.landsOn === 'Avalanche' ? 2500 : 4500); }, src.landDelay);
    }
    paintPortfolio();
  }
  function endIncoming(){
    if (inT) inT.hidden = true;
    clearInterval(inTimer); clearTimeout(inLandTimer); inIntent = null;
    if (whMiniSub && whMiniSub.dataset.prev){ whMiniSub.textContent = whMiniSub.dataset.prev; whMiniSub.style.color = ''; }
    paintPortfolio();
  }
  // secondary button: change the destination pool while in flight; after arrival it sends to wallet
  if (itChange) itChange.addEventListener('click', e=>{
    e.stopPropagation(); if (itChange.disabled) return;
    if (inIntent && inIntent.stage === 'arrived'){ if (balSend) balSend.click(); return; }
    const o = itMenu.classList.toggle('open'); itChange.setAttribute('aria-expanded', o?'true':'false');
  });
  if (itMenu) itMenu.querySelectorAll('.pool-menu-item').forEach(m => m.addEventListener('click', ()=>{
    if (!inIntent) return; inIntent.pool = m.dataset.pool; inLabels();
    itMenu.classList.remove('open'); itChange.setAttribute('aria-expanded','false');
  }));
  document.addEventListener('click', e=>{
    if (itMenu && itMenu.classList.contains('open') && !itMenu.contains(e.target) && e.target !== itChange){
      itMenu.classList.remove('open'); itChange.setAttribute('aria-expanded','false');
    }
  });
  // "Keep in wallet" (bank) / "Got it" (hold): dismiss the tracker; the money stays where it is
  if (itKeep) itKeep.addEventListener('click', ()=>{ endIncoming(); });
  // primary: bank route opens the wallet deposit flow pre-filled; hold route opens it with the Balcore balance
  if (itDeposit) itDeposit.addEventListener('click', ()=>{
    if (itDeposit.disabled || !inIntent) return;
    if (inIntent.stage === 'arrived'){ openDepositFromBalance(); return; }
    if (inIntent.stage !== 'landed') return;
    setModalActive(navDeposit); open(ovD);
    if (window.__balcoreDepDirect) window.__balcoreDepDirect('wallet');
  });
  // The "deposit confirmed" hand-off that used to live here hung off the #depAck
  // overlay and read the amount back out of the form's DOM. DepositPanel owns
  // its own success state now (the tx hash, and when the shares activate), so
  // there is nothing to mirror: the incoming tracker is dismissed by its own
  // Keep / Change buttons.
  paintBal();

  // ---- portfolio: everything the user holds through Balcore, and where it is ----
  const ovPf = document.getElementById('ovPortfolio');
  const numOf = el => el ? (parseFloat(el.dataset && el.dataset.countup) || parseFloat((el.textContent||'').replace(/[^0-9.]/g,'')) || 0) : 0;
  const fmtShort = n => n >= 1e6 ? '$' + (n/1e6).toFixed(2) + 'M' : (n >= 1e3 ? '$' + (n/1e3).toFixed(1) + 'K' : fmt(n));
  const setTxtId = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  function paintPortfolio(){
    const pools = numOf(document.querySelector('.balance')), wallet = numOf(whMiniTotal), bal = BALC, total = pools + wallet + bal;
    setTxtId('pfTotal', fmt(total)); setTxtId('pfBucketPools', fmt(pools)); setTxtId('pfBucketWallet', fmt(wallet)); setTxtId('pfBucketBal', fmt(bal));
    const bbRow = document.getElementById('pfBucketBalRow'); if (bbRow) bbRow.hidden = bal <= 0;
    setTxtId('wmTotal', fmtShort(total)); setTxtId('wmPools', fmtShort(pools)); setTxtId('wmWallet', fmtShort(wallet)); setTxtId('wmBal', fmtShort(bal));
    const wmRow = document.getElementById('wmBalRow'); if (wmRow) wmRow.hidden = bal <= 0;
    // by pool, from the positions list and the share panel
    const shares = {};
    document.querySelectorAll('#ovShare .share-row').forEach(r => { const pct = r.querySelector('.share-pct'); if (pct) shares[r.dataset.coins] = pct.textContent; });
    const pfPools = document.getElementById('pfPools');
    if (pfPools) pfPools.innerHTML = Array.from(document.querySelectorAll('.pos[data-pair]')).map(p => {
      const ic = p.querySelector('.pair-ic'); const share = shares[p.dataset.coins];
      return '<div class="pt-row">' + (ic ? ic.outerHTML : '') + '<div class="pt-row-body"><b>' + p.dataset.pair + '</b><span>' + p.dataset.hold + (share ? ' · ' + share + ' of the pool' : '') + '</span></div><div class="pt-row-v">' + p.dataset.value + '<small>' + p.dataset.yield + ' / yr · ' + p.dataset.eall + ' all time</small></div></div>';
    }).join('');
    // by asset, from the sidebar donut
    const pfAssets = document.getElementById('pfAssets');
    if (pfAssets) pfAssets.innerHTML = Array.from(document.querySelectorAll('.pf-seg')).map(seg =>
      '<div class="pt-row"><span class="pt-dot" style="background:' + seg.dataset.color + '"></span><div class="pt-row-body"><b>' + seg.dataset.name + '</b><span>' + seg.dataset.pct + ' of your wallet</span></div><div class="pt-row-v">' + seg.dataset.val + '</div></div>'
    ).join('');
    // in motion: anything the trackers are showing
    const motion = [];
    if (tracker && !tracker.hidden) motion.push({ t: 'Withdrawal in progress', s: wtPair.textContent, v: wtAmt.textContent });
    if (inT && !inT.hidden && inIntent) motion.push({ t: itTitle.textContent, s: itPair.textContent, v: itAmt.textContent });
    const secEl = document.getElementById('pfMotionSec'), motEl = document.getElementById('pfMotion');
    if (secEl) secEl.hidden = motion.length === 0;
    if (motEl){
      motEl.hidden = motion.length === 0;
      motEl.innerHTML = motion.map(m => '<div class="pt-row"><span class="pt-dot" style="background:var(--gold)"></span><div class="pt-row-body"><b>' + m.t + '</b><span>' + m.s + '</span></div><div class="pt-row-v">' + m.v + '</div></div>').join('');
    }
  }
  function openPortfolio(){ if (!ovPf) return; paintPortfolio(); open(ovPf); }
  if (ovPf){
    ovPf.addEventListener('click', e=>{ if (e.target === ovPf) close(ovPf); });
    const pfX = ovPf.querySelector('[data-close]'); if (pfX) pfX.addEventListener('click', ()=> close(ovPf));
    addEventListener('keydown', e=>{ if (e.key === 'Escape') close(ovPf); });
    ovPf.querySelectorAll('.pt-bucket-act').forEach(b => b.addEventListener('click', ()=>{
      close(ovPf);
      if (b.dataset.pf === 'withdraw'){ navWithdraw.click(); return; }
      if (b.dataset.pf === 'balance'){ openDepositFromBalance(); return; }
      const ovWl = document.getElementById('ovWallet'); if (ovWl) open(ovWl);
    }));
  }
  const sidePf = document.getElementById('sidePortfolio');
  if (sidePf){
    sidePf.addEventListener('click', openPortfolio);
    sidePf.addEventListener('keydown', e=>{ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openPortfolio(); } });
  }
  const portfolioBtn = document.getElementById('portfolioBtn');
  if (portfolioBtn) portfolioBtn.addEventListener('click', openPortfolio);
  const pfMenuBtn = document.getElementById('pfMenuBtn');
  if (pfMenuBtn) pfMenuBtn.addEventListener('click', openPortfolio);
  const pfDeposited = document.getElementById('pfDeposited'), ovDepBrk = document.getElementById('ovDepBreak');
  if (pfDeposited && ovDepBrk) pfDeposited.addEventListener('click', ()=>{ close(ovPf); open(ovDepBrk); });
  // "Ahead of just holding" (#edgeCard) NO LONGER opens the balance breakdown.
  // Its figure needs an entry-price history nothing indexes yet, so the card
  // face renders a placeholder, and #ovBalBreak — which was all invented
  // figures — has since been deleted outright. Restore both together when the
  // breakdown can be read.
  // last week's fees by pool: settled figures; the card opens the Activity view where each settlement is listed
  const feesCard = document.getElementById('feesByPoolCard');
  if (feesCard){
    const goActivity = ()=>{ const a = document.querySelector('.nav-item[data-view="activity"]'); if (a) a.click(); };
    feesCard.addEventListener('click', goActivity);
    feesCard.addEventListener('keydown', e=>{ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); goActivity(); } });
  }
  const wbtn = document.getElementById('walletBtn');
  if (wbtn) wbtn.addEventListener('click', paintPortfolio);   // the menu summary is fresh when it opens
  paintPortfolio();
  // demo states: ?incoming (bank transfer in flight) · ?landed (bank money in the wallet, one tap)
  //              ?exchange (watching) · ?forwarding (USDC moving to Avalanche) · ?arrived (waiting in Balcore)
  const inQ = location.search;
  if (inQ.indexOf('incoming') !== -1) startIncoming({ source:'bank', usd:5000, pool:'btc', sentAt: Date.now() - 20*3600000, demo:false });
  else if (inQ.indexOf('landed') !== -1) startIncoming({ source:'bank', usd:5000, pool:'btc', sentAt: Date.now() - 2*86400000, stage:'landed' });
  else if (inQ.indexOf('exchange') !== -1) startIncoming({ source:'coinbase', usd:null, pool:'btc', demo:false });
  else if (inQ.indexOf('forwarding') !== -1) startIncoming({ source:'robinhood', usd:null, pool:'gold', stage:'forwarding' });
  else if (inQ.indexOf('arrived') !== -1) startIncoming({ source:'robinhood', usd:null, pool:'btc', stage:'arrived' });

  // settlement date in withdraw modal
  (function(){
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 0, 0));
    let add = (1 - d.getUTCDay() + 7) % 7;
    if (add === 0 && now >= d) add = 7;
    d.setUTCDate(d.getUTCDate() + add);
    const opts = {weekday:'short', month:'short', day:'numeric', timeZone:'UTC'};
    document.getElementById('wdSettle').textContent = d.toLocaleDateString('en-US',opts) + ' · 23:00 UTC';
  })();
})();

// ---------- command palette (search + navigate, live pool filter) ----------
(function(){
  const input = document.getElementById('poolSearch') as HTMLInputElement | null;
  const empty = document.getElementById('posEmpty');
  const menu = document.getElementById('cmdkMenu');
  if (!input || !menu) return;
  const positions = () => Array.from(document.querySelectorAll<HTMLElement>('.pos'));

  // navigation destinations (existing data-view targets)
  const NAV = [
    { name: 'Overview', sub: 'Go to view', target: 'overview' },
    { name: 'Protocol', sub: 'Go to view', target: 'protocol' },
    { name: 'Activity', sub: 'Go to view', target: 'activity' },
  ];
  // actions that open modals
  const ACTIONS = [
    { name: 'Deposit', sub: 'Open modal', target: 'navDeposit' },
    { name: 'Withdraw', sub: 'Open modal', target: 'navWithdraw' },
  ];

  // unique pool names harvested from the Protocol view's .pos list
  function pools(){
    const seen = new Map<string, string>();
    positions().forEach(pos => {
      const pair = pos.getAttribute('data-pair') || '';
      if (pair && !seen.has(pair)) {
        seen.set(pair, ((pos.getAttribute('data-hold') || '') + ' ' + (pos.getAttribute('data-coins') || '')).toLowerCase());
      }
    });
    return Array.from(seen, ([name, hay]) => ({ name, hay }));
  }

  function filter(){
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    positions().forEach(pos => {
      // match against the pair name + the holdings text (e.g. "bitcoin", "btc", "tesla", "gold", "usdc")
      const pair = (pos.getAttribute('data-pair') || '').toLowerCase();
      const hold = (pos.getAttribute('data-hold') || '').toLowerCase();
      const coins = (pos.getAttribute('data-coins') || '').toLowerCase();
      const match = q === '' || pair.includes(q) || hold.includes(q) || coins.includes(q);
      pos.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    if (empty) empty.hidden = shown !== 0;
  }

  let items: HTMLElement[] = [];
  let hi = -1;

  function closeMenu(){
    menu.classList.remove('open');
    menu.innerHTML = '';
    items = [];
    hi = -1;
    input.setAttribute('aria-expanded', 'false');
  }

  function activate(el: HTMLElement){
    const kind = el.getAttribute('data-kind');
    const target = el.getAttribute('data-target') || '';
    closeMenu();
    if (kind === 'nav'){
      const t = document.querySelector('[data-view="' + target + '"]') as HTMLElement | null;
      if (t) t.click();
    } else if (kind === 'action'){
      const t = document.getElementById(target) as HTMLElement | null;
      if (t) t.click();
    } else if (kind === 'pool'){
      const pv = document.getElementById('viewProtocol');
      if (pv && getComputedStyle(pv).display === 'none'){
        const t = document.querySelector('[data-view="protocol"]') as HTMLElement | null;
        if (t) t.click();
      }
      input.value = target;
      filter();
    }
    input.blur();
  }

  function setHi(i: number){
    hi = i;
    items.forEach((el, j) => el.classList.toggle('on', j === hi));
  }

  function renderMenu(){
    const q = input.value.trim().toLowerCase();
    if (!q){ closeMenu(); return; }
    const matches: { kind: string; name: string; sub: string; target: string }[] = [];
    NAV.forEach(n => { if (n.name.toLowerCase().includes(q)) matches.push({ kind: 'nav', name: n.name, sub: n.sub, target: n.target }); });
    ACTIONS.forEach(a => { if (a.name.toLowerCase().includes(q)) matches.push({ kind: 'action', name: a.name, sub: a.sub, target: a.target }); });
    pools().forEach(p => { if (p.name.toLowerCase().includes(q) || p.hay.includes(q)) matches.push({ kind: 'pool', name: p.name, sub: 'Pool · filter on Protocol', target: p.name }); });
    menu.innerHTML = '';
    if (!matches.length){ closeMenu(); return; }
    matches.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pool-menu-item';
      b.setAttribute('role', 'option');
      b.setAttribute('data-kind', m.kind);
      b.setAttribute('data-target', m.target);
      const body = document.createElement('span');
      body.className = 'pmi-body';
      const nm = document.createElement('span');
      nm.className = 'pmi-name';
      nm.textContent = m.name;
      const sb = document.createElement('span');
      sb.className = 'pmi-sub';
      sb.textContent = m.sub;
      body.appendChild(nm);
      body.appendChild(sb);
      b.appendChild(body);
      // mousedown so selection fires before the input's blur closes the menu
      b.addEventListener('mousedown', e => { e.preventDefault(); activate(b); });
      menu.appendChild(b);
    });
    items = Array.from(menu.querySelectorAll<HTMLElement>('.pool-menu-item'));
    hi = -1;
    menu.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('input', () => { filter(); renderMenu(); });
  input.addEventListener('focus', renderMenu);
  input.addEventListener('blur', () => { setTimeout(closeMenu, 120); });
  input.addEventListener('keydown', e => {
    // Escape clears + closes + blurs
    if (e.key === 'Escape'){ input.value = ''; filter(); closeMenu(); input.blur(); return; }
    if (!menu.classList.contains('open')) return;
    if (e.key === 'ArrowDown'){ e.preventDefault(); setHi(Math.min(hi + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); setHi(Math.max(hi - 1, 0)); }
    else if (e.key === 'Enter'){ e.preventDefault(); const el = items[hi >= 0 ? hi : 0]; if (el) activate(el); }
  });

  // ⌘K / Ctrl-K focuses the search
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
})();



(function(){
  var tip=document.getElementById('donutTip');
  var svg=document.querySelector('.donut-svg');
  var segs=[].slice.call(document.querySelectorAll('.pf-seg'));
  var rows=[].slice.call(document.querySelectorAll('.legend .row[data-seg]'));
  if(!tip||!segs.length) return;
  var active=-1;
  function move(x,y){
    var pad=12, w=tip.offsetWidth||130, h=tip.offsetHeight||44;
    var l=x+14, t=y-h-10;
    if(l+w+pad>window.innerWidth) l=x-w-14;
    if(t<pad) t=y+18;
    tip.style.left=l+'px'; tip.style.top=t+'px';
  }
  function show(i,x,y){
    var s=segs[i]; if(!s) return; active=i;
    tip.innerHTML='<div class="t-name"><span class="d" style="background:'+s.dataset.color+'"></span>'+s.dataset.name+'</div><div class="t-sub">'+s.dataset.pct+' \u00b7 '+s.dataset.val+'</div>';
    tip.classList.add('show'); move(x,y);
    if(svg) svg.classList.add('dim');
    segs.forEach(function(el,j){el.classList.toggle('is-hover', j===i);});
    rows.forEach(function(el){el.classList.toggle('is-hover', +el.dataset.seg===i);});
  }
  function hide(){
    active=-1; tip.classList.remove('show');
    if(svg) svg.classList.remove('dim');
    segs.forEach(function(el){el.classList.remove('is-hover');});
    rows.forEach(function(el){el.classList.remove('is-hover');});
  }
  function bind(el,i){
    el.addEventListener('mouseenter',function(e){show(i,e.clientX,e.clientY);});
    el.addEventListener('mousemove',function(e){ if(active===i) move(e.clientX,e.clientY); });
    el.addEventListener('mouseleave',hide);
  }
  segs.forEach(function(el,i){bind(el,i);});
  rows.forEach(function(el){bind(el, +el.dataset.seg);});
})();


(function(){
  var m=document.getElementById('apMore'), pools=document.getElementById('apPools');
  if(!m||!pools) return;
  m.addEventListener('click',function(){
    var ex=pools.classList.toggle('expanded');
    m.setAttribute('aria-expanded', ex?'true':'false');
    m.textContent = ex ? 'less' : '· +2 more';
  });
})();


(function(){
  document.querySelectorAll('.perf-cta, .lead-cta').forEach(function(btn){
    btn.addEventListener('click',function(){ var d=document.getElementById('navDeposit'); if(d) d.click(); });
  });
})();





// #poolFees / #poolFeesToggle removed with the fabricated fees-by-pool list.

(function(){
  var KEY="balcoreTheme", root=document.documentElement,
      btns=document.querySelectorAll("[data-theme-toggle]");
  function apply(t){
    if(t==="light"){root.setAttribute("data-theme","light");}else{root.removeAttribute("data-theme");t="dark";}
    btns.forEach(function(b){
      b.setAttribute("aria-pressed", t==="light" ? "true":"false");
      b.setAttribute("aria-label", t==="light" ? "Switch to dark mode":"Switch to light mode");
    });
  }
  var saved="dark"; try{ saved=localStorage.getItem(KEY)||"dark"; }catch(e){}
  apply(saved);
  btns.forEach(function(b){ b.addEventListener("click", function(){
    var t=root.getAttribute("data-theme")==="light" ? "dark":"light";
    try{ localStorage.setItem(KEY,t); }catch(e){}
    apply(t);
  }); });
})();

// ---- protocol flow card ----
// REMOVED. This block held five hardcoded period totals (1W/1M/6M/1Y/ALL) and
// wrote them into #flowIncome/#flowIL/#flowUsers/#flowProto/#flowReserve. Those
// are sums over time, which the contracts do not expose, so ProtocolView now
// renders the card as a coming-soon state and the elements no longer exist.
}
