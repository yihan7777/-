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
  $('#openListeningTest')?.addEventListener('click', async () => {
    const htmlFile = $('#practiceHtmlFile').files?.[0];
    const audioFile = $('#practiceAudioFile').files?.[0];
    if (!htmlFile || !audioFile) { status('需要同时选择同一篇的 HTML 题目和 audio.mp3。', true); return; }
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = URL.createObjectURL(audioFile);
    const title = htmlFile.name.replace(/\.html$/i,'');
    const part = inferPart(title);
    $('#practicePart').value = part;
    const source = injectBridge(await htmlFile.text(), activeAudioUrl, title, part);
    activeUrl = URL.createObjectURL(new Blob([source], {type:'text/html'}));
    $('#practiceFrame').src = activeUrl;
    $('#practiceTitle').textContent = part + ' · ' + title;
    $('#practiceFrameWrap').classList.remove('hidden');
    $('#causePanel').classList.add('hidden');
    status('✓ 题目已在本机打开。完成后请点击题目页面底部的 Finish。');
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
  activate(initial);
  setTimeout(() => { if (location.hash === '#listening-hub') activate(initial); }, 0);
})();
