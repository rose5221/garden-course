/* 园林史·文明长课
   46 站线性长课 + 地图位置标注 + 文明启动纪录片模式
*/
(() => {
'use strict';

const D = window.APP_DATA;
const STOPS = D.stops;
const ERAS = D.eras;

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtYear = y => y < 0 ? `前 ${-y}` : `${y}`;
const eraOf = k => ERAS.find(e => e.k === k) || {};
const isCn = s => s.id.startsWith('c');

/* ---------- 进度（localStorage） ---------- */
const LS = 'garden-course-v1';
let prog = { day: 1, seq: 1, done: [], daysDone: [] };
try { Object.assign(prog, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (_) {}
const saveProg = () => localStorage.setItem(LS, JSON.stringify(prog));

/* ============================================================
   地图
   ============================================================ */
const VIEW = { lon0: -20, lon1: 150, lat0: -12, lat1: 66 };
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const M0 = mercY(VIEW.lat0), M1 = mercY(VIEW.lat1);

let GEO = null;
const maps = new WeakMap();

function initMap(canvas, fxCanvas, pinsHost, opts = {}) {
  const ctx = canvas.getContext('2d');
  const fx = fxCanvas ? fxCanvas.getContext('2d') : null;
  const state = { W: 0, H: 0, dpr: Math.min(devicePixelRatio || 1, 2), k: 1, tx: 0, ty: 0, pins: new Map(), cur: null };
  maps.set(canvas, state);

  function projRaw(lon, lat) {
    const x = (lon - VIEW.lon0) / (VIEW.lon1 - VIEW.lon0) * state.W;
    const my = mercY(Math.max(-84, Math.min(84, lat)));
    const y = (M1 - my) / (M1 - M0) * state.H;
    return [x, y];
  }
  const proj = (lon, lat) => {
    const [x, y] = projRaw(lon, lat);
    return [x * state.k + state.tx, y * state.k + state.ty];
  };
  state.proj = proj;

  function draw() {
    const { W, H } = state;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#080706';
    ctx.fillRect(0, 0, W, H);

    if (GEO) {
      const p = new Path2D();
      for (const f of GEO.features) {
        const g = f.geometry;
        if (g.type !== 'MultiPolygon') continue;
        for (const poly of g.coordinates) {
          for (const ring of poly) {
            if (ring.length < 3) continue;
            let st = false;
            for (const pt of ring) {
              const [x, y] = proj(pt[0], pt[1]);
              if (!st) { p.moveTo(x, y); st = true; } else p.lineTo(x, y);
            }
            p.closePath();
          }
        }
      }
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#221d17');
      g.addColorStop(1, '#171410');
      ctx.fillStyle = g;
      ctx.fill(p);
      ctx.strokeStyle = 'rgba(150,138,118,.30)';
      ctx.lineWidth = .55;
      ctx.stroke(p);
    }
    // 经纬网
    ctx.strokeStyle = 'rgba(190,168,132,.04)';
    ctx.lineWidth = 1;
    for (let lon = -20; lon <= 150; lon += 20) {
      const x = proj(lon, 0)[0];
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let lat = 0; lat <= 60; lat += 15) {
      const y = proj(0, lat)[1];
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  function placePins() {
    if (!pinsHost) return;
    if (!state.pins.size) {
      for (const s of STOPS) {
        const el = document.createElement('div');
        el.className = 'pin ' + (isCn(s) ? 'cn' : 'we');
        el.dataset.id = s.id;
        el.innerHTML = `<i></i><span class="pinlab">${esc(s.place)}</span>`;
        el.addEventListener('click', e => {
          e.stopPropagation();
          if (opts.onPick) opts.onPick(s);
        });
        pinsHost.appendChild(el);
        state.pins.set(s.id, el);
      }
    }
    // 同年份同地点的推挤
    const list = STOPS.map(s => {
      const [x, y] = proj(s.lon, s.lat);
      return { s, tx: x, ty: y, x, y };
    });
    list.sort((a, b) => (b.s.q.length) - (a.s.q.length));
    const done = [];
    for (const it of list) {
      let t = 0;
      while (t < 30) {
        if (!done.some(p => Math.abs(p.x - it.x) < 20 && Math.abs(p.y - it.y) < 17)) break;
        const a = t * 2.39996, r = 11 + Math.sqrt(t) * 7;
        it.x = it.tx + Math.cos(a) * r;
        it.y = it.ty + Math.sin(a) * r * .8;
        t++;
      }
      done.push(it);
    }
    for (const it of list) {
      const el = state.pins.get(it.s.id);
      if (!el) continue;
      el.style.left = it.x + 'px';
      el.style.top = it.y + 'px';
      el.classList.toggle('cur', it.s.id === state.cur);
      el.classList.toggle('done', prog.done.includes(it.s.id));
      el.classList.toggle('future', it.s.seq > prog.seq && it.s.id !== state.cur);
    }
    // 引线
    if (fx) {
      fx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      fx.clearRect(0, 0, state.W, state.H);
      fx.strokeStyle = 'rgba(180,158,124,.20)';
      fx.lineWidth = .8;
      for (const it of list) {
        if (Math.hypot(it.x - it.tx, it.y - it.ty) < 4) continue;
        const el = state.pins.get(it.s.id);
        if (el && el.classList.contains('future')) continue;
        fx.beginPath(); fx.moveTo(it.tx, it.ty); fx.lineTo(it.x, it.y); fx.stroke();
      }
    }
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    state.W = r.width; state.H = r.height;
    for (const c of [canvas, fxCanvas]) {
      if (!c) continue;
      c.width = Math.round(state.W * state.dpr);
      c.height = Math.round(state.H * state.dpr);
      c.style.width = state.W + 'px';
      c.style.height = state.H + 'px';
    }
    draw(); placePins();
  }

  state.resize = resize;
  state.setCur = id => { state.cur = id; placePins(); };
  state.redraw = () => { draw(); placePins(); if (state.focus) drawFocus(state.focus); };

  // 高亮当前地理位置（供文明启动用）
  state.setFocus = s => {
    state.focus = s;
    if (!fx) return;
    fx.clearRect(0, 0, state.W, state.H);
    const [x, y] = proj(s.lon, s.lat);
    fx.save();
    fx.strokeStyle = 'rgba(201,162,39,.85)';
    fx.lineWidth = 1.2;
    fx.beginPath(); fx.arc(x, y, 16, 0, Math.PI * 2); fx.stroke();
    fx.strokeStyle = 'rgba(201,162,39,.35)';
    fx.beginPath(); fx.arc(x, y, 26, 0, Math.PI * 2); fx.stroke();
    fx.fillStyle = 'rgba(201,162,39,.95)';
    fx.beginPath(); fx.arc(x, y, 4.5, 0, Math.PI * 2); fx.fill();
    // 十字定位线
    fx.strokeStyle = 'rgba(201,162,39,.30)';
    fx.setLineDash([3, 5]);
    fx.beginPath(); fx.moveTo(x - 42, y); fx.lineTo(x + 42, y); fx.stroke();
    fx.beginPath(); fx.moveTo(x, y - 42); fx.lineTo(x, y + 42); fx.stroke();
    fx.setLineDash([]);
    // 地名
    fx.font = '600 13px "Songti SC",serif';
    fx.fillStyle = 'rgba(240,225,195,.95)';
    fx.shadowColor = 'rgba(0,0,0,.9)'; fx.shadowBlur = 6;
    fx.fillText(s.place, x + 20, y - 18);
    fx.restore();
  };
  const drawFocus = s => state.setFocus(s);

  // 缩放
  if (opts.zoom) {
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const k0 = state.k;
      const k = Math.max(1, Math.min(10, k0 * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      if (k === k0) return;
      state.tx = mx - (mx - state.tx) * (k / k0);
      state.ty = my - (my - state.ty) * (k / k0);
      state.k = k;
      const mxX = state.W * (k - 1), mxY = state.H * (k - 1);
      state.tx = Math.min(0, Math.max(-mxX, state.tx));
      state.ty = Math.min(0, Math.max(-mxY, state.ty));
      state.redraw();
    }, { passive: false });
    let drag = false, sx = 0, sy = 0;
    canvas.addEventListener('pointerdown', e => {
      if (e.target.closest('.pin')) return;
      drag = true; sx = e.clientX - state.tx; sy = e.clientY - state.ty;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      state.tx = e.clientX - sx; state.ty = e.clientY - sy;
      const mxX = state.W * (state.k - 1), mxY = state.H * (state.k - 1);
      state.tx = Math.min(0, Math.max(-mxX, state.tx));
      state.ty = Math.min(0, Math.max(-mxY, state.ty));
      state.redraw();
    });
    canvas.addEventListener('pointerup', e => { drag = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} });
  }

  resize();
  return state;
}

/* ============================================================
   课程渲染
   ============================================================ */
let curSeq = prog.seq || 1;
let mapState = null;

function stopBySeq(n) { return STOPS.find(s => s.seq === n); }

function renderStop(n, scrollTop = true) {
  const s = stopBySeq(n);
  if (!s) return;
  curSeq = n;
  prog.seq = n;
  prog.day = s.day;
  saveProg();

  const e = eraOf(s.era);
  const cn = isCn(s);

  let h = `<div class="stopHead">
    <div class="stopMeta">
      <span class="sideTag ${cn ? 'cn' : 'we'}">${cn ? '中国' : '西方'}</span>
      <span>${esc(e.n)}</span>
      <span class="stopYear">${fmtYear(s.y)} 年</span>
      <span class="stopPlace">· ${esc(s.place)}</span>
    </div>
    <h1>${esc(s.t)}</h1>
    <p class="lead">${esc(s.lead)}</p>
  </div>`;

  h += '<div class="pts">';
  for (const p of s.pts) {
    h += `<div class="pt"><h3>${esc(p.h)}</h3><p>${esc(p.b)}</p></div>`;
  }
  h += '</div>';

  if (s.q && s.q.length) {
    h += `<div class="qsec">
      <div class="qsecHead"><span>本站考点 · 自拟题</span><span>${s.q.length} 题</span></div>`;
    for (const q of s.q) {
      h += `<details class="qcard"><summary>
        <span class="kb kb-${q.k}">${q.k}</span>
        <span>${esc(q.t)}</span>
      </summary><div class="qbody">
        <h4>参考答案</h4><p>${esc(q.a)}</p>
        ${q.kp ? `<div class="kp"><b>得分点：</b>${esc(q.kp)}</div>` : ''}
        ${q.err ? `<div class="err"><b>易错：</b>${esc(q.err)}</div>` : ''}
      </div></details>`;
    }
    h += '</div>';
  }

  $('#lessonInner').innerHTML = h;
  $('#dayBadge').textContent = `第 ${s.day} 天`;
  $('#stopBadge').textContent = String(s.seq).padStart(2, '0') + ' / ' + STOPS.length;
  $('#progressBar').style.width = (s.seq / STOPS.length * 100) + '%';

  if (!prog.done.includes(s.id)) { prog.done.push(s.id); saveProg(); }

  if (mapState) {
    mapState.setCur(s.id);
    $('#hudPlace').textContent = s.place;
    $('#hudYear').textContent = fmtYear(s.y) + ' 年 · ' + (e.n || '');
    // 地图居中到该点
    const r = $('#map');
    if (r && mapState.W) {
      const [x, y] = mapState.proj(s.lon, s.lat);
      const dx = mapState.W / 2 - x, dy = mapState.H / 2 - y;
      mapState.tx += dx * 0.55; mapState.ty += dy * 0.55;
      mapState.redraw();
    }
  }

  if (scrollTop) $('#lesson').scrollTop = 0;
  $('#btnPrev').disabled = n <= 1;
  $('#btnNext').textContent = n >= STOPS.length ? '回到第一站 ↺' : '下一站 →';
}

/* ============================================================
   文明启动
   ============================================================ */
const cine = { list: [], i: 0, timer: null, paused: false, ms: 20000, cineMap: null };

function startCivil(day) {
  const list = STOPS.filter(s => s.day === day).sort((a, b) => a.seq - b.seq);
  if (!list.length) return;
  cine.list = list; cine.i = 0; cine.paused = false;
  $('#launch').classList.add('hidden');
  $('#main').classList.add('hidden');
  $('#cinema').classList.remove('hidden');
  $('#cineDone').classList.add('hidden');
  if (!cine.cineMap) {
    cine.cineMap = initMap($('#cineMap'), $('#cineFx'), null, {});
  }
  cine.cineMap.resize();
  $('#cineDay').textContent = `第 ${day} 天`;
  showCine(0);
}

function showCine(i) {
  cine.i = i;
  const s = cine.list[i];
  if (!s) return finishCivil();
  $('#cineCount').textContent = `${i + 1} / ${cine.list.length}`;
  $('#cineYear').textContent = fmtYear(s.y);
  $('#cinePlace').textContent = s.place + ' · ' + (eraOf(s.era).n || '');
  $('#cineTitle').textContent = s.t;
  $('#cineLead').textContent = s.lead;
  $('#cinePts').innerHTML = s.pts.slice(0, 3).map(p =>
    `<li><b>${esc(p.h)}</b>　${esc(p.b.slice(0, 78))}${p.b.length > 78 ? '…' : ''}</li>`).join('');

  if (cine.cineMap) {
    cine.cineMap.setFocus(s);
    const M = cine.cineMap;
    // 先归零算原始位置，再平移到目标屏幕坐标
    M.tx = 0; M.ty = 0;
    const [bx, by] = M.proj(s.lon, s.lat);
    const narrow = window.innerWidth <= 640;
    M.tx = M.W * (narrow ? 0.50 : 0.30) - bx;
    M.ty = M.H * (narrow ? 0.52 : 0.50) - by;
    M.redraw();
  }

  $('#cineBar i').style.width = '0%';
  clearInterval(cine.timer);
  if (!cine.paused) startTimer();
}

function startTimer() {
  const t0 = Date.now();
  cine.timer = setInterval(() => {
    if (cine.paused) return;
    const p = Math.min(1, (Date.now() - t0) / cine.ms);
    $('#cineBar i').style.width = (p * 100) + '%';
    if (p >= 1) { clearInterval(cine.timer); nextCine(); }
  }, 100);
}

function nextCine() {
  if (cine.i + 1 >= cine.list.length) return finishCivil();
  showCine(cine.i + 1);
}

function finishCivil() {
  clearInterval(cine.timer);
  const day = cine.list[0].day;
  if (!prog.daysDone.includes(day)) { prog.daysDone.push(day); saveProg(); }
  const first = cine.list[0].seq, last = cine.list[cine.list.length - 1].seq;
  prog.seq = Math.min(STOPS.length, last + 1);
  saveProg();
  $('#cineDoneText').innerHTML =
    `第 ${day} 天 · 第 ${first}—${last} 站<br>
     从「${esc(cine.list[0].t)}」走到「${esc(cine.list[cine.list.length - 1].t)}」<br>
     下次启动会从第 ${prog.seq} 站（第 ${stopBySeq(prog.seq) ? stopBySeq(prog.seq).day : day} 天）继续。`;
  $('#cineDone').classList.remove('hidden');
}

/* ============================================================
   启动页渲染
   ============================================================ */
function renderLaunch() {
  const days = {};
  for (const s of STOPS) {
    days[s.day] = days[s.day] || { n: 0, from: s, to: s };
    days[s.day].n++;
    if (s.seq < days[s.day].from.seq) days[s.day].from = s;
    if (s.seq > days[s.day].to.seq) days[s.day].to = s;
  }
  $('#launchDays').innerHTML = Object.keys(days).sort((a, b) => a - b).map(d => {
    const x = days[d];
    const done = prog.daysDone.includes(+d);
    return `<button data-day="${d}" class="${done ? 'done' : ''}" title="${esc(x.from.t)} → ${esc(x.to.t)}">
      第 ${d} 天 · ${x.n} 站${done ? ' ✓' : ''}</button>`;
  }).join('');
  $$('#launchDays button').forEach(b => {
    b.addEventListener('click', () => {
      const d = +b.dataset.day;
      const first = STOPS.find(s => s.day === d);
      goMain();
      renderStop(first.seq);
    });
  });
}

/* ============================================================
   搜索
   ============================================================ */
let SEARCH = null;
function buildSearch() {
  const arr = [];
  for (const s of STOPS) {
    arr.push({ t: s.t, sub: `${fmtYear(s.y)} · ${s.place}`, kind: '站', seq: s.seq });
    for (const q of s.q) arr.push({ t: q.t, sub: q.k, kind: q.k, seq: s.seq, stop: s.t });
    for (const p of s.pts) arr.push({ t: p.h, sub: s.t, kind: '知识点', seq: s.seq });
  }
  return arr;
}

function doSearch(kw) {
  if (!SEARCH) SEARCH = buildSearch();
  kw = kw.trim().toLowerCase();
  const box = $('#searchResults');
  if (!kw) { box.innerHTML = ''; return; }
  const hits = SEARCH.filter(x =>
    x.t.toLowerCase().includes(kw) || (x.sub || '').toLowerCase().includes(kw)).slice(0, 40);
  box.innerHTML = hits.length ? hits.map((x, i) =>
    `<div class="sr" data-i="${i}"><span class="sk">${esc(x.kind)}</span>
     <span>${esc(x.t)}</span><span class="st">${esc(x.sub || '')}</span></div>`).join('')
    : '<div class="sr" style="color:#6d6459">没找到</div>';
  box.querySelectorAll('.sr').forEach(el => el.addEventListener('click', () => {
    const x = hits[+el.dataset.i];
    if (!x) return;
    goMain();
    renderStop(x.seq);
    $('#searchBox').classList.add('hidden');
    // 若是题目，展开
    if (x.kind !== '站' && x.kind !== '知识点') {
      setTimeout(() => {
        for (const c of $$('.qcard')) {
          if (c.querySelector('summary span:nth-child(2)')?.textContent === x.t) {
            c.open = true; c.scrollIntoView({ block: 'center', behavior: 'smooth' }); break;
          }
        }
      }, 200);
    }
  }));
}

/* ============================================================
   导航
   ============================================================ */
function goMain() {
  $('#launch').classList.add('hidden');
  $('#cinema').classList.add('hidden');
  $('#main').classList.remove('hidden');
}

function goHome() {
  $('#main').classList.add('hidden');
  $('#cinema').classList.add('hidden');
  $('#launch').classList.remove('hidden');
  renderLaunch();
}

/* ============================================================
   启动
   ============================================================ */
function boot() {
  renderLaunch();

  $('#btnCivil').addEventListener('click', () => {
    const day = prog.daysDone.length >= 6 ? 1 : (Math.min(...Array.from({length:6},(_,i)=>i+1).filter(d=>!prog.daysDone.includes(d))) || 1);
    startCivil(day);
  });
  $('#btnBrowse').addEventListener('click', () => { goMain(); renderStop(curSeq); });
  $('#btnHome').addEventListener('click', goHome);
  $('#btnPrev').addEventListener('click', () => { if (curSeq > 1) renderStop(curSeq - 1); });
  $('#btnNext').addEventListener('click', () => {
    renderStop(curSeq >= STOPS.length ? 1 : curSeq + 1);
  });

  $('#btnMap').addEventListener('click', () => {
    const w = $('#mapWrap');
    w.classList.toggle('hidden');
    if (!w.classList.contains('hidden')) {
      if (!mapState) mapState = initMap($('#map'), $('#fx'), $('#pins'), { zoom: true, onPick: s => renderStop(s.seq) });
      setTimeout(() => { mapState.resize(); const s = stopBySeq(curSeq); if (s) mapState.setCur(s.id); }, 30);
    }
  });
  $('#mapClose').addEventListener('click', () => $('#mapWrap').classList.add('hidden'));

  $('#btnCivil2').addEventListener('click', () => {
    const s = stopBySeq(curSeq);
    startCivil(s ? s.day : 1);
  });

  $('#btnSearch').addEventListener('click', () => {
    $('#searchBox').classList.toggle('hidden');
    if (!$('#searchBox').classList.contains('hidden')) setTimeout(() => $('#searchInput').focus(), 40);
  });
  $('#searchInput').addEventListener('input', e => doSearch(e.target.value));

  // 文明启动控制
  $('#cineExit').addEventListener('click', () => { clearInterval(cine.timer); goMain(); renderStop(cine.list[cine.i] ? cine.list[cine.i].seq : curSeq); });
  $('#cinePause').addEventListener('click', () => {
    cine.paused = !cine.paused;
    $('#cinePause').textContent = cine.paused ? '继续' : '暂停';
    if (!cine.paused) { $('#cineBar i').style.width = '0%'; startTimer(); }
  });
  $('#cineNextStop').addEventListener('click', () => { clearInterval(cine.timer); nextCine(); });
  $('#cineSkip').addEventListener('click', () => { clearInterval(cine.timer); finishCivil(); });
  $('#cineTomorrow').addEventListener('click', goHome);
  $('#cineQuiz').addEventListener('click', () => {
    goMain();
    const s = cine.list[0];
    renderStop(s.seq);
    setTimeout(() => {
      const qs = $$('.qcard');
      if (qs[0]) { qs[0].open = true; qs[0].scrollIntoView({ block: 'center' }); }
    }, 220);
  });

  // 键盘
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (!$('#main').classList.contains('hidden')) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (curSeq > 1) renderStop(curSeq - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); renderStop(curSeq >= STOPS.length ? 1 : curSeq + 1); }
      if (e.key === 'm') $('#btnMap').click();
    }
    if (!$('#cinema').classList.contains('hidden')) {
      if (e.key === ' ') { e.preventDefault(); $('#cinePause').click(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); $('#cineNextStop').click(); }
      if (e.key === 'Escape') $('#cineExit').click();
    }
  });

  addEventListener('resize', () => {
    clearTimeout(window.__rz);
    window.__rz = setTimeout(() => { if (mapState) mapState.resize(); if (cine.cineMap) cine.cineMap.resize(); }, 140);
  });

  fetch('assets/world.geo.json').then(r => r.json()).then(g => {
    GEO = g;
    if (mapState) mapState.redraw();
    if (cine.cineMap) cine.cineMap.redraw();
  }).catch(() => {});
}

boot();
})();
