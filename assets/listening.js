(() => {
  'use strict';
  window.listeningModuleReady = true;
  const $ = s => document.querySelector(s);
  const button = $('#addListeningWords');
  if (!button) return;

  const customKey = 'ielts-listening-custom-v1';
  const stateKey = 'ielts-listening-state-v1';
  const fallbackStore = {};
  let cards = [], state = {}, queue = [], current = null, revealed = false;
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const getStore = (name, fallback) => {
    try { return JSON.parse(localStorage.getItem(name) || JSON.stringify(fallback)); }
    catch (_) { return fallbackStore[name] || fallback; }
  };
  const setStore = (name, value) => {
    fallbackStore[name] = value;
    try { localStorage.setItem(name, JSON.stringify(value)); } catch (_) {}
  };
  const setStatus = (text, ok = true) => {
    const el = $('#listeningStatus');
    if (!el) return;
    el.textContent = text;
    el.className = ok ? 'module-status success' : 'module-status error';
  };
  function speak(text, rate = .76) {
    if (!('speechSynthesis' in window)) { setStatus('当前浏览器不支持朗读。请使用 Safari 打开。', false); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = rate;
    speechSynthesis.speak(u);
  }
  function build() {
    queue = cards.filter(c => !state[c.id]?.archived && (state[c.id]?.due || 0) <= Date.now());
    if (!queue.length) queue = cards.filter(c => !state[c.id]?.archived).sort((a,b) => (state[a.id]?.due || 0) - (state[b.id]?.due || 0)).slice(0, 5);
    updateArchived(); show();
  }
  function updateArchived() { $('#listeningArchivedCount').textContent = cards.filter(c => state[c.id]?.archived).length; }
  function show() {
    current = queue.shift(); revealed = false;
    $('#audioAnswer').classList.add('hidden'); $('#audioRating').classList.remove('ready');
    $('#heardAnswer').value = ''; $('#heardAnswer').disabled = false; $('#revealAudio').disabled = false;
    if (!current) { $('#listeningDue').textContent = '0'; $('#revealAudio').textContent = '今天完成了'; return; }
    $('#listeningDue').textContent = queue.length + 1; $('#revealAudio').textContent = '翻面查看答案';
  }
  function reveal() {
    if (!current || revealed) return; revealed = true;
    const answer = $('#heardAnswer').value.trim(), correct = norm(answer) === norm(current.word);
    $('#listenWord').textContent = current.word; $('#listenMeaning').textContent = current.meaning;
    $('#listenExample').textContent = current.example;
    $('#listenResult').textContent = answer ? (correct ? '✓ 拼写正确' : `✕ 你写的是：${answer}`) : '先反应含义，再查看答案';
    $('#listenResult').className = correct ? 'listen-correct' : 'listen-wrong';
    $('#audioAnswer').classList.remove('hidden'); $('#audioRating').classList.add('ready'); $('#heardAnswer').disabled = true;
  }
  function cleanItem(text) {
    return text.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '').trim();
  }
  function parseInput(raw) {
    const results = [];
    raw.split(/\r?\n/).forEach(line => {
      line = cleanItem(line); if (!line) return;
      if (/[|｜\t]/.test(line)) {
        const p = line.split(/[|｜\t]/).map(x => x.trim());
        if (p[0]) results.push({word:p[0], meaning:p[1] || '中文含义待补充', example:p[2] || `Listen carefully for “${p[0]}” in this sentence.`});
      } else {
        line.split(/[,，、;；]+/).map(cleanItem).filter(Boolean).forEach(word => results.push({word, meaning:'中文含义待补充', example:`Listen carefully for “${word}” in this sentence.`}));
      }
    });
    return results;
  }
  function add() {
    try {
      const raw = $('#listeningImport').value.trim();
      if (!raw) { setStatus('请先粘贴一个或多个英文单词。', false); return; }
      const existing = new Set(cards.map(x => norm(x.word))), custom = getStore(customKey, []), added = [];
      let skipped = 0;
      parseInput(raw).forEach(item => {
        const idKey = norm(item.word); if (!idKey) return;
        if (existing.has(idKey)) { skipped++; return; }
        const card = {id:`LC-${Date.now()}-${added.length}`, ...item};
        custom.push(card); cards.push(card); added.push(card); existing.add(idKey);
      });
      if (!added.length) { setStatus(skipped ? '这些词已经在听力卡组中。' : '没有识别到可添加的英文内容。', false); return; }
      setStore(customKey, custom); $('#listeningImport').value = '';
      queue = [...added]; show();
      setStatus(`✓ 已自动整理并加入 ${added.length} 张卡${skipped ? `，跳过 ${skipped} 个重复词` : ''}。点击“播放单词”开始。`);
    } catch (error) { setStatus(`添加失败：${error.message}`, false); }
  }

  button.addEventListener('click', add);
  $('#playWord').addEventListener('click', () => current && speak(current.word, .68));
  $('#playExample').addEventListener('click', () => current && speak(current.example, .78));
  $('#revealAudio').addEventListener('click', reveal);
  $('#heardAnswer').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); reveal(); } });
  $('#audioRating').addEventListener('click', e => {
    const b = e.target.closest('[data-audio-grade]'); if (!b || !revealed || !current) return;
    const grade = b.dataset.audioGrade, old = state[current.id] || {interval:0,reps:0}; let delay = 0, interval = old.interval;
    if (grade === 'again') { old.reps = 0; queue.splice(Math.min(3, queue.length), 0, current); }
    if (grade === 'hard') { delay = 10*60*1000; interval = Math.max(.01, old.interval*.7); }
    if (grade === 'good') { interval = old.interval ? Math.max(1,old.interval*2) : 1; delay=interval*86400000; old.reps++; }
    if (grade === 'easy') { interval = old.interval ? Math.max(4,old.interval*2.5) : 4; delay=interval*86400000; old.reps++; }
    state[current.id] = {due:Date.now()+delay,interval,reps:old.reps,lastGrade:grade}; setStore(stateKey,state); show();
  });
  $('#archiveListening').addEventListener('click', () => {
    if (!current) return;
    state[current.id] = {...(state[current.id] || {}), archived:true, archivedAt:Date.now()};
    setStore(stateKey,state); updateArchived(); setStatus(`当前词已移出听力学习，可随时恢复。`); show();
  });
  $('#restoreListening').addEventListener('click', () => {
    const ids=cards.filter(c => state[c.id]?.archived).map(c => c.id);
    if (!ids.length) { setStatus('没有已移出的听力词。', false); return; }
    if (!confirm(`恢复 ${ids.length} 个已移出的听力词吗？`)) return;
    ids.forEach(id => { state[id].archived=false; state[id].due=0; }); setStore(stateKey,state); build(); setStatus(`已恢复 ${ids.length} 个听力词。`);
  });
  window.addEventListener('ielts-listening-cards-added',event=>{
    const added=event.detail?.cards||[];if(!added.length)return;
    const known=new Set(cards.map(x=>x.id));added.forEach(card=>{if(!known.has(card.id))cards.push(card)});
    queue=[...added,...queue];updateArchived();show();setStatus(`✓ 真题复盘已加入 ${added.length} 张听力反应卡。`);
  });

  state = getStore(stateKey, {}); const custom = getStore(customKey, []);
  fetch('data/listening-defaults.json?v=6', {cache:'no-store'}).then(r => r.ok ? r.json() : []).catch(() => []).then(defaults => {
    cards = [...defaults, ...custom]; build(); setStatus(`听力卡模块已就绪，共 ${cards.length} 张卡。`);
  });
})();
