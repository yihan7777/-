(() => {
  'use strict';
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };
  const fetchJson = path => fetch(`${path}?overview=2`, {cache:'no-store'}).then(r => r.ok ? r.json() : []).catch(() => []);
  const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let sharedData = null;

  async function loadData() {
    const [vocab, listeningDefaults, readingDefaults] = await Promise.all([
      fetchJson('data/vocabulary.json'), fetchJson('data/listening-defaults.json'), fetchJson('data/reading-defaults.json')
    ]);
    return {vocab, listeningDefaults, readingDefaults};
  }
  function records(module, data) {
    if (module === 'memory') {
      const state = read('ielts-speaking-vocabulary-v1', {});
      return data.vocab.map(card => ({id:card.id, title:card.front, meta:card.meaning, state:state[card.id] || {}}));
    }
    if (module === 'listening') {
      const state = read('ielts-listening-state-v1', {});
      const custom = read('ielts-listening-custom-v1', []);
      return [...data.listeningDefaults, ...custom].map(card => ({id:card.id, title:card.word, meta:card.meaning, state:state[card.id] || {}}));
    }
    if (module === 'reading') {
      const state = read('ielts-reading-state-v1', {});
      const custom = read('ielts-reading-custom-v1', []);
      return [...data.readingDefaults, ...custom].map(card => ({id:card.id, title:card.front, meta:card.meaning, state:state[card.id] || {}}));
    }
    const state = read('ielts-answer-dictation-state-v1', {});
    const bank = read('ielts-answer-dictation-bank-v1', null);
    return (bank?.articles || []).flatMap(article => article.answers.map(card => ({
      id:card.id, title:card.answer, meta:article.title, state:state[card.id] || {}
    })));
  }
  function cardHtml(item, module) {
    const s = item.state || {};
    const practiced = (s.reps || 0) > 0 || s.lastGrade || (s.attempts || 0) > 0;
    const details = module === 'dictation'
      ? `拼错 ${s.wrongCount || 0} 次 · 练习 ${s.attempts || 0} 次`
      : `${practiced ? '已经练习' : '尚未练习'}${s.lastGrade ? ` · 上次：${s.lastGrade}` : ''}`;
    return `<article class="overview-card"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.meta || '暂无补充')}</p><small>${escapeHtml(details)}</small></article>`;
  }
  function render(details, list, tab) {
    const active = list.filter(item => !item.state.archived);
    const archived = list.filter(item => item.state.archived);
    details.querySelector('[data-overview-count]').textContent = `在线 ${active.length} · 已剔除 ${archived.length}`;
    const chosen = tab === 'archived' ? archived : active;
    const strip = details.querySelector('[data-overview-strip]');
    strip.innerHTML = chosen.length
      ? chosen.map(item => cardHtml(item, details.dataset.cardOverview)).join('')
      : `<p class="overview-empty">${tab === 'archived' ? '还没有剔除的卡片。' : '当前没有在线学习卡片。'}</p>`;
    strip.scrollLeft = 0;
  }
  async function openOverview(details) {
    if (!sharedData) sharedData = loadData();
    const data = await sharedData;
    const list = records(details.dataset.cardOverview, data);
    const selected = details.querySelector('[data-overview-tab].active')?.dataset.overviewTab || 'active';
    details._overviewList = list;
    render(details, list, selected);
  }

  document.querySelectorAll('[data-card-overview]').forEach(details => {
    details.addEventListener('toggle', () => { if (details.open) openOverview(details); });
    details.querySelectorAll('[data-overview-tab]').forEach(button => button.addEventListener('click', () => {
      details.querySelectorAll('[data-overview-tab]').forEach(item => item.classList.toggle('active', item === button));
      render(details, details._overviewList || [], button.dataset.overviewTab);
    }));
  });
})();
