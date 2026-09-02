(() => {
  'use strict';

  const SUPABASE_URL = 'https://vutebqbacomgnxweaupb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_EfWYOeShH4-bLnwengMnPQ_b4ofnA41';
  const SESSION_KEY = 'ielts-cloud-session-v1';
  const LAST_SYNC_KEY = 'ielts-cloud-last-sync-v1';
  const DB_NAME = 'ielts-private-listening-bank-v1';
  const STORE_NAME = 'tests';
  const BUCKET = 'ielts-private-files';
  const SYNC_VERSION = '7.3';

  const state = { session: loadJson(SESSION_KEY), busy: false, learningRecoveryRunning: false, cooldownUntil: 0, cooldownTimer: null, localCount: null, cloudCount: null };

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
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('part', 'part', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
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
  function isPlaceholderTitle(value) {
    const title=String(value||'').replace(/\s+/g,' ').trim();
    return !title||/^(?:云端听力|未命名(?:题目)?|未知题目|untitled|listening)(?:\s*\d+)?$/i.test(title);
  }
  function stableTestKey(item) {
    return String(item?.id||item?.htmlPath||canonicalTestKey(item));
  }
  function preferNewest(previous,item) {
    if(!previous)return item;
    if(isPlaceholderTitle(previous.title)&&!isPlaceholderTitle(item.title))return item;
    if(!isPlaceholderTitle(previous.title)&&isPlaceholderTitle(item.title))return previous;
    return Number(item.updatedAt||0)>=Number(previous.updatedAt||0)?item:previous;
  }
  function dedupeSyncItems(list, requireHtmlPath = false) {
    const byStable=new Map();
    (Array.isArray(list)?list:[]).forEach(item=>{
      if(!item||(requireHtmlPath&&!item.htmlPath))return;
      const key=requireHtmlPath?String(item.htmlPath||item.id):stableTestKey(item),previous=byStable.get(key);
      byStable.set(key,preferNewest(previous,item));
    });
    return [...byStable.values()];
  }
  function dedupeManifest(list) {
    return dedupeSyncItems(list,true);
  }
  function dedupeLocalTests(list) {
    return dedupeSyncItems(list,false);
  }
  function applyComputerTitle(remote,local) {
    if(!remote||isPlaceholderTitle(local?.title))return remote;
    return {...remote,title:local.title,part:local.part||remote.part};
  }
  function arrayItemKey(item, index) {
    if (item == null || typeof item !== 'object') return typeof item + ':' + JSON.stringify(item);
    if (item.id) return 'id:' + item.id;
    if (item.date && item.title) return ['attempt', item.title, item.part || '', item.date, item.correct ?? '', item.total ?? ''].join('|');
    if (item.word) return 'word:' + String(item.word).toLowerCase();
    if (item.front) return 'front:' + String(item.category || '') + '|' + String(item.front).toLowerCase();
    return 'json:' + JSON.stringify(item);
  }
  function mergeStorageValue(remoteValue, localValue) {
    if (localValue == null) return remoteValue;
    if (remoteValue == null) return localValue;
    try {
      const remote = JSON.parse(remoteValue), local = JSON.parse(localValue);
      if (Array.isArray(remote) && Array.isArray(local)) {
        const map = new Map();
        remote.forEach((item, index) => map.set(arrayItemKey(item, index), item));
        local.forEach((item, index) => map.set(arrayItemKey(item, index), item));
        return JSON.stringify([...map.values()]);
      }
      if (remote && local && typeof remote === 'object' && typeof local === 'object') return JSON.stringify({ ...remote, ...local });
    } catch (_) {}
    return localValue || remoteValue;
  }
  function mergeStorageMaps(remoteMap = {}, localMap = {}) {
    const merged = {};
    new Set([...Object.keys(remoteMap || {}), ...Object.keys(localMap || {})]).forEach(key => {
      merged[key] = mergeStorageValue(remoteMap?.[key], localMap?.[key]);
    });
    return merged;
  }
  function recoverStoredMeta(item) {
    const folder = String(item.htmlPath || item.id || '').split('/')[1] || String(item.id || '');
    let decoded = folder;
    try { decoded = decodeURIComponent(folder.replace(/_/g, '%')); } catch (_) {}
    const part = String(item.part || decoded.match(/\/(P[1-4])\//i)?.[1] || 'P1').toUpperCase();
    const decodedTitle = decoded.match(/(?:^|\/)(\d+\.\s*P[1-4][^/]+)/i)?.[1] || decoded.split('/').filter(Boolean).at(-2);
    const title = (!isPlaceholderTitle(item.title)&&item.title) || decodedTitle || item.title || '云端听力';
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
  async function uploadObject(token, path, blob, contentType, attempt = 0) {
    const safeContentType = String(contentType || 'application/octet-stream').split(';')[0].trim();
    try {
      const activeToken = state.session?.access_token || token;
      await api(`/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST', headers: authHeaders(activeToken, { 'Content-Type': safeContentType, 'x-upsert': 'true' }), body: blob
      });
    } catch (error) {
      if (isExpiredTokenError(error)) {
        setStatus('登录令牌已更新，正在从当前文件继续上传…');
        const fresh = await ensureSession(true);
        return uploadObject(fresh.access_token, path, blob, contentType, attempt);
      }
      if (attempt < 4) {
        const delay = 900 * (2 ** attempt);
        setStatus(`上传暂时中断，${Math.max(1, Math.round(delay / 1000))} 秒后从当前文件重试（${attempt + 1}/4）…`);
        await new Promise(resolve => setTimeout(resolve, delay));
        const fresh = await ensureSession(false);
        return uploadObject(fresh.access_token, path, blob, contentType, attempt + 1);
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
  function localAssetEntries(test) {
    return (Array.isArray(test?.assets) ? test.assets : []).map((item, index) => {
      const blob = item?.blob instanceof Blob ? item.blob : (item instanceof Blob ? item : null);
      if (!blob) return null;
      return { name: item?.name || blob.name || `asset-${index}`, type: item?.type || blob.type || 'application/octet-stream', blob };
    }).filter(Boolean);
  }
  async function persistCloudState(session, uid, localStorageMap, listeningManifest) {
    const active = await ensureSession(false);
    await api('/rest/v1/user_sync_state?on_conflict=user_id', {
      method: 'POST',
      headers: authHeaders(active.access_token || session.access_token, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        user_id: uid,
        payload: { localStorage: localStorageMap, listeningManifest: dedupeManifest(listeningManifest), exportedAt: new Date().toISOString() },
        version: Date.now(),
        device_name: navigator.userAgent.slice(0, 180),
        updated_at: new Date().toISOString()
      })
    });
  }
  async function uploadListening(token, uid, progress, existingManifest = [], onCheckpoint = null) {
    const tests = dedupeLocalTests(await dbAll());
    const cleanRemote=dedupeManifest(existingManifest);
    const remoteById = new Map(cleanRemote.map(item => [String(item.id||''), item]));
    const remoteByPath = new Map(cleanRemote.map(item => [String(item.htmlPath||''), item]));
    const manifest = [];
    let changed = 0;
    for (let i = 0; i < tests.length; i += 1) {
      let test = tests[i];
      const recovered = recoverStoredMeta(test);
      const healedTitle = titleFromHtml(test.html || '', test, recovered);
      if (healedTitle && healedTitle !== test.title && !/^云端听力(?:\s+\d+)?$/i.test(healedTitle)) {
        test = {...test,title:healedTitle,part:recovered.part || test.part};
        await dbPut(test);
      }
      const previous = remoteById.get(String(test.id||'')) || remoteByPath.get(String(test.cloudPath||''));
      const namedPrevious = applyComputerTitle(previous,test);
      const assets = localAssetEntries(test);
      const needsUpload = !namedPrevious ||
        Number(test.updatedAt || 0) > Number(namedPrevious.updatedAt || 0) ||
        (test.audio instanceof Blob && !namedPrevious.audioPath) ||
        (assets.length && (namedPrevious.assets || []).length < assets.length);
      if (!needsUpload) {
        manifest.push(namedPrevious);
        remoteById.set(String(test.id||''),namedPrevious);remoteByPath.set(String(namedPrevious.htmlPath||''),namedPrevious);
        progress(`正在核对听力 ${i + 1}/${tests.length}：${test.title || test.id}（名称已按电脑统一）`);
        continue;
      }
      progress(`正在上传听力 ${i + 1}/${tests.length}：${test.title || test.id}`);
      const folder = `${uid}/${safePath(test.id)}`;
      const htmlPath = `${folder}/question.html`;
      await uploadObject(token, htmlPath, new Blob([test.html || ''], { type: 'text/html' }), 'text/html');
      let audioPath = namedPrevious?.audioPath || null;
      let audioType = namedPrevious?.audioType || '';
      let audioName = namedPrevious?.audioName || '';
      if (test.audio instanceof Blob) {
        audioPath = `${folder}/audio.${extension(test.audio.name, test.audio.type)}`;
        audioType = test.audio.type || 'audio/mpeg';
        audioName = test.audio.name || 'audio.mp3';
        await uploadObject(token, audioPath, test.audio, audioType);
      }
      const assetManifest = [];
      for (let a = 0; a < assets.length; a += 1) {
        const asset = assets[a];
        const assetPath = `${folder}/assets/${safePath(asset.name)}`;
        await uploadObject(token, assetPath, asset.blob, asset.type);
        assetManifest.push({ name: asset.name, path: assetPath, type: asset.type });
      }
      const item = {
        id: test.id, part: test.part, title: test.title, frequency: test.frequency || 0,
        updatedAt: test.updatedAt || Date.now(), htmlPath, audioPath, audioType, audioName,
        assets: assetManifest.length ? assetManifest : (namedPrevious?.assets || [])
      };
      manifest.push(item);
      remoteById.set(String(test.id||''),item);
      remoteByPath.set(String(item.htmlPath||''),item);
      changed += 1;
      if (onCheckpoint && changed % 8 === 0) {
        await onCheckpoint(dedupeManifest([...existingManifest, ...manifest]));
      }
    }
    if (onCheckpoint && changed) await onCheckpoint(dedupeManifest([...existingManifest, ...manifest]));
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
    const existingById = new Map(existing.map(record => [String(record.id||''), record]));
    const existingByPath = new Map(existing.filter(record=>record.cloudPath).map(record => [String(record.cloudPath), record]));
    const checkpointKey = `ielts-cloud-download-progress-${uid}`;
    const checkpoint = loadJson(checkpointKey);
    const startIndex = checkpoint?.snapshotId === snapshotId ? Math.min(Number(checkpoint.index) || 0, list.length) : 0;
    for (let i = startIndex; i < list.length; i += 1) {
      const item = list[i];
      const local = existingById.get(String(item.id||'')) || existingByPath.get(String(item.htmlPath||''));
      const needsNameRepair=local&&isPlaceholderTitle(local.title)&&!isPlaceholderTitle(item.title);
      if (local && needsNameRepair && Number(local.updatedAt || 0) >= Number(item.updatedAt || 0) && local.html) {
        const renamed={...local,title:item.title,part:item.part||local.part};await dbPut(renamed);
        existingById.set(String(renamed.id||''),renamed);existingByPath.set(String(item.htmlPath||''),renamed);
        progress(`已按电脑命名：${item.title}`);
        localStorage.setItem(checkpointKey, JSON.stringify({ snapshotId, index: i + 1 }));
        continue;
      }
      if (local && !needsNameRepair && Number(local.updatedAt || 0) >= Number(item.updatedAt || 0) && local.html) {
        localStorage.setItem(checkpointKey, JSON.stringify({ snapshotId, index: i + 1 }));
        continue;
      }
      progress(`${startIndex ? '断点续传' : '正在恢复'} ${i + 1}/${list.length}：${item.title || item.id}`);
      const html = await (await downloadObject(token, item.htmlPath)).text();
      let audio = local?.audio || null;
      if (item.audioPath) {
        const blob = await downloadObject(token, item.audioPath);
        audio = new File([blob], item.audioName || `audio.${extension('', item.audioType)}`, { type: item.audioType || blob.type });
      }
      const assets = [];
      for (const asset of (item.assets || [])) {
        if (!asset?.path) continue;
        const blob = await downloadObject(token, asset.path);
        assets.push({ name: asset.name || 'asset', type: asset.type || blob.type, blob });
      }
      const recovered = recoverStoredMeta(item);
      const restoredTitle = titleFromHtml(html, item, recovered);
      const record = {
        id: local?.id || recovered.id, part: recovered.part, title: restoredTitle,
        frequency: item.frequency || 0, updatedAt: item.updatedAt || Date.now(),
        html, audio, assets: assets.length ? assets : (local?.assets || []), cloudPath: item.htmlPath
      };
      await dbPut(record);
      existingById.set(String(record.id||''),record);
      existingByPath.set(String(item.htmlPath||''), record);
      localStorage.setItem(checkpointKey, JSON.stringify({ snapshotId, index: i + 1 }));
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    localStorage.removeItem(checkpointKey);
  }
  async function uploadAll() {
    return withBusy(async () => {
      const session = await ensureSession(true);
      const uid = session.user?.id;
      if (!uid) throw new Error('无法识别账号，请重新登录');
      const localRowsBeforeUpload = await dbAll();
      if (!localRowsBeforeUpload.length) throw new Error('检测到本机听力为 0，已禁止空题库上传。请先点击“从云端恢复听力”。');
      setStatus('正在整理本机学习记录…');
      const existingRows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(uid)}&select=payload&limit=1`, { headers: authHeaders(session.access_token) });
      const remotePayload = existingRows?.[0]?.payload || {};
      const existingManifest = dedupeManifest(remotePayload.listeningManifest);
      const mergedStorage = mergeStorageMaps(remotePayload.localStorage, collectLocalStorage());
      const localManifest = await uploadListening(session.access_token, uid, setStatus, existingManifest, async partial => {
        await persistCloudState(session, uid, mergedStorage, partial);
        setStatus(`已安全保存云端进度：${partial.length} 篇；继续上传…`);
      });
      const listeningManifest = dedupeManifest([...existingManifest, ...localManifest]);
      await persistCloudState(session, uid, mergedStorage, listeningManifest);
      const localRows = await dbAll(),localCount = dedupeLocalTests(localRows).length;
      if (listeningManifest.length < localCount) throw new Error(`云端校验未通过：本机 ${localCount} 篇，云端仅 ${listeningManifest.length} 篇；本机数据未被覆盖，请再次点智能同步继续`);
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      state.localCount = localCount; state.cloudCount = listeningManifest.length;
      setStatus(`上传完成并校验：本机 ${localCount} 篇不重复题目，云端 ${listeningManifest.length} 篇；名称已按电脑统一。`);
      renderAccount();
    });
  }
  async function downloadAll() {
    return withBusy(async () => {
      const session = await ensureSession(true);
      const uid = session.user?.id;
      setStatus('正在读取并合并云端记录…');
      const rows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(uid)}&select=payload,updated_at&limit=1`, { headers: authHeaders(session.access_token) });
      const row = rows?.[0];
      if (!row?.payload) throw new Error('云端还没有备份，请先在原设备点击“智能双向同步”');
      const mergedStorage = mergeStorageMaps(row.payload.localStorage, collectLocalStorage());
      Object.entries(mergedStorage).forEach(([key, value]) => localStorage.setItem(key, value));
      const cleanManifest = dedupeManifest(row.payload.listeningManifest);
      const local = await dbAll();
      const localById = new Map(local.map(item => [String(item.id||''), item]));
      const localByPath = new Map(local.filter(item=>item.cloudPath).map(item => [String(item.cloudPath), item]));
      const needed = cleanManifest.filter(item => {
        const current = localById.get(String(item.id||'')) || localByPath.get(String(item.htmlPath||''));
        return !current || Number(item.updatedAt || 0) > Number(current.updatedAt || 0) || (isPlaceholderTitle(current.title)&&!isPlaceholderTitle(item.title));
      });
      await downloadListening(session.access_token, needed, setStatus, uid, `${row.updated_at}|${needed.length}`);
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      setStatus(`合并完成：新增或更新 ${needed.length} 篇，原设备数据全部保留。正在刷新…`);
      setTimeout(() => location.reload(), 1200);
    });
  }
  async function syncBoth() {
    return withBusy(async () => {
      const session = await ensureSession(true), uid = session.user?.id;
      if (!uid) throw new Error('无法识别账号，请重新登录');
      setStatus('正在比对电脑、手机与云端；只合并，不删除任何一端的数据…');
      const rows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(uid)}&select=payload,updated_at&limit=1`, { headers: authHeaders(session.access_token) });
      const row = rows?.[0], remotePayload = row?.payload || {};
      const remoteManifest = dedupeManifest(remotePayload.listeningManifest);
      const mergedStorage = mergeStorageMaps(remotePayload.localStorage, collectLocalStorage());
      Object.entries(mergedStorage).forEach(([key, value]) => localStorage.setItem(key, value));

      const localBefore = await dbAll();
      const localById = new Map(localBefore.map(item => [String(item.id||''), item]));
      const localByPath = new Map(localBefore.filter(item=>item.cloudPath).map(item => [String(item.cloudPath), item]));
      const missing = remoteManifest.filter(item => {
        const local = localById.get(String(item.id||'')) || localByPath.get(String(item.htmlPath||''));
        return !local || Number(item.updatedAt || 0) > Number(local.updatedAt || 0) || (isPlaceholderTitle(local.title)&&!isPlaceholderTitle(item.title));
      });
      if (missing.length) {
        setStatus(`云端有 ${missing.length} 篇本机缺少，先安全补到本机…`);
        await downloadListening(session.access_token, missing, setStatus, uid, `merge|${row?.updated_at || Date.now()}|${missing.length}`);
      }

      const localAfterDownload = await dbAll();
      setStatus(`本机现有 ${localAfterDownload.length} 篇，正在把云端缺少的篇目续传…`);
      const uploaded = await uploadListening((await ensureSession(false)).access_token, uid, setStatus, remoteManifest, async partial => {
        await persistCloudState(session, uid, mergedStorage, partial);
        setStatus(`断点已保存：云端现在有 ${partial.length} 篇；继续同步…`);
      });
      const finalManifest = dedupeManifest([...remoteManifest, ...uploaded]);
      await persistCloudState(session, uid, mergedStorage, finalManifest);

      const verifyRows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(uid)}&select=payload&limit=1`, { headers: authHeaders((await ensureSession(false)).access_token) });
      const verifiedManifest = dedupeManifest(verifyRows?.[0]?.payload?.listeningManifest);
      const finalLocal = await dbAll();
      const finalLocalCount=dedupeLocalTests(finalLocal).length;
      state.localCount = finalLocalCount; state.cloudCount = verifiedManifest.length;
      if (verifiedManifest.length < finalLocalCount) {
        throw new Error(`同步未完整：本机 ${finalLocalCount} 篇不重复题目，云端 ${verifiedManifest.length} 篇。本机内容已保留，请再次点击“智能双向同步”从断点继续`);
      }
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      setStatus(`同步完成：本机 ${finalLocalCount} 篇不重复题目，云端 ${verifiedManifest.length} 篇；手机缺失名称已按电脑修正。正在刷新…`);
      setTimeout(() => location.reload(), 1400);
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
      setStatus('登录成功。正在检查并恢复云端听力…');
      setTimeout(async () => {
        try {
          const restored = await autoRecoverMissingLearningData();
          if (!restored) await autoRecoverEmptyListening();
        } catch (_) {}
      }, 700);
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
      const localRows=await dbAll(),localCount = dedupeLocalTests(localRows).length,rawLocalCount=localRows.length;
      const session = await ensureSession(false);
      const rows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(session.user.id)}&select=payload&limit=1`, { headers: authHeaders(session.access_token) });
      const cloudCount = dedupeManifest(rows?.[0]?.payload?.listeningManifest).length;
      state.localCount = localCount;
      state.cloudCount = cloudCount;
      const account = document.getElementById('cloudAccount');
      if (account) account.textContent = `已登录：${session.user?.email || '同步账号'} · 本机 ${localCount} 篇不重复题目${rawLocalCount>localCount?`（共 ${rawLocalCount} 条文件）`:''} / 云端 ${cloudCount} 篇`;
      const trigger = document.getElementById('cloudSyncTrigger');
      if (trigger) trigger.textContent = `☁ 本机${localCount} / 云端${cloudCount}`;
      if (cloudCount > localCount) setStatus(`云端比本机多 ${cloudCount - localCount} 篇。请点击“↓ 下载云端到本机”，并保持页面打开直到自动刷新。`);
      showRecoveryBanner(localCount === 0, cloudCount);
      renderAccount();
    } catch (_) {}
  }

  function showRecoveryBanner(show, cloudCount = state.cloudCount, customMessage = '') {
    const banner = document.getElementById('listeningRecoveryBanner');
    if (!banner) return;
    banner.hidden = !show;
    const text = banner.querySelector('span');
    if (text) text.textContent = customMessage || (state.session?.access_token
      ? `检测到本机听力为空。点击立即从云端恢复${Number(cloudCount)>0?` ${cloudCount} 篇`:''}。`
      : '检测到本机听力为空。请登录原来的同步账号立即恢复。');
  }
  function parseStored(value, fallback) {
    try { return value == null ? fallback : JSON.parse(value); } catch (_) { return fallback; }
  }
  function arraySize(value) {
    const parsed = parseStored(value, []);
    return Array.isArray(parsed) ? parsed.length : 0;
  }
  function dictationSize(value) {
    const parsed = parseStored(value, null);
    return Array.isArray(parsed?.articles) ? parsed.articles.length : 0;
  }
  function mergeDictationBanks(remoteValue, localValue) {
    const remote = parseStored(remoteValue, null), local = parseStored(localValue, null);
    if (!remote?.articles?.length) return localValue || remoteValue;
    if (!local?.articles?.length) return remoteValue;
    const articles = new Map(remote.articles.map(article => [String(article.id || article.title), article]));
    local.articles.forEach(article => {
      const key = String(article.id || article.title), previous = articles.get(key);
      if (!previous) { articles.set(key, article); return; }
      const answers = new Map((previous.answers || []).map(answer => [String(answer.id || answer.answer), answer]));
      (article.answers || []).forEach(answer => answers.set(String(answer.id || answer.answer), answer));
      articles.set(key, { ...previous, ...article, answers: [...answers.values()] });
    });
    return JSON.stringify({ ...remote, ...local, articles: [...articles.values()] });
  }
  async function autoRecoverMissingLearningData() {
    if (state.learningRecoveryRunning) return false;
    const localWordCount = arraySize(localStorage.getItem('ielts-listening-custom-v1'));
    const localDictationCount = dictationSize(localStorage.getItem('ielts-answer-dictation-bank-v1'));
    const localHistoryCount = arraySize(localStorage.getItem('ielts-listening-test-history-v1'));
    if (!state.session?.access_token) {
      if (!localWordCount || !localDictationCount) showRecoveryBanner(true, state.cloudCount, '检测到单词反应卡或答案词听写未加载。请登录原同步账号恢复。');
      return false;
    }
    state.learningRecoveryRunning = true;
    try {
      const session = await ensureSession(false), uid = session.user?.id;
      const rows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(uid)}&select=payload&limit=1`, { headers: authHeaders(session.access_token) });
      const remote = rows?.[0]?.payload?.localStorage || {};
      const remoteWordCount = arraySize(remote['ielts-listening-custom-v1']);
      const remoteDictationCount = dictationSize(remote['ielts-answer-dictation-bank-v1']);
      const remoteHistoryCount = arraySize(remote['ielts-listening-test-history-v1']);
      const restoreWords = remoteWordCount > localWordCount;
      const restoreDictation = remoteDictationCount > localDictationCount;
      const restoreHistory = remoteHistoryCount > localHistoryCount;
      if (!restoreWords && !restoreDictation && !restoreHistory) return false;
      const names = [];
      if (restoreWords) {
        localStorage.setItem('ielts-listening-custom-v1', mergeStorageValue(remote['ielts-listening-custom-v1'], localStorage.getItem('ielts-listening-custom-v1')));
        if (remote['ielts-listening-state-v1']) localStorage.setItem('ielts-listening-state-v1', mergeStorageValue(remote['ielts-listening-state-v1'], localStorage.getItem('ielts-listening-state-v1')));
        names.push(`单词反应卡 ${remoteWordCount} 张`);
      }
      if (restoreDictation) {
        localStorage.setItem('ielts-answer-dictation-bank-v1', mergeDictationBanks(remote['ielts-answer-dictation-bank-v1'], localStorage.getItem('ielts-answer-dictation-bank-v1')));
        if (remote['ielts-answer-dictation-state-v1']) localStorage.setItem('ielts-answer-dictation-state-v1', mergeStorageValue(remote['ielts-answer-dictation-state-v1'], localStorage.getItem('ielts-answer-dictation-state-v1')));
        if (remote['ielts-answer-dictation-article-v1'] && !localStorage.getItem('ielts-answer-dictation-article-v1')) localStorage.setItem('ielts-answer-dictation-article-v1', remote['ielts-answer-dictation-article-v1']);
        names.push(`答案词听写 ${remoteDictationCount} 篇`);
      }
      if (restoreHistory) {
        localStorage.setItem('ielts-listening-test-history-v1', mergeStorageValue(remote['ielts-listening-test-history-v1'], localStorage.getItem('ielts-listening-test-history-v1')));
        names.push(`做题记录 ${remoteHistoryCount} 条`);
      }
      const message = `已从云端恢复：${names.join('、')}。不会新增做题记录，正在刷新…`;
      showRecoveryBanner(true, state.cloudCount, message);
      setStatus(message);
      setTimeout(() => location.reload(), 900);
      return true;
    } finally { state.learningRecoveryRunning = false; }
  }
  async function autoRecoverEmptyListening() {
    const localRows = await dbAll();
    if (localRows.length) { showRecoveryBanner(false); return false; }
    showRecoveryBanner(true);
    if (!state.session?.access_token || state.busy) return false;
    const session = await ensureSession(false), uid = session.user?.id;
    const rows = await api(`/rest/v1/user_sync_state?user_id=eq.${encodeURIComponent(uid)}&select=payload&limit=1`, { headers: authHeaders(session.access_token) });
    const cloudCount = dedupeManifest(rows?.[0]?.payload?.listeningManifest).length;
    state.localCount = 0; state.cloudCount = cloudCount;
    showRecoveryBanner(true, cloudCount);
    if (!cloudCount) { setStatus('云端没有可恢复的听力文件。', true); return false; }
    const modal = document.getElementById('cloudSyncModal');
    if (modal) modal.hidden = false;
    setStatus(`检测到本机为空，正在从云端安全恢复 ${cloudCount} 篇；不会新增做题记录，请保持页面打开…`);
    await downloadAll();
    return true;
  }

  function injectUi() {
    const style = document.createElement('style');
    style.textContent = `
      .cloud-sync-trigger{position:fixed;right:18px;bottom:86px;z-index:9998;border:0;border-radius:999px;background:#17634d;color:#fff;padding:13px 18px;font-weight:800;box-shadow:0 8px 25px #163e3038;cursor:pointer}
      .cloud-sync-modal{position:fixed;inset:0;z-index:9999;background:#0b2019a8;display:grid;place-items:center;padding:18px}.cloud-sync-modal[hidden]{display:none}
      .cloud-sync-card{width:min(560px,100%);max-height:90vh;overflow:auto;background:#f7fcf9;border-radius:24px;padding:24px;color:#173b30;box-shadow:0 20px 70px #0005}.cloud-sync-card h2{margin:0 0 8px}.cloud-sync-card p{line-height:1.6}
      .cloud-sync-close{float:right;border:0;background:transparent;font-size:25px}.cloud-sync-fields{display:grid;gap:10px}.cloud-sync-fields input{font:inherit;padding:13px;border:1px solid #b9d8cc;border-radius:12px}.cloud-sync-actions{display:flex;flex-wrap:wrap;gap:9px;margin:14px 0}.cloud-sync-actions button{border:1px solid #17634d;border-radius:999px;background:#fff;color:#17634d;padding:10px 15px;font-weight:750}.cloud-sync-actions .primary{background:#17634d;color:#fff}.cloud-sync-actions button:disabled{opacity:.45}.cloud-sync-fields[hidden],.cloud-sync-actions[hidden]{display:none!important}
      .cloud-sync-account{padding:11px 13px;background:#e4f4ed;border-radius:12px}.cloud-sync-status{min-height:48px;padding:10px 12px;border-left:4px solid #43a27e;background:#fff}.cloud-sync-status.error{border-color:#df654f;color:#9d2f20}.cloud-sync-note{font-size:13px;color:#527166}
      .listening-recovery-banner{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:9997;width:min(720px,calc(100% - 28px));display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:2px solid #c88713;border-radius:16px;background:#fff0b8;color:#5a3a00;box-shadow:0 10px 30px #4d330033;font-weight:800}.listening-recovery-banner[hidden]{display:none}.listening-recovery-banner button{flex:none;border:1px solid #8b5b00;border-radius:999px;background:#d99a22;color:#2f2100;padding:10px 15px;font-weight:900;cursor:pointer}@media(max-width:600px){.listening-recovery-banner{align-items:stretch;flex-direction:column}.listening-recovery-banner button{width:100%}}
    `;
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend', `
      <button class="cloud-sync-trigger" id="cloudSyncTrigger">☁ 云同步</button>
      <div class="listening-recovery-banner" id="listeningRecoveryBanner" hidden><span>检测到本机听力为空。</span><button id="listeningRecoveryNow">立即恢复听力</button></div>
      <div class="cloud-sync-modal" id="cloudSyncModal" hidden><section class="cloud-sync-card" role="dialog" aria-modal="true" aria-label="跨设备云同步">
        <button class="cloud-sync-close" id="cloudSyncClose" aria-label="关闭">×</button>
        <h2>电脑和手机数据互通</h2><p>两台设备登录同一个账号。打开云头像后会自动双向合并；也可以使用下面的手动按钮。</p>
        <div class="cloud-sync-account" id="cloudAccount"></div>
        <div class="cloud-sync-fields" id="cloudFields"><input id="cloudEmail" type="email" autocomplete="email" placeholder="邮箱"><input id="cloudPassword" type="password" autocomplete="current-password" placeholder="密码（至少6位）"></div>
        <div class="cloud-sync-actions" id="cloudGuestActions"><button id="cloudSignup">注册</button><button class="primary" id="cloudLogin">登录</button></div>
        <div class="cloud-sync-actions" id="cloudUserActions"><button class="primary" id="cloudSmartSync">↕ 智能双向同步</button><button id="cloudUpload">↑ 仅上传</button><button id="cloudDownload">↓ 从云端恢复听力</button><button id="cloudLogout">退出账号</button></div>
        <p class="cloud-sync-status" id="cloudStatus">准备同步。听力音频较大时，请保持页面打开。</p>
        <p class="cloud-sync-note">同步版本 v${SYNC_VERSION}。会同步：做题记录、错题复盘、词汇与记忆卡片、作文/口语记录，以及私人听力 HTML 和音频。账号之间的数据互相隔离。</p>
      </section></div>`);
    const modal = document.getElementById('cloudSyncModal');
    document.getElementById('cloudSyncTrigger').onclick = async () => {
      modal.hidden = false;
      renderAccount();
      await refreshCountDisplay();
      const active = state.session;
      const autoKey = 'ielts-cloud-auto-merge-v7.3';
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
    document.getElementById('listeningRecoveryNow').onclick = async () => {
      modal.hidden = false;
      renderAccount();
      if (!state.session?.access_token) { setStatus('请先登录原来的同步账号；登录后会立即自动恢复听力。'); return; }
      const restored = await autoRecoverMissingLearningData();
      if (!restored) await autoRecoverEmptyListening();
    };
    document.getElementById('cloudLogout').onclick = () => { saveSession(null); setStatus('已退出账号。'); };
    renderAccount();
    setTimeout(async () => {
      try {
        const restored = await autoRecoverMissingLearningData();
        if (!restored) await autoRecoverEmptyListening();
      } catch (_) {}
    }, 600);
    window.IELTSCloudSync = {
      recoverListening: async () => {
        if (!state.session?.access_token) {
          modal.hidden = false;
          renderAccount();
          setStatus('请先登录原来备份听力所用的账号，再点“↓ 仅下载”。');
          return false;
        }
        await downloadAll();
        return true;
      },
      open: () => {
        modal.hidden = false;
        renderAccount();
        refreshCountDisplay().catch(() => {});
      }
    };
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
    if (upload && (shouldDownload || state.localCount === 0)) upload.disabled = true;
    if (download) download.classList.toggle('primary', shouldDownload);
    const last = localStorage.getItem(LAST_SYNC_KEY);
    const trigger = document.getElementById('cloudSyncTrigger');
    if (trigger) trigger.textContent = last ? '☁ 已同步' : '☁ 云同步';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectUi);
  else injectUi();
})();
