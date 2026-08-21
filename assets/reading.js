(() => {
  'use strict';
  window.readingModuleReady = true;
  const $ = s => document.querySelector(s);
  const button = $('#addReadingCards');
  if (!button) return;

  const customKey = 'ielts-reading-custom-v1';
  const stateKey = 'ielts-reading-state-v1';
  let cards = [], state = {}, queue = [], current = null, reviewed = 0, initial = 0;
  const memoryFallback = {};
  const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const getStore = (name, fallback) => {
    try { return JSON.parse(localStorage.getItem(name) || JSON.stringify(fallback)); }
    catch (_) { return memoryFallback[name] || fallback; }
  };
  const setStore = (name, value) => {
    memoryFallback[name] = value;
    try { localStorage.setItem(name, JSON.stringify(value)); } catch (_) {}
  };
  const status = (text, ok = true) => {
    const el = $('#readingStatus');
    if (!el) return;
    el.textContent = text;
    el.className = ok ? 'module-status success' : 'module-status error';
  };
  const speak = text => {
    if (!('speechSynthesis' in window)) { status('当前浏览器不支持朗读，但卡片仍可正常使用。', false); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB'; utterance.rate = .76;
    speechSynthesis.speak(utterance);
  };

  function saveState() { setStore(stateKey, state); }
  function updateArchived() { $('#readingArchivedCount').textContent = cards.filter(c => state[c.id]?.archived).length; }
  function show() {
    current = queue.shift();
    $('#readingCard').classList.remove('flipped');
    $('#readingBack').classList.add('hidden');
    $('#readingRating').classList.remove('ready');
    if (!current) {
      $('#readingFront').textContent = '今天完成了！';
      $('#readingDue').textContent = '0';
      $('#readingCounter').textContent = `本轮完成 ${reviewed} 张`;
      return;
    }
    $('#readingFront').textContent = current.front;
    $('#readingMeaning').textContent = current.meaning;
    $('#readingExample').textContent = current.example || '原文例句待补充';
    $('#readingNote').textContent = current.note || '来自阅读生词积累';
    $('#readingTag').textContent = current.front.includes(' ') ? 'EXPRESSION' : 'WORD';
    $('#readingDue').textContent = queue.length + 1;
    $('#readingCounter').textContent = `本轮 ${reviewed + 1} / ${Math.max(initial, reviewed + queue.length + 1)}`;
  }
  function build(force = false) {
    queue = cards.filter(c => !state[c.id]?.archived && (force || (state[c.id]?.due || 0) <= Date.now()));
    if (!queue.length) queue = cards.filter(c => !state[c.id]?.archived).sort((a,b) => (state[a.id]?.due || 0) - (state[b.id]?.due || 0)).slice(0, 5);
    initial = queue.length; reviewed = 0; updateArchived(); show();
  }
  function addCards() {
    try {
      const input = $('#readingImport').value.trim();
      if (!input) { status('请先输入至少一个英文单词。', false); return; }
      const existing = new Set(cards.map(x => key(x.front)));
      const custom = getStore(customKey, []), added = [];
      let skipped = 0;
      input.split(/\r?\n/).forEach(line => {
        const parts = line.split(/[|｜\t]/).map(x => x.trim());
        const front = parts[0] || '';
        if (!front) return;
        if (existing.has(key(front))) { skipped++; return; }
        const card = {
          id: `RC-${Date.now()}-${added.length}`,
          front,
          meaning: parts[1] || '中文含义待补充',
          example: parts[2] || '原文例句待补充',
          note: parts[3] || '来自阅读生词积累'
        };
        custom.push(card); cards.push(card); added.push(card); existing.add(key(front));
      });
      if (!added.length) { status(skipped ? '这些单词已经在卡片库中，没有重复添加。' : '没有识别到英文单词。', false); return; }
      setStore(customKey, custom);
      $('#readingImport').value = '';
      queue = [...added]; initial = added.length; reviewed = 0; show();
      status(`✓ 已加入 ${added.length} 张，新卡已显示在右侧${skipped ? `；跳过 ${skipped} 张重复卡` : ''}。`);
    } catch (error) {
      status(`添加失败：${error.message}`, false);
    }
  }

  button.addEventListener('click', addCards);
  $('#readingCard').addEventListener('click', () => {
    if (!current) return;
    const flipped = !$('#readingCard').classList.contains('flipped');
    $('#readingCard').classList.toggle('flipped', flipped);
    $('#readingBack').classList.toggle('hidden', !flipped);
    $('#readingRating').classList.toggle('ready', flipped);
  });
  $('#readExpression').addEventListener('click', () => current && speak(current.front));
  $('#readingRating').addEventListener('click', event => {
    const target = event.target.closest('[data-reading-grade]');
    if (!target || !current || !$('#readingRating').classList.contains('ready')) return;
    const grade = target.dataset.readingGrade, old = state[current.id] || {interval:0,reps:0};
    let delay = 0, interval = old.interval;
    if (grade === 'again') { old.reps = 0; queue.splice(Math.min(3, queue.length), 0, current); }
    if (grade === 'hard') { delay = 10 * 60 * 1000; interval = Math.max(.01, old.interval * .7); }
    if (grade === 'good') { interval = old.interval ? Math.max(1, old.interval * 2) : 1; delay = interval * 86400000; old.reps++; }
    if (grade === 'easy') { interval = old.interval ? Math.max(4, old.interval * 2.5) : 4; delay = interval * 86400000; old.reps++; }
    state[current.id] = {due:Date.now()+delay, interval, reps:old.reps, lastGrade:grade};
    saveState(); reviewed++; show();
  });
  $('#resetReadingSession').addEventListener('click', () => build(true));
  $('#archiveReading').addEventListener('click', () => {
    if (!current) return;
    state[current.id] = {...(state[current.id] || {}), archived:true, archivedAt:Date.now()};
    saveState(); reviewed++; updateArchived(); status(`“${current.front}”已移出学习，可随时恢复。`); show();
  });
  $('#restoreReading').addEventListener('click', () => {
    const ids = cards.filter(c => state[c.id]?.archived).map(c => c.id);
    if (!ids.length) { status('没有已移出的阅读词。', false); return; }
    if (!confirm(`恢复 ${ids.length} 个已移出的阅读词吗？`)) return;
    ids.forEach(id => { state[id].archived=false; state[id].due=0; }); saveState(); build(); status(`已恢复 ${ids.length} 个阅读词。`);
  });
  $('#exportReading').addEventListener('click', async () => {
    const text = cards.map(c => `${c.front} | ${c.meaning} | ${c.example || ''} | ${c.note || ''}`).join('\n');
    try { await navigator.clipboard.writeText(text); status(`已复制 ${cards.length} 张阅读卡。`); }
    catch (_) { status('浏览器不允许直接复制，请在 Safari 中打开后再试。', false); }
  });

  state = getStore(stateKey, {});
  const custom = getStore(customKey, []);
  fetch('data/reading-defaults.json?v=6', {cache:'no-store'})
    .then(r => r.ok ? r.json() : [])
    .catch(() => [])
    .then(defaults => {
      cards = [...defaults, ...custom];
      build();
      status(`阅读卡模块已就绪，共 ${cards.length} 张卡。`);
    });
})();
