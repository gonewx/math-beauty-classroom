/* 数学之美 · 课件引擎
   - 翻页 / 逐步出现（.step）/ 互动演示的生命周期（data-demo）
   - 讲者视图（?presenter，另开窗口，用 postMessage 同步，file:// 下也能用）
   - 计时、目录、黑屏、讲稿、视频（data-video，文件存在时才显示 🎬 按钮） */
(function () {
  'use strict';

  // 每一集在自己的 index.html 里用 window.DECK_CONFIG = { chapters: [...] } 定义章节与计划时间
  var CHAPTERS = (window.DECK_CONFIG && window.DECK_CONFIG.chapters) || [{ name: '课程', min: 40, color: '#7B5CF0' }];
  var TOTAL_MIN = CHAPTERS.reduce(function (a, c) { return a + c.min; }, 0);

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var stage = $('#stage');
  var slides = $$('#stage > .slide');
  var isPresenter = /[?&]presenter\b/.test(location.search);

  function chOf(s) { return Math.min(+s.getAttribute('data-ch') || 0, CHAPTERS.length - 1); }
  function titleOf(s) {
    if (s.getAttribute('data-title')) return s.getAttribute('data-title');
    var t = s.querySelector('h1,h2');
    return t ? t.textContent.trim() : '';
  }
  function notesOf(s) { var a = s.querySelector('aside.notes'); return a ? a.innerHTML : ''; }
  function stepsOf(s) { return $$('.step', s); }
  function chStartMin(ch) { var m = 0; for (var i = 0; i < ch; i++) m += CHAPTERS[i].min; return m; }
  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  if (isPresenter) { initPresenter(); return; }

  /* ================= 主窗口 ================= */

  var idx = -1, step = 0;
  var startTime = null;
  var presenterWin = null;
  var demoInst = new Map();

  // ---- 缩放 ----
  function fit() {
    var s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    stage.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  fit();
  // 舞台和视口都不允许被“滚动”（按钮获得焦点时浏览器可能会自动滚动），否则画面会整体偏移
  [stage, $('#viewport')].forEach(function (el) {
    el.addEventListener('scroll', function () { el.scrollLeft = 0; el.scrollTop = 0; });
  });

  // ---- 互动演示 ----
  function demosIn(slide) {
    return $$('[data-demo]', slide).map(function (el) {
      if (!demoInst.has(el)) {
        var f = window.Demos && window.Demos[el.getAttribute('data-demo')];
        var inst = {};
        try { inst = (f && f(el)) || {}; } catch (e) { console.error(e); }
        demoInst.set(el, inst);
      }
      return demoInst.get(el);
    });
  }
  function callDemos(slide, fn) {
    var r = false;
    demosIn(slide).forEach(function (d) {
      if (r) return;
      if (typeof d[fn] === 'function') { try { r = !!d[fn](); } catch (e) { console.error(e); } }
    });
    return r;
  }

  // ---- 翻页 ----
  function show(i, stepTarget) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    var changed = i !== idx;
    if (changed && idx >= 0) {
      var old = slides[idx];
      demosIn(old).forEach(function (d) { if (d.leave) try { d.leave(); } catch (e) { console.error(e); } });
    }
    slides.forEach(function (s, k) {
      s.classList.toggle('active', k === i);
      s.classList.toggle('past', k < i);
    });
    var s = slides[i];
    var steps = stepsOf(s);
    var n = stepTarget === 'all' ? steps.length : (stepTarget || 0);
    steps.forEach(function (el, k) { el.classList.toggle('shown', k < n); });
    idx = i; step = n;
    if (changed) demosIn(s).forEach(function (d) { if (d.enter) try { d.enter(); } catch (e) { console.error(e); } });
    updateChrome();
  }
  function next() {
    var s = slides[idx];
    if (callDemos(s, 'next')) { sync(); return; }
    var steps = stepsOf(s);
    if (step < steps.length) {
      steps[step].classList.add('shown');
      step++;
      updateChrome();
      return;
    }
    if (idx < slides.length - 1) {
      if (startTime === null && idx === 0) startTimer();
      show(idx + 1, 0);
    }
  }
  function prev() {
    var s = slides[idx];
    var steps = stepsOf(s);
    if (step > 0) {
      step--;
      steps[step].classList.remove('shown');
      updateChrome();
      return;
    }
    if (callDemos(s, 'prev')) { sync(); return; }
    if (idx > 0) show(idx - 1, 'all');
  }
  function go(i) { closeOverlays(); show(i, 0); }

  function updateChrome() {
    var s = slides[idx], ch = chOf(s);
    var color = CHAPTERS[ch].color;
    stage.style.setProperty('--tagc', color);
    $('#chapterTag span').textContent = CHAPTERS[ch].name;
    $('#progress').style.width = (slides.length > 1 ? idx / (slides.length - 1) * 100 : 100) + '%';
    $('#pageNo').textContent = (idx + 1) + ' / ' + slides.length;
    $('#hudCount').textContent = (idx + 1) + ' / ' + slides.length;
    var chTag = $('#chapterTag'); chTag.style.visibility = s.classList.contains('cover') ? 'hidden' : 'visible';
    if (history.replaceState) history.replaceState(null, '', '#' + (idx + 1));
    $('#notesPanel').innerHTML = '<b>【' + (idx + 1) + '】' + titleOf(s) + '</b>' +
      (stepsOf(s).length ? '　（本页点击动画 ' + step + '/' + stepsOf(s).length + '）' : '') + notesOf(s);
    updateVideoBtn();
    sync();
  }

  // ---- 计时 ----
  function startTimer() { startTime = Date.now(); sync(); }
  setInterval(function () {
    var box = $('#timerBox');
    if (!box.classList.contains('open')) return;
    if (startTime === null) { box.textContent = '⏱ 0:00 / ' + TOTAL_MIN + ':00'; return; }
    var el = Date.now() - startTime;
    var end = (chStartMin(chOf(slides[idx])) + CHAPTERS[chOf(slides[idx])].min) * 60000;
    box.textContent = '⏱ ' + fmt(el) + ' / ' + TOTAL_MIN + ':00';
    box.classList.toggle('late', el > end);
  }, 500);

  // ---- 讲者视图同步 ----
  function sync() {
    if (!presenterWin || presenterWin.closed) return;
    try {
      presenterWin.postMessage({ mb: 'state', idx: idx, step: step, startTime: startTime }, '*');
    } catch (e) { /* ignore */ }
  }
  function openPresenter() {
    var url = location.href.split('#')[0].split('?')[0] + '?presenter';
    presenterWin = window.open(url, 'mb-presenter', 'width=1200,height=760');
    setTimeout(sync, 800);
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || !d.mb) return;
    presenterWin = e.source;
    if (d.mb === 'hello') sync();
    else if (d.mb === 'cmd') {
      if (d.cmd === 'next') next();
      else if (d.cmd === 'prev') prev();
      else if (d.cmd === 'go') go(d.idx);
      else if (d.cmd === 'black') toggleBlack(false);
      else if (d.cmd === 'startTimer') startTimer();
      else if (d.cmd === 'resetTimer') { startTime = null; sync(); }
    }
  });

  // ---- 目录 ----
  function buildMenu() {
    var html = '<button class="btn sm close" data-act="closeOverlays">✕ 关闭</button><h3>☰ 目录（点击跳转）</h3>';
    CHAPTERS.forEach(function (c, ci) {
      html += '<div class="menu-ch"><span style="color:' + c.color + '">■</span>' + c.name +
        '<small>第 ' + chStartMin(ci) + '–' + (chStartMin(ci) + c.min) + ' 分钟</small></div><div class="menu-list">';
      slides.forEach(function (s, i) {
        if (chOf(s) !== ci) return;
        html += '<button data-go="' + i + '" class="' + (i === idx ? 'cur' : '') + '">' + (i + 1) + '. ' + titleOf(s) +
          (s.getAttribute('data-optional') ? '<span class="opt">可跳过</span>' : '') + '</button>';
      });
      html += '</div>';
    });
    $('#menuPanel').innerHTML = html;
  }

  // ---- 覆盖层 ----
  function closeOverlays() {
    $$('.overlay').forEach(function (o) { o.classList.remove('open'); });
    var v = $('#videoEl'); if (!v.paused) v.pause();
  }
  function toggleOverlay(id) {
    var o = $(id), open = o.classList.contains('open');
    closeOverlays();
    if (!open) o.classList.add('open');
  }
  function toggleBlack(white) {
    var b = $('#blackout');
    if (b.classList.contains('open')) { b.classList.remove('open'); return; }
    b.classList.toggle('white', !!white);
    b.classList.add('open');
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      var el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
    }
  }

  // ---- 视频（可选）----
  var videoOK = {};
  slides.forEach(function (s) {
    var src = s.getAttribute('data-video');
    if (!src || videoOK[src] !== undefined) return;
    videoOK[src] = false;
    var v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.addEventListener('loadedmetadata', function () { videoOK[src] = true; updateVideoBtn(); });
    v.src = src;
  });
  function updateVideoBtn() {
    $$('.video-btn', stage).forEach(function (b) { b.remove(); });
    var s = slides[idx], src = s && s.getAttribute('data-video');
    if (!src || !videoOK[src]) return;
    var b = document.createElement('button');
    b.className = 'btn video-btn';
    b.textContent = '🎬 播放视频';
    b.addEventListener('click', playVideo);
    s.appendChild(b);
  }
  function playVideo() {
    var src = slides[idx].getAttribute('data-video');
    if (!src || !videoOK[src]) return;
    var v = $('#videoEl');
    if (v.getAttribute('src') !== src) v.src = src;
    closeOverlays();
    $('#videoOverlay').classList.add('open');
    v.currentTime = 0;
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  }

  // ---- 事件 ----
  function act(a) {
    switch (a) {
      case 'next': next(); break;
      case 'prev': prev(); break;
      case 'menu': buildMenu(); toggleOverlay('#menuOverlay'); break;
      case 'help': toggleOverlay('#helpOverlay'); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'presenter': openPresenter(); break;
      case 'closeOverlays': closeOverlays(); break;
    }
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-act],[data-go]') : null;
    if (t && t.hasAttribute('data-go')) { go(+t.getAttribute('data-go')); return; }
    if (t) act(t.getAttribute('data-act'));
    // 点完按钮立即失焦，避免空格/回车再次触发按钮
    var b = e.target.closest && e.target.closest('button');
    if (b) setTimeout(function () { b.blur(); }, 0);
  });
  document.addEventListener('change', function (e) {
    if (e.target.type === 'range') e.target.blur();
  });
  document.addEventListener('pointerup', function (e) {
    if (e.target.type === 'range') setTimeout(function () { e.target.blur(); }, 0);
  });
  ['menuOverlay', 'helpOverlay'].forEach(function (id) {
    $('#' + id).addEventListener('click', function (e) { if (e.target.id === id) closeOverlays(); });
  });
  $('#blackout').addEventListener('click', function () { $('#blackout').classList.remove('open'); });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, k = e.key;
    var typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'button'));
    if (typing && k !== 'PageDown' && k !== 'PageUp' && k !== 'Escape') return;
    if (t && t.type === 'range' && /^Arrow/.test(k)) return;

    var black = $('#blackout').classList.contains('open');
    if (black && k !== 'b' && k !== 'B' && k !== 'w' && k !== 'W' && k !== '.') {
      $('#blackout').classList.remove('open'); e.preventDefault(); return;
    }
    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        e.preventDefault(); if (!$('#videoOverlay').classList.contains('open')) next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); if (!$('#videoOverlay').classList.contains('open')) prev(); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End': e.preventDefault(); go(slides.length - 1); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'b': case 'B': case '.': toggleBlack(false); break;
      case 'w': case 'W': toggleBlack(true); break;
      case 'n': case 'N': $('#notesPanel').classList.toggle('open'); break;
      case 't': case 'T':
        $('#timerBox').classList.toggle('open');
        if (startTime === null) startTimer();
        break;
      case 'm': case 'M': act('menu'); break;
      case 'h': case 'H': case '?': act('help'); break;
      case 'p': case 'P': openPresenter(); break;
      case 'v': case 'V': playVideo(); break;
      case 'Escape': closeOverlays(); break;
    }
  });

  // HUD 自动隐藏
  var hud = $('#hud'), hudTimer = null;
  function wake() {
    hud.classList.remove('idle');
    document.body.style.cursor = '';
    clearTimeout(hudTimer);
    hudTimer = setTimeout(function () { hud.classList.add('idle'); }, 3000);
  }
  document.addEventListener('pointermove', wake);
  document.addEventListener('pointerdown', wake);
  wake();

  $('#videoEl').addEventListener('ended', function () { setTimeout(closeOverlays, 800); });

  var start = parseInt((location.hash || '').replace('#', ''), 10);
  show(isNaN(start) ? 0 : start - 1, 0);

  window.Deck = { next: next, prev: prev, go: go, get index() { return idx; }, get step() { return step; } };

  /* ================= 讲者视图窗口 ================= */
  function initPresenter() {
    document.body.classList.add('presenter');
    document.title = '讲者视图 · 数学之美';
    var root = $('#presenter');
    root.innerHTML =
      '<div class="p-top">' +
      '  <div class="p-timer" id="pTimer">0:00</div>' +
      '  <div class="p-info" id="pInfo"></div>' +
      '  <div class="sp"></div>' +
      '  <button id="pStart">▶ 开始计时</button><button id="pReset">↺ 计时清零</button>' +
      '  <button id="pBlack">⬛ 黑屏</button>' +
      '  <button class="big" id="pPrev">◀ 上一步</button><button class="big" id="pNext">下一步 ▶</button>' +
      '</div>' +
      '<div class="p-main">' +
      '  <div class="p-cur"><h2 id="pTitle">等待连接课件窗口……</h2><div class="p-steps" id="pSteps"></div><div class="p-notes" id="pNotes">请从课件窗口按 P 打开本窗口。</div></div>' +
      '  <div class="p-side">' +
      '    <div class="p-box"><h4>下一页</h4><div class="p-next" id="pNextTitle">—</div></div>' +
      '    <div class="p-box"><h4>时间计划（共 ' + TOTAL_MIN + ' 分钟）</h4><div class="p-plan" id="pPlan"></div></div>' +
      '    <div class="p-box"><h4>快捷键</h4>本窗口也能用 ←/→/空格/翻页笔翻页；B 黑屏。<br>把课件窗口拖到投影屏并按 F 全屏。</div>' +
      '  </div>' +
      '</div>';

    var state = { idx: 0, step: 0, startTime: null };
    var main = window.opener;
    function send(cmd, extra) {
      if (!main || main.closed) return;
      var m = { mb: 'cmd', cmd: cmd };
      if (extra) for (var k in extra) m[k] = extra[k];
      main.postMessage(m, '*');
    }
    function render() {
      var s = slides[state.idx]; if (!s) return;
      var ch = chOf(s), n = stepsOf(s).length;
      $('#pTitle').textContent = (state.idx + 1) + '. ' + titleOf(s);
      $('#pSteps').textContent = n ? ('本页点击动画：已出现 ' + state.step + ' / ' + n) : '';
      $('#pNotes').innerHTML = notesOf(s) || '（本页无讲稿）';
      var nx = slides[state.idx + 1];
      $('#pNextTitle').textContent = nx ? (state.idx + 2) + '. ' + titleOf(nx) : '（最后一页）';
      $('#pInfo').innerHTML = CHAPTERS[ch].name + '<br>第 ' + (state.idx + 1) + ' / ' + slides.length + ' 页';
      var html = '';
      CHAPTERS.forEach(function (c, ci) {
        html += '<div class="' + (ci === ch ? 'cur' : ci < ch ? 'done' : '') + '"><span>' + c.name + '</span><span>' +
          chStartMin(ci) + '–' + (chStartMin(ci) + c.min) + ' 分</span></div>';
      });
      $('#pPlan').innerHTML = html;
    }
    function tick() {
      var t = $('#pTimer');
      if (state.startTime === null) { t.textContent = '0:00'; t.classList.remove('late'); return; }
      var el = Date.now() - state.startTime;
      var ch = chOf(slides[state.idx]);
      var end = (chStartMin(ch) + CHAPTERS[ch].min) * 60000;
      t.textContent = fmt(el) + ' / ' + TOTAL_MIN + ':00';
      t.classList.toggle('late', el > end);
      t.title = el > end ? '本章已超出计划时间' : '';
    }
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.mb !== 'state') return;
      main = e.source;
      state = d; render(); tick();
    });
    $('#pNext').onclick = function () { send('next'); };
    $('#pPrev').onclick = function () { send('prev'); };
    $('#pBlack').onclick = function () { send('black'); };
    $('#pStart').onclick = function () { send('startTimer'); };
    $('#pReset').onclick = function () { send('resetTimer'); };
    document.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') { e.preventDefault(); send('next'); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); send('prev'); }
      else if (k === 'b' || k === 'B' || k === '.') send('black');
    });
    setInterval(tick, 500);
    // 定期打招呼，课件窗口刷新后也能重新连上
    function hello() { if (main && !main.closed) main.postMessage({ mb: 'hello' }, '*'); }
    hello(); setInterval(hello, 2000);
    render();
  }
})();
