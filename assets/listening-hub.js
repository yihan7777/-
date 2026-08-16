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
  function dayStamp(offset=0) {
    const date = new Date(); date.setHours(0,0,0,0); date.setDate(date.getDate()+offset);
    return date.toISOString().slice(0,10);
  }
  function causeOptions() { return causes.map(c => '<option>' + c + '</option>').join(''); }
  function reviewCard(q) {
    return '<details class="wrong-review-card" data-wrong-q="' + esc(q) + '"><summary><b>第 ' + esc(q) + ' 题</b><span>展开填写完整复盘 ↓</span></summary><div class="wrong-review-body">' +
      '<label>主要错因<select data-primary-cause>' + causeOptions() + '</select></label>' +
      '<div class="secondary-causes">' + causes.map(c => '<label><input type="checkbox" data-secondary-cause value="' + esc(c) + '">' + esc(c) + '</label>').join('') + '</div>' +
      '<label>题型<select data-question-type><option>填空题</option><option>单选题</option><option>多选题</option><option>匹配题</option><option>地图题</option></select></label>' +
      '<label>原文定位句<textarea data-evidence placeholder="粘贴真正决定答案的原文，不用粘整段"></textarea></label>' +
      '<label>题干 ⇄ 原文同义替换<input data-synonym placeholder="例如：keep an open mind = be flexible"></label>' +
      '<label>下次看到什么要警觉？<input data-reminder placeholder="例如：听到 but 后等待最终观点"></label>' +
      '</div></details>';
  }
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
    pendingResult = {...event.data, id:'attempt-' + Date.now(), date:new Date().toISOString(), reviews:{}, reviewPlan:[{label:'D+1',due:dayStamp(1),done:false},{label:'D+3',due:dayStamp(3),done:false},{label:'D+7',due:dayStamp(7),done:false}]};
    const wrong = pendingResult.wrongQuestions || [];
    const rate = pendingResult.total ? Math.round(wrong.length / pendingResult.total * 100) : 0;
    $('#practiceScore').textContent = pendingResult.correct + '/' + pendingResult.total + ' · 错误率 ' + rate + '%';
    $('#causeQuestions').innerHTML = wrong.length ? wrong.map(reviewCard).join('') : '<p>本篇全部正确，无需标记错因。</p>';
    $('#causePanel').classList.remove('hidden');
    $('#causePanel').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('#saveTestAnalysis')?.addEventListener('click', () => {
    if (!pendingResult) return;
    document.querySelectorAll('[data-wrong-q]').forEach(card => {
      const q = card.dataset.wrongQ;
      pendingResult.reviews[q] = {
        primary:card.querySelector('[data-primary-cause]').value,
        secondary:[...card.querySelectorAll('[data-secondary-cause]:checked')].map(x=>x.value),
        questionType:card.querySelector('[data-question-type]').value,
        evidence:card.querySelector('[data-evidence]').value.trim(),
        synonym:card.querySelector('[data-synonym]').value.trim(),
        reminder:card.querySelector('[data-reminder]').value.trim()
      };
    });
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
    items.forEach(x => {
      if (x.reviews) Object.values(x.reviews).forEach(r => {
        if (r.primary) counts[r.primary] = (counts[r.primary] || 0) + 1;
        (r.secondary || []).forEach(c => counts[c] = (counts[c] || 0) + .35);
      });
      else Object.values(x.causes || {}).forEach(c => counts[c] = (counts[c] || 0) + 1);
    });
    const ranked = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    $('#causeRanking').innerHTML = ranked.length ? ranked.map(x => '<div class="cause-rank"><span>' + esc(x[0]) + '</span><b>' + Math.round(x[1]) + ' 次</b></div>').join('') : '<p class="empty-analysis">完成并保存一次真题复盘后显示。</p>';
    const top = ranked[0];
    $('#topListeningProblem').textContent = top ? top[0] + '（约 ' + Math.round(top[1]) + ' 次）' : '完成一次复盘后生成';
    const adviceMap={'定位失败':'先读题预测定位词，再做10–20秒答案片段重听','同义替换没反应':'优先复习题干⇄原文同义替换卡','没听出答案词':'进入单词反应卡，练到听音能立即反应','拼写或单复数错误':'进入答案词听写，拼对后才过关','审题或字数限制':'提交前检查题目限定词和字数','走神导致跟丢':'练短片段复述，并抓转折后的最终观点','选项干扰':'逐项写清“出现了但为什么不能选”'};
    $('#topListeningAdvice').textContent = top ? (adviceMap[top[0]] || '重新听答案片段，并写一句下次提醒') : '系统会根据重复错因给出训练建议';
    const today=dayStamp(), due=[];
    items.forEach(item => (item.reviewPlan||[]).forEach((plan,index) => { if(!plan.done && plan.due<=today) due.push({item,plan,index}); }));
    $('#dueReviewCount').textContent = due.length;
    $('#dueReviewList').innerHTML = due.length ? due.map(x => '<div class="due-review-item"><i>' + esc(x.plan.label) + '</i><span><b>' + esc(x.item.part) + '</b> · ' + esc(x.item.title) + '</span><button data-review-open="' + esc(x.item.title) + '">重新做</button><button data-review-done="' + esc(x.item.id||'') + '" data-plan-index="' + x.index + '">已复习</button></div>').join('') : '<p class="empty-analysis">今天没有到期任务。完成新错题后会自动生成 D+1、D+3、D+7。</p>';
    document.querySelectorAll('[data-review-done]').forEach(btn => btn.onclick = () => {
      const all=loadHistory(), item=all.find(x=>x.id===btn.dataset.reviewDone);
      if(item?.reviewPlan?.[Number(btn.dataset.planIndex)]) item.reviewPlan[Number(btn.dataset.planIndex)].done=true;
      saveHistory(all); renderAnalysis();
    });
    document.querySelectorAll('[data-review-open]').forEach(btn => btn.onclick = async () => {
      const record=(await dbAll()).find(x=>x.title===btn.dataset.reviewOpen);
      if(!record) return alert('这篇题目尚未保存在本机私人题库，请先重新导入题库文件夹。');
      activate('practice'); await launchTest(record.html,record.audio,record.title,record.part);
    });
    $('#attemptHistory').innerHTML = items.length ? items.slice(0,20).map(x => {
      const reviews=x.reviews||{};
      const details=Object.entries(reviews).map(([q,r]) => '<div class="attempt-wrong"><b>第 '+esc(q)+'题 · '+esc(r.primary||'未标记')+'</b><span>'+esc(r.synonym||r.evidence||r.reminder||'暂无补充分析')+'</span></div>').join('');
      return '<details class="attempt-details"><summary><span><b>'+esc(x.part)+'</b> · '+esc(x.title)+'</span><b>'+x.correct+'/'+x.total+'</b></summary><div class="attempt-wrong-list">'+(details||'<p class="empty-analysis">旧记录暂无逐题详情。</p>')+'</div></details>';
    }).join('') : '<p class="empty-analysis">暂无练习记录。</p>';
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
