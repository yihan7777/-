(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const fileInput = $('#dictationFile');
  if (!fileInput) return;

  const bankKey = 'ielts-answer-dictation-bank-v1';
  const stateKey = 'ielts-answer-dictation-state-v1';
  const articleKey = 'ielts-answer-dictation-article-v1';
  const fallback = {};
  let bank = load(bankKey, null);
  let state = load(stateKey, {});
  let mode = 'all';
  let queue = [];
  let current = null;
  let checked = false;

  function load(key, defaultValue) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaultValue)); }
    catch (_) { return Object.prototype.hasOwnProperty.call(fallback, key) ? fallback[key] : defaultValue; }
  }
  function save(key, value) {
    fallback[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function norm(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
  }
  function answerState(id) {
    if (!state[id]) state[id] = {attempts:0, wrongCount:0, correctCount:0, archived:false};
    return state[id];
  }
  function status(text, ok = true) {
    const el = $('#dictationStatus');
    el.textContent = text;
    el.className = `module-status ${ok ? 'success' : 'error'}`;
  }
  function validBank(data) {
    return data && data.format === 'ielts-answer-dictation-v1' && Array.isArray(data.articles) &&
      data.articles.every(a => a.title && Array.isArray(a.answers) && a.answers.every(x => x.id && x.answer));
  }
  function selectedArticle() {
    return bank?.articles?.find(a => a.id === $('#dictationArticle').value) || bank?.articles?.[0] || null;
  }
  function refreshSelect() {
    const select = $('#dictationArticle');
    if (!bank?.articles?.length) {
      select.innerHTML = '<option>请先导入题库</option>';
      select.disabled = true;
      return;
    }
    const saved = load(articleKey, bank.articles[0].id);
    select.innerHTML = bank.articles.map(a => `<option value="${a.id}">${String(a.order).padStart(3,'0')} · ${escapeHtml(a.title)}（${a.answers.length}词）</option>`).join('');
    select.value = bank.articles.some(a => a.id === saved) ? saved : bank.articles[0].id;
    select.disabled = false;
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function updateStats() {
    const answers = bank?.articles?.flatMap(a => a.answers) || [];
    $('#dictationArticleCount').textContent = bank?.articles?.length || 0;
    $('#dictationWrongTotal').textContent = answers.filter(a => answerState(a.id).wrongCount > 0 && !answerState(a.id).archived).length;
    $('#dictationArchivedCount').textContent = answers.filter(a => answerState(a.id).archived).length;
  }
  function buildQueue() {
    const article = selectedArticle();
    if (!article) { emptyCard(); return; }
    queue = article.answers.filter(a => {
      const s = answerState(a.id);
      return !s.archived && (mode === 'all' || s.wrongCount > 0);
    });
    if (!queue.length) {
      current = null;
      $('#dictationTitle').textContent = article.title;
      $('#dictationCounter').textContent = mode === 'wrong' ? '本篇暂无错词' : '本篇已无待练词';
      $('#dictationCorrectAnswer').textContent = '';
      $('#dictationFeedback').textContent = mode === 'wrong' ? '先练“本篇全部”，拼错的词会自动进入错词听写。' : '本篇单词均已剔除，可点击左侧恢复。';
      $('#dictationResult').classList.remove('hidden');
      toggleControls(false);
      updateStats();
      return;
    }
    showNext();
  }
  function showNext() {
    const article = selectedArticle();
    current = queue.shift() || null;
    checked = false;
    $('#dictationTitle').textContent = article?.title || '听力答案词听写';
    $('#dictationInput').value = '';
    $('#dictationResult').classList.add('hidden');
    if (!current) {
      $('#dictationCounter').textContent = '本轮完成';
      $('#dictationFeedback').textContent = '本轮已经完成，可以重新选择文章或切换为错词模式。';
      $('#dictationResult').classList.remove('hidden');
      toggleControls(false);
      updateStats();
      return;
    }
    const total = queue.length + 1;
    $('#dictationCounter').textContent = `本轮剩余 ${total} 词`;
    toggleControls(true);
    $('#nextDictation').disabled = true;
    setTimeout(() => speak(current.answer), 120);
  }
  function emptyCard() {
    current = null;
    $('#dictationTitle').textContent = '请先导入题库';
    $('#dictationCounter').textContent = '—';
    $('#dictationResult').classList.add('hidden');
    toggleControls(false);
    updateStats();
  }
  function toggleControls(enabled) {
    ['#playDictation','#dictationInput','#checkDictation','#archiveDictation'].forEach(sel => $(sel).disabled = !enabled);
    if (!enabled) $('#nextDictation').disabled = true;
  }
  function speak(text) {
    if (!current || !('speechSynthesis' in window)) { status('当前浏览器不能播放发音，请使用 Safari。', false); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = .68;
    speechSynthesis.speak(utterance);
  }
  function check() {
    if (!current || checked) return;
    const typed = $('#dictationInput').value.trim();
    if (!typed) { status('请先输入你听到的答案。', false); return; }
    checked = true;
    const s = answerState(current.id);
    s.attempts += 1;
    const correct = norm(typed) === norm(current.answer);
    if (correct) s.correctCount += 1;
    else s.wrongCount += 1;
    save(stateKey, state);
    $('#dictationCorrectAnswer').textContent = current.answer;
    $('#dictationFeedback').textContent = correct ? '✓ 拼写正确' : `✕ 你写的是：${typed}`;
    $('#dictationFeedback').className = correct ? 'listen-correct' : 'listen-wrong';
    $('#dictationMistakes').textContent = `这个答案累计拼错 ${s.wrongCount} 次 · 共练习 ${s.attempts} 次`;
    $('#dictationResult').classList.remove('hidden');
    $('#dictationInput').disabled = true;
    $('#checkDictation').disabled = true;
    $('#nextDictation').disabled = false;
    updateStats();
  }
  function archive() {
    if (!current) return;
    const archivedAnswer = current.answer;
    answerState(current.id).archived = true;
    save(stateKey, state);
    updateStats();
    showNext();
    status(`✓ “${archivedAnswer}”已移出学习。`);
  }
  function restore() {
    if (!bank) return;
    bank.articles.flatMap(a => a.answers).forEach(a => { answerState(a.id).archived = false; });
    save(stateKey, state);
    buildQueue();
    status('✓ 已恢复全部熟词。');
  }
  function importBank(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!validBank(data)) throw new Error('文件格式不正确');
        bank = data;
        save(bankKey, bank);
        refreshSelect();
        buildQueue();
        status(`✓ 已导入 ${bank.articleCount || bank.articles.length} 篇文章、${bank.answerCount || bank.articles.flatMap(a=>a.answers).length} 个答案词。`);
      } catch (error) { status(`导入失败：${error.message}`, false); }
      fileInput.value = '';
    };
    reader.onerror = () => status('文件读取失败，请重新选择。', false);
    reader.readAsText(file, 'utf-8');
  }

  fileInput.addEventListener('change', () => fileInput.files?.[0] && importBank(fileInput.files[0]));
  $('#dictationArticle').addEventListener('change', e => { save(articleKey, e.target.value); buildQueue(); });
  document.querySelectorAll('[data-dictation-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.dictationMode;
    document.querySelectorAll('[data-dictation-mode]').forEach(x => x.classList.toggle('active', x === button));
    buildQueue();
  }));
  $('#playDictation').addEventListener('click', () => current && speak(current.answer));
  $('#checkDictation').addEventListener('click', check);
  $('#dictationInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    checked ? showNext() : check();
  });
  $('#nextDictation').addEventListener('click', showNext);
  $('#archiveDictation').addEventListener('click', archive);
  $('#restoreDictation').addEventListener('click', restore);

  if (validBank(bank)) {
    refreshSelect();
    buildQueue();
    status(`✓ 已载入本机题库：${bank.articles.length} 篇文章。`);
  } else {
    bank = null;
    emptyCard();
  }
})();
