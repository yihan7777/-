(() => {
  'use strict';
  window.readingModuleReady = true;
  const $ = selector => document.querySelector(selector);
  const button = $('#addReadingCards');
  if (!button) return;

  const customKey = 'ielts-reading-custom-v1';
  const stateKey = 'ielts-reading-state-v1';
  const sourceKey = 'ielts-reading-source-v1';
  const deckKey = 'ielts-reading-deck-v1';
  const groupKey = 'ielts-reading-groups-v1';
  const weakKey = 'ielts-reading-weak-only-v1';
  const memoryFallback = {};
  let cards = [], articles = [], state = {}, queue = [], current = null;
  let reviewed = 0, initial = 0, activeArticle = '', activeDeck = 'september', activeLevel = '高频';
  let groupPreferences = { september: '高频', color: '全部', personal: '全部' };
  let weakOnly = false, sessionRepeats = {};

  const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const getStore = (name, fallback) => {
    try { return JSON.parse(localStorage.getItem(name) || JSON.stringify(fallback)); }
    catch (_) { return memoryFallback[name] ?? fallback; }
  };
  const setStore = (name, value) => {
    memoryFallback[name] = value;
    try { localStorage.setItem(name, JSON.stringify(value)); } catch (_) {}
  };
  const status = (text, ok = true) => {
    const element = $('#readingStatus');
    if (!element) return;
    element.textContent = text;
    element.className = ok ? 'module-status success' : 'module-status error';
  };
  const speak = text => {
    if (!('speechSynthesis' in window)) { status('当前浏览器不支持朗读，但卡片仍可正常使用。', false); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB'; utterance.rate = .76;
    speechSynthesis.speak(utterance);
  };
  const saveState = () => setStore(stateKey, state);
  const articleCards = () => {
    let list;
    if (activeDeck === 'personal') list = cards.filter(card => !card.articleId);
    else if (activeArticle) list = cards.filter(card => card.articleId === activeArticle);
    else list = cards;
    if (weakOnly) list = list.filter(card => {
      const progress = state[card.id] || {};
      return !progress.reps || progress.lastGrade === 'again' || progress.lastGrade === 'hard';
    });
    return list.filter(card => !state[card.id]?.archived);
  };
  const weakness = card => {
    const progress = state[card.id] || {};
    return (progress.againCount || 0) * 6 + (progress.hardCount || 0) * 3 - (progress.reps || 0);
  };
  const articleFor = id => articles.find(article => article.id === id);
  async function loadCompressedDeck(path) {
    const manifestResponse = await fetch(`data/${path}/index.json?v=1`, { cache: 'no-store' });
    if (!manifestResponse.ok) return { articles: [], cards: [] };
    const manifest = await manifestResponse.json();
    if (!Array.isArray(manifest.parts) || !manifest.parts.length || !('DecompressionStream' in window)) return { articles: [], cards: [] };
    const chunks = await Promise.all(manifest.parts.map(part =>
      fetch(`data/${path}/${part}?v=1`, { cache: 'no-store' }).then(response => response.ok ? response.text() : '')
    ));
    const binary = Uint8Array.from(atob(chunks.join('')), character => character.charCodeAt(0));
    const stream = new Blob([binary]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  function updateArchived() {
    $('#readingArchivedCount').textContent = cards.filter(card => state[card.id]?.archived).length;
  }
  function updateArticleMeta() {
    const info = articleFor(activeArticle);
    const pool = articleCards();
    const learned = pool.filter(card => (state[card.id]?.reps || 0) > 0).length;
    const weak = pool.filter(card => ['again', 'hard'].includes(state[card.id]?.lastGrade)).length;
    const deckName = info?.deck === 'color' ? '彩色词汇' : '九月文章';
    $('#readingArticleMeta').textContent = info
      ? `${deckName} · ${info.level} · ${info.part} · 本组 ${info.count} 个词 · 已认识 ${learned} · 待加强 ${weak}`
      : `共 ${pool.length} 张个人阅读卡`;
  }
  function show() {
    current = queue.shift();
    $('#readingCard').classList.remove('flipped');
    $('#readingBack').classList.add('hidden');
    $('#readingRating').classList.remove('ready');
    $('#lookupReadingWord').disabled = !current?.lookup;
    if (!current) {
      $('#readingFront').textContent = weakOnly ? '这篇暂时没有不熟词！' : '本轮完成了！';
      $('#readingMeaning').textContent = '';
      $('#readingExample').textContent = '';
      $('#readingNote').textContent = '';
      $('#readingDue').textContent = '0';
      $('#readingCounter').textContent = `本轮完成 ${reviewed} 次测试`;
      updateArticleMeta();
      return;
    }
    const progress = state[current.id] || {};
    $('#readingFront').textContent = current.front;
    $('#readingMeaning').textContent = current.meaning;
    $('#readingExample').textContent = current.example || '原文例句待补充';
    $('#readingNote').textContent = current.note || '来自阅读生词积累';
    $('#readingTag').textContent = current.articleId ? `${current.level || '九月'} · ${current.part || ''}` : (current.front.includes(' ') ? 'EXPRESSION' : 'WORD');
    $('#readingDue').textContent = queue.length + 1;
    $('#readingCounter').textContent = `本轮 ${reviewed + 1} / ${Math.max(initial, reviewed + queue.length + 1)} · 忘记 ${progress.againCount || 0} 次`;
  }
  function build(force = false) {
    const now = Date.now();
    const pool = articleCards();
    queue = pool.filter(card => force || (state[card.id]?.due || 0) <= now)
      .sort((a, b) => weakness(b) - weakness(a) || (state[a.id]?.due || 0) - (state[b.id]?.due || 0));
    if (!queue.length && pool.length && !weakOnly) {
      queue = [...pool].sort((a, b) => (state[a.id]?.due || 0) - (state[b.id]?.due || 0)).slice(0, activeArticle ? 10 : 20);
    }
    initial = queue.length; reviewed = 0; sessionRepeats = {};
    updateArchived(); updateArticleMeta(); show();
  }
  function fillGroupOptions() {
    const select = $('#readingLevelFilter');
    const wrap = $('#readingGroupWrap');
    const values = activeDeck === 'september'
      ? ['高频', '中频', '低频', '全部']
      : activeDeck === 'color'
        ? ['全部', ...new Set(articles.filter(article => article.deck === 'color').map(article => article.level))]
        : ['全部'];
    wrap.hidden = activeDeck === 'personal';
    $('#readingGroupLabel').textContent = activeDeck === 'color' ? '主题' : '频率';
    select.replaceChildren();
    values.forEach(value => {
      const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option);
    });
    activeLevel = values.includes(groupPreferences[activeDeck]) ? groupPreferences[activeDeck] : values[0];
    select.value = activeLevel;
  }
  function fillArticleOptions() {
    const select = $('#readingArticleFilter');
    const filtered = articles.filter(article => article.deck === activeDeck && (activeLevel === '全部' || article.level === activeLevel));
    document.querySelectorAll('[data-reading-deck]').forEach(tab => tab.classList.toggle('active', tab.dataset.readingDeck === activeDeck));
    select.replaceChildren();
    $('#readingArticleWrap').hidden = activeDeck === 'personal';
    $('#readingArticleLabel').textContent = activeDeck === 'color' ? '选择 List' : '选择文章';
    if (activeDeck === 'personal') {
      const personal = document.createElement('option'); personal.value = 'personal'; personal.textContent = '我的手动阅读卡'; select.append(personal);
      activeArticle = 'personal'; select.value = activeArticle; setStore(sourceKey, activeArticle); return;
    }
    filtered.forEach(article => {
      const option = document.createElement('option');
      option.value = article.id;
      option.textContent = activeDeck === 'color' ? article.title : `${article.part} · ${article.title.replace(/^P[1-3]\s*-\s*/i, '')}`;
      select.append(option);
    });
    if (![...select.options].some(option => option.value === activeArticle)) {
      activeArticle = filtered[0]?.id || 'personal';
    }
    select.value = activeArticle;
    setStore(sourceKey, activeArticle);
  }
  function addCards() {
    try {
      const input = $('#readingImport').value.trim();
      if (!input) { status('请先输入至少一个英文单词。', false); return; }
      const existing = new Set(cards.map(card => key(card.front)));
      const custom = getStore(customKey, []), added = [];
      let skipped = 0;
      input.split(/\r?\n/).forEach(line => {
        const parts = line.split(/[|｜\t]/).map(part => part.trim());
        const front = parts[0] || '';
        if (!front) return;
        if (existing.has(key(front))) { skipped += 1; return; }
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
      activeDeck = 'personal'; activeArticle = 'personal'; setStore(deckKey, activeDeck); setStore(sourceKey, activeArticle); fillGroupOptions(); fillArticleOptions();
      queue = [...added]; initial = added.length; reviewed = 0; sessionRepeats = {}; show();
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
  $('#lookupReadingWord').addEventListener('click', () => {
    if (!current?.lookup) { status('手动卡片暂未设置查词链接。', false); return; }
    window.open(current.lookup, '_blank', 'noopener');
  });
  $('#readingRating').addEventListener('click', event => {
    const target = event.target.closest('[data-reading-grade]');
    if (!target || !current || !$('#readingRating').classList.contains('ready')) return;
    const grade = target.dataset.readingGrade;
    const old = state[current.id] || { interval: 0, reps: 0, againCount: 0, hardCount: 0 };
    let delay = 0, interval = old.interval || 0;
    sessionRepeats[current.id] = sessionRepeats[current.id] || 0;
    if (grade === 'again') {
      old.reps = 0; old.againCount = (old.againCount || 0) + 1;
      if (sessionRepeats[current.id] < 4) {
        queue.splice(Math.min(2, queue.length), 0, current);
        queue.splice(Math.min(7, queue.length), 0, current);
        sessionRepeats[current.id] += 2;
      }
    }
    if (grade === 'hard') {
      delay = 10 * 60 * 1000; interval = Math.max(.01, interval * .7); old.hardCount = (old.hardCount || 0) + 1;
      if (sessionRepeats[current.id] < 3) { queue.splice(Math.min(4, queue.length), 0, current); sessionRepeats[current.id] += 1; }
    }
    if (grade === 'good') { interval = interval ? Math.max(1, interval * 2) : 1; delay = interval * 86400000; old.reps += 1; }
    if (grade === 'easy') { interval = interval ? Math.max(4, interval * 2.5) : 4; delay = interval * 86400000; old.reps += 1; }
    state[current.id] = { ...old, due: Date.now() + delay, interval, lastGrade: grade, lastSeen: Date.now() };
    saveState(); reviewed += 1; updateArticleMeta(); show();
  });
  $('#readingLevelFilter').addEventListener('change', event => {
    activeLevel = event.target.value; groupPreferences[activeDeck] = activeLevel; setStore(groupKey, groupPreferences); fillArticleOptions(); build();
  });
  $('#readingDeckTabs').addEventListener('click', event => {
    const tab = event.target.closest('[data-reading-deck]');
    if (!tab) return;
    activeDeck = tab.dataset.readingDeck; setStore(deckKey, activeDeck);
    fillGroupOptions(); fillArticleOptions(); build();
  });
  $('#readingArticleFilter').addEventListener('change', event => {
    activeArticle = event.target.value; setStore(sourceKey, activeArticle); build();
  });
  $('#readingWeakOnly').addEventListener('click', event => {
    weakOnly = !weakOnly; setStore(weakKey, weakOnly);
    event.currentTarget.classList.toggle('active', weakOnly);
    event.currentTarget.setAttribute('aria-pressed', String(weakOnly));
    build(true);
  });
  $('#resetReadingSession').addEventListener('click', () => build(true));
  $('#archiveReading').addEventListener('click', () => {
    if (!current) return;
    state[current.id] = { ...(state[current.id] || {}), archived: true, archivedAt: Date.now() };
    saveState(); reviewed += 1; updateArchived(); status(`“${current.front}”已移出学习，可随时恢复。`); show();
  });
  $('#restoreReading').addEventListener('click', () => {
    const ids = cards.filter(card => state[card.id]?.archived).map(card => card.id);
    if (!ids.length) { status('没有已移出的阅读词。', false); return; }
    if (!confirm(`恢复 ${ids.length} 个已移出的阅读词吗？`)) return;
    ids.forEach(id => { state[id].archived = false; state[id].due = 0; });
    saveState(); build(); status(`已恢复 ${ids.length} 个阅读词。`);
  });
  $('#exportReading').addEventListener('click', async () => {
    const text = cards.map(card => `${card.front} | ${card.meaning} | ${card.example || ''} | ${card.note || ''}`).join('\n');
    try { await navigator.clipboard.writeText(text); status(`已复制 ${cards.length} 张阅读卡。`); }
    catch (_) { status('浏览器不允许直接复制，请在 Safari 中打开后再试。', false); }
  });

  state = getStore(stateKey, {});
  activeArticle = getStore(sourceKey, '');
  activeDeck = getStore(deckKey, activeArticle.startsWith('CV-') ? 'color' : (activeArticle === 'personal' ? 'personal' : 'september'));
  if (!['september', 'color', 'personal'].includes(activeDeck)) activeDeck = 'september';
  groupPreferences = { ...groupPreferences, ...getStore(groupKey, {}) };
  activeLevel = groupPreferences[activeDeck];
  weakOnly = Boolean(getStore(weakKey, false));
  $('#readingWeakOnly').classList.toggle('active', weakOnly);
  $('#readingWeakOnly').setAttribute('aria-pressed', String(weakOnly));
  const custom = getStore(customKey, []);
  Promise.all([
    fetch('data/reading-defaults.json?v=6', { cache: 'no-store' }).then(response => response.ok ? response.json() : []).catch(() => []),
    loadCompressedDeck('reading-september').catch(() => ({ articles: [], cards: [] })),
    loadCompressedDeck('reading-color-vocab').catch(() => ({ articles: [], cards: [] }))
  ]).then(([defaults, september, color]) => {
    const septemberArticles = (Array.isArray(september.articles) ? september.articles : []).map(article => ({ ...article, deck: 'september' }));
    const septemberCards = (Array.isArray(september.cards) ? september.cards : []).map(card => ({ ...card, deck: 'september' }));
    const colorArticles = Array.isArray(color.articles) ? color.articles : [];
    const colorCards = Array.isArray(color.cards) ? color.cards : [];
    articles = [...septemberArticles, ...colorArticles];
    cards = [...defaults, ...septemberCards, ...colorCards, ...custom];
    fillGroupOptions(); fillArticleOptions(); build();
    status(`卡组已分开：九月文章 ${septemberCards.length} 张；彩色词汇 ${colorCards.length} 张。忘了或模糊的词都会自动重复出现。`);
  });
})();
