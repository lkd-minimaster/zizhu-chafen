'use strict';

/**
 * 自助查分 · 界面与网络层
 * 运行在作业详情页内：读取同源接口 → 等待 AI 批阅稳定 → 用浮动卡片展示临时卷面分。
 * 不写 Cookie / localStorage，不向第三方发送任何数据。
 */
function startScoreReader(core, options) {
  const version = (options && options.version) || '2.0.0';
  const KEY = '__SYSU_SCORE_PEEK__';
  const opened = window[KEY];
  if (opened) { opened.focus(); return; }

  const DETAIL_API = '/cloud/student-homework/homeworkStudent/getStudentHomeworkDetail';
  const ANSWERS_API = '/cloud/student-homework/homeworkStudentExam/examAnswersAndStatisticsQuery';
  const TOKEN_KEYS = ['token', 'access_token', 'accessToken', 'jwt', 'Authorization', 'authorization'];
  const COOKIE_NAMES = ['jt-cas', 'ai-poly', 'openapi-token', 'cloudapi-token', 'token'];

  class StopError extends Error {
    constructor() { super('已停止'); this.name = 'AbortError'; }
  }

  let ctx;
  try {
    ctx = core.context(location.href);
  } catch (error) {
    alert(error.message);
    return;
  }

  const startUrl = location.href;
  let runStartedAt = Date.now();
  const priorFocus = document.activeElement;
  const host = document.createElement('div');
  host.id = 'sysu-score-peek';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box}
    .panel{pointer-events:auto;outline:none;position:absolute;right:22px;bottom:22px;width:380px;max-width:calc(100vw - 24px);
      max-height:calc(100dvh - 32px);overflow:auto;background:#fff;color:#13241f;border:1px solid #e0e8e4;
      border-radius:20px;box-shadow:0 18px 60px rgba(14,45,36,.16),0 2px 8px rgba(14,45,36,.06);
      font:14px/1.65 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
      padding:20px 22px 18px;scrollbar-width:thin}
    header{display:flex;align-items:center;gap:8px;margin-bottom:18px}
    .brand{display:flex;align-items:center;gap:7px;font-weight:700;letter-spacing:.5px;font-size:14px;color:#0f3b2f}
    .brand i{width:8px;height:8px;border-radius:50%;background:#0e7a58;box-shadow:0 0 0 3px #d9f2e8}
    .ver{font-size:10px;font-weight:600;color:#7a918a;border:1px solid #e0e8e4;border-radius:20px;padding:0 6px;line-height:16px}
    .pill{margin-left:auto;font-size:11px;padding:3px 9px;border-radius:20px;background:#eef6f2;color:#0e6b52;white-space:nowrap}
    .panel[data-state=busy] .pill::before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;
      background:currentColor;margin-right:5px;vertical-align:1px;animation:pulse 1.1s ease-in-out infinite}
    @keyframes pulse{50%{opacity:.25}}
    .icon{border:0;background:transparent;color:#7d918a;font-size:17px;line-height:1;padding:4px 6px;border-radius:8px;cursor:pointer}
    .icon:hover{background:#f1f6f3;color:#1d3b32}
    .icon:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid #1c9a72;outline-offset:2px}
    .content{position:relative}
    .label{font-size:11px;letter-spacing:2.5px;color:#6d857d;margin:0 0 6px}
    h2{font-size:19px;line-height:1.45;margin:0 0 8px;font-weight:720;overflow-wrap:anywhere}
    .desc{color:#5b716a;margin:0;min-height:23px;font-size:13px}
    .wait{font-size:12px;color:#82958e;margin:8px 0 0;font-variant-numeric:tabular-nums}
    .score{display:flex;align-items:baseline;gap:8px;padding:16px 0 4px}
    .score strong{font-size:64px;line-height:1;font-weight:760;letter-spacing:-3px;color:#0d2e25;
      font-variant-numeric:tabular-nums;animation:rise .35s ease-out}
    @keyframes rise{from{opacity:0;transform:translateY(6px)}}
    .score span{font-size:18px;color:#7b8f88}
    .meta{font-size:11.5px;color:#72867f;margin:6px 0 16px;font-variant-numeric:tabular-nums}
    .notice{border-radius:11px;padding:10px 12px;background:#f2f7f4;color:#4f645c;font-size:11.5px;line-height:1.7}
    .diag{margin-top:14px;font-size:11.5px;color:#748880}
    .diag summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:4px;padding:2px 0}
    .diag summary::-webkit-details-marker{display:none}
    .diag summary::before{content:"›";display:inline-block;transition:transform .15s;font-size:14px}
    .diag[open] summary::before{transform:rotate(90deg)}
    .diag dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:8px 0 6px;padding:10px 12px;
      background:#fafcfb;border:1px solid #edf1ef;border-radius:9px;font-family:ui-monospace,Consolas,monospace;font-size:10.5px}
    .diag dt{color:#8a9c96}
    .diag dd{margin:0;color:#3f564e;overflow-wrap:anywhere}
    .perq{margin:2px 0 10px}
    .perq-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:8px 0 6px}
    .perq-head b{font-size:11px;color:#2b4a3e}
    .perq-head span{font-size:10px;color:#82958e;font-variant-numeric:tabular-nums}
    .perq-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;padding:8px;background:#fafcfb;
      border:1px solid #edf1ef;border-radius:9px}
    .perq-item{display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 0;border-radius:5px;
      background:#fff;border:1px solid #eef2ef}
    .perq-item span{font-size:8.5px;color:#8a9c96;line-height:1.4}
    .perq-item strong{font-size:12px;color:#1d3b32;line-height:1.4;font-variant-numeric:tabular-nums}
    .perq-note{font-size:10px;color:#8a9c96;margin-top:5px;line-height:1.6}
    .link{border:0;background:none;color:#0e7a58;font:inherit;cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:2px}
    footer{display:flex;gap:8px;margin-top:16px}
    footer button{font:inherit;cursor:pointer;border-radius:10px;padding:10px 14px;transition:background .15s}
    .primary{flex:1;background:#0e6b4f;border:1px solid #0e6b4f;color:#fff;font-weight:650}
    .primary:hover{background:#0b5b43}
    .ghost{background:#fff;border:1px solid #dde7e2;color:#325147}
    .ghost:hover{background:#f3f8f5}
    button:disabled{opacity:.4;cursor:default}
    [hidden]{display:none!important}
    .panel[data-state=error] .pill{background:#fff2e8;color:#a05a25}
    .panel[data-state=done] .pill{background:#e6f6ee;color:#0b6b4e}
    @media (max-width:560px){
      .panel{right:10px;left:10px;bottom:10px;width:auto;max-height:76vh;border-radius:18px}
      .score strong{font-size:54px}
    }
    @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style>
  <section class="panel" data-state="busy" role="dialog" aria-label="自助查分" aria-live="polite" tabindex="-1">
    <header>
      <span class="brand"><i></i>自助查分<span class="ver">v${version}</span></span>
      <span class="pill" data-pill>连接中</span>
      <button class="icon" data-close aria-label="关闭自助查分">✕</button>
    </header>
    <div class="content">
      <p class="label">临时卷面分</p>
      <h2 data-title>正在读取当前作业</h2>
      <p class="desc" data-desc>核对登录状态与作业信息…</p>
      <p class="wait" data-wait hidden></p>
      <div class="score" data-score hidden><strong data-total>—</strong><span data-max></span></div>
      <p class="meta" data-meta hidden></p>
      <div class="notice">临时卷面分，最终以老师评定为准。<br>只读取你自己的得分；平台不向学生开放标准答案。</div>
      <details class="diag">
        <summary>诊断信息 · 每题得分</summary>
        <dl>
          <dt>版本</dt><dd data-d-version></dd>
          <dt>作业</dt><dd data-d-homework></dd>
          <dt>状态</dt><dd data-d-status></dd>
          <dt>登录态</dt><dd data-d-token></dd>
          <dt>请求</dt><dd data-d-requests></dd>
          <dt>用时</dt><dd data-d-elapsed></dd>
        </dl>
        <div class="perq" data-perq hidden>
          <div class="perq-head"><b>每题得分</b><span data-perq-sum></span></div>
          <div class="perq-grid" data-perq-grid></div>
          <p class="perq-note">分数由平台逐题返回，不含对错与标准答案。</p>
        </div>
        <button class="link" data-copy-diag type="button">复制诊断信息</button>
      </details>
    </div>
    <footer>
      <button class="primary" data-primary type="button">停止等待</button>
      <button class="ghost" data-copy type="button" hidden>复制成绩</button>
    </footer>
  </section>`;

  document.documentElement.appendChild(host);
  const el = (selector) => root.querySelector(selector);
  const panel = el('.panel');
  const titleEl = el('[data-title]');
  const descEl = el('[data-desc]');
  const waitEl = el('[data-wait]');
  const pillEl = el('[data-pill]');
  const scoreEl = el('[data-score]');
  const totalEl = el('[data-total]');
  const maxEl = el('[data-max]');
  const metaEl = el('[data-meta]');
  const perqEl = el('[data-perq]');
  const perqGrid = el('[data-perq-grid]');
  const perqSum = el('[data-perq-sum]');
  const primaryBtn = el('[data-primary]');
  const copyBtn = el('[data-copy]');
  const diag = { status: '准备中', token: '未读取', requests: 0, error: '' };
  const session = { token: '', source: '' };

  let controller = null;
  let generation = 0;
  let busy = false;
  let closed = false;
  let routeChanged = false;
  let lastResult = null;
  let ticker = null;
  let originalTitle = document.title;
  let titleChanged = false;

  function paint(fields) {
    if (fields.state) panel.dataset.state = fields.state;
    if (fields.pill) pillEl.textContent = fields.pill;
    if (fields.title) titleEl.textContent = fields.title;
    if (fields.desc != null) descEl.textContent = fields.desc;
    if (fields.wait != null) {
      waitEl.hidden = !fields.wait;
      if (fields.wait) waitEl.textContent = fields.wait;
    }
    if ('score' in fields) {
      scoreEl.hidden = fields.score == null;
      if (fields.score != null) {
        totalEl.textContent = fields.score.total;
        maxEl.textContent = '/ ' + fields.score.max;
      }
    }
    if (fields.meta != null) {
      metaEl.hidden = !fields.meta;
      metaEl.textContent = fields.meta || '';
    }
    if (fields.primary) {
      primaryBtn.textContent = fields.primary;
      primaryBtn.dataset.action = fields.primaryAction || 'stop';
    }
    if (fields.copy != null) copyBtn.hidden = !fields.copy;
    refreshDiag();
  }

  function refreshDiag() {
    el('[data-d-version]').textContent = 'v' + version;
    el('[data-d-homework]').textContent = ctx.homeworkId;
    el('[data-d-status]').textContent = diag.status + (diag.error ? ' · ' + diag.error : '');
    el('[data-d-token]').textContent = diag.token;
    el('[data-d-requests]').textContent = diag.requests + ' 次';
    el('[data-d-elapsed]').textContent = duration(Date.now() - runStartedAt);
  }

  function duration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  function fmtScore(value) {
    return String(Math.round(Number(value) * 100) / 100);
  }

  function renderBreakdown(result) {
    const list = result && Array.isArray(result.breakdown) ? result.breakdown : null;
    perqGrid.textContent = '';
    if (!list || !list.length) {
      perqEl.hidden = true;
      return;
    }
    perqEl.hidden = false;
    perqSum.textContent = list.length + ' 题 · 合计 ' + fmtScore(result.total);
    for (const item of list) {
      const cell = document.createElement('div');
      cell.className = 'perq-item';
      const label = document.createElement('span');
      label.textContent = '第' + item.order + '题';
      const score = document.createElement('strong');
      score.textContent = fmtScore(item.score);
      cell.append(label, score);
      perqGrid.append(cell);
    }
  }

  function nowText(ms) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(ms) + '（北京时间）';
  }

  function tick() {
    if (panel.dataset.state !== 'busy') return;
    const elapsed = Date.now() - runStartedAt;
    if (!waitEl.hidden) {
      const extra = elapsed > 120000 ? ' · 可以先去做别的，完成后标题会提示' : '';
      waitEl.textContent = '已等待 ' + duration(elapsed) + extra;
    }
    refreshDiag();
  }

  function startTicker() {
    clearInterval(ticker);
    ticker = setInterval(tick, 1000);
  }

  function stopTicker() {
    clearInterval(ticker);
    ticker = null;
  }

  function abortError() { return new StopError(); }

  function cancel() {
    generation += 1;
    busy = false;
    if (controller) { try { controller.abort(); } catch {} }
    stopTicker();
  }

  function check() {
    if (closed || routeChanged) throw abortError();
    if (controller && controller.signal.aborted) throw abortError();
    if (location.href !== startUrl) { routeChanged = true; throw abortError(); }
  }

  function dispose() {
    if (closed) return;
    closed = true;
    cancel();
    clearInterval(routeTimer);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    if (titleChanged) document.title = originalTitle;
    host.remove();
    try { delete window[KEY]; } catch { window[KEY] = undefined; }
    if (priorFocus && priorFocus.isConnected && typeof priorFocus.focus === 'function') {
      try { priorFocus.focus({ preventScroll: true }); } catch {}
    }
  }

  const onKey = (event) => {
    if (event.key === 'Escape' && (root.activeElement || document.activeElement === host)) dispose();
  };
  const onVisibility = () => {
    if (!document.hidden && titleChanged) { document.title = originalTitle; titleChanged = false; }
  };

  const routeTimer = setInterval(() => {
    if (closed || routeChanged || location.href === startUrl) return;
    routeChanged = true;
    cancel();
    paint({
      state: 'error', pill: '已停止', title: '页面已经切换',
      desc: '请关闭这个面板，在新的作业详情页重新点击书签。',
      score: null, meta: '', wait: '', primary: '关闭', primaryAction: 'close', copy: false,
    });
    diag.status = '页面已切换';
    refreshDiag();
  }, 500);

  /* ---------- 登录身份 ---------- */

  function fromStorage() {
    const stores = [window.localStorage, window.sessionStorage];
    for (const store of stores) {
      try {
        for (const key of TOKEN_KEYS) {
          const value = store.getItem(key);
          const found = normalizeToken(value);
          if (found) return found;
        }
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i);
          if (!key || !/token|auth|jwt/i.test(key)) continue;
          const found = normalizeToken(store.getItem(key));
          if (found) return found;
        }
      } catch {}
    }
    return '';
  }

  function normalizeToken(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let value = raw.trim();
    if (!value) return '';
    if (value.length > 2 && value[0] === '"' && value[value.length - 1] === '"') {
      try { value = String(JSON.parse(value)); } catch {}
    }
    if (/^Bearer\s+\S{10,}$/i.test(value)) return value;
    if (/^eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}$/.test(value)) return value;
    if (/^[A-Za-z0-9\-._~+/]{24,}={0,2}$/.test(value)) return value;
    return '';
  }

  function fromCookie() {
    let cookies = '';
    try { cookies = document.cookie || ''; } catch { return ''; }
    const pairs = cookies.split(';').map((item) => item.trim());
    for (const name of COOKIE_NAMES) {
      const hit = pairs.find((item) => item.startsWith(name + '='));
      if (!hit) continue;
      try {
        const value = decodeURIComponent(hit.slice(name.length + 1));
        if (value) return value;
      } catch {}
    }
    return '';
  }

  function cookieSource() {
    let cookies = '';
    try { cookies = document.cookie || ''; } catch { return ''; }
    for (const name of COOKIE_NAMES) {
      if (cookies.split(';').some((item) => item.trim().startsWith(name + '='))) return name;
    }
    return '';
  }

  function readAuthHeader(headers) {
    if (!headers) return '';
    try {
      if (typeof headers.get === 'function') return headers.get('authorization') || '';
      if (Array.isArray(headers)) {
        for (const [name, value] of headers) if (String(name).toLowerCase() === 'authorization') return String(value);
      } else if (typeof headers === 'object') {
        for (const name of Object.keys(headers)) {
          if (name.toLowerCase() === 'authorization') return String(headers[name]);
        }
      }
    } catch {}
    return '';
  }

  /**
   * 万不得已时的兜底：监听页面自己去请求接口时附带的 Authorization。
   * 同时包住 XHR 与 fetch，只观察同源请求，拿到就立刻还原。
   */
  function captureToken(signal, timeoutMs) {
    return new Promise((resolve, reject) => {
      const XHR = XMLHttpRequest.prototype;
      const originalOpen = XHR.open;
      const originalSet = XHR.setRequestHeader;
      const originalSend = XHR.send;
      const originalFetch = window.fetch;
      const records = new WeakMap();
      let finished = false;

      function restore() {
        if (XHR.open === patchOpen) XHR.open = originalOpen;
        if (XHR.setRequestHeader === patchSet) XHR.setRequestHeader = originalSet;
        if (XHR.send === patchSend) XHR.send = originalSend;
        if (window.fetch === patchFetch) window.fetch = originalFetch;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }
      function finish(error, token) {
        if (finished) return;
        finished = true;
        restore();
        error ? reject(error) : resolve(token);
      }
      function sameOrigin(url) {
        try { return new URL(url, location.href).origin === location.origin; } catch { return false; }
      }
      function patchOpen(method, url) {
        const result = originalOpen.apply(this, arguments);
        try { if (sameOrigin(url)) records.set(this, {}); } catch {}
        return result;
      }
      function patchSet(name, value) {
        const result = originalSet.apply(this, arguments);
        try {
          if (String(name).toLowerCase() === 'authorization' && records.has(this)) {
            const token = normalizeToken(String(value));
            if (token) records.get(this).token = token;
          }
        } catch {}
        return result;
      }
      function patchSend() {
        const token = records.get(this) && records.get(this).token;
        const result = originalSend.apply(this, arguments);
        if (token) finish(null, token);
        return result;
      }
      function patchFetch(input, init) {
        try {
          const url = typeof input === 'string' ? input : input && input.url;
          if (url && sameOrigin(url)) {
            let token = readAuthHeader(init && init.headers);
            if (!token && input && typeof input === 'object' && input.headers) token = readAuthHeader(input.headers);
            token = normalizeToken(token);
            if (token) finish(null, token);
          }
        } catch {}
        return originalFetch.apply(this, arguments);
      }
      const onAbort = () => finish(abortError());
      const timer = setTimeout(() => {
        finish(core.GradeError
          ? new core.GradeError('没能读到登录身份。请刷新作业页并重新登录后再试。', 'auth')
          : new Error('没能读到登录身份。'));
      }, timeoutMs);

      XHR.open = patchOpen;
      XHR.setRequestHeader = patchSet;
      XHR.send = patchSend;
      window.fetch = patchFetch;
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();

      // 温和地“碰”一下页面：部分单页应用在窗口重新获得焦点时会刷新数据。
      setTimeout(() => {
        if (finished) return;
        try { window.dispatchEvent(new Event('focus')); } catch {}
        try { document.dispatchEvent(new Event('visibilitychange')); } catch {}
      }, 1200);
      setTimeout(() => {
        if (finished) return;
        try { window.dispatchEvent(new Event('online')); } catch {}
      }, 6000);
    });
  }

  /* ---------- 网络 ---------- */

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(abortError()); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }

  async function post(path, body, token, signal) {
    check();
    diag.requests += 1;
    refreshDiag();
    const request = new AbortController();
    const onAbort = () => { try { request.abort(); } catch {} };
    signal.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { request.abort(); } catch {} }, 12000);
    const headers = { 'Content-Type': 'application/json;charset=UTF-8' };
    if (token) headers.Authorization = token;
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        mode: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        signal: request.signal,
        headers,
        body: JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) {
        throw new core.GradeError('登录已失效或没有读取权限，请重新登录后再试。', 'auth');
      }
      if (response.status === 429) throw new core.GradeError('请求太频繁，请稍等一会儿再试。', 'rate');
      if (!response.ok) throw new core.GradeError('平台暂时没有响应（HTTP ' + response.status + '）。', 'network');
      let json;
      try { json = await response.json(); } catch { throw new core.GradeError('接口返回的不是有效数据，请确认登录状态。', 'format'); }
      if (Number(json.code) === 401 || Number(json.code) === 403) {
        throw new core.GradeError('登录已失效或没有读取权限，请重新登录后再试。', 'auth');
      }
      if (Number(json.code) !== 200 || json.success === false) {
        throw new core.GradeError('平台拒绝了这次查询，请确认登录状态和作业权限。', 'api');
      }
      check();
      return json.data;
    } catch (error) {
      if (signal.aborted || closed || routeChanged) throw abortError();
      if (timedOut) throw new core.GradeError('网络请求超时，请稍后再试。', 'network');
      if (error instanceof TypeError) throw new core.GradeError('网络连接中断，请检查网络后再试。', 'network');
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  }

  /* ---------- 主流程 ---------- */

  async function ensureIdentity(signal) {
    const stored = fromStorage();
    if (stored) { session.token = stored; session.source = '页面存储'; }
    else {
      const cookie = fromCookie();
      if (cookie) { session.token = cookie; session.source = 'Cookie ' + (cookieSource() || ''); }
    }

    paint({ desc: '核对当前账号是否可以读取这次作业…' });
    diag.status = '校验访问权限';
    try {
      await post(DETAIL_API, ctx, session.token, signal);
      if (!session.token) session.source = '登录 Cookie';
      diag.token = session.source;
      return;
    } catch (error) {
      if (error.code !== 'auth' || signal.aborted) throw error;
      diag.token = '需要等待页面请求';
      paint({ desc: '等待页面自己发出一次带身份的请求，最多 30 秒；不需要修改答案。' });
      diag.status = '等待登录身份';
      session.token = await captureToken(signal, 30000);
      session.source = '页面请求头';
      diag.token = session.source;
      await post(DETAIL_API, ctx, session.token, signal);
    }
  }

  function phaseText(state) {
    const title = state.params ? state.params.title : '当前作业';
    switch (state.phase) {
      case 'aiReview':
        return { pill: 'AI 批阅中', title, desc: '分数仍在逐题写入，先不展示中间值。' };
      case 'checking':
        return { pill: '读取中', title, desc: '正在读取 ' + state.params.count + ' 道题的得分…' };
      case 'changing':
        return { pill: '同步中', title, desc: '批阅状态刚刚变化，等待这一轮写入完成。' };
      case 'incomplete':
        return { pill: '同步中', title, desc: '还有题目没有写完分数，继续等待。' };
      case 'verifying':
        return { pill: '复核中', title, desc: '再读一次，确认逐题得分没有变化。' };
      default:
        return { pill: '读取中', title, desc: '正在核对…' };
    }
  }

  function renderResult(result) {
    busy = false;
    stopTicker();
    lastResult = result;
    const total = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(result.total);
    paint({
      state: 'done', pill: '已读取', title: result.title,
      desc: '连续两次核对一致，当前卷面分如下。',
      wait: '', score: { total, max: result.max },
      meta: result.count + ' 道题已核对 · 读取于 ' + nowText(result.readAt),
      primary: '重新读取', primaryAction: 'run', copy: true,
    });
    renderBreakdown(result);
    diag.status = '读取完成';
    diag.error = '';
    refreshDiag();
    if (document.hidden && !titleChanged) {
      originalTitle = document.title;
      document.title = '【' + total + ' 分】' + result.title;
      titleChanged = true;
    }
  }

  function renderError(error) {
    busy = false;
    stopTicker();
    const hints = {
      auth: '登录可能已过期。刷新页面、重新登录后再点书签。',
      page: '请先打开作业详情页，再点击书签。',
      published: '这次作业的成绩已经公布，直接看页面上的正式成绩即可。',
      timeout: 'AI 批阅可能还没结束，可以过几分钟再点“重新读取”。',
      scope: '页面数据与账号对不上，为安全起见已停止。',
      unsupported: '当前只支持个人、题目型作业。',
      status: '作业还没进入待批阅状态，或已经过了这个阶段。',
      network: '检查网络后可以重试。',
      rate: '等一两分钟再试。',
    };
    paint({
      state: 'error', pill: '未能读取',
      title: error.code === 'published' ? '成绩已经发布' : '暂时看不到卷面分',
      desc: (error.message || '读取失败。') + (hints[error.code] ? ' ' + hints[error.code] : ''),
      wait: '', score: null, meta: '', primary: '重试', primaryAction: 'run', copy: false,
    });
    renderBreakdown(null);
    diag.status = '读取失败';
    diag.error = (error.code || 'error') + ': ' + (error.message || '');
    refreshDiag();
  }

  function renderStopped() {
    busy = false;
    stopTicker();
    paint({
      state: 'idle', pill: '已停止', title: '已停止读取',
      desc: '没有修改、提交或发布任何内容，可以随时重新读取。',
      wait: '', primary: '重新读取', primaryAction: 'run',
    });
    renderBreakdown(null);
    diag.status = '已停止';
    refreshDiag();
  }

  async function run() {
    if (busy) return;
    if (routeChanged || closed) return;
    cancel();
    const runId = generation;
    controller = new AbortController();
    const signal = controller.signal;
    busy = true;
    lastResult = null;
    renderBreakdown(null);
    runStartedAt = Date.now();
    diag.requests = 0;
    diag.status = '启动';
    diag.error = '';
    paint({
      state: 'busy', pill: '连接中', title: '正在读取当前作业',
      desc: '核对登录状态与作业信息…', wait: '已等待 00:00',
      score: null, meta: '', primary: '停止等待', primaryAction: 'stop', copy: false,
    });
    startTicker();

    try {
      await ensureIdentity(signal);
      if (runId !== generation) return;
      diag.status = '查询作业状态';
      paint({ pill: '读取中', desc: '正在核对作业状态与题目数量…' });

      const result = await core.collect({
        ctx,
        loadDetail: () => post(DETAIL_API, ctx, session.token, signal),
        loadAnswers: (params) => post(ANSWERS_API, {
          homeworkId: params.homeworkId,
          paperId: params.paperId,
          examId: params.examId,
          courseId: params.courseId,
          term: params.term,
          studentId: params.studentId,
        }, session.token, signal),
        update: (state) => {
          if (runId !== generation) return;
          const view = phaseText(state);
          diag.status = view.pill;
          refreshDiag();
          paint({ pill: view.pill, title: view.title, desc: view.desc, wait: '已等待 ' + duration(state.elapsed) });
        },
        check,
        sleep: (ms) => sleep(ms, signal),
        timeoutMs: 15 * 60 * 1000,
      });

      if (runId !== generation || closed) return;
      renderResult(result);
    } catch (error) {
      if (runId !== generation || closed) return;
      if (error && error.name === 'AbortError') renderStopped();
      else renderError(error);
    } finally {
      session.token = '';
      if (runId === generation) busy = false;
    }
  }

  async function copyText(text, button) {
    const original = button.textContent;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      button.textContent = '已复制';
    } catch {
      button.textContent = '复制失败';
    }
    setTimeout(() => { button.textContent = original; }, 1600);
  }

  function resultText() {
    if (!lastResult) return '';
    const total = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(lastResult.total);
    return lastResult.title + '：' + total + ' / ' + lastResult.max + ' 分（临时卷面分，读取于 ' +
      nowText(lastResult.readAt) + '，最终以老师评定为准）';
  }

  function diagText() {
    return JSON.stringify({
      tool: '自助查分 v' + version,
      at: new Date().toISOString(),
      url: location.href,
      homeworkId: ctx.homeworkId,
      status: diag.status,
      token: diag.token,
      requests: diag.requests,
      elapsedMs: Date.now() - runStartedAt,
      scores: lastResult && lastResult.breakdown
        ? Object.fromEntries(lastResult.breakdown.map((item) => [item.order, item.score]))
        : undefined,
      error: diag.error || undefined,
    }, null, 2);
  }

  primaryBtn.addEventListener('click', () => {
    if (primaryBtn.dataset.action === 'close') { dispose(); return; }
    if (primaryBtn.dataset.action === 'stop') { cancel(); renderStopped(); return; }
    void run();
  });
  copyBtn.addEventListener('click', () => copyText(resultText(), copyBtn));
  el('[data-close]').addEventListener('click', dispose);
  el('[data-copy-diag]').addEventListener('click', (event) => copyText(diagText(), event.currentTarget));
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisibility);

  window[KEY] = {
    version,
    focus: () => { try { panel.focus({ preventScroll: true }); } catch {} },
    close: dispose,
    rerun: run,
  };

  refreshDiag();
  try { panel.focus({ preventScroll: true }); } catch {}
  void run();
}

if (typeof module !== 'undefined' && module.exports) module.exports = startScoreReader;
