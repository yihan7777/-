(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const tabs = [...document.querySelectorAll('[data-listening-page]')];
  const views = [...document.querySelectorAll('[data-listening-view]')];
  if (!tabs.length) return;
  const pageKey = 'ielts-listening-inner-page-v1';
  const historyKey = 'ielts-listening-test-history-v1';
  const causes = ['没听出答案词','定位失败','同义替换没反应','拼写或单复数错误','审题或字数限制','走神导致跟丢','选项干扰','其他'];
  let activeUrl = null;
  let activeAudioUrl = null;
  let pendingResult = null;
  let privatePart = 'P1';
  const dbName = 'ielts-private-listening-bank-v1';
  function openDb() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('tests', {keyPath:'id'});
        store.createIndex('part', 'part');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function dbPut(record) {
    const db = await openDb();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('tests','readwrite');
      tx.objectStore('tests').put(record);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  }
  async function dbAll() {
    const db = await openDb();
    return new Promise((resolve,reject) => {
      const request = db.transaction('tests').objectStore('tests').getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  async function dbClear() {
    const db = await openDb();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('tests','readwrite');
      tx.objectStore('tests').clear();
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function loadHistory() { try { return JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch (_) { return []; } }
  function saveHistory(items) { try { localStorage.setItem(historyKey, JSON.stringify(items)); } catch (_) {} }
  function activate(name) {
    if (!tabs.some(x => x.dataset.listeningPage === name)) name = 'reaction';
    tabs.forEach(x => x.classList.toggle('active', x.dataset.listeningPage === name));
    views.forEach(view => { if (view.dataset.listeningView !== 'all') view.hidden = view.dataset.listeningView !== name; });
    try { localStorage.setItem(pageKey, name); } catch (_) {}
    if (name === 'analysis') renderAnalysis();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  tabs.forEach(tab => tab.addEventListener('click', () => activate(tab.dataset.listeningPage)));
  document.querySelector('[data-page="listening-hub"]')?.addEventListener('click', () => setTimeout(() => activate(localStorage.getItem(pageKey) || 'reaction')));
  function inferPart(name) {
    const match = String(name).match(/\bP([1-4])\b/i);
    return match ? 'P' + match[1] : $('#practicePart').value;
  }
  function injectBridge(html, audioUrl, title, part) {
    const replaced = html.replace(/"audio"\s*:\s*"[^"]*"/, '"audio":' + JSON.stringify(audioUrl));
    const bridge = '<script>(function(){document.addEventListener("click",function(e){if(e.target&&e.target.id==="finish"){setTimeout(function(){var wrong=[].slice.call(document.querySelectorAll("#nav .incorrect")).map(function(x){return x.dataset.q});var correct=document.querySelectorAll("#nav .correct").length;parent.postMessage({type:"ielts-test-result",title:' + JSON.stringify(title) + ',part:' + JSON.stringify(part) + ',correct:correct,wrongQuestions:wrong,total:correct+wrong.length},"*")},600)}})})();<\/script>';
    return replaced.replace('</body>', bridge + '</body>');
  }
  function status(text, bad=false) {
    const el = $('#practiceImportStatus');
    el.textContent = text;
    el.style.color = bad ? '#b64535' : '';
  }
  function frequencyFromPath(path) {
    if (path.includes('/次高频/')) return '次高频';
    if (path.includes('/非高频/')) return '非高频';
    return '高频';
  }
  async function launchTest(htmlText, audioBlob, title, part) {
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = URL.createObjectURL(audioBlob);
    $('#practicePart').value = part;
    const source = injectBridge(htmlText, activeAudioUrl, title, part);
    activeUrl = URL.createObjectURL(new Blob([source], {type:'text/html'}));
    $('#practiceFrame').src = activeUrl;
    $('#practiceTitle').textContent = part + ' · ' + title;
    $('#practiceFrameWrap').classList.remove('hidden');
    $('#causePanel').classList.add('hidden');
    $('#practiceFrameWrap').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function renderPrivateBank() {
    const records = await dbAll();
    $('#privateBankCount').textContent = records.length ? records.length + ' 篇已保存在本机' : '尚未导入';
    $('#privatePartTabs').innerHTML = ['P1','P2','P3','P4'].map(part => '<button class="' + (part === privatePart ? 'active' : '') + '" data-private-part="' + part + '">' + part + '（' + records.filter(x=>x.part===part).length + '）</button>').join('');
    document.querySelectorAll('[data-private-part]').forEach(btn => btn.onclick = () => { privatePart = btn.dataset.privatePart; renderPrivateBank(); });
    const filtered = records.filter(x => x.part === privatePart).sort((a,b) => (a.frequency+a.title).localeCompare(b.frequency+b.title));
    $('#privateTestList').innerHTML = filtered.length ? filtered.map(x => '<button class="private-test-item" data-private-test="' + esc(x.id) + '"><span><b>' + esc(x.title) + '</b><small>' + esc(x.frequency) + '</small></span><em>开始 →</em></button>').join('') : '<p>这个部分还没有导入篇目。</p>';
    document.querySelectorAll('[data-private-test]').forEach(btn => btn.onclick = async () => {
      const record = (await dbAll()).find(x => x.id === btn.dataset.privateTest);
      if (record) launchTest(record.html, record.audio, record.title, record.part);
    });
  }
  $('#practiceFolder')?.addEventListener('change', async event => {
    const files = [...(event.target.files || [])].filter(file => !(file.webkitRelativePath || '').startsWith('__MACOSX/') && !/\.DS_Store$/.test(file.name));
    const htmlFiles = files.filter(file => /\.html$/i.test(file.name));
    if (!htmlFiles.length) { status('这个文件夹中没有找到 HTML 题目文件。', true); return; }
    let imported = 0, skipped = 0;
    for (const htmlFile of htmlFiles) {
      const path = htmlFile.webkitRelativePath || htmlFile.name;
      const dir = path.slice(0, path.lastIndexOf('/') + 1);
      const audioFile = files.find(file => (file.webkitRelativePath || file.name) === dir + 'audio.mp3');
      if (!audioFile) { skipped++; continue; }
      const part = inferPart(path);
      const title = htmlFile.name.replace(/\.html$/i,'');
      status('正在导入 ' + (imported + 1) + '/' + htmlFiles.length + '：' + title);
      await dbPut({id:path,part,title,frequency:frequencyFromPath(path),html:await htmlFile.text(),audio:audioFile,updatedAt:Date.now()});
      imported++;
    }
    status('✓ 已导入 ' + imported + ' 篇私人真题' + (skipped ? '，另有 ' + skipped + ' 篇缺少 audio.mp3' : '') + '。');
    event.target.value = '';
    await renderPrivateBank();
  });
  $('#openListeningTest')?.addEventListener('click', async () => {
    const htmlFile = $('#practiceHtmlFile').files?.[0];
    const audioFile = $('#practiceAudioFile').files?.[0];
    if (!htmlFile || !audioFile) { status('需要同时选择同一篇的 HTML 题目和 audio.mp3。', true); return; }
    const title = htmlFile.name.replace(/\.html$/i,'');
    const part = inferPart(title);
    await launchTest(await htmlFile.text(), audioFile, title, part);
    status('✓ 题目已在本机打开。完成后请点击题目页面底部的 Finish。');
  });
  $('#clearPrivateBank')?.addEventListener('click', async () => {
    if (!confirm('确认删除保存在本机的全部私人真题吗？练习成绩统计不会被删除。')) return;
    await dbClear();
    await renderPrivateBank();
    status('本机私人题库已清除。');
  });
  $('#closeListeningTest')?.addEventListener('click', () => {
    $('#practiceFrameWrap').classList.add('hidden');
    $('#practiceFrame').src = 'about:blank';
  });
  window.addEventListener('message', event => {
    if (event.data?.type !== 'ielts-test-result') return;
    pendingResult = {...event.data, date:new Date().toISOString(), causes:{}};
    const wrong = pendingResult.wrongQuestions || [];
    const rate = pendingResult.total ? Math.round(wrong.length / pendingResult.total * 100) : 0;
    $('#practiceScore').textContent = pendingResult.correct + '/' + pendingResult.total + ' · 错误率 ' + rate + '%';
    $('#causeQuestions').innerHTML = wrong.length ? wrong.map(q => '<label class="cause-row"><b>第 ' + esc(q) + ' 题</b><select data-cause-q="' + esc(q) + '">' + causes.map(c => '<option>' + c + '</option>').join('') + '</select></label>').join('') : '<p>本篇全部正确，无需标记错因。</p>';
    $('#causePanel').classList.remove('hidden');
    $('#causePanel').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('#saveTestAnalysis')?.addEventListener('click', () => {
    if (!pendingResult) return;
    document.querySelectorAll('[data-cause-q]').forEach(select => pendingResult.causes[select.dataset.causeQ] = select.value);
    const items = loadHistory();
    items.unshift(pendingResult);
    saveHistory(items.slice(0,200));
    $('#causePanel').classList.add('hidden');
    pendingResult = null;
    activate('analysis');
  });
  function renderAnalysis() {
    const items = loadHistory();
    $('#analysisPartGrid').innerHTML = ['P1','P2','P3','P4'].map(part => {
      const rows = items.filter(x => x.part === part);
      const total = rows.reduce((n,x) => n + (x.total || 0), 0);
      const wrong = rows.reduce((n,x) => n + (x.wrongQuestions?.length || 0), 0);
      const rate = total ? Math.round(wrong / total * 100) : 0;
      return '<article class="part-stat"><span>' + part + ' · ' + rows.length + ' 篇</span><strong>' + rate + '%</strong><small>错误率 · ' + (total-wrong) + '/' + total + ' 题正确</small></article>';
    }).join('');
    const counts = {};
    items.forEach(x => Object.values(x.causes || {}).forEach(c => counts[c] = (counts[c] || 0) + 1));
    const ranked = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    $('#causeRanking').innerHTML = ranked.length ? ranked.map(x => '<div class="cause-rank"><span>' + esc(x[0]) + '</span><b>' + x[1] + ' 次</b></div>').join('') : '<p class="empty-analysis">完成并保存一次真题复盘后显示。</p>';
    $('#attemptHistory').innerHTML = items.length ? items.slice(0,20).map(x => '<div class="attempt-row"><span><b>' + esc(x.part) + '</b> · ' + esc(x.title) + '</span><b>' + x.correct + '/' + x.total + '</b></div>').join('') : '<p class="empty-analysis">暂无练习记录。</p>';
  }
  $('#clearListeningHistory')?.addEventListener('click', () => {
    if (!confirm('确认清空全部听力真题统计吗？')) return;
    saveHistory([]);
    renderAnalysis();
  });
  let initial = 'reaction';
  try { initial = localStorage.getItem(pageKey) || initial; } catch (_) {}
  renderPrivateBank().catch(() => status('当前浏览器无法读取私人题库存储。', true));
  activate(initial);
  setTimeout(() => { if (location.hash === '#listening-hub') activate(initial); }, 0);
})();
