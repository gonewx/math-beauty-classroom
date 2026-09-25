/* 数学之美 · 互动演示
   每个演示：Demos.名字 = function (容器元素) { ...; return { enter, leave, next, prev }; }
   - enter/leave：进入/离开该页时调用（开始/停止动画）
   - next/prev：翻页笔“下一步/上一步”时先问演示，返回 true 表示演示自己用掉了这一步 */
(function () {
  'use strict';
  var Demos = window.Demos = {};
  var TAU = Math.PI * 2;
  var GOLDEN_ANGLE = 360 / Math.pow((1 + Math.sqrt(5)) / 2, 2); // ≈ 137.508°

  /* ---------- 小工具 ---------- */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null) return;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function svg(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  // 高清画布：按 CSS 尺寸 × 2 分配像素，绘图仍用 CSS 坐标
  function hiCanvas(w, hgt, cls) {
    var c = h('canvas', { class: cls || '' });
    c.width = w * 2; c.height = hgt * 2;
    c.style.width = w + 'px'; c.style.height = hgt + 'px';
    var ctx = c.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    c.ctx = ctx; c.w = w; c.h = hgt;
    return c;
  }
  function box(child, w, hgt) {
    var b = h('div', { class: 'canvas-box', style: 'width:' + w + 'px;height:' + hgt + 'px' });
    b.appendChild(child);
    return b;
  }
  function loop(fn) {
    var id = null;
    function tick(t) { if (fn(t) === false) { id = null; return; } id = requestAnimationFrame(tick); }
    return {
      start: function () { if (!id) id = requestAnimationFrame(tick); },
      stop: function () { if (id) cancelAnimationFrame(id); id = null; },
      running: function () { return !!id; }
    };
  }
  // 画布上的指针坐标（舞台被缩放过，要换算）
  function pointerPos(canvas, e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * canvas.w, y: (e.clientY - r.top) / r.height * canvas.h };
  }
  function btn(label, onclick, cls) { return h('button', { class: 'btn ' + (cls || ''), onclick: onclick }, label); }
  function slider(label, min, max, stepv, value, oninput, unit) {
    var out = h('output', {}, value + (unit || ''));
    var inp = h('input', { type: 'range', min: min, max: max, step: stepv, value: value });
    inp.addEventListener('input', function () { out.textContent = inp.value + (unit || ''); oninput(+inp.value); });
    var row = h('div', { class: 'slider-row' }, h('label', {}, label), inp, out);
    row.input = inp; row.output = out;
    row.set = function (v) { inp.value = v; out.textContent = v + (unit || ''); };
    return row;
  }
  function fib(n) { var a = 1, b = 1; for (var i = 1; i < n; i++) { var t = a + b; a = b; b = t; } return a; }

  /* ================= 向日葵（黄金角） ================= */
  function drawSeeds(ctx, cx, cy, count, angleDeg, spacing, colorFn, sizeK) {
    var a = angleDeg * Math.PI / 180;
    for (var i = 1; i <= count; i++) {
      var r = spacing * Math.sqrt(i);
      var th = i * a;
      var x = cx + r * Math.cos(th), y = cy + r * Math.sin(th);
      ctx.fillStyle = colorFn(i, count);
      ctx.beginPath();
      ctx.arc(x, y, spacing * (sizeK || 0.46) * (0.75 + 0.25 * Math.min(1, i / 40)), 0, TAU);
      ctx.fill();
    }
  }
  function seedColor(i, n) {
    var t = i / Math.max(n, 1);
    // 中心深褐 → 外圈金黄
    var r = Math.round(120 + 135 * t), g = Math.round(60 + 120 * t), b = Math.round(20 + 20 * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // 把第 k 族螺旋的每一条（按 i mod k 分组）按它在花盘外圈的位置排序，好让相邻的螺旋颜色也相邻
  function armColors(k, N, angleDeg) {
    var a = angleDeg * Math.PI / 180, arms = [];
    for (var r = 0; r < k; r++) {
      var i = N - ((N - r) % k);
      arms.push({ r: r, ang: ((i * a) % TAU + TAU) % TAU });
    }
    arms.sort(function (x, y) { return x.ang - y.ang; });
    var col = [];
    arms.forEach(function (arm, rank) {
      col[arm.r] = rank % 2 ? 'hsl(' + Math.round(rank / k * 330) + ',85%,46%)' : 'hsl(' + Math.round(rank / k * 330) + ',70%,80%)';
    });
    return col;
  }

  Demos.coverSunflower = function (el) {
    var W = 900, H = 900;
    var c = hiCanvas(W, H);
    el.appendChild(c);
    var N = 900, t0 = null;
    var lp = loop(function (t) {
      if (t0 === null) t0 = t;
      var k = Math.min(N, Math.floor((t - t0) / 6));
      var ctx = c.ctx;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.translate(W / 2, H / 2);
      ctx.rotate((t - t0) / 40000);
      drawSeeds(ctx, 0, 0, k, GOLDEN_ANGLE, 13.5, function (i) {
        var hue = 25 + 30 * (i / N);
        return 'hsl(' + (i % 21 === 0 ? 350 : hue) + ',' + (i % 21 === 0 ? 85 : 90) + '%,' + (48 + 12 * (i / N)) + '%)';
      });
      ctx.restore();
    });
    return {
      enter: function () { t0 = null; lp.start(); },
      leave: function () { lp.stop(); }
    };
  };

  Demos.sunflower = function (el) {
    var S = 650;
    var c = hiCanvas(S, S);
    var angle = 90, count = 0, N = 720, spiral = 0, growing = false;
    var lp = loop(function () {
      count = Math.min(N, count + 8);
      draw();
      if (count >= N) { growing = false; return false; }
    });
    function draw() {
      var ctx = c.ctx;
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = '#FFF6DB';
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 6, 0, TAU); ctx.fill();
      var cols = spiral ? armColors(spiral, N, angle) : null;
      drawSeeds(ctx, S / 2, S / 2, count, angle, (S / 2 - 22) / Math.sqrt(N), spiral ? function (i) {
        return cols[i % spiral];
      } : seedColor);
    }
    function grow() { count = 0; growing = true; lp.start(); }
    var readout = h('div', { class: 'sf-angle' }, '90', h('small', {}, '°'));
    function setAngle(a, animate) {
      angle = a;
      readout.firstChild.textContent = (Math.round(a * 10) / 10).toString();
      sl.set(Math.round(a * 10) / 10);
      presets.forEach(function (p) { p.b.classList.toggle('on', Math.abs(p.a - a) < 0.05); });
      if (animate) grow(); else { count = N; draw(); }
    }
    var sl = slider('转角', 60, 180, 0.1, 90, function (v) { spiral = 0; setAngle(v, false); }, '°');
    var presets = [90, 120, 135, 137.5, 140].map(function (a) {
      var real = a === 137.5 ? GOLDEN_ANGLE : a;
      var b = btn(a === 137.5 ? '137.5° ⭐' : a + '°', function () { spiral = 0; setAngle(real, true); });
      return { a: real, b: b };
    });
    var spiralBtns = [21, 34, 55].map(function (k) {
      var b = btn(k + ' 条', function () {
        spiral = spiral === k ? 0 : k;
        spiralBtns.forEach(function (x) { x.classList.toggle('on', x === b && spiral === k); });
        count = N; draw();
      }, 'sm');
      return b;
    });
    var panel = h('div', { class: 'sf-panel grow' },
      h('div', { class: 'card tint', style: 'font-size:26px' }, '种子从中心一颗颗长出来，每长一颗就', h('b', {}, '转一个相同的角度'), '。转多少度，种子排得最密、最整齐？'),
      h('div', { class: 'sf-label' }, '每颗种子转过的角度'),
      readout,
      h('div', { class: 'btns' }, presets.map(function (p) { return p.b; })),
      sl,
      h('div', { class: 'btns', style: 'align-items:center' }, btn('▶ 重新生长', grow, 'primary'),
        h('span', { class: 'sf-label', style: 'margin-left:10px' }, '数螺旋：'), spiralBtns)
    );
    el.appendChild(box(c, S, S));
    el.appendChild(panel);
    setAngle(90, false);
    count = 0;
    return {
      enter: function () { if (!growing && count === 0) grow(); else draw(); },
      leave: function () { lp.stop(); if (growing) { count = N; growing = false; } }
    };
  };

  /* ================= 读心术卡片 ================= */
  var CARD_ORDER = [2, 0, 4, 1, 3];            // 第几位二进制 → 卡片 A~E（打乱一点，不那么明显）
  var CARD_COLORS = ['coral', 'sun', 'teal', 'sky', 'grape'];
  var CARD_LETTERS = 'ABCDE';
  window.MagicMemory = null;

  function magicCard(k, onclick) {
    var bit = CARD_ORDER[k], nums = [];
    for (var n = 1; n <= 31; n++) if ((n >> bit) & 1) nums.push(n);
    var card = h('div', { class: 'mcard mc-' + CARD_COLORS[k], onclick: function () { onclick(card, bit); } },
      h('div', { class: 'mcard-h' }, '卡片 ' + CARD_LETTERS[k]),
      h('div', { class: 'mcard-g' }, nums.map(function (x) { return h('span', {}, x); })),
      h('div', { class: 'mcard-stamp' }, '✓ 有'));
    card.bit = bit;
    return card;
  }

  Demos.magic = function (el) {
    var picked = {}, revealed = false;
    var out = h('div', { class: 'magic-out' });
    var cards = CARD_LETTERS.split('').map(function (_, k) {
      return magicCard(k, function (card, bit) {
        if (revealed) reset();
        picked[bit] = !picked[bit];
        card.classList.toggle('picked', !!picked[bit]);
        out.innerHTML = '';
      });
    });
    function sum() { var s = 0; for (var b in picked) if (picked[b]) s += 1 << b; return s; }
    function reveal() {
      var s = sum();
      if (!s) { out.innerHTML = '<span class="muted" style="font-size:30px">先告诉我：你的数在哪几张卡片上？点一点卡片吧 👆</span>'; return; }
      revealed = true;
      out.innerHTML = '你想的数是…… <span class="num">' + s + '</span> ！';
      var bits = []; for (var b in picked) if (picked[b]) bits.push(+b);
      window.MagicMemory = { bits: bits, sum: s };
    }
    function reset() {
      picked = {}; revealed = false; out.innerHTML = '';
      cards.forEach(function (c) { c.classList.remove('picked'); });
    }
    el.appendChild(h('div', { class: 'mcards' }, cards));
    el.appendChild(h('div', { class: 'magic-bar' },
      btn('🔮 揭晓', reveal, 'primary'), btn('↺ 再来一次', reset), out));
    return {
      next: function () {
        if (!revealed && sum() > 0) { reveal(); return true; }
        return false;
      }
    };
  };

  Demos.magicReveal = function (el) {
    var picked = {};
    var out = h('div', { class: 'magic-out', style: 'margin-top:18px' });
    var cards = CARD_LETTERS.split('').map(function (_, k) {
      return magicCard(k, function (card, bit) {
        picked[bit] = !picked[bit];
        card.classList.toggle('picked', !!picked[bit]);
        render(false);
      });
    });
    cards.forEach(function (c) { c.classList.add('secret'); });
    function render(fromMemory) {
      var bits = [];
      for (var b = 0; b < 5; b++) if (picked[b]) bits.push(b);
      if (!bits.length) {
        out.innerHTML = '<span class="eq">试一试：点亮几张卡片，把它们的<em>第一个数</em>加起来 👆</span>';
        return;
      }
      var s = 0, parts = bits.map(function (b) { s += 1 << b; return '<em>' + (1 << b) + '</em>'; });
      out.innerHTML = '<span class="eq">' + (fromMemory ? '开场时同学想的数：' : '') + parts.join(' + ') + ' = </span><span class="num">' + s + '</span>';
    }
    el.appendChild(h('div', { class: 'mcards' }, cards));
    el.appendChild(out);
    return {
      enter: function () {
        picked = {};
        var mem = window.MagicMemory;
        if (mem) mem.bits.forEach(function (b) { picked[b] = true; });
        cards.forEach(function (c) { c.classList.toggle('picked', !!picked[c.bit]); });
        render(!!mem);
      }
    };
  };

  /* ================= 兔子 ================= */
  Demos.rabbits = function (el) {
    var month = 1, adults = 0, babies = 1, MAXNEXT = 8, MAX = 10;
    var hist = [];
    var monthEl = h('div', { class: 'rab-month' });
    var countEl = h('div', { class: 'rab-count' });
    var field = h('div', { class: 'rab-field' });
    var seq = h('div', { class: 'rab-seq' });
    function render(newBorn) {
      monthEl.textContent = '第 ' + month + ' 个月';
      countEl.textContent = '共 ' + (adults + babies) + ' 对';
      field.innerHTML = '';
      for (var i = 0; i < adults; i++) field.appendChild(h('span', { class: 'r', title: '大兔', style: 'animation-delay:' + Math.min(i * 20, 400) + 'ms' }, '🐇'));
      for (var j = 0; j < babies; j++) field.appendChild(h('span', { class: 'r baby', title: '小兔', style: newBorn ? 'animation-delay:' + (300 + Math.min(j * 30, 600)) + 'ms' : '' }, '🐰'));
      seq.innerHTML = '';
      seq.appendChild(h('span', { style: 'background:none;box-shadow:none;font-size:24px;padding:0' }, '对数：'));
      for (var m = 1; m <= month; m++) seq.appendChild(h('span', { class: m === month ? 'now' : '' }, fib(m)));
      nextBtn.disabled = month >= MAX;
    }
    function step() {
      if (month >= MAX) return false;
      hist.push([adults, babies]);
      var a = adults + babies, b = adults;
      adults = a; babies = b; month++;
      render(true);
      return true;
    }
    function back() {
      if (!hist.length) return false;
      var p = hist.pop(); adults = p[0]; babies = p[1]; month--;
      render(false);
      return true;
    }
    function reset() { month = 1; adults = 0; babies = 1; hist = []; render(false); }
    var nextBtn = btn('下个月 ▶', step, 'primary');
    el.appendChild(h('div', { class: 'rab' },
      h('div', { class: 'rab-top' }, monthEl, countEl, h('div', { class: 'grow' }),
        h('span', { style: 'font-size:22px;color:#5B6275;font-weight:700' }, '🐇 大兔　🐰 小兔')),
      field, seq,
      h('div', { class: 'btns' }, nextBtn, btn('↺ 重来', reset))));
    render(false);
    return {
      next: function () { return month < MAXNEXT ? step() : false; },
      prev: function () { return back(); }
    };
  };

  /* ================= 花瓣 ================= */
  var FLOWERS = [
    { n: 3, name: '延龄草', petal: '#FFFFFF', edge: '#C8C0D8', core: '#F2C94C' },
    { n: 5, name: '梅花', petal: '#FF8FB8', edge: '#E0588C', core: '#FFE08A' },
    { n: 8, name: '飞燕草', petal: '#6C8CF5', edge: '#3F5FD0', core: '#FFFFFF' },
    { n: 13, name: '万寿菊', petal: '#FFB020', edge: '#E08600', core: '#B85C00' },
    { n: 21, name: '紫菀', petal: '#B592F0', edge: '#8A63D2', core: '#F7C948' },
    { n: 34, name: '雏菊', petal: '#FFFFFF', edge: '#CFCFCF', core: '#F5B800' }
  ];
  function flowerSVG(f) {
    var s = svg('svg', { viewBox: '-100 -100 200 200' });
    var L = 82, core = f.n > 20 ? 22 : 18;
    var w = Math.max(5, Math.min(L * 0.62, TAU * (core + L * 0.45) / f.n * 0.62));
    for (var i = 0; i < f.n; i++) {
      var a = i * 360 / f.n - 90;
      var e = svg('ellipse', {
        cx: (core + (L - core) / 2).toFixed(1), cy: 0, rx: ((L - core) / 2 + 4).toFixed(1), ry: (w / 2).toFixed(1),
        fill: f.petal, stroke: f.edge, 'stroke-width': 1.6, transform: 'rotate(' + a.toFixed(2) + ')'
      });
      s.appendChild(e);
    }
    s.appendChild(svg('circle', { r: core, fill: f.core, stroke: 'rgba(0,0,0,.15)', 'stroke-width': 2 }));
    return s;
  }
  Demos.flowers = function (el) {
    var cards = FLOWERS.map(function (f) {
      var cnt = h('div', { class: 'fcount' }, '? 瓣');
      var card = h('div', { class: 'flower', onclick: function () { open(card); } },
        flowerSVG(f), h('div', { class: 'fname' }, f.name), cnt);
      card.f = f; card.cnt = cnt;
      return card;
    });
    function open(card) {
      if (card.classList.contains('open')) return;
      card.classList.add('open');
      card.cnt.textContent = card.f.n + ' 瓣';
    }
    el.appendChild(h('div', { class: 'flowers' }, cards));
    return {
      next: function () {
        for (var i = 0; i < cards.length; i++) if (!cards[i].classList.contains('open')) { open(cards[i]); return true; }
        return false;
      },
      prev: function () {
        for (var i = cards.length - 1; i >= 0; i--) if (cards[i].classList.contains('open')) {
          cards[i].classList.remove('open'); cards[i].cnt.textContent = '? 瓣'; return true;
        }
        return false;
      }
    };
  };

  /* ================= 斐波那契螺旋 ================= */
  Demos.fibspiral = function (el) {
    var W = 860, H = 560, MAXN = 11;
    var c = hiCanvas(W, H);
    // 预先算出每块正方形的位置（方向：右、上、左、下 循环）
    var sq = [], rect = { x: 0, y: 0, w: 1, h: 1 };
    sq.push({ x: 0, y: 0, s: 1, cx: 1, cy: 0, from: [0, 0], to: [1, 1] });
    for (var k = 1; k < MAXN; k++) {
      var s = fib(k + 1), q;
      var dir = (k - 1) % 4;
      if (dir === 0) { q = { x: rect.x + rect.w, y: rect.y, s: s }; q.cx = q.x; q.cy = q.y; rect.w += s; }
      else if (dir === 1) { q = { x: rect.x, y: rect.y - s, s: s }; q.cx = q.x; q.cy = q.y + s; rect.y -= s; rect.h += s; }
      else if (dir === 2) { q = { x: rect.x - s, y: rect.y, s: s }; q.cx = q.x + s; q.cy = q.y + s; rect.x -= s; rect.w += s; }
      else { q = { x: rect.x, y: rect.y + rect.h, s: s }; q.cx = q.x + s; q.cy = q.y; rect.h += s; }
      q.rect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      sq.push(q);
    }
    sq[0].rect = { x: 0, y: 0, w: 1, h: 1 };
    // 每块弧线：从上一块的终点出发
    var pt = [0, 0];
    sq.forEach(function (q, i) {
      if (i === 0) { q.cx = 1; q.cy = 0; }
      q.from = pt.slice();
      // 终点：圆心对面方向上、离起点 90° 的那个角
      var a0 = Math.atan2(q.from[1] - q.cy, q.from[0] - q.cx);
      var cands = [[q.x, q.y], [q.x + q.s, q.y], [q.x, q.y + q.s], [q.x + q.s, q.y + q.s]];
      var best = null;
      cands.forEach(function (p) {
        var d = Math.hypot(p[0] - q.cx, p[1] - q.cy);
        if (Math.abs(d - q.s) > 1e-6) return;
        var a = Math.atan2(p[1] - q.cy, p[0] - q.cx), da = Math.abs(Math.atan2(Math.sin(a - a0), Math.cos(a - a0)));
        if (Math.abs(da - Math.PI / 2) < 1e-6 && !best) best = p;
      });
      q.to = best || q.from;
      pt = q.to.slice();
    });
    var shown = 1, cam = null, auto = false;
    var COLORS = ['#FFE3A3', '#FFD0C2', '#CDEFE6', '#D6E6FF', '#E6DCFF', '#FFE0EF'];
    function target() {
      var r = sq[shown - 1].rect, pad = 1.18;
      var sc = Math.min(W / (r.w * pad), H / (r.h * pad));
      return { x: r.x + r.w / 2, y: r.y + r.h / 2, s: sc };
    }
    var lp = loop(function () {
      var t = target();
      if (!cam) cam = t;
      cam.x += (t.x - cam.x) * 0.12; cam.y += (t.y - cam.y) * 0.12; cam.s += (t.s - cam.s) * 0.12;
      draw();
      var done = Math.abs(t.s - cam.s) / t.s < 0.002 && Math.abs(t.x - cam.x) * t.s < 0.5;
      if (auto && done) {
        if (shown < MAXN) { shown++; } else auto = false;
      }
      if (done && !auto) { cam = t; draw(); return false; }
    });
    function draw() {
      var ctx = c.ctx;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(cam.s, cam.s);
      ctx.translate(-cam.x, -cam.y);
      var lw = 1 / cam.s;
      for (var i = 0; i < shown; i++) {
        var q = sq[i];
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fillRect(q.x, q.y, q.s, q.s);
        ctx.strokeStyle = '#1E2640'; ctx.lineWidth = 2 * lw;
        ctx.strokeRect(q.x, q.y, q.s, q.s);
        if (q.s * cam.s > 26) {
          ctx.fillStyle = 'rgba(30,38,64,.75)';
          ctx.font = '900 ' + Math.min(64, q.s * cam.s * 0.3) * lw + 'px sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(q.s, q.x + q.s / 2, q.y + q.s / 2);
        }
      }
      ctx.strokeStyle = '#F04E4B'; ctx.lineWidth = 6 * lw; ctx.lineCap = 'round';
      for (var j = 0; j < shown; j++) {
        var p = sq[j];
        var a0 = Math.atan2(p.from[1] - p.cy, p.from[0] - p.cx), a1 = Math.atan2(p.to[1] - p.cy, p.to[0] - p.cx);
        var d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.s, a0, a0 + d, d < 0);
        ctx.stroke();
      }
      ctx.restore();
    }
    function add() { if (shown < MAXN) { shown++; lp.start(); return true; } return false; }
    function reset() { shown = 1; auto = false; cam = null; lp.start(); }
    el.appendChild(h('div', { class: 'col' }, box(c, W, H),
      h('div', { class: 'btns' }, btn('＋ 加一块', add, 'primary'),
        btn('▶ 自动拼完', function () { auto = true; lp.start(); }), btn('↺ 重来', reset))));
    return {
      enter: function () { lp.start(); },
      leave: function () { lp.stop(); },
      next: function () { return add(); },
      prev: function () { if (shown > 1) { shown--; lp.start(); return true; } return false; }
    };
  };

  /* ================= 相邻两数之比 ================= */
  Demos.ratio = function (el) {
    var pairs = [];
    for (var i = 2; i <= 11; i++) pairs.push([fib(i), fib(i - 1)]);
    var shown = 1;
    var list = h('div', { class: 'ratio-list' });
    var W = 820, H = 150, PHI = (1 + Math.sqrt(5)) / 2;
    var line = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H });
    var x0 = 40, x1 = W - 40;
    function X(v) { return x0 + (v - 1) / 1 * (x1 - x0); }
    function render() {
      list.innerHTML = '';
      for (var i = 0; i < shown; i++) {
        var p = pairs[i], r = p[0] / p[1];
        list.appendChild(h('div', { html: p[0] + ' ÷ ' + p[1] + ' = <em>' + (Math.round(r * 1000) / 1000).toFixed(3) + '</em>' }));
      }
      while (line.firstChild) line.removeChild(line.firstChild);
      line.appendChild(svg('line', { x1: x0, y1: 90, x2: x1, y2: 90, stroke: '#1E2640', 'stroke-width': 3 }));
      [1, 1.5, 2].forEach(function (v) {
        line.appendChild(svg('line', { x1: X(v), y1: 82, x2: X(v), y2: 98, stroke: '#1E2640', 'stroke-width': 3 }));
        var t = svg('text', { x: X(v), y: 130, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 800, fill: '#5B6275' });
        t.textContent = v; line.appendChild(t);
      });
      line.appendChild(svg('line', { x1: X(PHI), y1: 20, x2: X(PHI), y2: 110, stroke: '#E9A400', 'stroke-width': 4, 'stroke-dasharray': '8 6' }));
      var tl = svg('text', { x: X(PHI), y: 18, 'text-anchor': 'middle', 'font-size': 24, 'font-weight': 900, fill: '#E9A400' });
      tl.textContent = '1.618…'; line.appendChild(tl);
      for (var j = 0; j < shown; j++) {
        var r2 = pairs[j][0] / pairs[j][1];
        line.appendChild(svg('circle', { cx: X(r2), cy: 90, r: j === shown - 1 ? 13 : 8, fill: j === shown - 1 ? '#F04E4B' : 'rgba(240,78,75,.35)' }));
      }
    }
    el.appendChild(list);
    el.appendChild(h('div', { class: 'card', style: 'padding:14px 20px' }, line));
    el.appendChild(h('div', { class: 'btns' }, btn('＋ 再算一个', function () { if (shown < pairs.length) { shown++; render(); } }, 'primary')));
    render();
    return {
      next: function () { if (shown < pairs.length) { shown++; render(); return true; } return false; },
      prev: function () { if (shown > 1) { shown--; render(); return true; } return false; }
    };
  };

  Demos.pentagram = function (el) {
    var R = 185, pts = [], PHI = (1 + Math.sqrt(5)) / 2;
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * TAU / 5;
      pts.push([R * Math.cos(a), R * Math.sin(a)]);
    }
    var s = svg('svg', { width: 430, height: 410, viewBox: '-215 -200 430 410' });
    var order = [0, 2, 4, 1, 3];
    s.appendChild(svg('polygon', { points: order.map(function (k) { return pts[k].join(','); }).join(' '), fill: '#FFE27A', stroke: 'none' }));
    for (var j = 0; j < 5; j++) {
      var p = pts[order[j]], q = pts[order[(j + 1) % 5]];
      s.appendChild(svg('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: '#C98A00', 'stroke-width': 3 }));
    }
    // 取一条线（顶点 0 → 顶点 2）：被截成 长 a、短 b、长 a 三段，a ÷ b = φ
    var A = pts[0], B = pts[2];
    function lerp(p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; }
    var t1 = PHI / (2 * PHI + 1);        // 第一个交点
    var P1 = lerp(A, B, t1), P2 = lerp(A, B, 1 - t1);
    var nx = -(B[1] - A[1]), ny = B[0] - A[0], nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
    var o = 13;
    // 红线 = a + b（从端点到较远的交点），绿线 = a（从端点到较近的交点）；(a+b) ÷ a = φ
    s.appendChild(svg('line', { x1: A[0] + nx * o, y1: A[1] + ny * o, x2: P2[0] + nx * o, y2: P2[1] + ny * o, stroke: '#F04E4B', 'stroke-width': 10, 'stroke-linecap': 'round' }));
    s.appendChild(svg('line', { x1: A[0] - nx * o, y1: A[1] - ny * o, x2: P1[0] - nx * o, y2: P1[1] - ny * o, stroke: '#12A38A', 'stroke-width': 10, 'stroke-linecap': 'round' }));
    [A, P1, P2].forEach(function (p) { s.appendChild(svg('circle', { cx: p[0], cy: p[1], r: 7, fill: '#1E2640' })); });
    el.appendChild(s);
  };

  /* ================= 巴恩斯利蕨 ================= */
  // data-mode="rules"：按“是哪条规则画出的点”上色，用来揭秘“整片叶子 = 茎 + 3 个缩小的自己”
  var FERN_RULE_COLORS = ['#8A5A2B', '#3BA55C', '#2F80ED', '#F08A00'];
  Demos.fern = function (el) {
    var W = 520, H = 640, TOTAL = 200000;
    var byRule = el.getAttribute('data-mode') === 'rules';
    var slow = el.getAttribute('data-speed') === 'slow';   // 开场用：约 15 秒慢慢长出来
    var c = hiCanvas(W, H);
    var x = 0, y = 0, n = 0;
    var ctx = c.ctx;
    function reset() { x = 0; y = 0; n = 0; ctx.fillStyle = '#FBFFF7'; ctx.fillRect(0, 0, W, H); }
    var lp = loop(function () {
      var per = byRule ? 4000 : slow ? (n < 1500 ? 10 : n < 20000 ? 100 : 400) : n < 3000 ? 60 : n < 20000 ? 600 : 2500;
      for (var i = 0; i < per && n < TOTAL; i++, n++) {
        var r = Math.random(), nx, ny, rule;
        if (r < 0.01) { nx = 0; ny = 0.16 * y; rule = 0; }
        else if (r < 0.86) { nx = 0.85 * x + 0.04 * y; ny = -0.04 * x + 0.85 * y + 1.6; rule = 1; }
        else if (r < 0.93) { nx = 0.2 * x - 0.26 * y; ny = 0.23 * x + 0.22 * y + 1.6; rule = 2; }
        else { nx = -0.15 * x + 0.28 * y; ny = 0.26 * x + 0.24 * y + 0.44; rule = 3; }
        x = nx; y = ny;
        var px = W / 2 + x * 58, py = H - 14 - y * 61.5;
        if (byRule) ctx.fillStyle = FERN_RULE_COLORS[rule];
        else {
          var g = Math.round(110 + 90 * (y / 10));
          ctx.fillStyle = 'rgb(' + Math.round(40 + 30 * (y / 10)) + ',' + g + ',' + Math.round(50 + 20 * (1 - y / 10)) + ')';
        }
        ctx.fillRect(px, py, rule === 0 && byRule ? 1.6 : 0.9, 0.9);
      }
      counter.textContent = '已画 ' + n.toLocaleString() + ' 个点';
      if (n >= TOTAL) return false;
    });
    var counter = h('div', { class: 'sf-label', style: 'text-align:center' }, '');
    reset();
    el.appendChild(h('div', { class: 'col', style: 'gap:10px' }, box(c, W, H),
      h('div', { class: 'btns', style: 'justify-content:center;align-items:center' },
        btn('🌱 重新生长', function () { reset(); lp.start(); }, 'sm'), counter)));
    return {
      enter: function () { if (n < TOTAL) lp.start(); },
      leave: function () { lp.stop(); }
    };
  };

  // 封面装饰：一片慢慢长出来的淡绿色蕨叶
  Demos.coverFern = function (el) {
    var W = 700, H = 880;
    var c = hiCanvas(W, H), ctx = c.ctx, x = 0, y = 0, n = 0, TOTAL = 120000;
    var lp = loop(function () {
      for (var i = 0; i < 1200 && n < TOTAL; i++, n++) {
        var r = Math.random(), nx, ny;
        if (r < 0.01) { nx = 0; ny = 0.16 * y; }
        else if (r < 0.86) { nx = 0.85 * x + 0.04 * y; ny = -0.04 * x + 0.85 * y + 1.6; }
        else if (r < 0.93) { nx = 0.2 * x - 0.26 * y; ny = 0.23 * x + 0.22 * y + 1.6; }
        else { nx = -0.15 * x + 0.28 * y; ny = 0.26 * x + 0.24 * y + 0.44; }
        x = nx; y = ny;
        ctx.fillStyle = 'hsla(' + Math.round(95 + 40 * y / 10) + ',55%,' + Math.round(38 + 18 * y / 10) + '%,.75)';
        ctx.fillRect(W / 2 + x * 78, H - 20 - y * 84, 1, 1);
      }
      if (n >= TOTAL) return false;
    });
    el.appendChild(c);
    return {
      enter: function () { ctx.clearRect(0, 0, W, H); n = 0; x = 0; y = 0; lp.start(); },
      leave: function () { lp.stop(); }
    };
  };

  /* ================= 分形树 ================= */
  Demos.tree = function (el) {
    var W = 860, H = 680;
    var c = hiCanvas(W, H);
    var angle = 25, depth = 9, ratio = 0.72, prog = 0, wind = false, bloom = false, t = 0;
    function branch(ctx, len, d, level) {
      var f = Math.max(0, Math.min(1, prog - level));
      if (f <= 0) return;
      var L = len * f;
      ctx.lineWidth = Math.max(1, len * 0.09);
      ctx.strokeStyle = level < depth - 3 ? '#7A4E2D' : level < depth - 1 ? '#6B8E23' : '#3BA55C';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L); ctx.stroke();
      if (level + 1 >= depth || f < 1) {
        if (bloom && f >= 1 && level + 1 >= depth) {
          ctx.fillStyle = (level * 7 + Math.floor(len)) % 3 ? '#FF9EC4' : '#FFC6DC';
          ctx.beginPath(); ctx.arc(0, -L, Math.max(2.5, len * 0.28), 0, TAU); ctx.fill();
        }
        return;
      }
      var sway = wind ? Math.sin(t * 1.6 + level * 0.9) * (2 + level * 1.1) : 0;
      ctx.save(); ctx.translate(0, -L); ctx.rotate((-angle + sway) * Math.PI / 180); branch(ctx, len * ratio, d, level + 1); ctx.restore();
      ctx.save(); ctx.translate(0, -L); ctx.rotate((angle + sway) * Math.PI / 180); branch(ctx, len * ratio, d, level + 1); ctx.restore();
    }
    function draw() {
      var ctx = c.ctx;
      ctx.clearRect(0, 0, W, H);
      var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#EAF6FF'); g.addColorStop(1, '#FFFFFF');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#CDEBC0'; ctx.fillRect(0, H - 34, W, 34);
      ctx.save(); ctx.translate(W / 2, H - 30); ctx.lineCap = 'round';
      var base = 170 * Math.min(1, 0.72 / ratio);
      branch(ctx, base, depth, 0);
      ctx.restore();
    }
    var lp = loop(function (ts) {
      t = ts / 1000;
      if (prog < depth) prog = Math.min(depth, prog + 0.06);
      draw();
      if (prog >= depth && !wind) return false;
    });
    function grow() { prog = 0; lp.start(); }
    function redraw() { prog = depth; if (!lp.running()) draw(); }
    var windBtn = btn('🌬 起风', function () { wind = !wind; windBtn.classList.toggle('on', wind); if (wind) lp.start(); else redraw(); });
    var bloomBtn = btn('🌸 开花', function () { bloom = !bloom; bloomBtn.classList.toggle('on', bloom); redraw(); });
    var sA = slider('分叉角度', 0, 90, 1, angle, function (v) { angle = v; redraw(); }, '°');
    var sD = slider('层数', 1, 12, 1, depth, function (v) { depth = v; redraw(); }, '');
    var sR = slider('缩短比例', 0.5, 0.8, 0.01, ratio, function (v) { ratio = v; redraw(); }, '');
    el.appendChild(box(c, W, H));
    el.appendChild(h('div', { class: 'col grow' },
      h('div', { class: 'card tint', style: 'font-size:27px' }, h('b', {}, '唯一的规则：'), h('br'), '树干分成两根短一点的树枝，每根树枝再', h('b', {}, '重复'), '这条规则。'),
      sA, sD, sR,
      h('div', { class: 'btns' }, btn('🌱 重新生长', grow, 'primary'), windBtn, bloomBtn),
      h('div', { class: 'callout', style: 'font-size:25px' }, '层数每加 1，树枝就翻一倍：', h('br'), '10 层 → 1 + 2 + 4 + … + 512 = ', h('b', {}, '1023'), ' 根！')
    ));
    return {
      enter: function () { if (prog === 0) grow(); else if (wind) lp.start(); else draw(); },
      leave: function () { lp.stop(); prog = depth; }
    };
  };

  /* ================= 科赫雪花 ================= */
  Demos.koch = function (el) {
    var S = 600, MAXIT = 5;
    var c = hiCanvas(S, S);
    var R = S * 0.44, cx = S / 2, cy = S / 2 + 10;
    function base() {
      var p = [];
      for (var i = 0; i < 3; i++) { var a = -Math.PI / 2 + i * TAU / 3; p.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
      return p;
    }
    function iterate(p, sgn) {
      var out = [], cs = Math.cos(sgn * Math.PI / 3), sn = Math.sin(sgn * Math.PI / 3);
      for (var i = 0; i < p.length; i++) {
        var A = p[i], B = p[(i + 1) % p.length];
        var dx = (B[0] - A[0]) / 3, dy = (B[1] - A[1]) / 3;
        var P = [A[0] + dx, A[1] + dy], Q = [A[0] + 2 * dx, A[1] + 2 * dy];
        out.push(A, P, [P[0] + dx * cs - dy * sn, P[1] + dx * sn + dy * cs], Q);
      }
      return out;
    }
    // 选择让小尖角朝外的方向：尖角应落在外接圆上
    var sgn = -1, test = iterate(base(), -1)[2];
    if (Math.hypot(test[0] - cx, test[1] - cy) < R * 0.9) sgn = 1;
    var polys = [base()];
    for (var k = 1; k <= MAXIT; k++) polys.push(iterate(polys[k - 1], sgn));
    var it = 0;
    var rows = [];
    var tbody = h('tbody');
    for (var r = 0; r <= MAXIT; r++) {
      var per = 27 * Math.pow(4 / 3, r);
      var tr = h('tr', {}, h('td', {}, '第 ' + r + ' 步'), h('td', {}, 3 * Math.pow(4, r)),
        h('td', {}, (Math.round(per * 10) / 10) + ' 厘米'));
      rows.push(tr); tbody.appendChild(tr);
    }
    function draw() {
      var ctx = c.ctx;
      ctx.clearRect(0, 0, S, S);
      ctx.setLineDash([10, 8]); ctx.strokeStyle = '#9DC2F7'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      var p = polys[it];
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
      for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.fillStyle = '#E3F0FF'; ctx.fill();
      ctx.strokeStyle = '#2F80ED'; ctx.lineWidth = it < 3 ? 4 : it < 5 ? 2.5 : 1.6; ctx.lineJoin = 'round'; ctx.stroke();
      rows.forEach(function (tr, k) { tr.className = k === it ? 'cur' : k > it ? 'hide' : ''; });
    }
    function fwd() { if (it < MAXIT) { it++; draw(); return true; } return false; }
    function back() { if (it > 0) { it--; draw(); return true; } return false; }
    el.appendChild(box(c, S, S));
    el.appendChild(h('div', { class: 'col grow' },
      h('div', { class: 'card tint', style: 'font-size:26px' }, '规则：把每条边分成 3 段，在', h('b', {}, '中间那段'), '上长出一个小尖角。一直重复……'),
      h('div', { class: 'card', style: 'padding:6px 16px' },
        h('table', { class: 'tbl compact' }, h('thead', {}, h('tr', {}, h('th', {}, '步骤'), h('th', {}, '边的条数'), h('th', {}, '周长（起始边长 9 厘米）'))), tbody)),
      h('div', { class: 'btns' }, btn('下一步 ▶', fwd, 'primary'), btn('◀ 上一步', back), btn('↺ 重来', function () { it = 0; draw(); })),
      h('div', { class: 'callout step', style: 'font-size:27px' }, '一直画下去：周长 → ', h('b', {}, '无限长'), '！', h('br'), '可雪花永远跑不出虚线圆 → 面积', h('b', {}, '有限'), '。')
    ));
    draw();
    return { next: fwd, prev: back };
  };

  /* ================= 混沌游戏（谢尔宾斯基三角形） ================= */
  Demos.chaos = function (el) {
    var W = 760, H = 660;
    var base = hiCanvas(W, H), over = hiCanvas(W, H);
    over.style.position = 'absolute'; over.style.left = '0'; over.style.top = '0';
    var V = [[W / 2, 58], [70, H - 76], [W - 70, H - 76]];
    var VC = ['#F04E4B', '#12A38A', '#2F80ED'];
    var LABEL = ['A（1、2）', 'B（3、4）', 'C（5、6）'];
    var cur = null, count = 0, anim = null, lastRoll = null;
    var info = h('div', { class: 'status-line' });
    function reset(start) {
      var ctx = base.ctx;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
      cur = start || [W / 2 + (Math.random() - 0.5) * 200, H / 2 + (Math.random() - 0.2) * 150];
      count = 0; anim = null; lastRoll = null;
      dot(cur, '#1E2640', 5);
      drawOver();
      info.innerHTML = '起点已选好。点“🎲 掷一次”试试！<br><span class="muted" style="font-size:22px">（也可以在画面上任意点一下，重新选起点）</span>';
    }
    function dot(p, col, r) { var ctx = base.ctx; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill(); }
    function drawOver() {
      var ctx = over.ctx;
      ctx.clearRect(0, 0, W, H);
      V.forEach(function (v, i) {
        ctx.fillStyle = VC[i]; ctx.beginPath(); ctx.arc(v[0], v[1], 14, 0, TAU); ctx.fill();
        ctx.font = '900 26px sans-serif'; ctx.textAlign = i === 0 ? 'left' : 'center'; ctx.textBaseline = 'middle';
        ctx.textAlign = i === 0 ? 'left' : i === 1 ? 'left' : 'right';
        ctx.fillText(LABEL[i], i === 0 ? v[0] + 24 : i === 1 ? v[0] - 14 : v[0] + 14, i === 0 ? v[1] : v[1] + 42);
      });
      if (anim) {
        ctx.setLineDash([8, 8]); ctx.strokeStyle = VC[anim.v]; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(anim.from[0], anim.from[1]); ctx.lineTo(V[anim.v][0], V[anim.v][1]); ctx.stroke(); ctx.setLineDash([]);
        var p = [anim.from[0] + (anim.to[0] - anim.from[0]) * anim.t, anim.from[1] + (anim.to[1] - anim.from[1]) * anim.t];
        ctx.fillStyle = '#1E2640'; ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, TAU); ctx.fill();
      } else if (cur && count < 300) {
        ctx.strokeStyle = '#1E2640'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cur[0], cur[1], 11, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = '#1E2640'; ctx.font = '800 22px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('已跳 ' + count.toLocaleString() + ' 次', W - 18, 34);
    }
    function roll() { var d = 1 + Math.floor(Math.random() * 6); return { d: d, v: d <= 2 ? 0 : d <= 4 ? 1 : 2 }; }
    function jump(v) {
      cur = [(cur[0] + V[v][0]) / 2, (cur[1] + V[v][1]) / 2];
      count++;
      dot(cur, VC[v], count < 200 ? 3.2 : 1.3);
    }
    var lp = loop(function () {
      if (!anim) return false;
      anim.t = Math.min(1, anim.t + 0.045);
      drawOver();
      if (anim.t >= 1) { jump(anim.v); anim = null; drawOver(); return false; }
    });
    function once() {
      if (anim) return;
      var r = roll(); lastRoll = r;
      info.innerHTML = '🎲 掷出 <b style="font-size:40px">' + r.d + '</b> → 向 <b style="color:' + VC[r.v] + '">' + 'ABC'[r.v] + '</b> 跳一半的路';
      var to = [(cur[0] + V[r.v][0]) / 2, (cur[1] + V[r.v][1]) / 2];
      anim = { from: cur.slice(), to: to, v: r.v, t: 0 };
      lp.start();
    }
    function many(n) {
      if (anim) { jump(anim.v); anim = null; lp.stop(); }
      var done = 0;
      var fast = loop(function () {
        var chunk = Math.min(n - done, Math.max(5, Math.ceil(n / 40)));
        for (var i = 0; i < chunk; i++) jump(roll().v);
        done += chunk;
        drawOver();
        if (done >= n) {
          info.innerHTML = count >= 3000 ? '看！乱跳跳出了<b>谢尔宾斯基三角形</b>——三角形里套三角形，一个分形！' : '继续跳，看看会出现什么……';
          return false;
        }
      });
      fast.start();
    }
    over.addEventListener('pointerdown', function (e) { var p = pointerPos(over, e); reset([p.x, p.y]); });
    var wrap = box(base, W, H); wrap.appendChild(over);
    el.appendChild(h('div', { class: 'col grow' },
      h('div', { class: 'card tint', style: 'font-size:25px' },
        h('ol', { class: 'rules', style: 'font-size:25px;line-height:1.55' },
          h('li', {}, '随便选一个起点'),
          h('li', {}, '掷骰子：1、2 → A　3、4 → B　5、6 → C'),
          h('li', {}, '朝那个角跳 ', h('b', {}, '一半的路'), '，留下一个点'),
          h('li', {}, '重复很多很多次……'))),
      h('div', { class: 'card step', style: 'font-size:27px' }, '🤔 投票：最后会出现什么？', h('br'),
        'A. 乱糟糟的一团　B. 一个圆　C. 别的图案'),
      info,
      h('div', { class: 'btns' }, btn('🎲 掷一次', once, 'primary'), btn('×100', function () { many(100); }),
        btn('×1000', function () { many(1000); }), btn('×10000', function () { many(10000); }), btn('↺ 重来', function () { reset(); }))));
    el.appendChild(wrap);
    reset();
    return { leave: function () { lp.stop(); if (anim) { jump(anim.v); anim = null; drawOver(); } } };
  };

  /* ================= 莫比乌斯带 3D ================= */
  Demos.mobius = function (el) {
    var W = 720, H = 560;
    var c = hiCanvas(W, H);
    var mode = 'ring', antU = null, trail = [], th = 0.6, running = false;
    var R = 2, HW = 0.7, NU = 120, NV = 5, D = 9, F = 1050, TILT = 1.02;
    var status = h('div', { class: 'status-line' });
    function P(u, v) {
      if (mode === 'ring') return [R * Math.cos(u), R * Math.sin(u), v];
      var r = R + v * Math.cos(u / 2);
      return [r * Math.cos(u), r * Math.sin(u), v * Math.sin(u / 2)];
    }
    function N(u) { // v = 0 处的法向量（莫比乌斯带绕一圈后会反向）
      var e = 1e-4, p0 = P(u, 0), pu = P(u + e, 0), pv = P(u, e);
      var a = [pu[0] - p0[0], pu[1] - p0[1], pu[2] - p0[2]], b = [pv[0] - p0[0], pv[1] - p0[1], pv[2] - p0[2]];
      var n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      var l = Math.hypot(n[0], n[1], n[2]); return [n[0] / l, n[1] / l, n[2] / l];
    }
    function antSide() { return mode === 'ring' ? 1 : -1; }
    function xf(p) {
      var ct = Math.cos(th), st = Math.sin(th);
      var x1 = p[0] * ct - p[1] * st, y1 = p[0] * st + p[1] * ct, z1 = p[2];
      var cp = Math.cos(TILT), sp = Math.sin(TILT);
      return [x1, y1 * cp - z1 * sp, y1 * sp + z1 * cp];
    }
    function xfv(n) { return xf(n); } // 旋转不含平移，向量同样适用
    function proj(q) { var s = F / (D + q[1]); return [W / 2 + q[0] * s * 0.62, H / 2 + 10 - q[2] * s * 0.62]; }
    function facing(q, n) { return n[0] * (0 - q[0]) + n[1] * (-D - q[1]) + n[2] * (0 - q[2]) > 0; }
    function draw() {
      var ctx = c.ctx;
      ctx.clearRect(0, 0, W, H);
      var prims = [];
      var L = [-0.3, -0.8, 0.5]; var ll = Math.hypot(L[0], L[1], L[2]); L = [L[0] / ll, L[1] / ll, L[2] / ll];
      for (var i = 0; i < NU; i++) {
        var u0 = i / NU * TAU, u1 = (i + 1) / NU * TAU;
        for (var j = 0; j < NV; j++) {
          var v0 = -HW + j / NV * 2 * HW, v1 = -HW + (j + 1) / NV * 2 * HW;
          var w = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)].map(xf);
          var z = (w[0][1] + w[1][1] + w[2][1] + w[3][1]) / 4;
          var a = [w[1][0] - w[0][0], w[1][1] - w[0][1], w[1][2] - w[0][2]], b = [w[3][0] - w[0][0], w[3][1] - w[0][1], w[3][2] - w[0][2]];
          var n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          var nl = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
          var ctr = [(w[0][0] + w[2][0]) / 2, (w[0][1] + w[2][1]) / 2, (w[0][2] + w[2][2]) / 2];
          var front = facing(ctr, n);
          var lum = 0.62 + 0.38 * Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
          var col;
          if (mode === 'ring') col = front ? [70, 140, 240] : [255, 160, 60];   // 外面蓝、里面橙
          else col = [150, 120, 240];
          col = 'rgb(' + Math.round(col[0] * lum) + ',' + Math.round(col[1] * lum) + ',' + Math.round(col[2] * lum) + ')';
          var q = w.map(proj);
          prims.push({ z: z, k: 0, draw: (function (q, col) { return function () {
            ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (var m = 1; m < 4; m++) ctx.lineTo(q[m][0], q[m][1]); ctx.closePath(); ctx.fill(); ctx.stroke();
          }; })(q, col) });
          if (j === (NV - 1) / 2) prims[prims.length - 1].center = i;
        }
      }
      // 边线
      [-HW, HW].forEach(function (v) {
        for (var i = 0; i < NU; i++) {
          var a = xf(P(i / NU * TAU, v)), b = xf(P((i + 1) / NU * TAU, v));
          prims.push({ z: (a[1] + b[1]) / 2 - 0.02, draw: (function (a, b) { return function () {
            var p = proj(a), q = proj(b); ctx.strokeStyle = 'rgba(30,38,64,.85)'; ctx.lineWidth = 2.2;
            ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
          }; })(a, b) });
        }
      });
      // 蚂蚁的足迹
      var EPS = 0.05, sd = antSide();
      function onSurf(u) {
        var p = P(u, 0), n = N(u);
        return { p: xf([p[0] + n[0] * EPS * sd, p[1] + n[1] * EPS * sd, p[2] + n[2] * EPS * sd]), n: xfv([n[0] * sd, n[1] * sd, n[2] * sd]) };
      }
      for (var t = 1; t < trail.length; t++) {
        var A = onSurf(trail[t - 1]), B = onSurf(trail[t]);
        var vis = facing(A.p, A.n);
        var um = ((trail[t] % TAU) + TAU) % TAU;
        var ci = Math.min(NU - 1, Math.floor(um / TAU * NU));
        var cz = xf(P((ci + 0.5) / NU * TAU, 0))[1];
        prims.push({ z: cz + (vis ? -0.03 : 0.03), draw: (function (A, B) { return function () {
          var p = proj(A.p), q = proj(B.p); ctx.strokeStyle = '#FF3B30'; ctx.lineWidth = 5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        }; })(A, B) });
      }
      prims.sort(function (a, b) { return b.z - a.z; });
      prims.forEach(function (p) { p.draw(); });
      if (antU !== null) {
        var S = onSurf(antU), sp = proj(S.p), vis2 = facing(S.p, S.n);
        ctx.save(); ctx.globalAlpha = vis2 ? 1 : 0.35;
        ctx.font = '40px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🐜', sp[0], sp[1]);
        ctx.restore();
      }
    }
    var lp = loop(function () {
      th += 0.004;
      if (antU !== null && antU < 2 * TAU) {
        antU = Math.min(2 * TAU, antU + 0.022);
        trail.push(antU);
        var laps = antU / TAU;
        if (mode === 'ring') {
          status.innerHTML = laps >= 2 ? '爬了 2 圈，蚂蚁还在<b>外面</b>（蓝色），<br>里面（橙色）一点都没爬到 → <b>2 个面</b>' : '蚂蚁在纸环外面爬……';
        } else {
          status.innerHTML = laps >= 2 ? '爬完第 2 圈，回到出发点！没翻过边，<br>却爬遍了整条带子 → 只有 <b>1 个面</b>！'
            : laps >= 1 ? '第 1 圈结束：回到了起点的<b>背面</b>！继续爬……' : '蚂蚁在莫比乌斯带上爬……';
        }
        if (antU >= 2 * TAU) running = false;
      }
      draw();
    });
    function setMode(m) {
      mode = m; antU = null; trail = []; running = false;
      ringBtn.classList.toggle('on', m === 'ring'); mobBtn.classList.toggle('on', m === 'mobius');
      status.innerHTML = m === 'ring' ? '普通纸环：外面<b style="color:#2F80ED">蓝色</b>，里面<b style="color:#F08A00">橙色</b>。' : '莫比乌斯带：扭了半圈的纸环。';
      draw();
    }
    function go() { antU = 0; trail = [0]; running = true; }
    var ringBtn = btn('⭕ 普通纸环', function () { setMode('ring'); });
    var mobBtn = btn('🎗️ 莫比乌斯带', function () { setMode('mobius'); });
    el.appendChild(h('div', { class: 'col' }, box(c, W, H),
      h('div', { class: 'btns' }, ringBtn, mobBtn, btn('🐜 蚂蚁出发', go, 'primary')), status));
    setMode('ring');
    return { enter: function () { lp.start(); }, leave: function () { lp.stop(); } };
  };

  /* ================= 凯撒密码轮 ================= */
  Demos.caesar = function (el) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', shift = 3, SZ = 560, C = SZ / 2;
    var wheel = svg('svg', { class: 'caesar-wheel', viewBox: '0 0 ' + SZ + ' ' + SZ });
    wheel.appendChild(svg('circle', { cx: C, cy: C, r: 270, fill: '#FFEDEC', stroke: '#F04E4B', 'stroke-width': 4 }));
    for (var i = 0; i < 26; i++) {
      var a = (i / 26) * TAU - Math.PI / 2;
      var t = svg('text', { x: C + 238 * Math.cos(a), y: C + 238 * Math.sin(a) + 11, 'text-anchor': 'middle', 'font-size': 32, fill: '#1E2640' });
      t.textContent = A[i]; wheel.appendChild(t);
      var a2 = ((i + 0.5) / 26) * TAU - Math.PI / 2;
      wheel.appendChild(svg('line', { x1: C + 212 * Math.cos(a2), y1: C + 212 * Math.sin(a2), x2: C + 266 * Math.cos(a2), y2: C + 266 * Math.sin(a2), stroke: '#FFB1AF', 'stroke-width': 2 }));
    }
    var inner = svg('g', { class: 'caesar-inner' });
    inner.appendChild(svg('circle', { cx: C, cy: C, r: 208, fill: '#1E2640' }));
    for (var j = 0; j < 26; j++) {
      var b = (j / 26) * TAU - Math.PI / 2;
      var t2 = svg('text', { x: C + 178 * Math.cos(b), y: C + 178 * Math.sin(b) + 11, 'text-anchor': 'middle', 'font-size': 30, fill: '#FFD166' });
      t2.textContent = A[j]; inner.appendChild(t2);
    }
    inner.appendChild(svg('circle', { cx: C, cy: C, r: 120, fill: '#2B3558' }));
    var keyText = svg('text', { x: C, y: C - 10, 'text-anchor': 'middle', 'font-size': 30, fill: '#fff' });
    var keyNum = svg('text', { x: C, y: C + 48, 'text-anchor': 'middle', 'font-size': 64, fill: '#FFD166' });
    var labOut = svg('text', { x: C, y: 18, 'text-anchor': 'middle', 'font-size': 14, fill: '#F04E4B' });
    wheel.appendChild(inner);
    // 中心文字不随内圈旋转
    var center = svg('g'); center.appendChild(keyText); center.appendChild(keyNum); wheel.appendChild(center);
    wheel.appendChild(labOut);
    // 指示箭头
    wheel.appendChild(svg('path', { d: 'M' + (C - 16) + ' 6 L' + (C + 16) + ' 6 L' + C + ' 30 Z', fill: '#F04E4B' }));
    function setShift(s) {
      shift = ((s % 26) + 26) % 26;
      inner.setAttribute('transform', 'rotate(' + (-shift * 360 / 26) + ' ' + C + ' ' + C + ')');
      keyText.textContent = '密钥';
      keyNum.textContent = shift;
      keyLabel.innerHTML = '密钥 <b>' + shift + '</b>：外圈 A → 内圈 <b>' + A[shift] + '</b>';
      translate();
    }
    // 拖动内圈
    var drag = null;
    function ang(e) {
      var r = wheel.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    }
    inner.addEventListener('pointerdown', function (e) {
      drag = { a: ang(e), s: shift }; inner.classList.add('drag');
      wheel.setPointerCapture && wheel.setPointerCapture(e.pointerId);
    });
    wheel.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var d = ang(e) - drag.a;
      var steps = Math.round(-d / (TAU / 26));
      var s = drag.s + steps;
      inner.setAttribute('transform', 'rotate(' + (-(drag.s * 360 / 26) + d * 180 / Math.PI) + ' ' + C + ' ' + C + ')');
      if ((((s % 26) + 26) % 26) !== shift) { shift = ((s % 26) + 26) % 26; keyNum.textContent = shift; keyLabel.innerHTML = '密钥 <b>' + shift + '</b>：外圈 A → 内圈 <b>' + A[shift] + '</b>'; translate(); }
    });
    function endDrag() { if (!drag) return; drag = null; inner.classList.remove('drag'); setShift(shift); }
    wheel.addEventListener('pointerup', endDrag);
    wheel.addEventListener('pointercancel', endDrag);

    var keyLabel = h('div', { class: 'sf-label', style: 'font-size:26px;color:#1E2640' });
    var input = h('input', { type: 'text', placeholder: '输入拼音，如 WO AI SHU XUE', maxlength: 40, spellcheck: 'false' });
    var out = h('div', { class: 'tr-out' }, '');
    var mode = 'dec';
    function tr(s, k) {
      return s.toUpperCase().replace(/[A-Z]/g, function (ch) { return A[(A.indexOf(ch) + k + 26) % 26]; });
    }
    function translate() {
      var v = input.value;
      out.textContent = v ? (mode === 'enc' ? '密文：' + tr(v, shift) : '明文：' + tr(v, -shift)) : '';
    }
    input.addEventListener('input', translate);
    var encBtn = btn('🔒 加密', function () { mode = 'enc'; encBtn.classList.add('on'); decBtn.classList.remove('on'); translate(); }, 'sm');
    var decBtn = btn('🔓 解密', function () { mode = 'dec'; decBtn.classList.add('on'); encBtn.classList.remove('on'); translate(); }, 'sm on');
    var wheelCol = h('div', { class: 'col', style: 'flex:none;align-items:center;gap:10px' },
      wheel,
      h('div', { class: 'btns', style: 'align-items:center' }, btn('－', function () { setShift(shift - 1); }, 'sm'), keyLabel, btn('＋', function () { setShift(shift + 1); }, 'sm')));
    el.insertBefore(wheelCol, el.firstChild);
    var side = el.querySelector('.caesar-side');
    (side || el).appendChild(h('div', { class: 'card tr-box', style: 'padding:14px 20px' },
      h('div', { class: 'btns', style: 'align-items:center' }, h('b', { style: 'font-size:24px' }, '🤖 翻译机'), decBtn, encBtn), input, out));
    setShift(3);
    return {};
  };


  /* ================= 斐波那契加法魔术 ================= */
  // 任选两个数开头，照“前两个相加”写满 10 个数；总和永远 = 11 × 第 7 个数。
  window.FibMagicMemory = null;
  Demos.fibMagic = function (el) {
    var a = null, b = null, shown = 0, sealed = false, summed = false, opened = false;
    var boxes = [], terms = [];
    function calc() { terms = [a, b]; for (var i = 2; i < 10; i++) terms.push(terms[i - 1] + terms[i - 2]); }
    var row = h('div', { class: 'seq', style: 'gap:14px;margin:26px 0 58px' });
    for (var i = 0; i < 10; i++) {
      var bx = h('div', { class: 'nbox', style: 'width:122px;height:112px;font-size:50px' }, '');
      bx.appendChild(h('span', { class: 'plus', style: 'bottom:-34px' }, '第 ' + (i + 1) + ' 个'));
      boxes.push(bx); row.appendChild(bx);
    }
    var sumEl = h('div', { class: 'magic-out' });
    var env = h('div', { class: 'card', style: 'display:none;align-items:center;gap:16px;font-size:30px;font-weight:800;padding:14px 26px' });
    function pickRow(label, which) {
      var bs = [];
      for (var n = 1; n <= 9; n++) (function (n) {
        var x = btn(String(n), function () {
          if (which === 0) a = n; else b = n;
          bs.forEach(function (y) { y.classList.toggle('on', y === x); });
          start();
        }, 'sm');
        x.style.minWidth = '60px';
        bs.push(x);
      })(n);
      return { el: h('div', { class: 'btns', style: 'align-items:center' }, h('b', { style: 'font-size:24px;width:5em' }, label), bs), bs: bs };
    }
    var r1 = pickRow('第 1 个数', 0), r2 = pickRow('第 2 个数', 1);
    function start() {
      shown = 0; sealed = false; summed = false; opened = false;
      if (a !== null && b !== null) { calc(); shown = 2; }
      render();
    }
    function render() {
      boxes.forEach(function (bx, i) {
        bx.firstChild.textContent = i < shown ? terms[i] : (i === 0 && a !== null ? a : i === 1 && b !== null ? b : '');
        bx.classList.toggle('q', i === 6 && shown >= 7);
      });
      env.style.display = sealed ? 'flex' : 'none';
      env.innerHTML = '✉️ 老师的预言：' + (opened
        ? '<span class="num" style="display:inline-block;background:#1E2640;color:#FFD166;padding:0 24px;border-radius:16px;font-size:52px;animation:pop .6s">' + 11 * terms[6] + '</span>　一模一样！🎉'
        : '<span style="letter-spacing:6px;color:#9AA0AE">（封好了，最后再打开）</span>');
      if (summed) {
        var total = terms.reduce(function (x, y) { return x + y; }, 0);
        sumEl.innerHTML = '<span class="eq">10 个数的总和 = </span><span class="num">' + total + '</span>';
        window.FibMagicMemory = { a: a, b: b, terms: terms.slice(), sum: total };
      } else sumEl.innerHTML = '';
    }
    function fwd() {
      if (a === null || b === null) return false;
      if (shown < 7) { shown++; render(); return true; }
      if (!sealed) { sealed = true; render(); return true; }
      if (shown < 10) { shown++; render(); return true; }
      if (!summed) { summed = true; render(); return true; }
      if (!opened) { opened = true; render(); return true; }
      return false;
    }
    function back() {
      if (a === null || b === null) return false;
      if (opened) { opened = false; render(); return true; }
      if (summed) { summed = false; render(); return true; }
      if (shown > 7) { shown--; render(); return true; }
      if (sealed) { sealed = false; render(); return true; }
      if (shown > 2) { shown--; render(); return true; }
      return false;
    }
    function random() {
      a = 1 + Math.floor(Math.random() * 9); b = 1 + Math.floor(Math.random() * 9);
      r1.bs.forEach(function (y, i) { y.classList.toggle('on', i + 1 === a); });
      r2.bs.forEach(function (y, i) { y.classList.toggle('on', i + 1 === b); });
      start();
    }
    el.appendChild(h('div', { class: 'col', style: 'gap:10px' }, r1.el, r2.el));
    el.appendChild(row);
    el.appendChild(h('div', { class: 'btns', style: 'align-items:center' },
      btn('下一步 ▶', fwd, 'primary'), btn('🎲 随机两个数', random), btn('↺ 重来', function () {
        a = b = null; r1.bs.concat(r2.bs).forEach(function (y) { y.classList.remove('on'); }); start();
      }), env));
    el.appendChild(sumEl);
    start();
    return { next: fwd, prev: back };
  };

  Demos.fibMagicSecret = function (el) {
    var tbl = h('table', { class: 'tbl compact' });
    var out = h('div', { class: 'magic-out', style: 'margin-top:12px' });
    function render() {
      var m = window.FibMagicMemory, a = m ? m.a : 3, b = m ? m.b : 5;
      var ca = [1, 0], cb = [0, 1];
      for (var i = 2; i < 10; i++) { ca.push(ca[i - 1] + ca[i - 2]); cb.push(cb[i - 1] + cb[i - 2]); }
      var html = '<thead><tr><th>第几个</th><th>含几个 ' + a + '（第1个数）</th><th>含几个 ' + b + '（第2个数）</th><th>这个数</th></tr></thead><tbody>';
      for (var k = 0; k < 10; k++) {
        html += '<tr' + (k === 6 ? ' class="cur"' : '') + '><td>第 ' + (k + 1) + ' 个</td><td>' + ca[k] + '</td><td>' + cb[k] + '</td><td>' + (ca[k] * a + cb[k] * b) + '</td></tr>';
      }
      html += '<tr style="font-weight:900"><td>合计</td><td style="color:#F04E4B">55</td><td style="color:#F04E4B">88</td><td>' + (55 * a + 88 * b) + '</td></tr></tbody>';
      tbl.innerHTML = html;
      out.innerHTML = '<span class="eq" style="font-size:30px">' + (m ? '开场的例子：' : '例如 3 和 5：') + '总和 = 11 × 第 7 个数 = 11 × <em>' + (5 * a + 8 * b) + '</em> = </span><span class="num" style="font-size:44px">' + (55 * a + 88 * b) + '</span>';
    }
    el.appendChild(h('div', { class: 'card', style: 'padding:8px 16px' }, tbl));
    el.appendChild(out);
    return { enter: render };
  };

  /* ================= 数螺旋的向日葵花盘 ================= */
  Demos.seedHead = function (el) {
    var S = 620, N = 520;
    var c = hiCanvas(S, S), k = 0;
    function draw() {
      var ctx = c.ctx;
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = '#FFF6DB'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 4, 0, TAU); ctx.fill();
      var cols = k ? armColors(k, N, GOLDEN_ANGLE) : null;
      drawSeeds(ctx, S / 2, S / 2, N, GOLDEN_ANGLE, (S / 2 - 20) / Math.sqrt(N), function (i) {
        return k ? cols[i % k] : seedColor(i, N);
      }, 0.47);
    }
    var bs = [0, 13, 21, 34].map(function (n) {
      var x = btn(n ? '涂出 ' + n + ' 条' : '原样', function () { k = n; bs.forEach(function (y) { y.classList.toggle('on', y === x); }); draw(); }, 'sm');
      return x;
    });
    el.appendChild(h('div', { class: 'col', style: 'align-items:center;gap:10px' }, box(c, S, S), h('div', { class: 'btns' }, bs)));
    draw();
    return {};
  };

  /* ================= 叶子的排列（俯视图） ================= */
  Demos.leaves = function (el) {
    var S = 560, angle = 180, NL = 14;
    var c = hiCanvas(S, S);
    function draw() {
      var ctx = c.ctx;
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = '#FFFDF5'; ctx.fillRect(0, 0, S, S);
      // 从下往上画：下面的叶子长，上面的叶子短，上面的会挡住下面的阳光
      for (var i = 0; i < NL; i++) {
        var len = 250 - i * 12, a = i * angle * Math.PI / 180;
        ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(a);
        ctx.fillStyle = 'rgba(46,160,67,.42)'; ctx.strokeStyle = 'rgba(20,90,40,.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(len / 2 + 10, 0, len / 2, 26, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#7A4E2D'; ctx.beginPath(); ctx.arc(S / 2, S / 2, 12, 0, TAU); ctx.fill();
      ctx.font = '800 22px sans-serif'; ctx.fillStyle = '#1E2640'; ctx.textAlign = 'left';
      ctx.fillText('☀️ 从上往下看（颜色越深 = 挡得越多）', 14, 32);
    }
    var bs = [180, 120, 90, 137.5].map(function (a) {
      var real = a === 137.5 ? GOLDEN_ANGLE : a;
      var x = btn(a === 137.5 ? '137.5° ⭐' : a + '°', function () { angle = real; bs.forEach(function (y) { y.classList.toggle('on', y === x); }); draw(); }, 'sm');
      if (a === 180) x.classList.add('on');
      return x;
    });
    el.appendChild(h('div', { class: 'col', style: 'align-items:center;gap:10px' }, box(c, S, S), h('div', { class: 'btns' }, bs)));
    draw();
    return {};
  };

  /* ================= 谢尔宾斯基三角形（一步步挖洞） ================= */
  Demos.sierpinski = function (el) {
    var S = 600, TH = Math.round(560 * Math.sqrt(3) / 2), HGT = TH + 40, MAXIT = 6;
    var c = hiCanvas(S, HGT);
    var A = [S / 2, 20], B = [20, 20 + TH], C = [S - 20, 20 + TH];
    var it = 0;
    function mid(p, q) { return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }
    function tri(ctx, a, b, cc, d) {
      if (d === 0) {
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(cc[0], cc[1]); ctx.closePath(); ctx.fill();
        return;
      }
      var ab = mid(a, b), bc = mid(b, cc), ca = mid(cc, a);
      tri(ctx, a, ab, ca, d - 1); tri(ctx, ab, b, bc, d - 1); tri(ctx, ca, bc, cc, d - 1);
    }
    var tbody = h('tbody'), rows = [];
    for (var r = 0; r <= MAXIT; r++) {
      var tr = h('tr', {}, h('td', {}, '第 ' + r + ' 步'), h('td', {}, Math.pow(3, r)),
        h('td', {}, (Math.round(Math.pow(0.75, r) * 1000) / 10) + '%'));
      rows.push(tr); tbody.appendChild(tr);
    }
    function draw() {
      var ctx = c.ctx;
      ctx.clearRect(0, 0, S, HGT);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#12A38A';
      tri(ctx, A, B, C, it);
      ctx.strokeStyle = '#0B6E5D'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.stroke();
      rows.forEach(function (tr, k) { tr.className = k === it ? 'cur' : k > it ? 'hide' : ''; });
    }
    function fwd() { if (it < MAXIT) { it++; draw(); return true; } return false; }
    function back() { if (it > 0) { it--; draw(); return true; } return false; }
    el.appendChild(box(c, S, HGT));
    el.appendChild(h('div', { class: 'col grow' },
      h('div', { class: 'card tint', style: 'font-size:26px' }, '规则：把每个绿色三角形的三条边的', h('b', {}, '中点'), '连起来，', h('b', {}, '挖掉中间'), '那个倒着的三角形。一直重复……'),
      h('div', { class: 'card', style: 'padding:6px 16px' },
        h('table', { class: 'tbl compact' }, h('thead', {}, h('tr', {}, h('th', {}, '步骤'), h('th', {}, '绿色三角形个数'), h('th', {}, '剩下的面积'))), tbody)),
      h('div', { class: 'btns' }, btn('挖一次 ▶', fwd, 'primary'), btn('◀ 上一步', back), btn('↺ 重来', function () { it = 0; draw(); }))
    ));
    draw();
    return { next: fwd, prev: back };
  };

  /* ================= 海岸线有多长（用不同长度的尺子量） ================= */
  Demos.coastline = function (el) {
    var W = 860, H = 520, PX_PER_KM = 2;
    var c = hiCanvas(W, H);
    // 固定随机种子，保证每次打开海岸线都一样
    var seed = 20240917;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    // 随机版“科赫曲线”：每段都在中间随机朝陆地或大海拱出一个弯，弯里再有弯
    var pts = [[30, 270], [W * 0.36, 230], [W * 0.62, 300], [W - 30, 260]];
    for (var lv = 0; lv < 5; lv++) {
      var np = [pts[0]];
      for (var i = 1; i < pts.length; i++) {
        var p = pts[i - 1], q = pts[i];
        var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
        var a = 0.3 + rnd() * 0.08, b = 0.62 + rnd() * 0.08, mid = (a + b) / 2;
        var hgt = (0.2 + rnd() * 0.16) * len * (rnd() < 0.5 ? -1 : 1);
        np.push([p[0] + dx * a, p[1] + dy * a]);
        np.push([p[0] + dx * mid - dy / len * hgt, p[1] + dy * mid + dx / len * hgt]);
        np.push([p[0] + dx * b, p[1] + dy * b]);
        np.push(q);
      }
      pts = np;
    }
    // 用两脚规沿海岸线“走”：每一步都是一把固定长度的尺子
    function walk(step) {
      var out = [pts[0].slice()], cur = pts[0], i = 1, total = 0;
      while (i < pts.length) {
        var p = pts[i - 1], q = pts[i];
        if (Math.hypot(q[0] - cur[0], q[1] - cur[1]) < step) { i++; continue; }
        // 在线段 p→q 上找离 cur 恰好 step 的点
        var dx = q[0] - p[0], dy = q[1] - p[1], fx = p[0] - cur[0], fy = p[1] - cur[1];
        var a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), cc = fx * fx + fy * fy - step * step;
        var t = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * cc))) / (2 * a);
        cur = [p[0] + dx * t, p[1] + dy * t];
        out.push(cur); total += step;
      }
      var end = pts[pts.length - 1], rest = Math.hypot(end[0] - cur[0], end[1] - cur[1]);
      if (rest > 0.5) { out.push(end.slice()); total += rest; }
      return { pts: out, len: total };
    }
    var RULERS = [100, 50, 25, 12, 6];
    var result = null, shownSeg = 0, results = {};
    function draw() {
      var ctx = c.ctx;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#CFE8FF'; ctx.fillRect(0, 0, W, H);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, pts[0][1]);
      pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
      ctx.lineTo(W, pts[pts.length - 1][1]); ctx.lineTo(W, 0); ctx.closePath();
      ctx.fillStyle = '#E8DDB5'; ctx.fill();
      ctx.strokeStyle = '#8A6A3A'; ctx.lineWidth = 1.5;
      ctx.beginPath(); pts.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
      ctx.font = '800 26px sans-serif'; ctx.fillStyle = 'rgba(90,70,30,.6)'; ctx.fillText('陆地', 40, 60);
      ctx.fillStyle = 'rgba(30,80,160,.55)'; ctx.fillText('大海', 40, H - 40);
      // 比例尺
      ctx.fillStyle = '#1E2640'; ctx.fillRect(W - 230, H - 40, 100 * PX_PER_KM, 6);
      ctx.font = '700 18px sans-serif'; ctx.fillText('100 公里', W - 170, H - 50);
      if (result) {
        ctx.strokeStyle = '#F04E4B'; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (var k = 0; k <= shownSeg && k < result.pts.length; k++) {
          var p = result.pts[k]; if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
        }
        ctx.stroke();
        ctx.fillStyle = '#1E2640';
        for (var m = 0; m <= shownSeg && m < result.pts.length; m++) {
          ctx.beginPath(); ctx.arc(result.pts[m][0], result.pts[m][1], result.pts.length > 60 ? 2.5 : 5, 0, TAU); ctx.fill();
        }
      }
    }
    var lp = loop(function () {
      if (!result) return false;
      shownSeg += Math.max(1, Math.ceil(result.pts.length / 60));
      draw();
      if (shownSeg >= result.pts.length) { renderTable(); return false; }
    });
    var tbody = h('tbody');
    function renderTable() {
      tbody.innerHTML = '';
      RULERS.forEach(function (r) {
        var res = results[r];
        tbody.appendChild(h('tr', { class: result && result.r === r ? 'cur' : '' }, h('td', {}, r + ' 公里'),
          h('td', {}, res ? res.steps : '?'), h('td', {}, res ? Math.round(res.len) + ' 公里' : '?')));
      });
    }
    var rbtns = RULERS.map(function (r) {
      var b = btn(r + ' 公里', function () { measure(r); }, 'sm');
      b.r = r; return b;
    });
    function measure(r) {
      var w = walk(r * PX_PER_KM);
      result = { r: r, pts: w.pts };
      results[r] = { steps: w.pts.length - 1, len: w.len / PX_PER_KM };
      shownSeg = 0;
      rbtns.forEach(function (b) { b.classList.toggle('on', b.r === r); });
      renderTable(); lp.start();
    }
    function nextRuler() {
      for (var i = 0; i < RULERS.length; i++) if (!results[RULERS[i]]) { measure(RULERS[i]); return true; }
      return false;
    }
    el.appendChild(h('div', { class: 'col', style: 'gap:10px' }, box(c, W, H),
      h('div', { class: 'btns', style: 'align-items:center' }, h('b', { style: 'font-size:24px' }, '📏 尺子长度：'), rbtns)));
    el.appendChild(h('div', { class: 'col grow' },
      h('div', { class: 'card', style: 'padding:6px 16px' },
        h('table', { class: 'tbl compact' }, h('thead', {}, h('tr', {}, h('th', {}, '尺子'), h('th', {}, '量了几步'), h('th', {}, '量出的长度'))), tbody)),
      h('div', { class: 'card tint', style: 'font-size:25px' }, '🤔 如果换成 1 米长的尺子，', h('br'), '甚至用', h('b', {}, '蚂蚁的步子'), '去量，', h('br'), '海岸线会变成多长？')));
    renderTable(); draw();
    return { next: nextRuler, leave: function () { lp.stop(); shownSeg = result ? result.pts.length : 0; draw(); } };
  };

  /* ================= 曼德博集合：无限放大（像一段视频） ================= */
  Demos.mandelbrot = function (el) {
    // 终点是“海马谷”里一个缩小版的曼德博集合（宽约 0.0000039），放大约 34 万倍正好看清它
    var W = 900, H = 540, DURATION = 40000, ZOOM = 3.4e5, W0 = 3.4;
    var TX = -0.7436429870371587, TY = 0.1318263708719787;
    var SX = -0.65, SY = 0;
    var c = hiCanvas(W, H);
    // 播放时用低分辨率保证流畅；暂停或播完后，再一行一行补画成高清
    var levels = [{ w: 450, h: 270 }, { w: 300, h: 180 }, { w: 1200, h: 720 }], q = 0, HI = 2;
    levels.forEach(function (L) {
      L.cv = document.createElement('canvas'); L.cv.width = L.w; L.cv.height = L.h;
      L.ctx = L.cv.getContext('2d'); L.img = L.ctx.createImageData(L.w, L.h);
    });
    // 调色板：深蓝 → 白 → 金 → 深红，循环使用
    var PAL = [];
    var stops = [[0, [8, 20, 80]], [0.2, [40, 110, 200]], [0.42, [240, 250, 255]], [0.6, [255, 190, 40]], [0.8, [180, 40, 30]], [1, [8, 20, 80]]];
    for (var i = 0; i < 256; i++) {
      var t = i / 255, k = 0;
      while (stops[k + 1][0] < t) k++;
      var a = stops[k], b = stops[k + 1], f = (t - a[0]) / (b[0] - a[0]);
      PAL.push([0, 1, 2].map(function (j) { return Math.round(a[1][j] + (b[1][j] - a[1][j]) * f); }));
    }
    var elapsed = 0, playing = false, last = null, hiRow = -1;
    var label = h('div', { class: 'sf-label', style: 'font-size:26px;color:#1E2640' });
    function fmtZoom(z) {
      if (z < 1e4) return Math.round(z).toLocaleString();
      if (z < 1e8) return (Math.round(z / 1e3) / 10) + ' 万';
      return (Math.round(z / 1e7) / 10) + ' 亿';
    }
    function view() {
      var p = Math.min(1, elapsed / DURATION), zoom = Math.pow(ZOOM, p);
      return { zoom: zoom, vw: W0 / zoom, cx: TX + (SX - TX) / zoom, cy: TY + (SY - TY) / zoom,
        maxIt: Math.floor(120 + 180 * Math.log(zoom) / Math.LN10) };
    }
    function rows(L, v, y0, y1) {
      var data = L.img.data, sc = v.vw / L.w, maxIt = v.maxIt;
      for (var py = y0; py < y1; py++) {
        var ci = v.cy + (py - L.h / 2) * sc;
        for (var px = 0; px < L.w; px++) {
          var cr = v.cx + (px - L.w / 2) * sc, zr = 0, zi = 0, zr2 = 0, zi2 = 0, n = 0;
          while (n < maxIt && zr2 + zi2 < 256) { zi = 2 * zr * zi + ci; zr = zr2 - zi2 + cr; zr2 = zr * zr; zi2 = zi * zi; n++; }
          var o = (py * L.w + px) * 4;
          if (n >= maxIt) { data[o] = 10; data[o + 1] = 12; data[o + 2] = 30; }
          else {
            var mu = n + 1 - Math.log(Math.log(Math.sqrt(zr2 + zi2))) / Math.LN2;
            var col = PAL[Math.floor(mu * 6) & 255];
            data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2];
          }
          data[o + 3] = 255;
        }
      }
    }
    function blit(L, y0, y1) {
      L.ctx.putImageData(L.img, 0, 0, 0, y0, L.w, y1 - y0);
      c.ctx.imageSmoothingEnabled = true;
      if (y0 === 0 && y1 === L.h) c.ctx.drawImage(L.cv, 0, 0, W, H);
      else c.ctx.drawImage(L.cv, 0, y0, L.w, y1 - y0, 0, y0 * H / L.h, W, (y1 - y0) * H / L.h);
    }
    function render() {
      var v = view(), L = levels[q], t0 = performance.now();
      rows(L, v, 0, L.h); blit(L, 0, L.h);
      // 电脑慢就降低清晰度，保证动画流畅
      var dt = performance.now() - t0;
      if (dt > 70 && q === 0) q = 1; else if (dt < 25 && q === 1) q = 0;
      label.innerHTML = '已放大 <b style="font-size:34px">' + fmtZoom(v.zoom) + '</b> 倍';
    }
    var lp = loop(function (ts) {
      if (playing) {
        if (last !== null) elapsed = Math.min(DURATION, elapsed + Math.min(120, ts - last));
        last = ts;
        render();
        if (elapsed >= DURATION) { playing = false; playBtn.textContent = '▶ 播放'; hiRow = 0; }
        return;
      }
      // 高清补画：每帧画几十行，不卡住页面
      if (hiRow >= 0) {
        var L = levels[HI], v = view(), t0 = performance.now(), y0 = hiRow;
        v.maxIt *= 3;
        while (hiRow < L.h && performance.now() - t0 < 30) { rows(L, v, hiRow, Math.min(L.h, hiRow + 8)); hiRow = Math.min(L.h, hiRow + 8); }
        blit(L, y0, hiRow);
        if (hiRow >= L.h) { blit(L, 0, L.h); hiRow = -1; return false; }
        return;
      }
      return false;
    });
    function play() {
      if (elapsed >= DURATION) elapsed = 0;
      playing = !playing; playBtn.textContent = playing ? '⏸ 暂停' : '▶ 播放';
      last = null; hiRow = playing ? -1 : 0;
      lp.start();
    }
    var playBtn = btn('▶ 播放', play, 'primary');
    el.appendChild(h('div', { class: 'col', style: 'gap:10px' }, box(c, W, H),
      h('div', { class: 'btns', style: 'align-items:center' }, playBtn,
        btn('↺ 从头开始', function () { elapsed = 0; render(); if (!playing) { hiRow = 0; lp.start(); } }), label)));
    render();
    return {
      enter: function () { if (!playing) { hiRow = 0; lp.start(); } },
      leave: function () { playing = false; playBtn.textContent = '▶ 播放'; lp.stop(); last = null; hiRow = -1; }
    };
  };

  /* ================= 扭了 k 个半圈的纸环（3D，自动旋转，无按钮） ================= */
  // data-twists="0/1/2"（扭几个半圈），data-w / data-h（画布大小）
  function renderBand(ctx, W, H, k, th) {
    var R = 2, HW = 0.7, NU = 96, NV = 5, D = 9, F = 1050, TILT = 1.02, S = Math.min(W / 540, H / 440);
    function P(u, v) {
      var r = R + v * Math.sin(k * u / 2);
      return [r * Math.cos(u), r * Math.sin(u), v * Math.cos(k * u / 2)];
    }
    function xf(p) {
      var ct = Math.cos(th), st = Math.sin(th);
      var x1 = p[0] * ct - p[1] * st, y1 = p[0] * st + p[1] * ct, z1 = p[2];
      var cp = Math.cos(TILT), sp = Math.sin(TILT);
      return [x1, y1 * cp - z1 * sp, y1 * sp + z1 * cp];
    }
    function proj(q) { var s = F / (D + q[1]) * 0.62 * S; return [W / 2 + q[0] * s, H / 2 + 10 * S - q[2] * s]; }
    var L = [-0.3, -0.8, 0.5], ll = Math.hypot(L[0], L[1], L[2]); L = [L[0] / ll, L[1] / ll, L[2] / ll];
    var prims = [];
    for (var i = 0; i < NU; i++) {
      var u0 = i / NU * TAU, u1 = (i + 1) / NU * TAU;
      for (var j = 0; j < NV; j++) {
        var v0 = -HW + j / NV * 2 * HW, v1 = -HW + (j + 1) / NV * 2 * HW;
        var w = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)].map(xf);
        var z = (w[0][1] + w[1][1] + w[2][1] + w[3][1]) / 4;
        var a = [w[1][0] - w[0][0], w[1][1] - w[0][1], w[1][2] - w[0][2]], b = [w[3][0] - w[0][0], w[3][1] - w[0][1], w[3][2] - w[0][2]];
        var n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        var nl = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
        var c = [(w[0][0] + w[2][0]) / 2, (w[0][1] + w[2][1]) / 2, (w[0][2] + w[2][2]) / 2];
        var front = n[0] * -c[0] + n[1] * (-D - c[1]) + n[2] * -c[2] > 0;
        var lum = 0.62 + 0.38 * Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        var base = k % 2 ? [150, 120, 240] : front ? [70, 140, 240] : [255, 160, 60];
        prims.push({ z: z, q: w.map(proj), col: 'rgb(' + Math.round(base[0] * lum) + ',' + Math.round(base[1] * lum) + ',' + Math.round(base[2] * lum) + ')' });
      }
    }
    [-HW, HW].forEach(function (v) {
      for (var i = 0; i < NU; i++) {
        var a = xf(P(i / NU * TAU, v)), b = xf(P((i + 1) / NU * TAU, v));
        prims.push({ z: (a[1] + b[1]) / 2 - 0.02, line: [proj(a), proj(b)] });
      }
    });
    prims.sort(function (a, b) { return b.z - a.z; });
    ctx.clearRect(0, 0, W, H);
    prims.forEach(function (p) {
      ctx.beginPath();
      if (p.line) {
        ctx.strokeStyle = 'rgba(30,38,64,.85)'; ctx.lineWidth = 2.2 * Math.max(S, 0.5);
        ctx.moveTo(p.line[0][0], p.line[0][1]); ctx.lineTo(p.line[1][0], p.line[1][1]); ctx.stroke();
      } else {
        ctx.fillStyle = p.col; ctx.strokeStyle = p.col; ctx.lineWidth = 1;
        ctx.moveTo(p.q[0][0], p.q[0][1]); for (var m = 1; m < 4; m++) ctx.lineTo(p.q[m][0], p.q[m][1]);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    });
  }
  Demos.band = function (el) {
    var W = +el.getAttribute('data-w') || 400, H = +el.getAttribute('data-h') || 320, k = +el.getAttribute('data-twists') || 0;
    var c = hiCanvas(W, H), th = 0.6 + k * 0.9;
    el.appendChild(c);
    var lp = loop(function () { th += 0.005; renderBand(c.ctx, W, H, k, th); });
    renderBand(c.ctx, W, H, k, th);
    return { enter: function () { lp.start(); }, leave: function () { lp.stop(); } };
  };

  /* ================= 哥尼斯堡七桥：在地图上走一走，再变成点和线 ================= */
  var KB_NODES = { A: { x: 450, y: 62, name: '北岸' }, B: { x: 450, y: 505, name: '南岸' }, C: { x: 310, y: 280, name: '小岛' }, D: { x: 745, y: 280, name: '东边' } };
  var KB_BRIDGES = [
    { a: 'A', b: 'C', x: 250, y: 205, r: 90 }, { a: 'A', b: 'C', x: 380, y: 205, r: 90 },
    { a: 'B', b: 'C', x: 250, y: 355, r: 90 }, { a: 'B', b: 'C', x: 380, y: 355, r: 90 },
    { a: 'C', b: 'D', x: 470, y: 280, r: 0 },
    { a: 'A', b: 'D', x: 660, y: 143, r: 80 }, { a: 'B', b: 'D', x: 660, y: 417, r: 100 }
  ];
  Demos.konigsberg = function (el) {
    var W = 900, H = 560;
    var c = hiCanvas(W, H), ctx = c.ctx;
    var graph = el.getAttribute('data-mode') === 'graph' ? 1 : 0, gt = graph, cur = null, used = [], path = [];
    var info = h('div', { class: 'status-line' });
    function other(b, n) { return b.a === n ? b.b : b.a; }
    function degree(n) { return KB_BRIDGES.filter(function (b) { return b.a === n || b.b === n; }).length; }
    function drawMap() {
      ctx.fillStyle = '#EDE3C4'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#7FB5EE'; ctx.lineWidth = 58; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      [[[0, 280], [150, 280]], [[150, 280], [190, 205], [430, 205], [470, 235]], [[150, 280], [190, 355], [430, 355], [470, 325]],
        [[470, 200], [470, 360]], [[470, 210], [620, 150], [920, 95]], [[470, 350], [620, 410], [920, 465]]].forEach(function (pl) {
        ctx.beginPath(); ctx.moveTo(pl[0][0], pl[0][1]); for (var i = 1; i < pl.length; i++) ctx.lineTo(pl[i][0], pl[i][1]); ctx.stroke();
      });
      ctx.font = '800 22px sans-serif'; ctx.fillStyle = 'rgba(30,80,160,.6)'; ctx.textAlign = 'left';
      ctx.fillText('河', 40, 288);
      KB_BRIDGES.forEach(function (b, i) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r * Math.PI / 180);
        ctx.fillStyle = used.indexOf(i) >= 0 ? '#F04E4B' : '#9A6B3F';
        ctx.fillRect(-40, -13, 80, 26);
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.strokeRect(-40, -13, 80, 26);
        ctx.restore();
      });
    }
    function edgeCurve(b) {
      var p = KB_NODES[b.a], q = KB_NODES[b.b];
      return { p: p, q: q, cx: 2 * b.x - (p.x + q.x) / 2, cy: 2 * b.y - (p.y + q.y) / 2 };
    }
    function drawGraph(alpha) {
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.fillRect(0, 0, W, H);
      KB_BRIDGES.forEach(function (b, i) {
        var e = edgeCurve(b);
        ctx.strokeStyle = used.indexOf(i) >= 0 ? '#F04E4B' : '#1E2640'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(e.p.x, e.p.y); ctx.quadraticCurveTo(e.cx, e.cy, e.q.x, e.q.y); ctx.stroke();
      });
      Object.keys(KB_NODES).forEach(function (k) {
        var n = KB_NODES[k];
        ctx.fillStyle = '#2F80ED'; ctx.beginPath(); ctx.arc(n.x, n.y, 20, 0, TAU); ctx.fill();
        ctx.fillStyle = '#F04E4B'; ctx.font = '900 26px sans-serif'; ctx.textAlign = 'left';
        var dx = k === 'D' ? 30 : k === 'C' ? -150 : 30;
        ctx.fillText(degree(k) + ' 条线', n.x + dx, n.y + (k === 'A' ? 12 : k === 'B' ? 8 : 9));
      });
      ctx.restore();
    }
    function draw() {
      drawMap();
      if (gt > 0) drawGraph(gt);
      Object.keys(KB_NODES).forEach(function (k) {
        var n = KB_NODES[k];
        if (gt < 0.5) {
          ctx.fillStyle = 'rgba(30,38,64,.8)'; ctx.font = '900 26px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(n.name, n.x, n.y + 9);
        }
      });
      if (cur) {
        var n = KB_NODES[cur];
        ctx.font = '44px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('🚶', n.x + (gt > 0.5 ? 0 : 60), n.y + (gt > 0.5 ? -26 : 14));
      }
    }
    var lp = loop(function () {
      gt += (graph - gt) * 0.12;
      if (Math.abs(graph - gt) < 0.01) { gt = graph; draw(); return false; }
      draw();
    });
    function setInfo() {
      if (!cur) { info.innerHTML = '先<b>点一块陆地</b>（北岸、南岸、小岛、东边）作为起点。'; return; }
      var left = KB_BRIDGES.length - used.length;
      var can = KB_BRIDGES.some(function (b, i) { return used.indexOf(i) < 0 && (b.a === cur || b.b === cur); });
      if (!left) info.innerHTML = '🎉 七座桥全走完了！（真的吗？快告诉大家你是怎么走的！）';
      else if (!can) info.innerHTML = '😵 没有桥可以走了！还剩 <b>' + left + '</b> 座桥没走过。点“↺ 重来”换个起点试试？';
      else info.innerHTML = '已经走过 <b>' + used.length + '</b> 座桥，还剩 <b>' + left + '</b> 座。点一座<b>挨着你</b>的桥走过去。';
    }
    c.addEventListener('pointerdown', function (e) {
      var p = pointerPos(c, e);
      if (!cur) {
        var best = null, bd = 1e9;
        Object.keys(KB_NODES).forEach(function (k) { var n = KB_NODES[k], d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) { bd = d; best = k; } });
        if (bd < 150) { cur = best; path = [best]; }
        setInfo(); draw(); return;
      }
      for (var i = 0; i < KB_BRIDGES.length; i++) {
        var b = KB_BRIDGES[i], hit;
        if (gt > 0.5) { var e2 = edgeCurve(b), mx = (e2.p.x + 2 * e2.cx + e2.q.x) / 4, my = (e2.p.y + 2 * e2.cy + e2.q.y) / 4; hit = Math.hypot(mx - p.x, my - p.y) < 40; }
        else hit = Math.hypot(b.x - p.x, b.y - p.y) < 44;
        if (!hit) continue;
        if (used.indexOf(i) >= 0) { info.innerHTML = '这座桥已经走过了，每座桥只能走<b>一次</b>哦！'; return; }
        if (b.a !== cur && b.b !== cur) { info.innerHTML = '这座桥不挨着你现在站的地方（' + KB_NODES[cur].name + '）。'; return; }
        used.push(i); cur = other(b, cur); path.push(cur);
        setInfo(); draw(); return;
      }
    });
    function reset() { cur = null; used = []; path = []; setInfo(); draw(); }
    var modeBtn = btn(graph ? '🗺️ 变回地图' : '⚫ 变成点和线', function () {
      graph = graph ? 0 : 1; modeBtn.textContent = graph ? '🗺️ 变回地图' : '⚫ 变成点和线'; lp.start();
    });
    el.insertBefore(h('div', { class: 'col', style: 'gap:10px' }, box(c, W, H),
      h('div', { class: 'btns', style: 'align-items:center' }, btn('↺ 重来', reset), modeBtn)), el.firstChild);
    var side = el.querySelector('.kb-side');
    if (side) side.insertBefore(info, side.firstChild); else el.appendChild(h('div', { class: 'col grow' }, info));
    setInfo(); draw();
    return {};
  };

  /* ================= 一笔画闯关 ================= */
  var EULER_LEVELS = [
    { name: '正方形加一条斜线', nodes: [[0, 0], [1, 0], [1, 1], [0, 1]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]] },
    { name: '小房子', nodes: [[0, 1], [1, 1], [1, 0.42], [0, 0.42], [0.5, 0]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3], [3, 4], [4, 2]] },
    { name: '五角星', nodes: [0, 1, 2, 3, 4].map(function (i) { var a = -Math.PI / 2 + i * TAU / 5; return [0.5 + 0.5 * Math.cos(a), 0.52 + 0.5 * Math.sin(a)]; }),
      edges: [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]] },
    { name: '蝴蝶结', nodes: [[0, 0], [0, 1], [0.5, 0.5], [1, 0], [1, 1]], edges: [[0, 1], [1, 2], [2, 0], [3, 4], [4, 2], [2, 3]] },
    { name: '田字格', nodes: [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]],
      edges: [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [0, 3], [3, 6], [1, 4], [4, 7], [2, 5], [5, 8]] },
    { name: '哥尼斯堡七桥', nodes: [[0.5, 0], [0.5, 1], [0.12, 0.5], [0.88, 0.5]], labels: ['北岸', '南岸', '小岛', '东边'],
      edges: [[0, 2], [0, 2], [1, 2], [1, 2], [2, 3], [0, 3], [1, 3]] }
  ];
  Demos.euler = function (el) {
    var W = 640, H = 540, PAD = 80;
    var c = hiCanvas(W, H), ctx = c.ctx;
    var lv = 0, cur = null, used = [], showOdd = false, showAns = false;
    var title = h('h3', { style: 'margin:0' }), info = h('div', { class: 'status-line' }), ans = h('div', { class: 'callout', style: 'font-size:25px;display:none' });
    function L() { return EULER_LEVELS[lv]; }
    function pos(i) { var n = L().nodes[i]; return [PAD + n[0] * (W - 2 * PAD), PAD + n[1] * (H - 2 * PAD)]; }
    function deg(i) { return L().edges.filter(function (e) { return e[0] === i || e[1] === i; }).length; }
    function oddList() { return L().nodes.map(function (_, i) { return i; }).filter(function (i) { return deg(i) % 2; }); }
    // 两点之间有几条边、这是第几条：用来把重边画成弯的
    function curveOf(k) {
      var e = L().edges[k], same = [], idx = 0;
      L().edges.forEach(function (f, j) { if ((f[0] === e[0] && f[1] === e[1]) || (f[0] === e[1] && f[1] === e[0])) { if (j === k) idx = same.length; same.push(j); } });
      var p = pos(e[0]), q = pos(e[1]), off = (idx - (same.length - 1) / 2) * 70;
      var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
      return { p: p, q: q, cx: (p[0] + q[0]) / 2 - dy / len * off, cy: (p[1] + q[1]) / 2 + dx / len * off };
    }
    function draw() {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
      ctx.lineCap = 'round';
      L().edges.forEach(function (e, k) {
        var cv = curveOf(k), u = used.indexOf(k) >= 0;
        ctx.strokeStyle = u ? '#F04E4B' : '#C9C3B6'; ctx.lineWidth = u ? 10 : 7;
        ctx.beginPath(); ctx.moveTo(cv.p[0], cv.p[1]); ctx.quadraticCurveTo(cv.cx, cv.cy, cv.q[0], cv.q[1]); ctx.stroke();
      });
      L().nodes.forEach(function (_, i) {
        var p = pos(i), odd = deg(i) % 2;
        ctx.fillStyle = showOdd && odd ? '#F04E4B' : i === cur ? '#2F80ED' : '#1E2640';
        ctx.beginPath(); ctx.arc(p[0], p[1], i === cur ? 20 : 15, 0, TAU); ctx.fill();
        if (showOdd) {
          ctx.fillStyle = odd ? '#F04E4B' : '#12A38A'; ctx.font = '900 24px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(deg(i), p[0] + (p[0] < W / 2 ? -34 : 34), p[1] - 18);
        }
        if (L().labels) { ctx.fillStyle = '#5B6275'; ctx.font = '800 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(L().labels[i], p[0], p[1] + (p[1] > H / 2 ? 44 : -30)); }
      });
    }
    function setInfo() {
      title.textContent = '第 ' + (lv + 1) + ' 关 · ' + L().name;
      var left = L().edges.length - used.length;
      if (cur === null) info.innerHTML = '点一个<b>点</b>作为起点，再一个一个点相邻的点，把线全部画完，<b>每条线只能画一次</b>。';
      else if (!left) info.innerHTML = '🎉 <b>一笔画成功！</b>';
      else if (!L().edges.some(function (e, k) { return used.indexOf(k) < 0 && (e[0] === cur || e[1] === cur); }))
        info.innerHTML = '😵 卡住了！还有 <b>' + left + '</b> 条线没画。点“↺ 重来”，换个起点试试？';
      else info.innerHTML = '还剩 <b>' + left + '</b> 条线。';
      var odd = oddList().length;
      ans.style.display = showAns ? '' : 'none';
      ans.innerHTML = odd === 0 ? '奇点 0 个 → <b>能</b>一笔画，从哪个点出发都行！'
        : odd === 2 ? '奇点 2 个 → <b>能</b>一笔画，要从一个<b>奇点</b>出发，在另一个奇点结束。'
        : '奇点 ' + odd + ' 个 → <b>不能</b>一笔画，怎么试都不行！';
    }
    c.addEventListener('pointerdown', function (e) {
      var p = pointerPos(c, e), hit = -1;
      L().nodes.forEach(function (_, i) { var q = pos(i); if (Math.hypot(q[0] - p.x, q[1] - p.y) < 36) hit = i; });
      if (hit < 0) return;
      if (cur === null) { cur = hit; }
      else {
        var k = -1;
        L().edges.forEach(function (ed, j) { if (k < 0 && used.indexOf(j) < 0 && ((ed[0] === cur && ed[1] === hit) || (ed[1] === cur && ed[0] === hit))) k = j; });
        if (k < 0) { info.innerHTML = '这两个点之间<b>没有</b>还没画的线，换一个点试试。'; return; }
        used.push(k); cur = hit;
      }
      setInfo(); draw();
    });
    function go(n) { lv = Math.max(0, Math.min(EULER_LEVELS.length - 1, n)); cur = null; used = []; showAns = false; setInfo(); draw(); }
    var oddBtn = btn('🔴 数一数每个点连几条线', function () { showOdd = !showOdd; oddBtn.classList.toggle('on', showOdd); draw(); }, 'sm');
    el.appendChild(box(c, W, H));
    el.appendChild(h('div', { class: 'col grow' }, title, info,
      h('div', { class: 'btns' }, btn('◀ 上一关', function () { go(lv - 1); }, 'sm'), btn('下一关 ▶', function () { go(lv + 1); }, 'sm primary'), btn('↺ 重来', function () { go(lv); }, 'sm')),
      h('div', { class: 'btns' }, oddBtn, btn('💡 看答案', function () { showAns = !showAns; setInfo(); }, 'sm')), ans));
    go(0);
    return {};
  };

  /* ================= 甜甜圈变咖啡杯（橡皮泥变形） ================= */
  Demos.morph = function (el) {
    var W = 720, H = 520, N = 180;
    var c = hiCanvas(W, H), ctx = c.ctx;
    function resample(pts, n) {
      var seg = [], total = 0;
      for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(d); total += d; }
      var out = [], k = 0, acc = 0;
      for (var j = 0; j < n; j++) {
        var t = j / n * total;
        while (acc + seg[k] < t) { acc += seg[k]; k++; }
        var f = (t - acc) / seg[k], p = pts[k], q = pts[(k + 1) % pts.length];
        out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
      }
      return out;
    }
    function circle(cx, cy, r, a0) { var p = []; for (var i = 0; i < 360; i++) { var a = a0 + i / 360 * TAU; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
    // 甜甜圈：外圆 + 内圆；咖啡杯（侧面）：杯身 + 把手，把手中间的孔就是那一个“洞”
    var donutOut = resample(circle(0, 0, 170, -3 * Math.PI / 4), N), donutIn = resample(circle(0, 0, 62, -2 * Math.PI / 3), N);
    var mugOut = [[-150, -130], [20, -130], [20, -88]];
    for (var i = 0; i <= 60; i++) { var a = -Math.PI / 2 + i / 60 * Math.PI; mugOut.push([20 + 125 * Math.cos(a), 88 * Math.sin(a)]); }
    mugOut.push([20, 130], [-150, 130]);
    var mugIn = [];
    for (var j = 0; j <= 60; j++) { var b = -Math.PI / 2 + j / 60 * Math.PI; mugIn.push([40 + 82 * Math.cos(b), 50 * Math.sin(b)]); }
    mugOut = resample(mugOut, N); mugIn = resample(mugIn, N);
    var t = 0, target = 0;
    var sl = slider('变一变', 0, 100, 1, 0, function (v) { t = target = v / 100; draw(); }, '%');
    function lerpC(a, b, f) { return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * f); }).join(',') + ')'; }
    function draw() {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#FFFDF7'; ctx.fillRect(0, 0, W, H);
      var e = t * t * (3 - 2 * t);
      ctx.save(); ctx.translate(W / 2 + 10, H / 2);
      ctx.beginPath();
      [[donutOut, mugOut], [donutIn, mugIn]].forEach(function (pair) {
        pair[0].forEach(function (p, i) { var q = pair[1][i], x = p[0] + (q[0] - p[0]) * e, y = p[1] + (q[1] - p[1]) * e; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath();
      });
      ctx.fillStyle = lerpC([222, 150, 80], [76, 139, 245], e); ctx.fill('evenodd');
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(30,38,64,.6)'; ctx.stroke();
      ctx.restore();
      ctx.font = '800 26px sans-serif'; ctx.fillStyle = '#1E2640'; ctx.textAlign = 'center';
      ctx.fillText(e < 0.15 ? '🍩 甜甜圈' : e > 0.85 ? '☕ 咖啡杯（侧面）' : '……捏呀捏……', W / 2, H - 22);
    }
    var lp = loop(function () {
      t += (target - t) * 0.04; if (Math.abs(target - t) < 0.002) t = target;
      sl.set(Math.round(t * 100)); draw();
      if (t === target) return false;
    });
    function go(v) { target = v; lp.start(); }
    el.appendChild(h('div', { class: 'col', style: 'gap:10px' }, box(c, W, H),
      h('div', { class: 'btns' }, btn('☕ 捏成杯子', function () { go(1); }, 'primary'), btn('🍩 变回甜甜圈', function () { go(0); })), sl));
    draw();
    return { next: function () { if (target < 1) { go(1); return true; } return false; }, prev: function () { if (target > 0) { go(0); return true; } return false; } };
  };

  /* ================= 数一数有几个洞 ================= */
  var HOLE_ITEMS = [['人', 0], ['A', 1], ['口', 1], ['0', 1], ['中', 2], ['B', 2], ['8', 2], ['日', 2], ['目', 3], ['田', 4]];
  Demos.holes = function (el) {
    var cards = HOLE_ITEMS.map(function (it) {
      var badge = h('div', { class: 'fcount' }, '? 个洞');
      var card = h('div', { class: 'flower', style: 'padding:6px 10px 14px', onclick: function () { open(card); } },
        h('div', { style: 'font-size:118px;font-weight:900;line-height:1.25;font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif' }, it[0]), badge);
      card.n = it[1]; card.badge = badge;
      return card;
    });
    function open(card) { if (card.classList.contains('open')) return; card.classList.add('open'); card.badge.textContent = card.n + ' 个洞'; }
    el.appendChild(h('div', { style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:18px' }, cards));
    return {
      next: function () { for (var i = 0; i < cards.length; i++) if (!cards[i].classList.contains('open')) { open(cards[i]); return true; } return false; },
      prev: function () { for (var i = cards.length - 1; i >= 0; i--) if (cards[i].classList.contains('open')) { cards[i].classList.remove('open'); cards[i].badge.textContent = '? 个洞'; return true; } return false; }
    };
  };

  /* ================= 封面装饰：慢慢翻转的 0 和 1 ================= */
  Demos.coverBits = function (el) {
    var W = 900, H = 900, COLS = 14, ROWS = 14, cw = W / COLS, ch = H / ROWS;
    var c = hiCanvas(W, H), ctx = c.ctx, cells = [];
    for (var i = 0; i < COLS * ROWS; i++) cells.push({ v: Math.random() < 0.5 ? 1 : 0, t: Math.random() * 6 });
    var COLORS = ['#7B5CF0', '#F04E4B', '#F08A00', '#12A38A', '#2F80ED'];
    var lp = loop(function (ts) {
      var tt = ts / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      cells.forEach(function (cell, i) {
        var x = (i % COLS) * cw + cw / 2, y = Math.floor(i / COLS) * ch + ch / 2;
        var d = Math.hypot(x - W * 0.55, y - H / 2) / (W * 0.5);
        if (d > 1) return;
        if (Math.random() < 0.004) cell.v = 1 - cell.v;
        var a = (1 - d) * (0.35 + 0.35 * Math.sin(tt * 1.3 + cell.t));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.font = '900 ' + Math.round(ch * 0.62) + 'px Consolas, "Courier New", monospace';
        ctx.fillText(cell.v, x, y);
      });
      ctx.globalAlpha = 1;
    });
    el.appendChild(c);
    return { enter: function () { lp.start(); }, leave: function () { lp.stop(); } };
  };

  /* ================= 像素画：一行行 0 和 1，涂出一幅画 ================= */
  // data-pic="heart"（默认）；按“下一步”一行一行解码
  var PIXEL_PICS = {
    heart: ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000', '00000000'],
    cat: ['1000000001', '1100000011', '1111111111', '1111111111', '1101111011', '1111111111', '1111001111', '1111111111', '0111111110', '0011111100']
  };
  Demos.pixels = function (el) {
    var pic = PIXEL_PICS[el.getAttribute('data-pic') || 'heart'], n = pic.length, CELL = Math.floor(560 / n);
    var shown = 0, cells = [], codes = [];
    var grid = h('div', { style: 'display:grid;grid-template-columns:auto repeat(' + n + ',' + CELL + 'px);gap:3px;align-items:center' });
    pic.forEach(function (row, r) {
      var code = h('div', { style: 'font-family:Consolas,"Courier New",monospace;font-size:' + Math.round(CELL * 0.5) + 'px;font-weight:900;letter-spacing:2px;padding-right:14px;color:#9AA0AE' }, row);
      codes.push(code); grid.appendChild(code);
      for (var k = 0; k < n; k++) (function (k) {
        var cell = h('div', { style: 'width:' + CELL + 'px;height:' + CELL + 'px;border-radius:6px;background:#F1EEE8;cursor:pointer;transition:background .25s' });
        cell.on = false;
        cell.addEventListener('click', function () { cell.on = !cell.on; paint(cell); });
        cells.push(cell); grid.appendChild(cell);
      })(k);
    });
    function paint(cell) { cell.style.background = cell.on ? '#F04E4B' : '#F1EEE8'; }
    function render() {
      pic.forEach(function (row, r) {
        codes[r].style.color = r < shown ? '#1E2640' : r === shown ? '#F04E4B' : '#9AA0AE';
        for (var k = 0; k < n; k++) { var cell = cells[r * n + k]; cell.on = r < shown && row[k] === '1'; paint(cell); }
      });
    }
    function fwd() { if (shown < n) { shown++; render(); return true; } return false; }
    function back() { if (shown > 0) { shown--; render(); return true; } return false; }
    el.appendChild(h('div', { class: 'col', style: 'gap:12px' }, grid,
      h('div', { class: 'btns' }, btn('解码一行 ▶', fwd, 'primary'), btn('全部解码', function () { shown = n; render(); }), btn('↺ 清空', function () { shown = 0; render(); }))));
    render();
    return { next: fwd, prev: back };
  };

  /* ================= 暴力破解凯撒密码：25 种可能全部试一遍 ================= */
  // data-plain：明文（拼音），data-key：密钥
  Demos.bruteforce = function (el) {
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var plain = el.getAttribute('data-plain') || 'SHU XUE HEN YOU QU', key = +el.getAttribute('data-key') || 11;
    function tr(s, k) { return s.replace(/[A-Z]/g, function (ch) { return A[(A.indexOf(ch) + k + 26) % 26]; }); }
    var cipher = tr(plain, key), shown = 0, found = false;
    var cards = [];
    for (var k = 1; k <= 25; k++) (function (k) {
      var card = h('div', { style: 'background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(60,40,10,.1);padding:5px 12px;font-family:Consolas,"Courier New",monospace;font-size:23px;font-weight:800;cursor:pointer;opacity:.15;transition:all .25s;white-space:nowrap' },
        h('span', { style: 'color:#9AA0AE;font-size:16px' }, '往回 ' + k + '：'), tr(cipher, -k));
      card.k = k;
      card.addEventListener('click', function () {
        card.style.opacity = 1;
        if (k === key) { card.style.background = '#12A38A'; card.style.color = '#fff'; found = true; msg.innerHTML = '🎉 找到了！密钥是 <b>' + k + '</b>——“数学很有趣”！'; }
        else { card.style.background = '#FFEDEC'; msg.innerHTML = '往回挪 ' + k + ' 位，读不通，不是它。'; }
      });
      cards.push(card);
    })(k);
    var msg = h('div', { class: 'status-line' }, '截获密文：');
    function fwd() {
      if (shown < 25) { shown = Math.min(25, shown + 5); cards.forEach(function (c, i) { if (i < shown) c.style.opacity = 1; }); msg.innerHTML = '电脑已经试了 <b>' + shown + '</b> 种……找一找哪一行能读通？'; return true; }
      return false;
    }
    el.appendChild(h('div', { class: 'col grow', style: 'gap:12px' },
      h('div', { style: 'display:flex;gap:16px;align-items:center' }, h('span', { class: 'sf-label', style: 'font-size:26px;color:#1E2640' }, '🕵️ 截获密文（密钥不知道）：'), h('span', { class: 'cipher-code', style: 'font-size:36px' }, cipher)),
      h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px' }, cards),
      h('div', { class: 'btns', style: 'align-items:center' }, btn('让电脑试 5 种 ▶', fwd, 'primary'), msg)));
    return { next: fwd };
  };

  /* ================= 条形码的“检查员”：EAN-13 校验码 ================= */
  var EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  var EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  var EAN_R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  var EAN_P = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  function eanCheck(d12) {
    var s = 0;
    for (var i = 0; i < 12; i++) s += (+d12[i]) * (i % 2 ? 3 : 1);
    return { sum: s, check: (10 - s % 10) % 10 };
  }
  function eanBits(d) {
    var bits = '101', par = EAN_P[+d[0]];
    for (var i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? EAN_L : EAN_G)[+d[i]];
    bits += '01010';
    for (var j = 7; j <= 12; j++) bits += EAN_R[+d[j]];
    return bits + '101';
  }
  Demos.ean = function (el) {
    var base = '978710700000';
    var digits = (base + eanCheck(base).check).split('');
    var W = 640, H = 230;
    var c = hiCanvas(W, H), ctx = c.ctx;
    var boxes = h('div', { style: 'display:flex;gap:6px' });
    var table = h('div', {});
    var verdict = h('div', { class: 'callout', style: 'font-size:27px' });
    function drawBarcode() {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      var bits = eanBits(digits), mw = 5, x0 = (W - bits.length * mw) / 2;
      for (var i = 0; i < bits.length; i++) {
        if (bits[i] !== '1') continue;
        var guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
        ctx.fillStyle = '#1E2640'; ctx.fillRect(x0 + i * mw, 14, mw, guard ? 166 : 150);
      }
      ctx.font = '700 24px Consolas, "Courier New", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#1E2640';
      ctx.fillText(digits[0], x0 - 16, 190);
      for (var k = 1; k <= 6; k++) ctx.fillText(digits[k], x0 + (3 + (k - 1) * 7 + 3.5) * mw, 190);
      for (var m = 7; m <= 12; m++) ctx.fillText(digits[m], x0 + (50 + (m - 7) * 7 + 3.5) * mw, 190);
    }
    function render() {
      boxes.innerHTML = '';
      digits.forEach(function (d, i) {
        var b = h('div', { style: 'width:40px;height:52px;border-radius:10px;display:flex;align-items:center;justify-content:center;font:900 30px Consolas,"Courier New",monospace;cursor:pointer;' +
          (i === 12 ? 'background:#1E2640;color:#FFD166' : 'background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.12)') }, d);
        b.title = '点一下，这一位加 1';
        b.addEventListener('click', function () { digits[i] = String((+digits[i] + 1) % 10); render(); });
        boxes.appendChild(b);
      });
      var r = eanCheck(digits.slice(0, 12)), ok = r.check === +digits[12];
      var row1 = digits.slice(0, 12).map(function (d, i) { return '<td>' + (i % 2 ? '×3' : '×1') + '</td>'; }).join('');
      var row2 = digits.slice(0, 12).map(function (d, i) { return '<td><b>' + d * (i % 2 ? 3 : 1) + '</b></td>'; }).join('');
      table.innerHTML = '<table class="tbl compact" style="font-size:22px"><tr><th>乘</th>' + row1 + '</tr><tr><th>得</th>' + row2 + '</tr></table>' +
        '<p style="font-size:24px;margin:8px 0 0">加起来 = <b>' + r.sum + '</b>，还差 <b>' + r.check + '</b> 凑到整十 → 检查码应该是 <b>' + r.check + '</b></p>';
      verdict.innerHTML = ok ? '✅ 最后一位是 <b>' + digits[12] + '</b>，对上了：条形码<b>没有错</b>！' : '❌ 最后一位是 <b>' + digits[12] + '</b>，应该是 <b>' + r.check + '</b>：<b>发现错误！</b>收银机会“嘀”一声，要求重扫。';
      drawBarcode();
    }
    function breakOne() { var i = Math.floor(Math.random() * 12); digits[i] = String((+digits[i] + 1 + Math.floor(Math.random() * 8)) % 10); render(); }
    function fix() { digits[12] = String(eanCheck(digits.slice(0, 12)).check); render(); }
    el.appendChild(h('div', { class: 'col', style: 'gap:12px;flex:none' }, box(c, W, H), boxes,
      h('div', { class: 'btns' }, btn('🐞 偷偷改错一位', breakOne, 'primary'), btn('🔧 修好检查码', fix), btn('↺ 恢复', function () { digits = (base + eanCheck(base).check).split(''); render(); }))));
    el.appendChild(h('div', { class: 'col grow' }, table, verdict,
      h('div', { class: 'card tint', style: 'font-size:25px' }, '📚 动手：拿出一本课本，把封底条形码下面的 ', h('b', {}, '13 位数'), '抄到学习单第 4 题，', h('br'), '按上面的方法算一算，看看最后一位对不对得上！')));
    render();
    return {};
  };

  /* ================= 二进制灯泡 ================= */
  Demos.bits = function (el) {
    var vals = [16, 8, 4, 2, 1], on = [0, 0, 0, 0, 0];
    var total = h('div', { class: 'bits-total' });
    var bulbs = vals.map(function (v, i) {
      var bit = h('div', { class: 'bit' }, '0');
      var b = h('div', { class: 'bulb', onclick: function () { on[i] = 1 - on[i]; render(); } },
        h('div', { class: 'glass' }, v), h('div', { class: 'base' }), bit);
      b.bit = bit;
      return b;
    });
    function render() {
      var s = 0, parts = [];
      bulbs.forEach(function (b, i) {
        b.classList.toggle('on', !!on[i]); b.bit.textContent = on[i];
        if (on[i]) { s += vals[i]; parts.push(vals[i]); }
      });
      total.innerHTML = '二进制 <span style="font-family:Consolas,monospace">' + on.join('') + '</span>　=　' +
        (parts.length > 1 ? parts.join(' + ') + ' = ' : '') + '<span>' + s + '</span>';
    }
    el.appendChild(h('div', { class: 'bulbs' }, bulbs));
    el.appendChild(total);
    el.appendChild(h('div', { class: 'btns', style: 'justify-content:center;margin-top:10px' }, btn('全部熄灭', function () { on = [0, 0, 0, 0, 0]; render(); }, 'sm')));
    render();
    return {};
  };
})();
