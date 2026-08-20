(() => {
  'use strict';

  const SUPABASE_URL = 'https://vutebqbacomgnxweaupb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_EfWYOeShH4-bLnwengMnPQ_b4ofnA41';
  const SESSION_KEY = 'ielts-cloud-session-v1';
  const LAST_SYNC_KEY = 'ielts-cloud-last-sync-v1';
  const DB_NAME = 'ielts-private-listening-bank-v1';
  const STORE_NAME = 'tests';
  const BUCKET = 'ielts-private-files';
  const SYNC_VERSION = '6.1';

  const state = { session: loadJson(SESSION_KEY), busy: false, cooldownUntil: 0, cooldownTimer: null, localCount: null, cloudCount: null };

  function loadJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function saveSession(session) {
    state.session = session;
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
    renderAccount();
  }
  function authHeaders(token, extra = {}) {
    return { apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  }
  async function api(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}${path}`, options);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `请求失败 ${response.status}`);
    return data;
  }
  async function ensureSession(forceRefresh = false) {
    const s = state.session;
    if (!s?.access_token) throw new Error('请先登录同步账号');
    if (!forceRefresh && (!s.expires_at || Date.now() < (s.expires_at * 1000 - 60000))) return s;
    if (!s.refresh_token) throw new Error('登录已过期，请重新登录');
    const refreshed = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: authHeaders('', { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    saveSession(normalizeSession(refreshed));
    return state.session;
  }
  function normalizeSession(data) {
    const raw = data?.session || data;
    if (!raw?.access_token) return null;
    return { ...raw, expires_at: raw.expires_at || Math.floor(Date.now() / 1000) + (raw.expires_in || 3600) };
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('part', 'part', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function dbAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      req.onsuccess = () => { db.close(); resolve(req.result || []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }
  async function dbPut(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  function collectLocalStorage() {
    const result = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || key === SESSION_KEY || key === LAST_SYNC_KEY) continue;
      if (key.startsWith('ielts-')) result[key] = localStorage.getItem(key);
    }
    return result;
  }
  function safePath(value) {
    return encodeURIComponent(String(value || 'item')).replace(/%/g, '_').slice(0, 160);
  }
  function normalizeTitle(value) {
    return String(value || '').replace(/\s+/g, ' ').replace(/^[\d０-９]+[.、]\s*/, '').trim().toLowerCase();
  }
  function canonicalTestKey(item) {
    return String(item?.part || 'P1').toUpperCase() + '|' + normalizeTitle(item?.title || item?.id);
  }
  function dedupeManifest(list) {
    const byFile = new Map();
    (Array.isArray(list) ? list : []).forEach(item => {
      if (!item?.htmlPath) return;
      const identity = item.htmlPath || item.id || canonicalTestKey(item);
      const previous = byFile.get(identity);
      if (!previous || Number(item.updatedAt || 0) >= Number(previous.updatedAt || 0)) byFile.set(identity, item);
    });
    const byTitle = new Map();
    [...byFile.values()].forEach(item => {
      const key = canonicalTestKey(item);
      const previous = byTitle.get(key);
      if (!previous || Number(item.updatedAt || 0) >= Number(previous.updatedAt || 0)) byTitle.set(key, item);
    });
    return [...byTitle.values()];
  }
  function mergeStorageValue(remoteValue, localValue) {
    if (localValue == null) return remoteValue;
    try {
      const remote = JSON.parse(remoteValue), local = JSON.parse(localValue);
      if (Array.isArray(remote) && Array.isArray(local)) {
        const map = new Map();
        [...remote, ...local].forEach((item, index) => map.set(item?.id || item?.title || JSON.stringify(item) || index, item));
        return JSON.stringify([...map.values()]);
      }
      if (remote && local && typeof remote === 'object' && typeof local === 'object') return JSON.stringify({ ...remote, ...local });
    } catch (_) {}
    return localValue;
  }
  function recoverStoredMeta(item) {
    const folder = String(item.htmlPath || item.id || '').split('/')[1] || String(item.id || '');
    let decoded = folder;
    try { decoded = decodeURIComponent(folder.replace(/_/g, '%')); } catch (_) {}
    const part = String(item.part || decoded.match(/\/(P[1-4])\//i)?.[1] || 'P1').toUpperCase();
    const decodedTitle = decoded.match(/(?:^|\/)(\d+\.\s*P[1-4][^/]+)/i)?.[1] || decoded.split('/').filter(Boolean).at(-2);
    const title = item.title || decodedTitle || '云端听力';
    return { id: item.id || decoded || crypto.randomUUID(), part, title };
  }
  function extension(name, type) {
    const match = String(name || '').match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match) return match[1].toLowerCase();
    if (type?.includes('mpeg')) return 'mp3';
    if (type?.includes('wav')) return 'wav';
    if (type?.includes('ogg')) return 'ogg';
    return 'bin';
  }
  function isExpiredTokenError(error) {
    return /exp.*claim.*timestamp|jwt.*expired|expired.*jwt|token.*expired/i.test(String(error?.message || error || ''));
  }
  async function uploadObject(token, path, blob, contentType, retried = false) {
    const safeContentType = String(contentType || 'application/octet-stream').split(';')[0].trim();
    try {
      await api(`/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST', headers: authHeaders(token, { 'Content-Type': safeContentType, 'x-upsert': 'true' }), body: blob
      });
    } catch (error) {
      if (!retried && isExpiredTokenError(error)) {
        setStatus('登录令牌已更新，正在从当前文件继续上传…');
        const fresh = await ensureSession(true);
        return uploadObject(fresh.access_token, path, blob, contentType, true);
      }
      throw error;
    }
  }
  async function downloadObject(token, path, attempt = 0) {
    try {
      const activeToken = state.session?.access_token || token;
      const response = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${path}`, { headers: authHeaders(activeToken) });
      if (!response.ok) {
        const detail = await response.text();
        const error = new Error(detail || `私人听力文件下载失败 ${response.status}`);
        if (isExpiredTokenError(error)) {
          const fresh = await ensureSession(true);
          return downloadObject(fresh.access_token, path, attempt);
        }
        throw error;
      }
      return response.blob();
    } catch (error) {
      if (attempt < 4 && !isExpiredTokenError(error)) {
        const delay = 800 * (2 ** attempt);
        setStatus(`网络中断，${Math.round(delay / 1000)} 秒后自动重试当前文件（${attempt + 1}/4）…`);
        await new Promise(resolve => setTimeout(resolve, delay));
        const fresh = await ensureSession(false);
        return downloadObject(fresh.access_token, path, attempt + 1);
      }
      throw error;
    }
  }
  async function uploadListening(token, uid, progress) {
    const tests = await dbAll();
    const manifest = [];
    for (let i = 0; i < tests.length; i += 1) {
      const test = tests[i];
      progress(`正在上传听力 ${i + 1}/${tests.length}：${test.title || test.id}`);
      const folder = `${uid}/${safePath(test.id)}`;
      const htmlPath = `${folder}/question.html`;
      const htmlBlob = new Blob([test.html || ''], { type: 'text/html' });
      await uploadObject(token, htmlPath, htmlBlob, 'text/html');
      let audioPath = null;
      if (test.audio instanceof Blob) {
        audioPath = `${folder}/audio.${extension(test.audio.name, test.audio.type)}`;
        await uploadObject(token, audioPath, test.audio, test.audio.type);
      }
      manifest.push({ id: test.id, part: test.part, title: test.title, frequency: test.frequency || 0, updatedAt: test.updatedAt || Date.now(), htmlPath, audioPath, audioType: test.audio?.type || '', audioName: test.audio?.name || '' });
    }
    return manifest;
  }
  function titleFromHtml(html, item, recovered) {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const candidates = [...doc.querySelectorAll('[data-title],h1,h2,h3,title')]
        .map(node => String(node.getAttribute?.('data-title') || node.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const exact = candidates.find(value => /^\d+\.\s*P[1-4]\b/i.test(value));
      const useful = candidates.find(value => value.length > 4 && value.length < 140 && !/IELTS Listening Practice|Questions?\s*\d|Text Size|Color/i.test(value));
      if (exact || useful) return exact || useful;
    } catch (_) {}
    return recovered.title;
  }
  async function downloadListening(token, manifest, progress, uid, snapshotId) {
    const list = Array.isArray(manifest) ? manifest : [];
    const existing = await dbAll();
    const existingIds = new Map(existing.map(record => [`${record.part || ''}|${String(record.title || '').trim().toLowerCase()}`, record.id]));
    const checkpointKey = `ielts-cloud-download-progress-${uid}`;
    const checkpoint = loadJson(checkpointKey);
    const startIndex = checkpoint?.snapshotId === snapshotId ? Math.min(Number(checkpoint.index) || 0, list.length) : 0;
    for (let i = startIndex; i < list.length; i += 1) {
      const item = list[i];
      progress(`${startIndex ? '断点续传' : '正在恢复'} ${i + 1}/${list.length}：${item.title || item.id}`);
      const html = await (await downloadObject(token, item.htmlPath)).text();
      let audio = null;
      if (item.audioPath) {
        const blob = await downloadObject(token, item.audioPath);
        audio = new File([blob], item.audioName || `audio.${extension('', item.audioType)}`, { type: item.audioType || blob.type });
      }
      const recovered = recoverStoredMeta(item);
      const restoredTitle = titleFromHtml(html, item, recovered);
      const sameTitleId = existingIds.get(`${recovered.part}|${String(restoredTitle).trim().toLowerCase()}`);
      await dbPut({ id: sameTitleId || recovered.id, part: recovered.part, title: restoredTitle, frequency: item.frequency || 0, updatedAt: item.updatedAt || Date.now(), html, audio, cloudPath: item.htmlPath });
      localStorage.setItem(checkpointKey, JSON.stringify({ snapshotId, index: i + 1 }));
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    localStorage.removeItem(checkpointKey);
  }

  async function uploadAll() {
    return withBusy(async () => {
      const session = await ensureSession(true);
      const uid = session.user?.id;
      if (!uid) throw new Error('无法识别账号，请重新登录');
      setStatus('正在整理本机学习记录…');
      const existingRows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(uid)}&select=payload&limit=1`, { headers: authHeaders(session.access_token) });
      const existingManifest = existingRows?.[0]?.payload?.listeningManifest || [];
      const localManifest = await uploadListening(session.access_token, uid, setStatus);
      const listeningManifest = dedupeManifest([...existingManifest, ...localManifest]);
      const payload = { localStorage: collectLocalStorage(), listeningManifest, exportedAt: new Date().toISOString() };
      const latest = await ensureSession(true);
      await api('/rest/v1/user_sync_state?on_conflict=user_id', {
        method: 'POST',
        headers: authHeaders(latest.access_token, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ user_id: uid, payload, version: Date.now(), device_name: navigator.userAgent.slice(0, 180), updated_at: new Date().toISOString() })
      });
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      setStatus(`上传完成：${Object.keys(payload.localStorage).length} 组学习记录，${listeningManifest.length} 篇听力。`);
      renderAccount();
    });
  }
  async function downloadAll() {
    if (!confirm('将云端学习记录恢复到本机，并覆盖同名记录。确定继续吗？')) return;
    return withBusy(async () => {
      const session = await ensureSession(true);
      const uid = session.user?.id;
      setStatus('正在读取云端记录…');
      const rows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(uid)}&select=payload,updated_at&limit=1`, { headers: authHeaders(session.access_token) });
      const row = rows?.[0];
      if (!row?.payload) throw new Error('云端还没有备份，请先在原设备点击“上传本机到云端”');
      Object.entries(row.payload.localStorage || {}).forEach(([key, value]) => localStorage.setItem(key, value));
      const cleanManifest = dedupeManifest(row.payload.listeningManifest);
      await downloadListening(session.access_token, cleanManifest, setStatus, uid, `${row.updated_at}|${cleanManifest.length}`);
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      setStatus('恢复完成，正在刷新页面…');
      setTimeout(() => location.reload(), 900);
    });
  }
  async function syncBoth() {
    return withBusy(async () => {
      const session = await ensureSession(true), uid = session.user?.id;
      if (!uid) throw new Error('无法识别账号，请重新登录');
      setStatus('正在比对电脑、手机与云端题库…');
      const rows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(uid)}&select=payload,updated_at&limit=1`, { headers: authHeaders(session.access_token) });
      const row = rows?.[0], remotePayload = row?.payload || {};
      const remoteManifest = dedupeManifest(remotePayload.listeningManifest);
      const localBefore = await dbAll();
      const localMap = new Map(localBefore.map(item => [canonicalTestKey(item), item]));
      const missing = remoteManifest.filter(item => {
        const local = localMap.get(canonicalTestKey(item));
        return !local || Number(item.updatedAt || 0) > Number(local.updatedAt || 0);
      });
      Object.entries(remotePayload.localStorage || {}).forEach(([key, value]) => {
        localStorage.setItem(key, mergeStorageValue(value, localStorage.getItem(key)));
      });
      if (missing.length) await downloadListening(session.access_token, missing, setStatus, uid, `smart|${row?.updated_at || Date.now()}|${missing.length}`);
      setStatus('云端内容已合并，正在上传统一后的题库…');
      const uploadedManifest = await uploadListening((await ensureSession(true)).access_token, uid, setStatus);
      const listeningManifest = dedupeManifest(uploadedManifest);
      const payload = { localStorage: collectLocalStorage(), listeningManifest, exportedAt: new Date().toISOString() };
      const latest = await ensureSession(true);
      await api('/rest/v1/user_sync_state?on_conflict=user_id', {
        method: 'POST',
        headers: authHeaders(latest.access_token, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ user_id: uid, payload, version: Date.now(), device_name: navigator.userAgent.slice(0, 180), updated_at: new Date().toISOString() })
      });
      state.localCount = listeningManifest.length; state.cloudCount = listeningManifest.length;
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      setStatus(`双向同步完成：电脑、手机与云端均为 ${listeningManifest.length} 篇。正在刷新…`);
      setTimeout(() => location.reload(), 1100);
    });
  }

  async function withBusy(task) {
    if (state.busy) return;
    state.busy = true; renderAccount();
    try { await task(); } catch (error) {
      const seconds = Number(String(error.message).match(/after\s+(\d+)\s+seconds?/i)?.[1] || 0);
      if (seconds) startCooldown(seconds);
      else setStatus(`失败：${error.message}`, true);
    }
    finally { state.busy = false; renderAccount(); }
  }
  function startCooldown(seconds) {
    state.cooldownUntil = Date.now() + seconds * 1000;
    clearInterval(state.cooldownTimer);
    const tick = () => {
      const left = Math.max(0, Math.ceil((state.cooldownUntil - Date.now()) / 1000));
      if (left > 0) setStatus(`请求过于频繁，请等待 ${left} 秒后再点登录或注册。`, true);
      else {
        clearInterval(state.cooldownTimer);
        state.cooldownTimer = null;
        state.cooldownUntil = 0;
        setStatus('现在可以重新登录或注册。');
      }
      renderAccount();
    };
    tick();
    state.cooldownTimer = setInterval(tick, 1000);
  }
  async function signup() {
    return withBusy(async () => {
      const { email, password } = credentials();
      if (password.length < 6) throw new Error('密码至少 6 位');
      const data = await api('/auth/v1/signup', { method: 'POST', headers: authHeaders('', { 'Content-Type': 'application/json' }), body: JSON.stringify({ email, password }) });
      const session = normalizeSession(data);
      if (session) { saveSession(session); setStatus('注册并登录成功。现在可上传本机数据。'); }
      else setStatus('注册成功。请打开邮箱确认后，再返回这里登录。');
    });
  }
  async function login() {
    return withBusy(async () => {
      const { email, password } = credentials();
      const data = await api('/auth/v1/token?grant_type=password', { method: 'POST', headers: authHeaders('', { 'Content-Type': 'application/json' }), body: JSON.stringify({ email, password }) });
      saveSession(normalizeSession(data));
      setStatus('登录成功。电脑和手机请使用同一个账号。');
    });
  }
  function credentials() {
    const email = document.getElementById('cloudEmail').value.trim();
    const password = document.getElementById('cloudPassword').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('请输入正确邮箱');
    if (!password) throw new Error('请输入密码');
    return { email, password };
  }
  function setStatus(message, error = false) {
    const el = document.getElementById('cloudStatus');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', error);
  }
  async function refreshCountDisplay() {
    if (!state.session?.access_token || state.busy) return;
    try {
      const localCount = (await dbAll()).length;
      const session = await ensureSession(false);
      const rows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(session.user.id)}&select=payload&limit=1`, { headers: authHeaders(session.access_token) });
      const cloudCount = dedupeManifest(rows?.[0]?.payload?.listeningManifest).length;
      state.localCount = localCount;
      state.cloudCount = cloudCount;
      const account = document.getElementById('cloudAccount');
      if (account) account.textContent = `已登录：${session.user?.email || '同步账号'} · 本机 ${localCount} 篇 / 云端 ${cloudCount} 篇`;
      const trigger = document.getElementById('cloudSyncTrigger');
      if (trigger) trigger.textContent = `☁ 本机${localCount} / 云端${cloudCount}`;
      if (cloudCount > localCount) setStatus(`云端比本机多 ${cloudCount - localCount} 篇。请点击“↓ 下载云端到本机”，并保持页面打开直到自动刷新。`);
      renderAccount();
    } catch (_) {}
  }

  function injectUi() {
    const style = document.createElement('style');
    style.textContent = `
      .cloud-sync-trigger{position:fixed;right:18px;bottom:86px;z-index:9998;border:0;border-radius:999px;background:#17634d;color:#fff;padding:13px 18px;font-weight:800;box-shadow:0 8px 25px #163e3038;cursor:pointer}
      .cloud-sync-modal{position:fixed;inset:0;z-index:9999;background:#0b2019a8;display:grid;place-items:center;padding:18px}.cloud-sync-modal[hidden]{display:none}
      .cloud-sync-card{width:min(560px,100%);max-height:90vh;overflow:auto;background:#f7fcf9;border-radius:24px;padding:24px;color:#173b30;box-shadow:0 20px 70px #0005}.cloud-sync-card h2{margin:0 0 8px}.cloud-sync-card p{line-height:1.6}
      .cloud-sync-close{float:right;border:0;background:transparent;font-size:25px}.cloud-sync-fields{display:grid;gap:10px}.cloud-sync-fields input{font:inherit;padding:13px;border:1px solid #b9d8cc;border-radius:12px}.cloud-sync-actions{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}.cloud-sync-actions button{border:1px solid #17634d;border-radius:999px;background:#fff;color:#17634d;padding:10px 15px;font-weight:750}.cloud-sync-actions .primary{background:#17634d;color:#fff}.cloud-sync-actions button:disabled{opacity:.45}.cloud-sync-fields[hidden],.cloud-sync-actions[hidden]{display:none!important}
      .cloud-sync-account{padding:11px 13px;background:#e4f4ed;border-radius:12px}.cloud-sync-status{min-height:48px;padding:10px 12px;border-left:4px solid #43a27e;background:#fff}.cloud-sync-status.error{border-color:#df654f;color:#9d2f20}.cloud-sync-note{font-size:13px;color:#527166}
    `;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', `
      <button class="cloud-sync-trigger" id="cloudSyncTrigger">☁ 云同步</button>
      <div class="cloud-sync-modal" id="cloudSyncModal" hidden><section class="cloud-sync-card" role="dialog" aria-modal="true" aria-label="跨设备云同步">
        <button class="cloud-sync-close" id="cloudSyncClose" aria-label="关闭">×</button>
        <h2>电脑和手机数据互通</h2><p>两台设备登录同一个账号。打开云头像后会自动双向合并；也可以使用下面的手动按钮。</p>
        <div class="cloud-sync-account" id="cloudAccount"></div>
        <div class="cloud-sync-fields" id="cloudFields"><input id="cloudEmail" type="email" autocomplete="email" placeholder="邮箱"><input id="cloudPassword" type="password" autocomplete="current-password" placeholder="密码（至少6位）"></div>
        <div class="cloud-sync-actions" id="cloudGuestActions"><button id="cloudSignup">注册</button><button class="primary" id="cloudLogin">登录</button></div>
        <div class="cloud-sync-actions" id="cloudUserActions"><button class="primary" id="cloudSmartSync">↕ 智能双向同步</button><button id="cloudUpload">↑ 仅上传</button><button id="cloudDownload">↓ 仅下载</button><button id="cloudLogout">退出账号</button></div>
        <p class="cloud-sync-status" id="cloudStatus">准备同步。听力音频较大时，请保持页面打开。</p>
        <p class="cloud-sync-note">同步版本 v${SYNC_VERSION}。会同步：做题记录、错题复盘、词汇与记忆卡片、作文/口语记录，以及私人听力 HTML 和音频。账号之间的数据互相隔离。</p>
      </section></div>`);
    const modal = document.getElementById('cloudSyncModal');
    document.getElementById('cloudSyncTrigger').onclick = async () => {
      modal.hidden = false;
      renderAccount();
      await refreshCountDisplay();
      const active = state.session;
      const autoKey = 'ielts-cloud-auto-merge-v6.1';
      if (active?.access_token && !sessionStorage.getItem(autoKey)) {
        sessionStorage.setItem(autoKey, 'running');
        setStatus('正在自动合并电脑、手机与云端数据，请保持页面打开…');
        try { await syncBoth(); sessionStorage.setItem(autoKey, 'done'); }
        catch (error) { sessionStorage.removeItem(autoKey); setStatus('自动合并未完成：' + (error?.message || error), true); }
      }
    };
    document.getElementById('cloudSyncClose').onclick = () => { modal.hidden = true; };
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
    document.getElementById('cloudSignup').onclick = signup;
    document.getElementById('cloudLogin').onclick = login;
    document.getElementById('cloudSmartSync').onclick = syncBoth;
    document.getElementById('cloudUpload').onclick = uploadAll;
    document.getElementById('cloudDownload').onclick = downloadAll;
    document.getElementById('cloudLogout').onclick = () => { saveSession(null); setStatus('已退出账号。'); };
    renderAccount();
  }
  function renderAccount() {
    const account = document.getElementById('cloudAccount');
    if (!account) return;
    const logged = Boolean(state.session?.access_token);
    account.textContent = logged ? `已登录：${state.session.user?.email || '同步账号'}` : '尚未登录';
    document.getElementById('cloudFields').hidden = logged;
    document.getElementById('cloudGuestActions').hidden = logged;
    document.getElementById('cloudUserActions').hidden = !logged;
    document.querySelectorAll('#cloudSyncModal button').forEach(button => { if (!button.classList.contains('cloud-sync-close')) button.disabled = state.busy || state.cooldownUntil > Date.now(); });
    const upload = document.getElementById('cloudUpload');
    const download = document.getElementById('cloudDownload');
    const shouldDownload = logged && state.cloudCount > state.localCount;
    if (upload && shouldDownload) upload.disabled = true;
    if (download) download.classList.toggle('primary', shouldDownload);
    const last = localStorage.getItem(LAST_SYNC_KEY);
    const trigger = document.getElementById('cloudSyncTrigger');
    if (trigger) trigger.textContent = last ? '☁ 已同步' : '☁ 云同步';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectUi);
  else injectUi();
})();
