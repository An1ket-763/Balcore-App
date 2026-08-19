/* eslint-disable */
// @ts-nocheck
/**
 * Ported from the original Balcore static prototype.
 * Holds the purely-visual widget behaviour (charts, counters, tickers, modal
 * micro-flows). Wallet connection, onboarding and the connected-address UI are
 * real React components and are NOT handled here.
 */
import { getTokenPrices } from "./data/prices";
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

// ---------- fee handling: auto-compound toggle (ON by default) ----------
(function(){
  const compound = document.getElementById('feeCompound');
  const claim = document.getElementById('feeClaim');
  const toggle = document.getElementById('feeToggle');
  const row = document.querySelector('.fee-toggle-row');
  const sub = document.getElementById('feeToggleSub');
  const foot = document.getElementById('feeFoot');
  const claimBtn = document.getElementById('feeClaimBtn');
  if (!toggle) return;
  let on = true; // auto-compound on by default
  function render(){
    compound.style.display = on ? '' : 'none';
    claim.style.display = on ? 'none' : '';
    toggle.classList.toggle('on', on);
    toggle.setAttribute('aria-checked', on ? 'true' : 'false');
    row.classList.toggle('off', !on);
    if (on){
      sub.textContent = 'Fees reinvest into your pools automatically';
      foot.textContent = 'Settles Tuesdays 00:00 UTC · auto-compounded, nothing to do.';
    } else {
      sub.textContent = 'Fees are held for you to claim';
      foot.textContent = 'Settles Tuesdays 00:00 UTC · claim to your wallet anytime after.';
      // reset the claim button when switching back into claim mode
      if (claimBtn){ claimBtn.classList.remove('claimed'); claimBtn.textContent = 'Claim to wallet'; claimBtn.disabled = false; }
    }
  }
  toggle.addEventListener('click',()=>{ on = !on; render(); });
  if (claimBtn){
    claimBtn.addEventListener('click',()=>{
      claimBtn.classList.add('claimed');
      claimBtn.textContent = 'Claimed ✓';
      claimBtn.disabled = true;
    });
  }
  render();
})();

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
    // animate protocol fees the first time the Protocol view opens
    if (name === 'protocol'){
      const pf = document.getElementById('protoFees');
      if (pf && window.__countUp) window.__countUp(pf);
    }
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
  const open = ov => { ov.classList.add('open'); document.body.style.overflow='hidden'; const i = ov.querySelector('input'); if(i) i.focus(); };
  const close = ov => {
    ov.classList.remove('open'); document.body.style.overflow='';
    if (ov === ovD || ov === ovW) restoreNav();
  };
  navDeposit.addEventListener('click',e=>{ e.preventDefault(); setModalActive(navDeposit); open(ovD); });
  navWithdraw.addEventListener('click',e=>{ e.preventDefault(); setModalActive(navWithdraw); open(ovW); });
  document.getElementById('swapBtn').addEventListener('click',()=> open(ovS));
  const ovB = document.getElementById('ovBridge');
  document.getElementById('bridgeBtn').addEventListener('click',()=> open(ovB));
  const ovShare = document.getElementById('ovShare');
  const shareBtn = document.getElementById('shareViewAll');
  if (shareBtn && ovShare){ shareBtn.addEventListener('click',()=> open(ovShare)); ovShare.addEventListener('click',e=>{ if(e.target===ovShare) close(ovShare); }); ovShare.querySelector('[data-close]').addEventListener('click',()=>close(ovShare)); }
  const ovBalBreak = document.getElementById('ovBalBreak');
  const balBreakLink = document.getElementById('balBreakLink');
  if (balBreakLink && ovBalBreak){
    balBreakLink.addEventListener('click', ()=> open(ovBalBreak));
    ovBalBreak.addEventListener('click', e=>{ if(e.target===ovBalBreak) close(ovBalBreak); });
    ovBalBreak.querySelector('[data-close]').addEventListener('click', ()=> close(ovBalBreak));
  }
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
      close(ovWallet); setModalActive(navDeposit); open(ovD);
      var pk = btn.dataset.pool;
      if (pk && pk!=='usdc'){ var mi = document.querySelector('#depPoolMenu .pool-menu-item[data-pool="'+pk+'"]'); if(mi) mi.click(); }
    }); });
  }
  [ovD,ovW,ovP,ovS,ovB].forEach(ov=>{
    ov.addEventListener('click',e=>{ if(e.target===ov) close(ov); });
    ov.querySelector('[data-close]').addEventListener('click',()=>close(ov));
  });
  addEventListener('keydown',e=>{ if(e.key==='Escape'){close(ovD);close(ovW);close(ovP);close(ovS);close(ovB);var _s=document.getElementById('ovShare'); if(_s) close(_s);var _w=document.getElementById('ovWallet'); if(_w) close(_w);var _db=document.getElementById('ovDepBreak'); if(_db) close(_db);var _bb=document.getElementById('ovBalBreak'); if(_bb) close(_bb);} });

  // ---------- bridge logic (Circle CCTP v2 mock) ----------
  (function(){
    const amt = document.getElementById('brAmt'), cta = document.getElementById('brCta');
    const recv = document.getElementById('brRecv'), fee = document.getElementById('brFee'), eta = document.getElementById('brEta');
    const fromName = document.getElementById('brFromName'), toName = document.getElementById('brToName');
    const fromIc = document.getElementById('brFromIc'), toIc = document.getElementById('brToIc');
    const flip = document.getElementById('brFlip'), chips = document.getElementById('brChips');
    if(!amt) return;
    // Chain logo marks (inline SVG, brand colors)
    const LOGOS = {
      'Ethereum':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#627EEA"/><path d="M16 5v8.13l6.87 3.07L16 5Z" fill="#fff" opacity=".6"/><path d="M16 5 9.13 16.2 16 13.13V5Z" fill="#fff"/><path d="M16 21.97V27l6.88-9.52L16 21.97Z" fill="#fff" opacity=".6"/><path d="M16 27v-5.03l-6.87-4.49L16 27Z" fill="#fff"/><path d="m16 20.69 6.87-4.49L16 13.14v7.55Z" fill="#fff" opacity=".25"/><path d="m9.13 16.2 6.87 4.49v-7.55L9.13 16.2Z" fill="#fff" opacity=".6"/></svg>',
      'Base':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#0052FF"/><path d="M16 26.5c5.8 0 10.5-4.7 10.5-10.5S21.8 5.5 16 5.5C10.5 5.5 6 9.72 5.55 15.1h13.9v1.8H5.55C6 22.28 10.5 26.5 16 26.5Z" fill="#fff"/></svg>',
      'Arbitrum':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#213147"/><path d="m16 6 8.4 14.6-2.6 1.5L16 11.2l-5.8 10.9-2.6-1.5L16 6Z" fill="#9DCCED"/><path d="m13.4 18.7 2.6-4.9 2.6 4.9-2.6 6.1-2.6-6.1Z" fill="#12AAFF"/></svg>',
      'OP Mainnet':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#FF0420"/><text x="16" y="20.6" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="11.5" fill="#fff">OP</text></svg>',
      'Polygon':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#8247E5"/><path d="M21.1 12.9c-.36-.21-.83-.21-1.23 0l-2.85 1.68-1.93 1.07-2.8 1.68c-.36.21-.83.21-1.23 0l-2.18-1.32a1.25 1.25 0 0 1-.61-1.07v-2.53c0-.43.22-.83.61-1.07l2.18-1.25c.36-.21.83-.21 1.23 0l2.18 1.3c.36.21.61.64.61 1.07v1.68l1.93-1.14v-1.71c0-.43-.22-.83-.61-1.07l-4.06-2.39c-.36-.21-.83-.21-1.23 0L7 11.26c-.4.21-.61.64-.61 1.04v4.78c0 .43.22.83.61 1.07l4.1 2.39c.36.21.83.21 1.23 0l2.8-1.64 1.93-1.11 2.8-1.64c.36-.21.83-.21 1.23 0l2.18 1.25c.36.21.61.64.61 1.07v2.53c0 .43-.22.83-.61 1.07l-2.14 1.28c-.36.21-.83.21-1.23 0l-2.18-1.25a1.25 1.25 0 0 1-.61-1.07v-1.64l-1.93 1.14v1.68c0 .43.22.83.61 1.07l4.1 2.39c.36.21.83.21 1.23 0l4.1-2.39c.36-.21.61-.64.61-1.07v-4.82c0-.43-.22-.83-.61-1.07l-4.12-2.42Z" fill="#fff"/></svg>',
      'Solana':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="solg" x1="6" y1="26" x2="26" y2="6" gradientUnits="userSpaceOnUse"><stop stop-color="#9945FF"/><stop offset="1" stop-color="#14F195"/></linearGradient></defs><circle cx="16" cy="16" r="16" fill="#0d0d15"/><path d="M10.4 19.9c.13-.13.3-.2.49-.2h11.5c.31 0 .46.37.24.59l-2.53 2.5a.7.7 0 0 1-.49.2H8.11a.34.34 0 0 1-.24-.59l2.53-2.5Zm0-10.7c.13-.13.3-.2.49-.2h11.5c.31 0 .46.37.24.59l-2.53 2.5a.7.7 0 0 1-.49.2H8.11a.34.34 0 0 1-.24-.59l2.53-2.5Zm11.2 5.32a.7.7 0 0 0-.49-.2H9.61a.34.34 0 0 0-.24.59l2.53 2.5c.13.13.3.2.49.2h11.5c.31 0 .46-.37.24-.59l-2.53-2.5Z" fill="url(#solg)"/></svg>',
      'Avalanche C-Chain':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#E84142"/><polygon points="16,7 19.2,12.7 14.0,22 7.6,22" fill="#fff"/><polygon points="20.9,16.5 24.4,22 17.9,22" fill="#fff"/></svg>',
      'Robinhood Chain':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#00C805"/><path d="M21.7 7.9c-5.6 1.5-9.7 5.5-11.6 11.6l-1.6 5 .9-.3 4.2-1.5c5.7-2.1 9.2-6.6 9.7-12.6l.2-2.4-1.8.2Zm-8.9 12.9c1.5-4.6 4.4-7.7 8.4-9.2-.8 4.4-3.5 7.6-7.6 9.1l-1.2.4.4-.3Z" fill="#fff"/></svg>',
      'BNB Chain':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#F0B90B"/><polygon points="16,6.4 19,9.4 16,12.4 13,9.4" fill="#fff"/><polygon points="16,12.9 19.1,16 16,19.1 12.9,16" fill="#fff"/><polygon points="16,19.6 19,22.6 16,25.6 13,22.6" fill="#fff"/><polygon points="8.9,13 11.9,16 8.9,19 5.9,16" fill="#fff"/><polygon points="23.1,13 26.1,16 23.1,19 20.1,16" fill="#fff"/></svg>',
      'NEAR':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#0f1014"/><polygon points="9.5,8.5 12.5,8.5 12.5,23.5 9.5,23.5" fill="#fff"/><polygon points="19.5,8.5 22.5,8.5 22.5,23.5 19.5,23.5" fill="#fff"/><polygon points="9.5,8.5 12.5,8.5 22.5,23.5 19.5,23.5" fill="#fff"/></svg>',
      'Algorand':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#0c0c0c"/><path d="M23 23.6h-2.7l-1.8-6.6-3.8 6.6h-3l5.2-9-.9-3.3-7.1 12.3H6.2L15.3 8h2.6l1.1 4.1h2.7l-1.8 3.1L23 23.6Z" fill="#fff"/></svg>',
      'Tron':'<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#EF0027"/><g stroke="#fff" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" fill="none"><path d="M7.2 7.2 24.6 10.2 14.4 25 7.2 7.2Z"/><path d="M7.2 7.2 16 13.6M24.6 10.2 16 13.6M14.4 25 16 13.6"/></g></svg>'
    };
    // mount chip logos
    chips.querySelectorAll('.br-chip').forEach(ch=>{ const ic=ch.querySelector('.bc-ic'); if(ic) ic.innerHTML = LOGOS[ch.dataset.chain]||''; });
    let other = 'Ethereum', toAvax = true, speed = 'fast';
    // illustrative fast-fee bps by source chain (live value comes from Circle fee API)
    const FAST_BPS = {'Ethereum':1,'Base':1,'Arbitrum':1,'OP Mainnet':1,'Polygon':1,'Solana':2,'Avalanche':1};
    function paintChain(icEl,nameEl,name){
      icEl.innerHTML = LOGOS[name]||'';
      const lbl = icEl.parentElement.querySelector('.br-lbl');
      const isFrom = icEl.id==='brFromIc';
      if(name==='Avalanche C-Chain'){ nameEl.textContent='Avalanche'; lbl.textContent=(isFrom?'From':'To')+' · C-Chain'; }
      else { nameEl.textContent=name; lbl.textContent=isFrom?'From':'To'; }
    }
    function render(){
      if(typeof phase!=='undefined' && phase==='review'){ phase='edit'; note.hidden=true; }
      paintChain(fromIc,fromName, toAvax ? other : 'Avalanche C-Chain');
      paintChain(toIc,toName, toAvax ? 'Avalanche C-Chain' : other);
      const ttl=document.getElementById('bridgeTitle'), sub=document.getElementById('brSubtitle');
      if(ttl&&sub){
        if(toAvax){ ttl.textContent='Bridge USDC to Balcore'; sub.textContent='Bring USDC in from any chain — then deposit and start market making.'; }
        else { ttl.textContent='Bridge USDC out'; sub.textContent='Move USDC from Avalanche back to any supported chain. Your funds, your call.'; }
      }
      const v = parseFloat((amt.value||'').replace(/,/g,''));
      const src = toAvax ? other : 'Avalanche';
      if(speed==='fast'){
        eta.textContent = '~30 seconds';
        if(v>0){
          const f = Math.max(v * (FAST_BPS[src]||1) / 10000, 0.01);
          fee.textContent = '≈ '+f.toFixed(2)+' USDC · Fast Transfer';
          recv.textContent = (v-f).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+' USDC';
        } else { fee.textContent='Fast Transfer · quoted at bridge time'; recv.textContent='—'; }
      } else {
        eta.textContent = src==='Ethereum' ? '~15–20 minutes (finality)' : '~1–5 minutes (finality)';
        fee.textContent = 'None · Standard Transfer';
        recv.textContent = v>0 ? v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+' USDC' : '—';
      }
      if(v>0){ cta.disabled=false; cta.textContent='Review bridge'; }
      else { cta.disabled=true; cta.textContent='Enter an amount'; }
    }
    chips.querySelectorAll('.br-chip').forEach(ch=>{
      ch.addEventListener('click',()=>{
        if(ch.classList.contains('soon')) return;
        chips.querySelectorAll('.br-chip').forEach(c=>c.classList.remove('on'));
        ch.classList.add('on'); other = ch.dataset.chain; render();
      });
    });
    flip.addEventListener('click',()=>{ if(modalEl.classList.contains('bridging')) return; toAvax = !toAvax; flip.classList.toggle('spin'); render(); });
    document.querySelectorAll('.br-speed-opt').forEach(b=>{
      b.addEventListener('click',()=>{
        document.querySelectorAll('.br-speed-opt').forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); speed = b.dataset.speed; render();
      });
    });
    amt.addEventListener('input',()=>{ document.querySelectorAll('#brPct .swap-pct-btn').forEach(b=>b.classList.remove('on')); render(); });
    document.querySelectorAll('#brPct .swap-pct-btn').forEach(pb=>{
      pb.addEventListener('click',()=>{
        const bal = parseFloat(document.getElementById('brBal').textContent.replace(/[^0-9.]/g,''))||0;
        const v = bal * (+pb.dataset.pct)/100;
        amt.value = (Math.floor(v*100)/100).toString();
        document.querySelectorAll('#brPct .swap-pct-btn').forEach(b=>b.classList.remove('on'));
        pb.classList.add('on');
        render();
      });
    });

    // ---- review → bridging → done flow ----
    const modalEl = document.querySelector('#ovBridge .modal');
    const note = document.getElementById('brReviewNote');
    const prog = document.getElementById('brProgress'), stepsEl = document.getElementById('brSteps');
    const doneEl = document.getElementById('brDone'), doneAmt = document.getElementById('brDoneAmt');
    const donePrimary = document.getElementById('brDonePrimary'), againBtn = document.getElementById('brAgain');
    let phase = 'edit', timers = [];
    function mockTx(chain){
      const hex='0123456789abcdef', b58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      const pick=(set,n)=>Array.from({length:n},()=>set[Math.floor(Math.random()*set.length)]).join('');
      return chain==='Solana' ? pick(b58,4)+'\u2026'+pick(b58,4) : '0x'+pick(hex,6)+'\u2026'+pick(hex,4);
    }
    function stepRow(i,t,s){
      return '<div class="br-step" data-i="'+i+'"><span class="st-ic"><span class="st-slot">'+(i+1)+'</span></span><div><div class="st-t">'+t+'</div><div class="st-s">'+s+'</div></div></div>';
    }
    function setStep(i,state,sub){
      const row = stepsEl.querySelector('.br-step[data-i="'+i+'"]'); if(!row) return;
      row.classList.remove('active','done'); if(state) row.classList.add(state);
      const slot = row.querySelector('.st-slot');
      if(state==='active') slot.innerHTML = '<span class="br-spinner"></span>';
      else if(state==='done') slot.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12.5 10 17.5 19 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      else slot.textContent = i+1;
      if(sub!==undefined) row.querySelector('.st-s').textContent = sub;
    }
    function resetFlow(){
      timers.forEach(clearTimeout); timers=[];
      const ran = (phase==='bridging'||phase==='done');
      phase='edit'; modalEl.classList.remove('bridging');
      prog.hidden=true; doneEl.hidden=true; stepsEl.innerHTML='';
      note.hidden=true;
      if(ran){ amt.value=''; document.querySelectorAll('#brPct .swap-pct-btn').forEach(b=>b.classList.remove('on')); }
      render();
    }
    function startBridge(){
      phase='bridging'; note.hidden=true; modalEl.classList.add('bridging');
      const src = toAvax ? other : 'Avalanche', dst = toAvax ? 'Avalanche' : other;
      const got = recv.textContent;
      const fast = speed==='fast';
      stepsEl.innerHTML =
        stepRow(0,'Burn on '+src,'Submitting transaction\u2026') +
        stepRow(1,'Circle attestation'+(fast?' \u00b7 Fast':''), fast?'Iris signing at confirmed level\u2026':'Waiting for source-chain finality\u2026') +
        stepRow(2,'Mint on '+dst,'Queued');
      prog.hidden=false; doneEl.hidden=true;
      setStep(0,'active');
      const d = fast ? [1300,1700,1300] : [1500,3400,1500];
      timers.push(setTimeout(()=>{ setStep(0,'done','tx '+mockTx(src)+' \u00b7 confirmed'); setStep(1,'active'); },d[0]));
      timers.push(setTimeout(()=>{ setStep(1,'done','attestation signed \u2713'); setStep(2,'active','Delivering native USDC\u2026'); },d[0]+d[1]));
      timers.push(setTimeout(()=>{
        setStep(2,'done','tx '+mockTx(dst)+' \u00b7 minted');
        doneAmt.textContent = got+' arrived on '+dst;
        donePrimary.textContent = toAvax ? 'Deposit & start market making' : 'Done';
        doneEl.hidden=false; phase='done';
      },d[0]+d[1]+d[2]));
    }
    cta.addEventListener('click',()=>{
      if(cta.disabled) return;
      if(phase==='edit'){
        phase='review';
        const src = toAvax ? other : 'Avalanche', dst = toAvax ? 'Avalanche' : other;
        const v = parseFloat((amt.value||'').replace(/,/g,''))||0;
        note.textContent = 'Bridging '+v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+' USDC \u00b7 '+src+' \u2192 '+dst+' \u00b7 '+(speed==='fast'?'Fast ~30s':'Standard');
        note.hidden=false;
        cta.textContent='Confirm bridge';
      } else if(phase==='review'){
        startBridge();
      }
    });
    againBtn.addEventListener('click',()=>{ resetFlow(); amt.value=''; document.querySelectorAll('#brPct .swap-pct-btn').forEach(b=>b.classList.remove('on')); render(); amt.focus(); });
    donePrimary.addEventListener('click',()=>{
      const wasIn = donePrimary.textContent.indexOf('Deposit')===0;
      document.querySelector('#ovBridge [data-close]').click();
      if(wasIn){ const nd=document.getElementById('navDeposit'); if(nd) nd.click(); }
    });
    // reset whenever the overlay closes
    new MutationObserver(()=>{ if(!document.getElementById('ovBridge').classList.contains('open')) resetFlow(); })
      .observe(document.getElementById('ovBridge'),{attributes:true,attributeFilter:['class']});

    render();
  })();

  // ---------- swap logic (aggregator-routed, multi-asset) ----------
  (function(){
    const from = document.getElementById('swapFrom'), to = document.getElementById('swapTo');
    const rateEl = document.getElementById('swapRate'), viaEl = document.getElementById('swapVia'), cta = document.getElementById('swapCta');
    const flip = document.getElementById('swapFlip');
    const fromTok = document.getElementById('swapFromTok'), toTok = document.getElementById('swapToTok');
    const fromBal = document.getElementById('swapFromBal'), toBal = document.getElementById('swapToBal');
    const routeOpts = document.querySelectorAll('#routeList .route-opt');
    const slipOpts = document.querySelectorAll('#slipOpts .slip-opt');
    const slipCustom = document.getElementById('slipCustom');
    const slipVal = document.getElementById('slipVal');
    const minOutEl = document.getElementById('swapMinOut');
    const bestTag = document.querySelector('.route-best-tag');
    const routeListEl = document.getElementById('routeList');

    const COIN_ICONS = {
      USDC:'<span class="coin c-usd"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="1.6"/><path d="M12 7.2v9.6M10.1 9.1c0-1 .9-1.5 1.9-1.5s1.9.4 1.9 1.4c0 .9-.7 1.3-1.9 1.5-1.2.2-1.9.6-1.9 1.5 0 1 .9 1.4 1.9 1.4s1.9-.5 1.9-1.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg></span>',
      BTC: '<span class="coin c-btc"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5.5v13M11.3 5v14M8 7h5.4c1.6 0 2.8.9 2.8 2.5S15 12 13.4 12H8m0 0h5.9c1.7 0 2.9.9 2.9 2.5S15.6 17 13.9 17H8" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>',
      ETH: '<span class="coin c-eth"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 6 12.2 12 15.8 18 12.2 12 3Z" fill="#fff" opacity=".9"/><path d="M6 13.4 12 17l6-3.6L12 21 6 13.4Z" fill="#fff" opacity=".55"/></svg></span>',
      AVAX:'<span class="coin c-avax"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5.2 20 18.4c.3.5 0 1.1-.6 1.1h-3.1c-.4 0-.7-.2-.9-.5l-2.7-4.8c-.3-.6-1.2-.6-1.5 0l-.9 1.6c-.3.5-.9.5-1.2 0l-.6-1.1c-.2-.4-.2-.9 0-1.3l3.6-6.8c.3-.6 1.2-.6 1.5 0Z" fill="#fff"/><path d="M8.2 15.2c.3-.5 1-.5 1.3 0l1.9 3.3c.3.5 0 1.1-.6 1.1H7c-.6 0-.9-.6-.6-1.1l1.8-3.3Z" fill="#fff"/></svg></span>',
      TSLA:'<span class="coin c-tsla"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8.3 13.4 6c2.4.1 4.6.7 4.6.7l.7-1.3S16.6 4.4 12 4.4 6.3 5.4 6.3 5.4L7 6.7s2.2-.6 4.6-.7L13 8.3h-2v11h1.9V8.3H12Z" fill="#fff"/></svg></span>',
      GOLD:'<span class="coin c-gold"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.6 9.5h6.8c.4 0 .7.2.8.6l1.5 4.7c.2.5-.2 1-.7 1H6.9c-.5 0-.9-.5-.7-1l1.5-4.7c.1-.4.5-.6.9-.6Z" fill="#503f10"/><path d="M9.7 6.4h4.6c.3 0 .6.2.7.5l1 3H8l1-3c.1-.3.4-.5.7-.5Z" fill="#503f10" opacity=".8"/></svg></span>'
    };
    const PRICES = getTokenPrices();
    const BALANCES = getTokenBalances();
    const TOKENS = {};
    Object.keys(COIN_ICONS).forEach(function(sym){
      TOKENS[sym] = { name: PRICES[sym].name, usd: PRICES[sym].usd, bal: BALANCES[sym], coin: COIN_ICONS[sym] };
    });
    const ORDER = ['USDC','BTC','ETH','AVAX','TSLA','GOLD'];
    let fromSym='USDC', toSym='BTC', slip=0.5;
    const chev = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function fmtBal(n){ return n>=1000 ? n.toLocaleString('en-US') : String(n); }
    function fmtAmt(sym, n){
      if (sym==='USDC') return Math.round(n).toLocaleString('en-US');
      if (n>=1000) return Math.round(n).toLocaleString('en-US');
      return n.toFixed(6);
    }
    function renderTok(btn, sym){ btn.innerHTML = TOKENS[sym].coin + sym + chev; btn.setAttribute('aria-haspopup','listbox'); btn.setAttribute('aria-expanded','false'); }
    function liveBal(sym){ const b = getTokenBalances(); return typeof b[sym] === 'number' ? b[sym] : TOKENS[sym].bal; }
    function renderBal(el, sym){ el.textContent = fmtBal(liveBal(sym)) + ' ' + sym; }
    function renderTokens(){ renderTok(fromTok, fromSym); renderTok(toTok, toSym); renderBal(fromBal, fromSym); renderBal(toBal, toSym); }

    function midRate(){ return TOKENS[fromSym].usd / TOKENS[toSym].usd; }
    function routeFactor(o){ return parseFloat(o.dataset.factor) || 1; }
    function activeFactor(){ const on=document.querySelector('#routeList .route-opt.on'); return on ? routeFactor(on) : 1; }
    function activeName(){ const on=document.querySelector('#routeList .route-opt.on .route-name'); return on ? on.textContent : ''; }
    function bestRoute(){ let best=null,s=-Infinity; routeOpts.forEach(o=>{const v=routeFactor(o); if(v>s){s=v;best=o;}}); return best; }
    function markBest(){ const b=bestRoute(); routeOpts.forEach(o=>o.classList.toggle('is-best', o===b)); }
    function selectBest(){ const b=bestRoute(); if(!b)return; routeOpts.forEach(o=>o.classList.remove('on')); b.classList.add('on'); }
    function assignQuotes(){ routeOpts.forEach(o=>{ o.dataset.factor = (1 - Math.random()*0.0009).toFixed(6); }); }

    function refresh(){
      fmtMoney(from, 8);
      const v = parseFloat(from.value.replace(/,/g,'')) || 0;
      const mr = midRate();
      rateEl.textContent = '1 ' + fromSym + ' = ' + fmtAmt(toSym, mr) + ' ' + toSym;
      var _sum=document.getElementById('swapDetSummary'); if(_sum){ var _base=TOKENS[fromSym].usd>=TOKENS[toSym].usd?fromSym:toSym, _q=_base===fromSym?toSym:fromSym, _px=TOKENS[_base].usd/TOKENS[_q].usd; _sum.textContent = '1 ' + _base + ' ≈ ' + fmtAmt(_q, _px) + ' ' + _q + ' ($' + TOKENS[_base].usd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) + ')'; }
      viaEl.textContent = activeName();
      routeOpts.forEach(o=>{ const f=routeFactor(o), oe=o.querySelector('.route-out'); if(oe) oe.textContent = v>0 ? fmtAmt(toSym, v*mr*f) : fmtAmt(toSym, mr*f); });
      const outNum = v>0 ? v*mr*activeFactor() : 0;
      to.value = v ? fmtAmt(toSym, outNum) : '';
      if (minOutEl) minOutEl.textContent = v>0 ? (fmtAmt(toSym, outNum*(1-slip/100)) + ' ' + toSym) : '\u2014';
      markBest();
      if (v <= 0){ cta.disabled = true; cta.textContent = 'Enter an amount'; return; }
      cta.disabled = false; cta.textContent = 'Swap via ' + activeName();
    }
    let scanIv=null, scanTimer=null;
    from.addEventListener('input', function(){
      refresh();
      var v = parseFloat(from.value.replace(/,/g,'')) || 0;
      clearTimeout(scanTimer);
      if (v>0) scanTimer = setTimeout(runScan, 450);
    });

    // ---- token selector dropdown ----
    const menu = document.createElement('div');
    menu.className = 'token-menu'; menu.setAttribute('role','listbox'); document.body.appendChild(menu);
    let activeSide = null;
    function buildMenu(currentSym){
      menu.innerHTML = ORDER.map(function(s){
        return '<button class="token-menu-item'+(s===currentSym?' sel':'')+'" role="option" data-sym="'+s+'">'
          + '<span class="tmi-ic">'+TOKENS[s].coin+'</span>'
          + '<span class="tmi-name">'+TOKENS[s].name+'</span>'
          + '<span class="tmi-sym">'+s+'</span></button>';
      }).join('');
    }
    function openMenu(side, btn){
      activeSide = side;
      buildMenu(side==='from'?fromSym:toSym);
      const r = btn.getBoundingClientRect();
      menu.style.minWidth = Math.max(r.width, 200) + 'px';
      menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 216)) + 'px';
      menu.style.top = (r.bottom + 6) + 'px';
      menu.classList.add('open');
      btn.setAttribute('aria-expanded','true');
    }
    function closeMenu(){ menu.classList.remove('open'); fromTok.setAttribute('aria-expanded','false'); toTok.setAttribute('aria-expanded','false'); activeSide=null; }
    function pick(sym){
      if (!activeSide) return;
      if (activeSide==='from'){ if (sym===toSym) toSym=fromSym; fromSym=sym; }
      else { if (sym===fromSym) fromSym=toSym; toSym=sym; }
      renderTokens(); from.value=''; to.value=''; assignQuotes(); selectBest(); markBest(); refresh(); closeMenu();
    }
    fromTok.addEventListener('click', function(e){ e.stopPropagation(); if(activeSide==='from') closeMenu(); else openMenu('from', fromTok); });
    toTok.addEventListener('click', function(e){ e.stopPropagation(); if(activeSide==='to') closeMenu(); else openMenu('to', toTok); });
    menu.addEventListener('click', function(e){ const it=e.target.closest('.token-menu-item'); if(it) pick(it.dataset.sym); });
    document.addEventListener('click', function(e){ if(menu.classList.contains('open') && !menu.contains(e.target)) closeMenu(); });
    window.addEventListener('scroll', function(){ if(menu.classList.contains('open')) closeMenu(); }, true);
    addEventListener('keydown', function(e){ if(e.key==='Escape') closeMenu(); });

    // ---- slippage ----
    slipOpts.forEach(function(btn){ btn.addEventListener('click', function(){
      slip = parseFloat(btn.dataset.slip);
      slipOpts.forEach(function(b){ b.classList.remove('on'); }); btn.classList.add('on');
      if (slipCustom) slipCustom.value = '';
      if (slipVal) slipVal.textContent = slip + '%';
      refresh();
    }); });
    if (slipCustom) slipCustom.addEventListener('input', function(){
      const val = parseFloat(slipCustom.value);
      if (!isNaN(val) && val>0){ slip = Math.min(val,50); slipOpts.forEach(function(b){ b.classList.remove('on'); }); if(slipVal) slipVal.textContent = slip+'%'; refresh(); }
    });

    // ---- best-route scan on open ----
    function runScan(){
      if (!routeListEl) return;
      var opts = Array.prototype.slice.call(routeOpts);
      assignQuotes();
      routeListEl.classList.add('scanning');
      if (bestTag) bestTag.innerHTML = '<span class="scan-spinner"></span>Scanning routes…';
      opts.forEach(function(o){ o.classList.remove('on'); });
      var step=0, steps=opts.length*2 + 1;
      clearInterval(scanIv);
      scanIv = setInterval(function(){
        opts.forEach(function(o){ o.classList.remove('scan-hit'); });
        if (step < steps-1){
          opts[step % opts.length].classList.add('scan-hit');
        } else {
          clearInterval(scanIv);
          routeListEl.classList.remove('scanning');
          selectBest(); markBest();
          if (bestTag) bestTag.innerHTML = '<span class="live-dot"></span>Best price';
          refresh();
        }
        step++;
      }, 115);
    }
    const ovSwapEl = document.getElementById('ovSwap');
    if (ovSwapEl) new MutationObserver(function(){ if (ovSwapEl.classList.contains('open')) runScan(); }).observe(ovSwapEl,{attributes:true,attributeFilter:['class']});

    // manual route selection
    routeOpts.forEach(function(opt){ opt.addEventListener('click', function(){ routeOpts.forEach(function(o){o.classList.remove('on');}); opt.classList.add('on'); refresh(); }); });
    // flip
    flip.addEventListener('click', function(){ flip.classList.toggle('spin'); const t=fromSym; fromSym=toSym; toSym=t; renderTokens(); from.value=''; to.value=''; assignQuotes(); selectBest(); markBest(); refresh(); });
    // max
    var pctBtns = document.querySelectorAll('#swapPct .swap-pct-btn');
    pctBtns.forEach(function(btn){ btn.addEventListener('click', function(){
      var pct = parseFloat(btn.dataset.pct), amt = +(liveBal(fromSym) * pct/100).toFixed(8);
      from.value = String(amt); fmtMoney(from,8);
      pctBtns.forEach(function(x){ x.classList.remove('on'); }); btn.classList.add('on');
      refresh(); from.focus();
      clearTimeout(scanTimer); scanTimer = setTimeout(runScan, 250);
    }); });
    from.addEventListener('input', function(){ pctBtns.forEach(function(x){ x.classList.remove('on'); }); });
    cta.addEventListener('click', function(){
      cta.disabled = true;
      cta.textContent = 'Confirm in wallet\u2026';
      const fromAmt = from.value;
      const toAmt = to.value;
      const fromSymbol = fromSym;
      const toSymbol = toSym;
      setTimeout(function(){
        const swapDone = document.getElementById('swapDone');
        const swapDoneAmt = document.getElementById('swapDoneAmt');
        const swapFields = document.querySelectorAll('#ovSwap .swap-field, #ovSwap .swap-mid, #ovSwap .route-block, #ovSwap .slip-block, #ovSwap .notice.green');
        swapFields.forEach(function(el){ el.style.display = 'none'; });
        cta.hidden = true;
        if(swapDone) swapDone.hidden = false;
        if(swapDoneAmt){
          swapDoneAmt.textContent = (fromAmt && toAmt)
            ? fromAmt + ' ' + fromSymbol + ' \u2192 ' + toAmt + ' ' + toSymbol + ' swapped'
            : 'Swap complete';
        }
      }, 1500);
    });
    const swapDoneClose = document.getElementById('swapDoneClose');
    if(swapDoneClose) swapDoneClose.addEventListener('click', function(){
      close(ovS);
      from.value = '';
      to.value = '';
      cta.disabled = true;
      cta.textContent = 'Enter an amount';
      cta.hidden = false;
      document.querySelectorAll('#swapPct .swap-pct-btn').forEach(function(x){ x.classList.remove('on'); });
      const swapDone = document.getElementById('swapDone');
      if(swapDone) swapDone.hidden = true;
      const swapFields = document.querySelectorAll('#ovSwap .swap-field, #ovSwap .swap-mid, #ovSwap .route-block, #ovSwap .slip-block, #ovSwap .notice.green');
      swapFields.forEach(function(el){ el.style.display = ''; });
    });

    // init
    assignQuotes(); renderTokens(); selectBest(); markBest(); refresh();
  })();

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
  document.getElementById('posAdd').addEventListener('click',()=>{ close(ovP); open(ovD); });
  document.getElementById('posWd').addEventListener('click',()=>{ close(ovP); open(ovW); });

  const fmt = n => '$' + Math.round(n).toLocaleString();

  // deposit logic — stateful CTA + equal split
  const dAmt = document.getElementById('depAmt'), dCta = document.getElementById('depCta');
  const dBtc = document.getElementById('depBtc'), dUsd = document.getElementById('depUsd');
  let BTC_PRICE = 63200; const D_MAX = 48900; let CUR_SYM = "BTC", CUR_DEC = 6;
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
  function dUpdate(){
    fmtMoney(dAmt);
    const v = parseFloat(dAmt.value.replace(/,/g,'')) || 0;
    if (v <= 0){ dCta.disabled = true; dCta.textContent = 'Enter an amount'; dBtc.textContent = dUsd.textContent = '—'; return; }
    dBtc.textContent = (v/2/BTC_PRICE).toFixed(CUR_DEC) + ' ' + CUR_SYM;
    dUsd.textContent = fmt(v/2) + ' USDC';
    if (v > D_MAX){ dCta.disabled = true; dCta.textContent = 'Amount exceeds wallet balance'; return; }
    dCta.disabled = false; dCta.textContent = 'Deposit ' + fmt(v);
  }
  dAmt.addEventListener('input', dUpdate);
  document.querySelectorAll('#depQuick button').forEach(b=>b.addEventListener('click',()=>{
    dAmt.value = b.dataset.v; dUpdate();
    document.querySelectorAll('#depQuick button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  }));
  const ack = document.getElementById('depAck');
  const ackMsg = document.getElementById('ackMsg');
  const ackTitle = document.getElementById('ackTitle');
  const ackIc = document.getElementById('ackIc');
  const ackBack = document.getElementById('ackBack');
  const ackGo = document.getElementById('ackGo');
  dCta.addEventListener('click',()=>{ if(dCta.disabled) return; buildAck(); if(ack) ack.hidden=false; });
  if (ackBack) ackBack.addEventListener('click',()=>{ if(ack) ack.hidden=true; });
  if (ackGo) ackGo.addEventListener('click',()=>{
    if(ack) ack.hidden=true;
    dCta.disabled=true;
    dCta.textContent='Confirm in wallet…';
    const deposited = dAmt ? dAmt.value : '';
    setTimeout(()=>{
      const depDone = document.getElementById('depDone');
      const depDoneAmt = document.getElementById('depDoneAmt');
      const walletPanel = document.getElementById('depWalletPanel');
      if(walletPanel) walletPanel.hidden = true;
      dCta.hidden = true;
      if(depDone) depDone.hidden = false;
      if(depDoneAmt){
        const v = parseFloat((deposited||'').replace(/,/g,'')) || 0;
        depDoneAmt.textContent = v ? fmt(v) + ' deposited' : 'Deposit confirmed';
      }
    }, 1500);
  });
  const depDoneClose = document.getElementById('depDoneClose');
  if(depDoneClose) depDoneClose.addEventListener('click',()=>{
    close(ovD);
    dAmt.value = '';
    dCta.disabled = true; dCta.textContent = 'Enter an amount'; dCta.hidden = false;
    const walletPanel = document.getElementById('depWalletPanel');
    if(walletPanel) walletPanel.hidden = false;
    const depDone = document.getElementById('depDone');
    if(depDone) depDone.hidden = true;
    if(dBtc) dBtc.textContent = '—';
    if(dUsd) dUsd.textContent = '—';
    document.querySelectorAll('#depQuick button').forEach(x=>x.classList.remove('on'));
  });
  if (ack) ack.addEventListener('click',(e)=>{ if(e.target===ack) ack.hidden=true; });
  addEventListener('keydown',(e)=>{ if(e.key==='Escape' && ack && !ack.hidden) ack.hidden=true; });

  // ---- deposit mode: convert-USDC vs provide-both ----
  let BTC_BAL = 0.77; const USDC_BAL = 48900;
  const autoMode = document.getElementById('depAutoMode');
  const bothMode = document.getElementById('depBothMode');
  const btcIn = document.getElementById('depBtcIn');
  const usdcIn = document.getElementById('depUsdcIn');
  const bothTotal = document.getElementById('depBothTotal');
  let mode = 'auto';
  const parseN = el => parseFloat((el.value||'').replace(/,/g,'')) || 0;

  // ---- deposit acknowledgement: build the timing message (Mon 23:00 UTC cutoff) ----
  function buildAck(){
    const now = new Date();
    const plc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0,0,0));
    let add = (2 - plc.getUTCDay() + 7) % 7; if (add===0 && now>=plc) add=7; plc.setUTCDate(plc.getUTCDate()+add);
    const cutoff = new Date(plc.getTime() - 3600000);
    let before = now < cutoff;
    if (location.search.indexOf("after")!==-1) before = false;   // demo: ?after forces the post-cutoff message
    if (location.search.indexOf("before")!==-1) before = true;   // demo: ?before forces the pre-cutoff message
    const ms = cutoff - now, dd = Math.floor(ms/86400000), hh = Math.floor(ms%86400000/3600000);
    const eta = (dd>0 ? dd+'d ' : '') + hh + 'h';
    if (before){
      if(ackIc){ ackIc.textContent = '⚡'; ackIc.className = 'ack-ic ok'; }
      if(ackTitle) ackTitle.textContent = 'Starts making markets right away';
      if(ackMsg) ackMsg.innerHTML = 'You\'re before next cycle\'s cutoff (Mon 23:00 UTC · ' + eta + ' left) — but no need to wait. Your funds start earning <b>supply APY right away</b>, and at <b>00:00 UTC Tuesday</b> they join the next placement and start earning market-making fees.';
    } else {
      if(ackIc){ ackIc.textContent = '⏱'; ackIc.className = 'ack-ic wait'; }
      if(ackTitle) ackTitle.textContent = 'You can still deposit now';
      if(ackMsg) ackMsg.innerHTML = 'It\'s past this cycle\'s cutoff (Mon 23:00 UTC) — but no need to wait. Your funds start earning <b>supply APY right away</b>, and the moment the next rebalance runs after <b>00:00 UTC Tuesday</b> (usually within <b>2–3 days</b>) they move into active market-making automatically. Nothing else for you to do.';
    }
  }

  function bothCalc(src){
    let btc, usdc;
    if (src === 'btc'){ fmtMoney(btcIn, 8); btc = parseN(btcIn); usdc = btc * BTC_PRICE; usdcIn.value = usdc ? fmt(usdc).replace('$','') : ''; }
    else if (src === 'usdc'){ fmtMoney(usdcIn); usdc = parseN(usdcIn); btc = usdc / BTC_PRICE; btcIn.value = btc ? btc.toFixed(CUR_DEC) : ''; }
    else { btc = parseN(btcIn); usdc = parseN(usdcIn); }
    const total = btc * BTC_PRICE + usdc;
    bothTotal.textContent = total ? fmt(total) : '$0.00';
    if (total <= 0){ dCta.disabled = true; dCta.textContent = 'Enter an amount'; return; }
    if (btc > BTC_BAL + 1e-9 || usdc > USDC_BAL + 1e-6){ dCta.disabled = true; dCta.textContent = 'Exceeds wallet balance'; return; }
    dCta.disabled = false; dCta.textContent = 'Deposit ' + fmt(total);
  }
  if (btcIn){
    btcIn.addEventListener('input', ()=> bothCalc('btc'));
    usdcIn.addEventListener('input', ()=> bothCalc('usdc'));
    document.querySelectorAll('#depBothMode .mini-max').forEach(b=> b.addEventListener('click', ()=>{
      if (b.dataset.max === 'btc'){ btcIn.value = String(BTC_BAL); bothCalc('btc'); }
      else { usdcIn.value = String(USDC_BAL); bothCalc('usdc'); }
    }));
  }
  document.querySelectorAll('#depMode button').forEach(btn=> btn.addEventListener('click', ()=>{
    document.querySelectorAll('#depMode button').forEach(x=>{ x.classList.remove('on'); x.setAttribute('aria-selected','false'); });
    btn.classList.add('on'); btn.setAttribute('aria-selected','true');
    mode = btn.dataset.mode;
    autoMode.hidden = (mode !== 'auto');
    bothMode.hidden = (mode !== 'both');
    if (mode === 'auto') dUpdate(); else bothCalc();
  }));

  // ---- deposit pool selector (pick which pair to deposit into) ----
  const DEP_POOLS = {
    btc:  {name:'Bitcoin / Dollar', asset:'Bitcoin', sym:'BTC',  sub:'BTC · USDC',  price:63200, apy:'30.0%', coin:'\u20bf', cls:'c-btc',  bal:0.77, dec:6},
    tsla: {name:'Tesla / Dollar',   asset:'Tesla',   sym:'TSLA', sub:'TSLA · USDC', price:206,   apy:'25.5%', coin:'T',       cls:'c-tsla', bal:180,  dec:2},
    gold: {name:'Gold / Dollar',    asset:'Gold',    sym:'XAUt', sub:'XAUt · USDC', price:2650,  apy:'28.4%', coin:'Au',      cls:'c-gold', bal:14,   dec:3}
  };
  const depPoolBtn = document.getElementById('depPoolBtn'), depPoolMenu = document.getElementById('depPoolMenu');
  function setDepPool(key){
    const pl = DEP_POOLS[key]; BTC_PRICE = pl.price; BTC_BAL = pl.bal; CUR_SYM = pl.sym; CUR_DEC = pl.dec;
    document.getElementById('depPoolIc').innerHTML = '<span class="coin ' + pl.cls + '">' + pl.coin + '</span><span class="coin c-usd">$</span>';
    document.getElementById('depPoolName').textContent = pl.name;
    document.getElementById('depPoolSub').textContent = pl.sub;
    document.getElementById('depPoolApy').textContent = pl.apy;
    document.getElementById('depDeployLabel').textContent = 'Deploys as ' + pl.asset;
    document.getElementById('depBothAssetLabel').textContent = pl.asset;
    document.getElementById('depBothBal').textContent = pl.bal + ' ' + pl.sym;
    const bc = document.getElementById('depBothCoin'); bc.textContent = pl.coin; bc.className = 'coin ' + pl.cls + ' dep-coin';
    document.getElementById('depBothUnit').textContent = pl.sym;
    document.querySelectorAll('#depPoolMenu .pool-menu-item').forEach(function(m){ m.classList.toggle('on', m.dataset.pool===key); });
    dAmt.value=''; btcIn.value=''; usdcIn.value='';
    document.querySelectorAll('#depQuick button').forEach(x=>x.classList.remove('on'));
    if (mode === 'auto') dUpdate(); else bothCalc();
  }
  if (depPoolBtn && depPoolMenu){
    depPoolBtn.addEventListener('click', function(e){ e.stopPropagation(); const open = depPoolMenu.classList.toggle('open'); depPoolBtn.setAttribute('aria-expanded', open?'true':'false'); });
    document.querySelectorAll('#depPoolMenu .pool-menu-item').forEach(function(m){ m.addEventListener('click', function(){ setDepPool(m.dataset.pool); depPoolMenu.classList.remove('open'); depPoolBtn.setAttribute('aria-expanded','false'); }); });
    document.addEventListener('click', function(e){ if(!depPoolMenu.contains(e.target) && e.target!==depPoolBtn && !depPoolBtn.contains(e.target)){ depPoolMenu.classList.remove('open'); depPoolBtn.setAttribute('aria-expanded','false'); } });
  }

  // deposit details collapse toggle (collapsed by default to save space)
  const depDet = document.getElementById('depDetails'), depDetTog = document.getElementById('depDetToggle');
  if (depDet && depDetTog) depDetTog.addEventListener('click', function(){ var o = depDet.classList.toggle('open'); depDetTog.setAttribute('aria-expanded', o?'true':'false'); });

  // precision card collapse toggle (collapsed by default to keep modal compact)
  const pToggle = document.getElementById('precisionToggle');
  if (pToggle){
    pToggle.addEventListener('click',()=>{
      const card = pToggle.closest('.precision');
      const open = card.classList.toggle('open');
      pToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ---- funding source toggle (From wallet / From bank) ----
  const walletPanel = document.getElementById('depWalletPanel');
  const bankPanel = document.getElementById('depBankPanel');
  const depSub = document.querySelector('#ovDeposit .m-sub');
  document.querySelectorAll('.src-toggle button').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.src-toggle button').forEach(b=>{b.classList.remove('on');b.setAttribute('aria-selected','false');});
      btn.classList.add('on'); btn.setAttribute('aria-selected','true');
      const bank = btn.dataset.src === 'bank';
      bankPanel.style.display = bank ? '' : 'none';
      walletPanel.style.display = bank ? 'none' : '';
      depSub.textContent = bank
        ? 'Fund from your bank — arrives as USDC, ready to deposit.'
        : 'Your deposit starts making markets at the next placement.';
    });
  });

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
  bankCta.addEventListener('click',()=>{ bankCta.disabled = true; bankCta.textContent = 'Opening Coinbase…'; });

  // withdraw logic
  const wAmt = document.getElementById('wdAmt'), wCta = document.getElementById('wdCta');
  // per-position data (value, token counts, second-token label, apy, icon)
  const WD_POOLS = {
    btc:  { name:'Bitcoin / Dollar', value:1325000, tokA:7.88,  aSym:'BTC',  tokB:662000, apy:'30.0%', ic:'<span class="coin c-btc">₿</span><span class="coin c-usd">$</span>' },
    tsla: { name:'Tesla / Dollar',   value:657200,  tokA:1595,  aSym:'TSLA', tokB:328600, apy:'25.5%', ic:'<span class="coin c-tsla">T</span><span class="coin c-usd">$</span>' },
    gold: { name:'Gold / Dollar',    value:436730,  tokA:82.0,  aSym:'XAUt', tokB:217300, apy:'28.4%', ic:'<span class="coin c-gold">Au</span><span class="coin c-usd">$</span>' }
  };
  let wdPool = WD_POOLS.btc;
  let BAL = wdPool.value, POS_BTC = wdPool.tokA, POS_USDC = wdPool.tokB;
  const wdBtcEl = document.getElementById('wdBtc'), wdUsdEl = document.getElementById('wdUsd');
  let wdSpeed = 'standard';
  const wdNotice = document.getElementById('wdNotice');
  const fastFee = document.getElementById('fastFee');
  function wUpdate(){
    fmtMoney(wAmt);
    const v = parseFloat(wAmt.value.replace(/,/g,'')) || 0;
    fastFee.textContent = '≈ ' + fmt(v * 0.03);
    // token counts returned = the same proportion of the tokens you provided (protected by count)
    const f = Math.min(v / BAL, 1);
    if (wdBtcEl) wdBtcEl.textContent = v > 0 ? (POS_BTC * f).toFixed(POS_BTC<10?4:2) + ' ' + wdPool.aSym : '—';
    if (wdUsdEl) wdUsdEl.textContent = v > 0 ? fmt(POS_USDC * f).replace('$','') + ' USDC' : '—';
    if (v <= 0){ wCta.disabled = true; wCta.textContent = 'Enter an amount'; return; }
    if (v > BAL){ wCta.disabled = true; wCta.textContent = 'Amount exceeds position'; return; }
    wCta.disabled = false;
    if (wdSpeed === 'fast'){
      const net = v * 0.97;
      wCta.textContent = 'Fast-Track · receive ' + fmt(net);
    } else {
      wCta.textContent = 'Request withdrawal · ' + fmt(v);
    }
  }
  wAmt.addEventListener('input', wUpdate);
  document.querySelectorAll('#wdQuick button').forEach(b=>b.addEventListener('click',()=>{
    wAmt.value = Math.round(BAL * (+b.dataset.p)/100); wUpdate();
    document.querySelectorAll('#wdQuick button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  }));
  // withdrawal speed toggle
  document.querySelectorAll('#wdSpeed .speed-opt').forEach(opt=>{
    opt.addEventListener('click',()=>{
      document.querySelectorAll('#wdSpeed .speed-opt').forEach(o=>o.classList.remove('on'));
      opt.classList.add('on');
      wdSpeed = opt.dataset.speed;
      if (wdSpeed === 'fast'){
        wdNotice.textContent = 'Unwound early from the reserve — funds arrive in 24–48 hours. A 3% fee covers the early exit; principal is still returned in full.';
      } else {
        wdNotice.textContent = 'Your funds keep making markets until settlement, then arrive in your wallet — no fee, full payout, no further action needed.';
      }
      wUpdate();
    });
  });
  // pool selector dropdown
  const wdPoolBtn = document.getElementById('wdPoolBtn'), wdPoolMenu = document.getElementById('wdPoolMenu');
  function setPool(key){
    wdPool = WD_POOLS[key]; BAL = wdPool.value; POS_BTC = wdPool.tokA; POS_USDC = wdPool.tokB;
    document.getElementById('wdPoolIc').innerHTML = wdPool.ic;
    document.getElementById('wdPoolName').textContent = wdPool.name;
    document.getElementById('wdPoolSub').textContent = 'Your position · ' + fmt(wdPool.value);
    document.getElementById('wdPoolApy').textContent = wdPool.apy;
    // relabel the "You receive" first cell to the pool's base asset
    const rlbl = document.querySelector('#ovWithdraw .split .k'); if(rlbl) rlbl.textContent = 'You receive · ' + wdPool.name.split(' / ')[0];
    document.querySelectorAll('#wdPoolMenu .pool-menu-item').forEach(function(m){ m.classList.toggle('on', m.dataset.pool===key); });
    wAmt.value=''; document.querySelectorAll('#wdQuick button').forEach(x=>x.classList.remove('on'));
    wUpdate();
  }
  if (wdPoolBtn && wdPoolMenu){
    wdPoolBtn.addEventListener('click', function(e){ e.stopPropagation(); const open=wdPoolMenu.classList.toggle('open'); wdPoolBtn.setAttribute('aria-expanded', open?'true':'false'); });
    document.querySelectorAll('#wdPoolMenu .pool-menu-item').forEach(function(m){ m.addEventListener('click', function(){ setPool(m.dataset.pool); wdPoolMenu.classList.remove('open'); wdPoolBtn.setAttribute('aria-expanded','false'); }); });
    document.addEventListener('click', function(e){ if(!wdPoolMenu.contains(e.target) && e.target!==wdPoolBtn && !wdPoolBtn.contains(e.target)) { wdPoolMenu.classList.remove('open'); wdPoolBtn.setAttribute('aria-expanded','false'); } });
  }
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

  // submit -> confirm in wallet -> close modal -> tracker appears on the overview
  wCta.addEventListener('click', function(){
    if (wCta.disabled) return;
    wCta.disabled = true; wCta.textContent = 'Confirm in wallet…';
    const v = parseFloat(wAmt.value.replace(/,/g,'')) || 0;
    const f = Math.min(v / BAL, 1);
    const tokenStr = (POS_BTC*f).toFixed(POS_BTC<10?4:2) + ' ' + wdPool.aSym + ' + ' + fmt(POS_USDC*f).replace('$','') + ' USDC';
    setTimeout(function(){
      const ov = document.getElementById('ovWithdraw'); if (ov) ov.classList.remove('open');
      showTracker(v, wdPool.name, tokenStr);
      wAmt.value = ''; document.querySelectorAll('#wdQuick button').forEach(x=>x.classList.remove('on')); wUpdate();
      const gv = document.querySelector('#viewOverview'); // ensure overview is visible so the user sees it
    }, 1100);
  });

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

// ---------- pool search (live filter) ----------
(function(){
  const input = document.getElementById('poolSearch');
  const empty = document.getElementById('posEmpty');
  if (!input) return;
  const positions = () => Array.from(document.querySelectorAll('.pos'));

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
  input.addEventListener('input', filter);
  // Escape clears
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ input.value = ''; filter(); input.blur(); }
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


(function(){
  var det=document.getElementById('swapDetails'), tog=document.getElementById('swapDetToggle');
  if(det&&tog) tog.addEventListener('click',function(){ var open=det.classList.toggle('open'); tog.setAttribute('aria-expanded', open?'true':'false'); tog.textContent = open?'Hide details':'Show details'; });
})();



(function(){var pf=document.getElementById("poolFees"),t=document.getElementById("poolFeesToggle");if(pf&&t)t.addEventListener("click",function(){var o=pf.classList.toggle("open");t.setAttribute("aria-expanded",o?"true":"false");});})();
(function(){var d=document.getElementById("wdDetails"),t=document.getElementById("wdDetToggle");if(d&&t)t.addEventListener("click",function(){var o=d.classList.toggle("open");t.setAttribute("aria-expanded",o?"true":"false");});})();

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

(function(){
  var data={
    "1w":{income:"$111,280",il:"$6,700",users:"$74,580",proto:"$9,000",reserve:"$21,000",sub:"Fees collected and where they went · last week"},
    "1m":{income:"$466,100",il:"$28,000",users:"$312,400",proto:"$37,700",reserve:"$88,000",sub:"Fees collected and where they went · last 30 days"},
    "6m":{income:"$2,737,000",il:"$168,000",users:"$1,838,000",proto:"$219,000",reserve:"$512,000",sub:"Fees collected and where they went · last 6 months"},
    "1y":{income:"$5,593,000",il:"$327,000",users:"$3,580,000",proto:"$506,000",reserve:"$1,180,000",sub:"Fees collected and where they went · last 12 months"},
    "all":{income:"$6,902,800",il:"$360,000",users:"$3,742,800",proto:"$840,000",reserve:"$1,960,000",sub:"Fees collected and where they went · since launch"}
  };
  var t=document.getElementById("flowToggle"); if(!t) return;
  function set(p){var d=data[p];
    document.getElementById("flowIncome").textContent=d.income;
    document.getElementById("flowIL").textContent=d.il;
    document.getElementById("flowUsers").textContent=d.users;
    document.getElementById("flowProto").textContent=d.proto;
    document.getElementById("flowReserve").textContent=d.reserve;
    document.getElementById("flowSub").textContent=d.sub;
    t.querySelectorAll("button").forEach(function(b){b.classList.toggle("on",b.dataset.p===p);});
  }
  t.querySelectorAll("button").forEach(function(b){b.addEventListener("click",function(){set(b.dataset.p);});});
  set("1m");
})();
}
