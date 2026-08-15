(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const grid = $('#memoryOverviewGrid');
  if (!grid) return;
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  };
  const fetchJson = path => fetch(`${path}?overview=1`, {cache:'no-store'}).then(r => r.ok ? r.json() : []).catch(() => []);
  const summary = (name, ids, state, detail = '') => {
    const records = ids.map(id => state?.[id] || {});
    const archived = records.filter(x => x.archived).length;
    const practiced = records.filter(x => (x.reps || 0) > 0 || x.lastGrade || (x.attempts || 0) > 0).length;
    const due = records.filter(x => !x.archived && (x.due || 0) <= Date.now()).length;
    return `<article><span>${name}</span><strong>${ids.length}</strong><small>已练 ${practiced} · 待复习 ${due} · 已熟练 ${archived}${detail}</small></article>`;
  };
  async function render() {
    const [vocab, listeningDefaults, readingDefaults] = await Promise.all([
      fetchJson('data/vocabulary.json'), fetchJson('data/listening-defaults.json'), fetchJson('data/reading-defaults.json')
    ]);
    const memoryState = read('ielts-speaking-vocabulary-v1', {});
    const listeningState = read('ielts-listening-state-v1', {});
    const readingState = read('ielts-reading-state-v1', {});
    const listeningCustom = read('ielts-listening-custom-v1', []);
    const readingCustom = read('ielts-reading-custom-v1', []);
    const dictationBank = read('ielts-answer-dictation-bank-v1', null);
    const dictationState = read('ielts-answer-dictation-state-v1', {});
    const dictationAnswers = dictationBank?.articles?.flatMap(a => a.answers) || [];
    const wrong = dictationAnswers.filter(a => (dictationState[a.id]?.wrongCount || 0) > 0 && !dictationState[a.id]?.archived).length;
    grid.innerHTML = [
      summary('词汇记忆卡', vocab.map(x => x.id), memoryState),
      summary('听力反应卡', [...listeningDefaults, ...listeningCustom].map(x => x.id), listeningState),
      summary('阅读生词卡', [...readingDefaults, ...readingCustom].map(x => x.id), readingState),
      summary('答案词听写', dictationAnswers.map(x => x.id), dictationState, ` · 错词 ${wrong}`)
    ].join('');
  }
  $('#refreshMemoryOverview').addEventListener('click', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  window.addEventListener('storage', render);
  render();
})();
