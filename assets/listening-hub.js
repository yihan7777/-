(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const tabs = [...document.querySelectorAll('[data-listening-page]')];
  const views = [...document.querySelectorAll('[data-listening-view]')];
  if (!tabs.length) return;
  const pageKey = 'ielts-listening-inner-page-v1';
  const historyKey = 'ielts-listening-test-history-v1';
  const analysisFilterKey = 'ielts-listening-analysis-filter-v1';
  const causes = ['没听出答案词','定位失败','同义替换没反应','拼写或单复数错误','审题或字数限制','走神导致跟丢','选项干扰','其他'];
  let activeUrl = null;
  let activeAudioUrl = null;
  let pendingResult = null;
  let editingAttemptId = null;
  let privatePart = 'P1';
  let privateVipOnly = false;
  let privateDoneView = 'all';
  let paperSelection = new Set();
  let paperQueue = [];
  let paperIndex = -1;
  let paperResults = new Map();
  let paperReviewQueue = [];
  let paperObjectUrls = [];
  let historyCache = null;
  let analysisFilter = 'all';
  const dbName = 'ielts-private-listening-bank-v1';
  async function requestPersistentStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch (_) {}
  }
  function openDb() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open(dbName, 2);
      request.onupgradeneeded = () => {
        const db=request.result;
        if(!db.objectStoreNames.contains('tests')){
          const store = db.createObjectStore('tests', {keyPath:'id'});
          store.createIndex('part', 'part');
        }
        if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath:'key'});
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
  async function dbPutMeta(key,value){
    const db=await openDb();
    return new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({key,value,updatedAt:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  }
  async function dbGetMeta(key){
    const db=await openDb();
    return new Promise((resolve,reject)=>{const req=db.transaction('meta').objectStore('meta').get(key);req.onsuccess=()=>resolve(req.result?.value);req.onerror=()=>reject(req.error)});
  }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function loadHistory() {
    if (Array.isArray(historyCache)) return historyCache;
    try { historyCache = JSON.parse(localStorage.getItem(historyKey) || '[]'); }
    catch (_) { historyCache = []; }
    return historyCache;
  }
  function saveHistory(items) {
    historyCache = Array.isArray(items) ? items : [];
    try { localStorage.setItem(historyKey, JSON.stringify(historyCache)); }
    catch (error) { console.warn('Listening history localStorage save failed', error); }
    dbPutMeta(historyKey,historyCache).catch(error=>console.warn('Listening history IndexedDB backup failed',error));
    window.dispatchEvent(new CustomEvent('ielts-review-data-changed',{detail:{key:historyKey}}));
  }
  function makeAttempt(data) {
    return {
      ...data,
      id: data?.id || 'attempt-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
      date: data?.date || new Date().toISOString(),
      reviews: data?.reviews || {},
      reviewStatus: data?.reviewStatus || 'pending',
      reviewPlan: data?.reviewPlan || [{label:'D+1',due:dayStamp(1),done:false},{label:'D+3',due:dayStamp(3),done:false},{label:'D+7',due:dayStamp(7),done:false}]
    };
  }
  function storeAttemptImmediately(data) {
    const items = loadHistory();
    const recent = items.find(x=>x.title===data?.title&&x.part===data?.part&&Math.abs(new Date(x.date||0).getTime()-Date.now())<10000);
    const attempt = makeAttempt(recent ? {...recent,...data,id:recent.id,date:recent.date} : data);
    const index = items.findIndex(x => x.id === attempt.id);
    if (index >= 0) items[index] = {...items[index], ...attempt};
    else items.unshift(attempt);
    saveHistory(items.slice(0,2000));
    return attempt;
  }
  function addReactionWords(raw, title, q) {
    const words=String(raw||'').split(/[\n,，、;；]+/).map(x=>x.trim()).filter(Boolean);
    if(!words.length)return 0;
    let custom=[];try{custom=JSON.parse(localStorage.getItem('ielts-listening-custom-v1')||'[]')}catch(_){}
    const known=new Set(custom.map(x=>String(x.word).toLowerCase().replace(/[^a-z]/g,'')));let added=0;
    words.forEach(word=>{const key=word.toLowerCase().replace(/[^a-z]/g,'');if(!key||known.has(key))return;custom.push({id:'LC-'+Date.now()+'-'+added,word,meaning:'来自真题复盘，中文待补充',example:'Listen for “'+word+'” in '+title+' (Q'+q+').'});known.add(key);added++});
    localStorage.setItem('ielts-listening-custom-v1',JSON.stringify(custom));
    if(added)window.dispatchEvent(new CustomEvent('ielts-listening-cards-added',{detail:{cards:custom.slice(-added)}}));
    return added;
  }
  function addPhraseCard(text,evidence,title,q) {
    const phrase=String(text||'').trim();if(!phrase)return 0;
    const parts=phrase.split(/\s*(?:=|→|⇄)\s*/);const front=parts[0],meaning=parts.slice(1).join(' = ')||'听力同义替换，含义待补充';
    const item={category:'固定句型',front,meaning,example:evidence||'',note:'听力真题复盘 · '+title+' · Q'+q};
    if(window.addIELTSVocabularyCard)return window.addIELTSVocabularyCard(item)?1:0;
    let custom=[];try{custom=JSON.parse(localStorage.getItem('ielts-speaking-vocabulary-custom-v1')||'[]')}catch(_){}
    if(custom.some(x=>String(x.front).toLowerCase()===front.toLowerCase()))return 0;
    custom.push({id:'VC-'+Date.now(),...item});localStorage.setItem('ielts-speaking-vocabulary-custom-v1',JSON.stringify(custom));return 1;
  }
  function dayStamp(offset=0) {
    const date = new Date(); date.setHours(0,0,0,0); date.setDate(date.getDate()+offset);
    return date.toISOString().slice(0,10);
  }
  function causeOptions() { return causes.map(c => '<option>' + c + '</option>').join(''); }
  function parseReviewPaste(raw) {
    const labels = [
      ['primary', /^(?:主要错因|错因)\s*[：:]\s*(.*)$/],
      ['questionType', /^(?:题型)\s*[：:]\s*(.*)$/],
      ['autoAnalysis', /^(?:系统找到的原文\s*\/\s*解析参考|系统找到的原文|解析参考)\s*[：:]\s*(.*)$/],
      ['evidence', /^(?:原文定位句|原文定位)\s*[：:]\s*(.*)$/],
      ['synonym', /^(?:题干\s*(?:⇄|↔|<->)\s*原文同义替换|同义替换)\s*[：:]\s*(.*)$/],
      ['newWords', /^(?:本题生词|生词)\s*[：:]\s*(.*)$/],
      ['reminder', /^(?:下次看到什么要警觉[？?]?|下次提醒|提醒)\s*[：:]\s*(.*)$/]
    ];
    const result = {}; let current = '';
    String(raw || '').split(/\r?\n/).forEach(source => {
      const line = source.trim().replace(/^[-*•]\s*/, '').replace(/\*\*/g, '');
      if (!line) return;
      const found = labels.map(([key, pattern]) => [key, line.match(pattern)]).find(([, match]) => match);
      if (found) { current = found[0]; result[current] = found[1][1].trim(); }
      else if (current) result[current] = [result[current], line].filter(Boolean).join('\n');
    });
    return result;
  }
  function importReviewPaste(card) {
    const parsed = parseReviewPaste(card.querySelector('[data-review-paste]')?.value || '');
    const fields = {questionType:'[data-question-type]',autoAnalysis:'[data-auto-analysis]',evidence:'[data-evidence]',synonym:'[data-synonym]',newWords:'[data-new-words]',reminder:'[data-reminder]'};
    let count = 0;
    if (parsed.primary) {
      const select = card.querySelector('[data-primary-cause]');
      select.value = causes.find(c => parsed.primary.includes(c)) || '其他'; count++;
    }
    Object.entries(fields).forEach(([key, selector]) => {
      if (!parsed[key]) return;
      const input = card.querySelector(selector);
      if (input) { input.value = parsed[key]; count++; }
    });
    const status = card.querySelector('[data-paste-status]');
    status.textContent = count ? '✓ 已自动填入 ' + count + ' 项，你可以继续逐项修改。' : '没有识别到字段，请保留“主要错因：”“题型：”等标题后重试。';
    status.classList.toggle('bad', !count);
  }
  function reviewCard(q, detail={}) {
    const analysisText=String(detail.analysis||'');
    const synonymMatch=analysisText.match(/[^。；\n]{2,80}\s*(?:=|→|⇄)\s*[^。；\n]{2,80}/);
    const synonymCandidate=synonymMatch?.[0]?.trim()||'';
    const wordCandidate=/^[A-Za-z][A-Za-z' -]{2,}$/.test(String(detail.correctAnswer||''))?detail.correctAnswer:'';
    return '<details class="wrong-review-card" data-wrong-q="' + esc(q) + '"><summary><b>第 ' + esc(q) + ' 题</b><span>展开查看答案、解析与卡片选项 ↓</span></summary><div class="wrong-review-body">' +
      '<div class="answer-compare"><div><span>你的答案</span><b>' + esc(detail.userAnswer||'—') + '</b></div><div><span>正确答案</span><b>' + esc(detail.correctAnswer||'—') + '</b></div></div>' +
      '<div class="review-paste-box"><b>整段粘贴，自动拆分</b><p>把 ChatGPT 生成的完整错题分析直接粘贴到这里。</p><textarea data-review-paste placeholder="主要错因：同义替换没反应\n题型：填空题\n系统找到的原文 / 解析参考：…\n原文定位句：…\n题干 ⇄ 原文同义替换：…\n本题生词：…\n下次看到什么要警觉？：…"></textarea><button type="button" data-import-review>自动填入下面各项</button><small data-paste-status></small></div>' +
      '<label>主要错因<select data-primary-cause>' + causeOptions() + '</select></label>' +
      '<div class="secondary-causes">' + causes.map(c => '<label><input type="checkbox" data-secondary-cause value="' + esc(c) + '">' + esc(c) + '</label>').join('') + '</div>' +
      '<label>题型<select data-question-type><option>填空题</option><option>单选题</option><option>多选题</option><option>匹配题</option><option>地图题</option></select></label>' +
      '<label>系统找到的原文/解析参考<textarea data-auto-analysis>' + esc(detail.autoAnalysis||[detail.transcript,detail.analysis].filter(Boolean).join('\n')) + '</textarea></label>' +
      '<label>原文定位句<textarea data-evidence placeholder="保留真正决定答案的一句">' + esc(detail.transcript||'') + '</textarea></label>' +
      '<label>题干 ⇄ 原文同义替换<input data-synonym value="' + esc(synonymCandidate) + '" placeholder="例如：keep an open mind = be flexible"></label>' +
      '<label>本题生词（多个词用逗号或换行分隔）<textarea data-new-words placeholder="例如：intersection, utilitarian">' + esc(wordCandidate) + '</textarea></label>' +
      '<label>下次看到什么要警觉？<input data-reminder placeholder="例如：听到 but 后等待最终观点"></label>' +
      '<div class="card-export-options"><label><input type="checkbox" data-add-words checked>保存时把生词加入“单词反应卡”</label><label><input type="checkbox" data-add-phrase checked>把同义替换/短语加入“词汇记忆卡”</label></div>' +
      '</div></details>';
  }
  function activate(name) {
    const liveTabs = [...document.querySelectorAll('[data-listening-page]')];
    const liveViews = [...document.querySelectorAll('[data-listening-view]')];
    if (!liveTabs.some(x => x.dataset.listeningPage === name)) name = 'reaction';
    liveTabs.forEach(x => {
      const selected = x.dataset.listeningPage === name;
      x.classList.toggle('active', selected);
      x.setAttribute('aria-selected', selected ? 'true' : 'false');
      x.setAttribute('aria-current', selected ? 'page' : 'false');
      x.dataset.selected = selected ? 'true' : 'false';
    });
    liveViews.forEach(view => { if (view.dataset.listeningView !== 'all') view.hidden = view.dataset.listeningView !== name; });
    document.body.dataset.listeningSubpage = name;
    try { localStorage.setItem(pageKey, name); } catch (_) {}
    if (name === 'analysis') renderAnalysis();
    if (name === 'intensive') renderIntensive().catch(()=>{});
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }
  document.addEventListener('click', event => {
    const tab = event.target.closest?.('[data-listening-page]');
    if (tab) activate(tab.dataset.listeningPage);
  }, true);
  document.querySelector('[data-page="listening-hub"]')?.addEventListener('click', () => setTimeout(() => activate(localStorage.getItem(pageKey) || 'reaction')));
  function inferPart(name) {
    const match = String(name).match(/\bP([1-4])\b/i);
    return match ? 'P' + match[1] : $('#practicePart').value;
  }
  function replaceAssetReferences(html, assets) {
    const source = String(html || '');
    const rows = [];
    (Array.isArray(assets) ? assets : []).forEach((item, index) => {
      const blob = item?.blob instanceof Blob ? item.blob : (item instanceof Blob ? item : null);
      if (!blob) return;
      const name = String(item?.name || blob.name || ('asset-' + index)).replace(/\\/g,'/').replace(/^\.\//,'');
      const url = URL.createObjectURL(blob);
      paperObjectUrls.push(url);
      rows.push({name,base:name.split('/').pop().toLowerCase(),url});
    });
    if (!rows.length) return source;
    try {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      const resolve = value => {
        let clean = String(value || '').replace(/\\/g,'/');
        try { clean = decodeURI(clean); } catch (_) {}
        clean = clean.split(/[?#]/)[0].replace(/^\.\//,'');
        const base = clean.split('/').pop().toLowerCase();
        return rows.find(row => clean.endsWith(row.name) || base === row.base)?.url || '';
      };
      doc.querySelectorAll('[src],[href],[poster]').forEach(node => {
        ['src','href','poster'].forEach(attr => {
          if (!node.hasAttribute(attr)) return;
          const url = resolve(node.getAttribute(attr));
          if (url) node.setAttribute(attr, url);
        });
      });
      doc.querySelectorAll('[style]').forEach(node => {
        let value = node.getAttribute('style') || '';
        value = value.replace(/url\((['"]?)([^)'"]+)\1\)/gi, (all,q,path) => {
          const url = resolve(path); return url ? 'url("' + url + '")' : all;
        });
        node.setAttribute('style', value);
      });
      doc.querySelectorAll('style').forEach(node => {
        node.textContent = (node.textContent || '').replace(/url\((['"]?)([^)'"]+)\1\)/gi, (all,q,path) => {
          const url = resolve(path); return url ? 'url("' + url + '")' : all;
        });
      });
      return '<!doctype html>\n' + doc.documentElement.outerHTML;
    } catch (_) {
      let output = source;
      rows.forEach(row => {
        [row.name, './'+row.name, encodeURI(row.name)].forEach(name => { output = output.split(name).join(row.url); });
      });
      return output;
    }
  }
  function injectBridge(html, audioUrl, title, part, assets = []) {
    let replaced = String(html || '').replace(/"audio"\s*:\s*"[^"]*"/, '"audio":' + JSON.stringify(audioUrl));
    replaced = replaceAssetReferences(replaced, assets);
    const layoutFix = '<style id="ielts-embedded-layout-fix">html,body{margin:0!important;padding:0!important;min-height:0!important;height:auto!important;scroll-behavior:auto!important;overflow:auto!important}body{display:block!important;box-sizing:border-box!important;background:#fff!important;padding:12px 16px 80px!important}body>*,main,#app,.app,.container,.wrapper,.page,.content,.exam,.test,.question-container{min-height:0!important;max-height:none!important;margin-top:0!important;padding-top:0!important;transform:none!important;top:auto!important}header:empty,.spacer:empty,[class*="spacer"]:empty,[class*="hero"]:empty{display:none!important}audio{max-width:100%!important}input,textarea,select,[contenteditable="true"]{scroll-margin-top:96px!important}@media(max-width:760px){body{padding:8px 8px 72px!important;width:100%!important;max-width:100%!important}table{max-width:100%!important;font-size:14px!important}}</style>';
    const bridge = '<script>(function(){function plain(v){var d=document.createElement("div");d.innerHTML=String(v||"");return d.textContent.trim()}function visible(n){if(!n)return false;var r=n.getBoundingClientRect(),s=getComputedStyle(n);return s.display!=="none"&&s.visibility!=="hidden"&&r.width>2&&r.height>2}function firstQuestion(){var list=[].slice.call(document.querySelectorAll("input:not([type=hidden]):not([type=range]):not([type=button]):not([type=submit]),textarea,select,[contenteditable=true]"));return list.find(visible)||[].slice.call(document.querySelectorAll("h1,h2,h3,h4,b,strong,p")).find(function(n){return /questions?\\s*\\d|complete the|choose the|write no more|notes below|form below/i.test(n.textContent||"")})}function compact(){var target=firstQuestion();if(!target)return;var node=target;while(node&&node!==document.body){node.style.setProperty("min-height","0","important");node.style.setProperty("height","auto","important");node.style.setProperty("max-height","none","important");node.style.setProperty("margin-top","0","important");node.style.setProperty("padding-top","0","important");node.style.setProperty("top","auto","important");node.style.setProperty("transform","none","important");if(node.parentElement){var sib=node.parentElement.firstElementChild;while(sib&&sib!==node){var r=sib.getBoundingClientRect(),txt=(sib.textContent||"").replace(/\\s+/g," ").trim(),interactive=sib.querySelector&&sib.querySelector("audio,input,textarea,select,button,[contenteditable=true]");if(!interactive&&r.height>140&&txt.length<90)sib.style.setProperty("display","none","important");sib=sib.nextElementSibling}}node=node.parentElement}var tr=target.getBoundingClientRect();if(tr.top>220){[].slice.call(document.querySelectorAll("body *")).forEach(function(el){if(el===target||el.contains(target)||target.contains(el))return;var r=el.getBoundingClientRect(),txt=(el.textContent||"").replace(/\\s+/g," ").trim();if(r.bottom<=tr.top&&r.height>180&&txt.length<60&&!el.querySelector("audio,input,textarea,select,button"))el.style.setProperty("display","none","important")})}requestAnimationFrame(function(){target.scrollIntoView({block:"start",inline:"nearest"});var root=document.scrollingElement||document.documentElement;root.scrollTop=Math.max(0,root.scrollTop-92)})}document.addEventListener("DOMContentLoaded",function(){[0,120,420,900,1800].forEach(function(t){setTimeout(compact,t)});new MutationObserver(function(){clearTimeout(window.__ieltsCompactTimer);window.__ieltsCompactTimer=setTimeout(compact,80)}).observe(document.body,{childList:true,subtree:true})});document.addEventListener("click",function(e){if(e.target&&e.target.id==="finish"){setTimeout(function(){var wrong=[].slice.call(document.querySelectorAll("#nav .incorrect")).map(function(x){return x.dataset.q});var correct=document.querySelectorAll("#nav .correct").length;var rows=[].slice.call(document.querySelectorAll(".review-table tbody tr"));var details={};wrong.forEach(function(q){var row=rows.find(function(r){return r.cells&&r.cells[0]&&r.cells[0].textContent.trim()===String(q)});var cues=(typeof DATA!=="undefined"&&DATA.transcriptLines||[]).filter(function(x){var h=String(x&&x.html||"");return h.indexOf("q"+q)>=0||h.indexOf("Q"+q)>=0});details[q]={userAnswer:row&&row.cells[1]?row.cells[1].textContent.trim():"",correctAnswer:row&&row.querySelector(".answer-value")?row.querySelector(".answer-value").dataset.answer:"",transcript:cues.map(function(x){return plain(x.html)}).join(" "),analysis:cues.map(function(x){return plain(x.analysis)}).filter(Boolean).join(" ")}});parent.postMessage({type:"ielts-test-result",title:' + JSON.stringify(title) + ',part:' + JSON.stringify(part) + ',correct:correct,wrongQuestions:wrong,total:correct+wrong.length,questionDetails:details},"*")},800)}})})();<\\/script>';
    const robustResultBridge = `<script>(function(){
      var initialTotal=0,lastSent='';
      function visible(n){if(!n)return false;var r=n.getBoundingClientRect(),s=getComputedStyle(n);return s.display!=='none'&&s.visibility!=='hidden'&&r.width>2&&r.height>2}
      function controls(){return [].slice.call(document.querySelectorAll('input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=range]),textarea,select,[contenteditable=true]')).filter(visible)}
      function numberOf(node,index){var raw=(node&&node.dataset&&(node.dataset.q||node.dataset.question||node.dataset.number))||(node&&node.textContent)||'';var m=String(raw).match(/\\d+/);return m?m[0]:String(index+1)}
      function collect(){
        var correctNodes=[].slice.call(document.querySelectorAll('#nav .correct,.question-nav .correct,[data-state="correct"],[data-result="correct"]'));
        var wrongNodes=[].slice.call(document.querySelectorAll('#nav .incorrect,#nav .wrong,.question-nav .incorrect,.question-nav .wrong,[data-state="incorrect"],[data-state="wrong"],[data-result="incorrect"],[data-result="wrong"]'));
        var wrong=[];wrongNodes.forEach(function(x,i){var q=numberOf(x,i);if(wrong.indexOf(q)<0)wrong.push(q)});
        var rows=[].slice.call(document.querySelectorAll('.review-table tbody tr,[class*="review"] tbody tr'));
        rows.forEach(function(row,i){if(/incorrect|wrong|错误|错题/i.test(row.className+' '+row.textContent)){var q=numberOf(row,i);if(wrong.indexOf(q)<0)wrong.push(q)}});
        var total=Math.max(initialTotal,correctNodes.length+wrong.length,rows.length,controls().length);
        var correct=correctNodes.length;if(!correct&&total&&wrong.length)correct=Math.max(0,total-wrong.length);
        var details={};wrong.forEach(function(q){var row=rows.find(function(r){return numberOf(r,0)===String(q)});var cues=(typeof DATA!=='undefined'&&DATA.transcriptLines||[]).filter(function(x){var h=String(x&&x.html||'');return h.indexOf('q'+q)>=0||h.indexOf('Q'+q)>=0});details[q]={userAnswer:row&&row.cells&&row.cells[1]?row.cells[1].textContent.trim():'',correctAnswer:row&&row.querySelector('.answer-value')?(row.querySelector('.answer-value').dataset.answer||row.querySelector('.answer-value').textContent.trim()):'',transcript:cues.map(function(x){var d=document.createElement('div');d.innerHTML=String(x.html||'');return d.textContent.trim()}).join(' '),analysis:cues.map(function(x){return String(x.analysis||'')}).filter(Boolean).join(' ')}});
        return {type:'ielts-test-result',title:${JSON.stringify(title)},part:${JSON.stringify(part)},correct:correct,wrongQuestions:wrong,total:total,questionDetails:details,capturedAt:new Date().toISOString()}
      }
      function send(){var data=collect();if(!data.total)return;var signature=[data.correct,data.total,data.wrongQuestions.join(',')].join('|');if(signature===lastSent)return;lastSent=signature;parent.postMessage(data,'*')}
      function schedule(){[120,450,900,1800,3200].forEach(function(t){setTimeout(send,t)})}
      function finishNode(node){if(!node)return false;var raw=[node.id,node.name,node.className,node.getAttribute&&node.getAttribute('aria-label'),node.value,node.textContent].join(' ');return /finish|submit|check\\s*answers?|complete|交卷|提交|完成|查看答案/i.test(raw)}
      document.addEventListener('DOMContentLoaded',function(){initialTotal=controls().length});
      document.addEventListener('click',function(e){var node=e.target&&e.target.closest&&e.target.closest('button,input[type=button],input[type=submit],a,[role=button]');if(finishNode(node))schedule()},true);
      document.addEventListener('submit',schedule,true);
    })();<\/script>`;
    const withStyle=/<\/head>/i.test(replaced)?replaced.replace(/<\/head>/i,layoutFix+'</head>'):layoutFix+replaced;
    return /<\/body>/i.test(withStyle)?withStyle.replace(/<\/body>/i,bridge+robustResultBridge+'</body>'):withStyle+bridge+robustResultBridge;
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
  function isVipTest(record) { return /\(\s*VIP\s*\)/i.test(String(record?.title || '')); }
  function testOrder(record) {
    const match = String(record?.title || '').match(/^\s*(\d+)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }
  function sortPaper(records) {
    const partOrder={P1:1,P2:2,P3:3,P4:4};
    return [...records].sort((a,b)=>(partOrder[a.part]||9)-(partOrder[b.part]||9)||testOrder(a)-testOrder(b)||a.title.localeCompare(b.title,undefined,{numeric:true}));
  }
  function renderPaperBuilder(records) {
    const doneTitles=new Set(loadHistory().map(x=>x.title));
    const selected=sortPaper(records.filter(x=>paperSelection.has(x.id)&&!doneTitles.has(x.title)));
    $('#paperBuilder').innerHTML='<div class="paper-builder-head"><div><b>组卷做套题</b><small>手动加入，或一键从 P1–P4 各抽一篇</small></div><strong>'+selected.length+' 篇</strong></div><div class="paper-builder-actions"><button data-random-paper>随机完整套题</button><button data-start-paper '+(selected.length?'':'disabled')+'>开始套题</button><button data-clear-paper '+(selected.length?'':'disabled')+'>清空</button></div><div class="paper-selected-strip">'+(selected.length?selected.map((x,i)=>'<span><i>'+x.part+'</i>'+(i+1)+'. '+esc(x.title)+'<button data-remove-paper="'+esc(x.id)+'" aria-label="移除">×</button></span>').join(''):'<p>还没有选题。你可以在题目下方点击“加入组卷”。</p>')+'</div>';
    document.querySelector('[data-random-paper]').onclick=()=>{
      const chosen=[];
      for(const part of ['P1','P2','P3','P4']){
        const pool=records.filter(x=>x.part===part&&(!privateVipOnly||isVipTest(x))&&!doneTitles.has(x.title));
        if(!pool.length)return alert(part+' 没有可用题目，请先导入该部分或关闭“仅看 VIP”。');
        chosen.push(pool[Math.floor(Math.random()*pool.length)]);
      }
      paperSelection=new Set(chosen.map(x=>x.id));renderPrivateBank();
    };
    document.querySelector('[data-start-paper]').onclick=()=>startPaper(records);
    document.querySelector('[data-clear-paper]').onclick=()=>{paperSelection.clear();renderPrivateBank()};
    document.querySelectorAll('[data-remove-paper]').forEach(btn=>btn.onclick=()=>{paperSelection.delete(btn.dataset.removePaper);renderPrivateBank()});
  }
  async function startPaper(records) {
    paperQueue=sortPaper(records.filter(x=>paperSelection.has(x.id)));
    if(!paperQueue.length)return;
    launchPaperWorkspace();
  }
  function cleanupPaperWorkspace() {
    paperObjectUrls.forEach(url=>URL.revokeObjectURL(url));paperObjectUrls=[];
    $('#paperFrames').innerHTML='';$('#paperFrames').hidden=true;$('#paperPartNav').hidden=true;
  }
  function compactFrameLayout(frame) {
    try {
      const doc=frame?.contentDocument,win=frame?.contentWindow;
      if(!doc||!win)return false;
      const target=[...doc.querySelectorAll('input:not([type="hidden"]):not([type="range"]):not([type="button"]):not([type="submit"]),textarea,select,[contenteditable="true"]')].find(node=>node.offsetParent!==null&&node.getBoundingClientRect().width>2)||[...doc.querySelectorAll('h1,h2,h3,h4,b,strong,p')].find(node=>/questions?\s*\d|complete the|choose the|write no more|notes below|form below/i.test(node.textContent||''));
      if(!target)return false;
      let node=target;
      while(node&&node!==doc.body){
        ['min-height','height','max-height','margin-top','padding-top','top','transform'].forEach(prop=>node.style.removeProperty(prop));
        node.style.setProperty('min-height','0','important');
        node.style.setProperty('height','auto','important');
        node.style.setProperty('max-height','none','important');
        node.style.setProperty('margin-top','0','important');
        node.style.setProperty('padding-top','0','important');
        node.style.setProperty('top','auto','important');
        node.style.setProperty('transform','none','important');
        if(node.parentElement){
          let sibling=node.parentElement.firstElementChild;
          while(sibling&&sibling!==node){
            const rect=sibling.getBoundingClientRect(),text=(sibling.textContent||'').replace(/\s+/g,' ').trim();
            const useful=sibling.querySelector?.('audio,input,textarea,select,button,[contenteditable="true"]');
            if(!useful&&rect.height>140&&text.length<90)sibling.style.setProperty('display','none','important');
            sibling=sibling.nextElementSibling;
          }
        }
        node=node.parentElement;
      }
      doc.documentElement.style.setProperty('min-height','0','important');
      doc.body.style.setProperty('min-height','0','important');
      doc.body.style.setProperty('height','auto','important');
      return true;
    } catch (_) { return false; }
  }
  function jumpFrameToQuestion(frame, smooth=true) {
    try {
      const doc=frame?.contentDocument, win=frame?.contentWindow;
      if(!doc||!win)return false;
      const candidates=[...doc.querySelectorAll('input:not([type="hidden"]):not([type="range"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]')];
      const target=candidates.find(node=>{
        const r=node.getBoundingClientRect();
        return node.offsetParent!==null&&r.width>2&&r.height>2;
      })||[...doc.querySelectorAll('h1,h2,h3,h4,b,strong,p')].find(node=>/questions?\s*\d|complete the|choose the|write no more|notes below|form below/i.test(node.textContent||''));
      if(!target)return false;
      if(!doc.getElementById('ielts-auto-focus-style')){
        const style=doc.createElement('style');style.id='ielts-auto-focus-style';
        style.textContent='html{scroll-behavior:auto!important} input,textarea,select,[contenteditable="true"]{scroll-margin-top:110px!important}';
        doc.head?.appendChild(style);
      }
      const scrollTarget=(container)=>{
        const tr=target.getBoundingClientRect(),cr=container.getBoundingClientRect();
        const next=container.scrollTop+tr.top-cr.top-Math.min(110,container.clientHeight*.14);
        container.scrollTo?.({top:Math.max(0,next),behavior:smooth?'smooth':'auto'});
        if(!container.scrollTo)container.scrollTop=Math.max(0,next);
      };
      let parent=target.parentElement;
      while(parent&&parent!==doc.body&&parent!==doc.documentElement){
        const style=win.getComputedStyle(parent);
        if(parent.scrollHeight>parent.clientHeight+30&&/(auto|scroll|overlay)/.test(style.overflowY+style.overflow))scrollTarget(parent);
        parent=parent.parentElement;
      }
      target.scrollIntoView({behavior:'auto',block:'start',inline:'nearest'});
      const root=doc.scrollingElement||doc.documentElement;
      const top=target.getBoundingClientRect().top+(root.scrollTop||win.scrollY)-Math.min(130,frame.clientHeight*.15);
      root.scrollTop=Math.max(0,top);doc.body.scrollTop=Math.max(0,top);
      win.scrollTo({top:Math.max(0,top),behavior:smooth?'smooth':'auto'});
      return true;
    } catch (_) { return false; }
  }
  function scheduleFrameJump(frame) {
    [80,260,700,1400,2400].forEach((delay,index)=>setTimeout(()=>{compactFrameLayout(frame);jumpFrameToQuestion(frame,index>2)},delay));
  }
  function jumpActiveQuestion(smooth=true) {
    const active=document.querySelector('[data-paper-frame]:not([hidden])')||$('#practiceFrame');
    return jumpFrameToQuestion(active,smooth);
  }
  function showPaperPart(index) {
    paperIndex=index;
    document.querySelectorAll('[data-paper-frame]').forEach(frame=>{
      const active=Number(frame.dataset.paperFrame)===index;frame.hidden=!active;
      if(!active){try{frame.contentDocument?.querySelectorAll('audio').forEach(audio=>audio.pause())}catch(_){}}
    });
    document.querySelectorAll('[data-paper-switch]').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.paperSwitch)===index));
    const record=paperQueue[index];
    if(record)$('#practiceTitle').textContent='IELTS 套题 · '+record.part+' · '+record.title;
    const activeFrame=document.querySelector('[data-paper-frame="'+index+'"]');
    scheduleFrameJump(activeFrame);
  }
  function launchPaperWorkspace() {
    cleanupPaperWorkspace();paperResults=new Map();paperReviewQueue=[];paperIndex=0;
    $('#practiceFrame').hidden=true;$('#practiceFrame').src='about:blank';
    $('#paperPartNav').hidden=false;$('#paperFrames').hidden=false;
    $('#paperPartNav').innerHTML=paperQueue.map((x,i)=>'<button data-paper-switch="'+i+'"><b>'+esc(x.part)+'</b><small>'+(i+1)+'</small></button>').join('');
    $('#paperFrames').innerHTML=paperQueue.map((record,i)=>{
      const audioUrl=URL.createObjectURL(record.audio);paperObjectUrls.push(audioUrl);
      const source=injectBridge(record.html,audioUrl,record.title,record.part,record.assets||[]);
      const pageUrl=URL.createObjectURL(new Blob([source],{type:'text/html'}));paperObjectUrls.push(pageUrl);
      return '<iframe data-paper-frame="'+i+'" src="'+esc(pageUrl)+'" title="'+esc(record.part+' '+record.title)+'" loading="eager" '+(i?'hidden':'')+'></iframe>';
    }).join('');
    document.querySelectorAll('[data-paper-frame]').forEach(frame=>frame.addEventListener('load',()=>scheduleFrameJump(frame)));
    document.querySelectorAll('[data-paper-switch]').forEach(btn=>btn.onclick=()=>showPaperPart(Number(btn.dataset.paperSwitch)));
    $('#practiceFrameWrap').classList.remove('hidden');$('#causePanel').classList.add('hidden');
    showPaperPart(0);$('#practiceFrameWrap').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function launchTest(htmlText, audioBlob, title, part, assets = []) {
    cleanupPaperWorkspace();$('#practiceFrame').hidden=false;
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = URL.createObjectURL(audioBlob);
    $('#practicePart').value = part;
    const source = injectBridge(htmlText, activeAudioUrl, title, part, assets);
    activeUrl = URL.createObjectURL(new Blob([source], {type:'text/html'}));
    $('#practiceFrame').src = activeUrl;
    $('#practiceFrame').onload=()=>scheduleFrameJump($('#practiceFrame'));
    $('#practiceTitle').textContent = part + ' · ' + title;
    $('#practiceFrameWrap').classList.remove('hidden');
    $('#causePanel').classList.add('hidden');
    $('#practiceFrameWrap').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function renderPrivateBank() {
    const records = await dbAll();
    const history = loadHistory();
    const doneTitles=new Set(history.map(x=>x.title));
    for(const id of [...paperSelection]){const record=records.find(x=>x.id===id);if(record&&doneTitles.has(record.title))paperSelection.delete(id)}
    $('#privateBankCount').textContent = records.length ? records.length + ' 篇已保存在本机' : '尚未导入';
    $('#privatePartTabs').innerHTML = ['P1','P2','P3','P4'].map(part => {
      const count=records.filter(x=>x.part===part&&(!privateVipOnly||isVipTest(x))).length;
      return '<button class="' + (part === privatePart ? 'active' : '') + '" data-private-part="' + part + '">' + part + '（' + count + '）</button>';
    }).join('');
    document.querySelectorAll('[data-private-part]').forEach(btn => btn.onclick = () => { privatePart = btn.dataset.privatePart; renderPrivateBank(); });
    const vipCount=records.filter(x=>x.part===privatePart&&isVipTest(x)).length;
    const doneCount=records.filter(x=>x.part===privatePart&&doneTitles.has(x.title)).length;
    $('#privateBankFilters').innerHTML='<button class="'+(!privateVipOnly?'active':'')+'" data-private-vip="all">全部题目</button><button class="'+(privateVipOnly?'active':'')+'" data-private-vip="vip">仅看 VIP（'+vipCount+'）</button><button class="'+(privateDoneView==='todo'?'active':'')+'" data-private-done="todo">未做（'+(records.filter(x=>x.part===privatePart).length-doneCount)+'）</button><button class="'+(privateDoneView==='done'?'active':'')+'" data-private-done="done">已做（'+doneCount+'）</button><span>已按题号从小到大排列</span>';
    document.querySelectorAll('[data-private-vip]').forEach(btn=>btn.onclick=()=>{privateVipOnly=btn.dataset.privateVip==='vip';renderPrivateBank()});
    document.querySelectorAll('[data-private-done]').forEach(btn=>btn.onclick=()=>{privateDoneView=privateDoneView===btn.dataset.privateDone?'all':btn.dataset.privateDone;renderPrivateBank()});
    renderPaperBuilder(records);
    const filtered = records.filter(x => x.part === privatePart && (!privateVipOnly || isVipTest(x)) && (privateDoneView==='all'||(privateDoneView==='done')===doneTitles.has(x.title))).sort((a,b) => testOrder(a)-testOrder(b) || a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'}));
    $('#privateTestList').innerHTML = filtered.length ? filtered.map(x => {
      const attempts=history.filter(a=>a.title===x.title);
      const attemptHtml=attempts.length?attempts.map(a=>{
        const wrong=Object.entries(a.reviews||{}).map(([q,r])=>esc('Q'+q+' '+(r.primary||'未标记')+(r.synonym?' · '+r.synonym:''))).join('<br>');
        return '<div class="private-attempt"><div class="private-attempt-head"><span>'+esc(new Date(a.date).toLocaleDateString())+' · '+a.correct+'/'+a.total+'</span><button class="edit-attempt" data-edit-attempt="'+esc(a.id||'')+'">重新编辑</button></div><div class="private-attempt-errors">'+(wrong||'本次没有逐题复盘记录')+'</div></div>';
      }).join(''):'<p class="no-private-errors">完成这篇并保存复盘后，错题会显示在这里。</p>';
      return '<details class="private-test-entry"><summary><span><b>'+esc(x.title)+(isVipTest(x)?' <i class="vip-test-badge">VIP</i>':'')+(doneTitles.has(x.title)?' <i class="done-test-badge">已做</i>':'')+'</b><small>'+esc(x.frequency)+' · '+attempts.length+' 次练习</small></span><em>展开 ↓</em></summary><div class="private-test-body"><div class="private-test-actions"><button data-private-test="'+esc(x.id)+'">'+(doneTitles.has(x.title)?'重新做题':'开始做题')+'</button><button class="'+(paperSelection.has(x.id)?'paper-added':'')+'" data-add-paper="'+esc(x.id)+'" '+(doneTitles.has(x.title)?'disabled title="已做题目不会加入新套题"':'')+'>'+(doneTitles.has(x.title)?'已做 · 不参与组卷':paperSelection.has(x.id)?'✓ 已加入组卷':'＋ 加入组卷')+'</button><button class="chatgpt-review" data-chatgpt-title="'+esc(x.title)+'">复制复盘并打开 ChatGPT</button></div>'+attemptHtml+'</div></details>';
    }).join('') : '<p>'+(privateVipOnly?'这个部分暂时没有标记为 VIP 的题目。':'这个部分还没有导入篇目。')+'</p>';
    document.querySelectorAll('[data-private-test]').forEach(btn => btn.onclick = async () => {
      const record = (await dbAll()).find(x => x.id === btn.dataset.privateTest);
      if (record) { paperQueue=[];paperReviewQueue=[];paperIndex=-1;launchTest(record.html, record.audio, record.title, record.part, record.assets||[]); }
    });
    document.querySelectorAll('[data-add-paper]').forEach(btn=>btn.onclick=()=>{paperSelection.has(btn.dataset.addPaper)?paperSelection.delete(btn.dataset.addPaper):paperSelection.add(btn.dataset.addPaper);renderPrivateBank()});
    document.querySelectorAll('[data-edit-attempt]').forEach(btn=>btn.onclick=()=>openAttemptEditor(btn.dataset.editAttempt));
    document.querySelectorAll('[data-chatgpt-title]').forEach(btn=>btn.onclick=()=>openChatGPTReview(btn.dataset.chatgptTitle));
  }
  function openAttemptEditor(id) {
    const attempt=loadHistory().find(x=>x.id===id);if(!attempt)return;
    paperReviewQueue=[];
    editingAttemptId=id;pendingResult=JSON.parse(JSON.stringify(attempt));
    const wrong=pendingResult.wrongQuestions||[];
    $('#practiceScore').textContent=pendingResult.correct+'/'+pendingResult.total+' · 重新编辑';
    $('#causeQuestions').innerHTML='<div class="edit-review-banner"><span>正在重新编辑已保存的错题复盘</span><button id="cancelReviewEdit">取消</button></div>'+wrong.map(q=>reviewCard(q,pendingResult.questionDetails?.[q]||{})).join('');
    wrong.forEach(q=>{
      const card=document.querySelector('[data-wrong-q="'+CSS.escape(String(q))+'"]'),r=pendingResult.reviews?.[q];if(!card||!r)return;
      card.querySelector('[data-primary-cause]').value=r.primary||causes[0];
      card.querySelector('[data-question-type]').value=r.questionType||'填空题';
      card.querySelector('[data-auto-analysis]').value=r.autoAnalysis||pendingResult.questionDetails?.[q]?.autoAnalysis||[pendingResult.questionDetails?.[q]?.transcript,pendingResult.questionDetails?.[q]?.analysis].filter(Boolean).join('\n');
      card.querySelector('[data-evidence]').value=r.evidence||'';
      card.querySelector('[data-synonym]').value=r.synonym||'';
      card.querySelector('[data-new-words]').value=r.newWords||'';
      card.querySelector('[data-reminder]').value=r.reminder||'';
      card.querySelectorAll('[data-secondary-cause]').forEach(x=>x.checked=(r.secondary||[]).includes(x.value));
      card.querySelector('[data-add-words]').checked=false;card.querySelector('[data-add-phrase]').checked=false;
    });
    $('#causePanel').classList.remove('hidden');$('#causePanel').scrollIntoView({behavior:'smooth',block:'start'});
    $('#cancelReviewEdit').onclick=()=>{editingAttemptId=null;pendingResult=null;$('#causePanel').classList.add('hidden')};
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-import-review]');
    if (button) importReviewPaste(button.closest('[data-wrong-q]'));
  });
  function chatGPTPrompt(title) {
    const attempts=loadHistory().filter(x=>x.title===title);
    const lines=attempts.flatMap(a=>Object.entries(a.reviews||{}).map(([q,r])=>{
      const d=a.questionDetails?.[q]||{};
      return ['Q'+q,'我的答案：'+(d.userAnswer||'未记录'),'正确答案：'+(d.correctAnswer||'未记录'),'主要错因：'+(r.primary||'未标记'),'次要错因：'+(r.secondary||[]).join('、'),'系统找到的原文 / 解析参考：'+(r.autoAnalysis||d.analysis||'未补充'),'原文定位：'+(r.evidence||d.transcript||'未补充'),'已有同义替换：'+(r.synonym||'未补充'),'生词：'+(r.newWords||'未补充'),'下次提醒：'+(r.reminder||'未补充')].join('\n');
    }));
    return '你是我的雅思听力复盘老师。下面是我在《'+title+'》中的错题复盘，请完成：\n1. 按题号检查我的错因是否准确；\n2. 提取“题干表达 ⇄ 原文表达”的同义替换；\n3. 整理值得加入听力反应卡的生词，并给出中文和简短例句；\n4. 整理值得加入记忆卡的短语；\n5. 总结我反复出现的问题，并给下一次做题前的3条提醒。\n不要编造原文中没有的信息。\n\n'+(lines.join('\n\n')||'这篇暂时没有保存错题，请先提醒我完成复盘。');
  }
  async function openChatGPTReview(title) {
    const prompt=chatGPTPrompt(title);
    const chatWindow=window.open('https://chatgpt.com/','_blank','noopener');
    try { await navigator.clipboard.writeText(prompt); }
    catch (_) { const area=document.createElement('textarea');area.value=prompt;document.body.append(area);area.select();document.execCommand('copy');area.remove(); }
    alert('这篇复盘内容已经复制。打开 ChatGPT 后直接粘贴发送即可。');
    if(!chatWindow)location.href='https://chatgpt.com/';
  }
  $('#practiceFolder')?.addEventListener('change', async event => {
    await requestPersistentStorage();
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
      const assets = files.filter(file => {
        const assetPath = file.webkitRelativePath || file.name;
        return assetPath.startsWith(dir) && file !== htmlFile && file !== audioFile && /\.(?:png|jpe?g|gif|webp|svg|css|woff2?|ttf|otf)$/i.test(file.name);
      }).map(file => ({name:(file.webkitRelativePath || file.name).slice(dir.length),type:file.type||'application/octet-stream',blob:file}));
      status('正在导入 ' + (imported + 1) + '/' + htmlFiles.length + '：' + title + (assets.length ? '（含 '+assets.length+' 个图片/样式资源）' : ''));
      await dbPut({id:path,part,title,frequency:frequencyFromPath(path),html:await htmlFile.text(),audio:audioFile,assets,updatedAt:Date.now()});
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
    await requestPersistentStorage();
    const htmlText = await htmlFile.text();
    const recordId = 'manual/' + part + '/' + htmlFile.name;
    await dbPut({id:recordId,part,title,frequency:'手动导入',html:htmlText,audio:audioFile,updatedAt:Date.now()});
    paperQueue=[];paperReviewQueue=[];paperIndex=-1;
    await launchTest(htmlText, audioFile, title, part);
    await renderPrivateBank();
    status('✓ 题目已打开并保存到“我的私人真题库”，刷新后仍可找到。完成后请点击题目页面底部的 Finish。');
  });
  $('#clearPrivateBank')?.addEventListener('click', async () => {
    if (!confirm('确认删除保存在本机的全部私人真题吗？练习成绩统计不会被删除。')) return;
    await dbClear();
    await renderPrivateBank();
    status('本机私人题库已清除。');
  });
  $('#closeListeningTest')?.addEventListener('click', () => {
    paperQueue=[];paperReviewQueue=[];paperIndex=-1;cleanupPaperWorkspace();
    $('#practiceFrameWrap').classList.remove('fullscreen-test');
    $('#practiceFrameWrap').classList.add('hidden');
    $('#practiceFrame').src = 'about:blank';
  });
  $('#jumpListeningQuestion')?.addEventListener('click',()=>{if(!jumpActiveQuestion())alert('题目仍在载入，请稍等一秒再点。')});
  $('#fullscreenListeningTest')?.addEventListener('click', async () => {
    const wrap=$('#practiceFrameWrap');
    const button=$('#fullscreenListeningTest');
    if (document.fullscreenElement||wrap.classList.contains('fullscreen-test')) { if(document.fullscreenElement)await document.exitFullscreen?.();wrap.classList.remove('fullscreen-test');button.textContent='⛶ 全屏做题';return; }
    wrap.classList.toggle('fullscreen-test');
    if (wrap.classList.contains('fullscreen-test')) {
      button.textContent='退出全屏';
      try { await wrap.requestFullscreen?.(); } catch (_) {}
    }
  });
  document.addEventListener('fullscreenchange',()=>{ if(!document.fullscreenElement){$('#practiceFrameWrap')?.classList.remove('fullscreen-test');if($('#fullscreenListeningTest'))$('#fullscreenListeningTest').textContent='⛶ 全屏做题'} });
  function showResultReview(data,label='') {
    editingAttemptId=null;
    pendingResult=makeAttempt(data);
    const wrong=pendingResult.wrongQuestions||[];
    const rate=pendingResult.total?Math.round(pendingResult.correct/pendingResult.total*100):0;
    $('#practiceScore').textContent=(label?label+' · ':'')+pendingResult.correct+'/'+pendingResult.total+' · 正确率 '+rate+'% · '+(pendingResult.reviewStatus==='completed'?'已复盘':'待复盘');
    $('#causeQuestions').innerHTML=wrong.length?wrong.map(q=>reviewCard(q,pendingResult.questionDetails?.[q]||{})).join(''):'<p>本篇全部正确，无需标记错因。</p>';
    $('#saveTestAnalysis').textContent=paperReviewQueue.length&&paperIndex<paperReviewQueue.length-1?'保存并复盘下一篇':'保存本次复盘';
    $('#causePanel').classList.remove('hidden');$('#causePanel').scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.addEventListener('message', event => {
    if (event.data?.type !== 'ielts-test-result') return;
    const savedAttempt = storeAttemptImmediately(event.data);
    renderPrivateBank();
    if(paperQueue.length){
      const index=paperQueue.findIndex(x=>x.title===event.data.title&&x.part===event.data.part);
      if(index<0)return;
      paperResults.set(index,savedAttempt);
      const tab=document.querySelector('[data-paper-switch="'+index+'"]');if(tab)tab.classList.add('completed');
      if(paperResults.size<paperQueue.length){
        const next=paperQueue.findIndex((_,i)=>!paperResults.has(i));showPaperPart(next);return;
      }
      paperReviewQueue=paperQueue.map((_,i)=>paperResults.get(i));
      paperQueue=[];paperIndex=0;cleanupPaperWorkspace();$('#practiceFrameWrap').classList.add('hidden');
      showResultReview(paperReviewQueue[0],'套题复盘 1/'+paperReviewQueue.length);return;
    }
    showResultReview(savedAttempt);
  });
  $('#saveTestAnalysis')?.addEventListener('click', async () => {
    if (!pendingResult) return;
    let wordsAdded=0,phrasesAdded=0;
    document.querySelectorAll('[data-wrong-q]').forEach(card => {
      const q = card.dataset.wrongQ;
      pendingResult.reviews[q] = {
        primary:card.querySelector('[data-primary-cause]').value,
        secondary:[...card.querySelectorAll('[data-secondary-cause]:checked')].map(x=>x.value),
        questionType:card.querySelector('[data-question-type]').value,
        autoAnalysis:card.querySelector('[data-auto-analysis]').value.trim(),
        evidence:card.querySelector('[data-evidence]').value.trim(),
        synonym:card.querySelector('[data-synonym]').value.trim(),
        newWords:card.querySelector('[data-new-words]').value.trim(),
        reminder:card.querySelector('[data-reminder]').value.trim()
      };
      const review=pendingResult.reviews[q];
      if(card.querySelector('[data-add-words]').checked)wordsAdded+=addReactionWords(review.newWords,pendingResult.title,q);
      if(card.querySelector('[data-add-phrase]').checked)phrasesAdded+=addPhraseCard(review.synonym,review.evidence,pendingResult.title,q);
    });
    pendingResult.cardsAdded={words:wordsAdded,phrases:phrasesAdded};
    pendingResult.reviewStatus='completed';
    pendingResult.reviewedAt=new Date().toISOString();
    const items = loadHistory();
    if(editingAttemptId){
      const index=items.findIndex(x=>x.id===editingAttemptId);
      if(index>=0)items[index]=pendingResult;else items.unshift(pendingResult);
    }else {
      const existingIndex=items.findIndex(x=>x.id===pendingResult.id);
      if(existingIndex>=0)items[existingIndex]=pendingResult;else items.unshift(pendingResult);
    }
    saveHistory(items.slice(0,2000));
    $('#causePanel').classList.add('hidden');
    const wasEditing=Boolean(editingAttemptId);editingAttemptId=null;pendingResult = null;
    renderPrivateBank();
    if(!wasEditing&&paperReviewQueue.length&&paperIndex<paperReviewQueue.length-1){
      paperIndex++;
      const next=paperReviewQueue[paperIndex];
      showResultReview(next,'套题复盘 '+(paperIndex+1)+'/'+paperReviewQueue.length);
    }else{
      const paperFinished=!wasEditing&&paperReviewQueue.length>0;
      paperQueue=[];paperReviewQueue=[];paperIndex=-1;
      activate('analysis');
      alert((paperFinished?'整套题已完成并保存':wasEditing?'修改已保存':'复盘已保存')+'：加入 '+wordsAdded+' 张反应卡、'+phrasesAdded+' 张短语卡。');
    }
  });
  function renderAnalysis() {
    const items = loadHistory();
    try { analysisFilter = localStorage.getItem(analysisFilterKey) || analysisFilter; } catch (_) {}
    const grandTotal=items.reduce((n,x)=>n+(x.total||0),0);
    const grandCorrect=items.reduce((n,x)=>n+(Number.isFinite(Number(x.correct))?Number(x.correct):Math.max(0,(x.total||0)-(x.wrongQuestions?.length||0))),0);
    $('#analysisPartGrid').innerHTML = '<article class="part-stat overall" data-analysis-part="ALL"><span>全部 · '+items.length+' 篇</span><strong>'+(grandTotal?Math.round(grandCorrect/grandTotal*100):0)+'%</strong><small>总正确率 · '+grandCorrect+'/'+grandTotal+' 题正确</small></article>'+['P1','P2','P3','P4'].map(part => {
      const rows = items.filter(x => x.part === part);
      const total = rows.reduce((n,x) => n + (x.total || 0), 0);
      const wrong = rows.reduce((n,x) => n + (x.wrongQuestions?.length || 0), 0);
      const correct = rows.reduce((n,x)=>n+(Number.isFinite(Number(x.correct))?Number(x.correct):Math.max(0,(x.total||0)-(x.wrongQuestions?.length||0))),0);
      const rate = total ? Math.round(correct / total * 100) : 0;
      return '<article class="part-stat" data-analysis-part="'+part+'"><span>' + part + ' · ' + rows.length + ' 篇</span><strong>' + rate + '%</strong><small>正确率 · ' + correct + '/' + total + ' 题正确</small></article>';
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
    const pendingCount=items.filter(x=>x.reviewStatus!=='completed').length;
    const completedCount=items.filter(x=>x.reviewStatus==='completed').length;
    const visibleItems=items.filter(x=>analysisFilter==='all'||(analysisFilter==='pending'?x.reviewStatus!=='completed':x.reviewStatus==='completed'));
    $('#attemptHistory').innerHTML = '<div class="attempt-history-filters"><button class="'+(analysisFilter==='all'?'active':'')+'" data-attempt-filter="all">全部记录（'+items.length+'）</button><button class="'+(analysisFilter==='pending'?'active':'')+'" data-attempt-filter="pending">待复盘（'+pendingCount+'）</button><button class="'+(analysisFilter==='completed'?'active':'')+'" data-attempt-filter="completed">已复盘（'+completedCount+'）</button></div>'+(visibleItems.length ? visibleItems.slice(0,100).map(x => {
      const reviews=x.reviews||{};
      const details=Object.entries(reviews).map(([q,r]) => '<div class="attempt-wrong"><b>第 '+esc(q)+'题 · '+esc(r.primary||'未标记')+'</b><span>'+esc(r.synonym||r.evidence||r.reminder||'暂无补充分析')+'</span></div>').join('');
      return '<details class="attempt-details" data-attempt-part="'+esc(x.part)+'" data-attempt-id="'+esc(x.id||'')+'"><summary><span><b>'+esc(x.part)+'</b> · '+esc(x.title)+'<small>'+esc(new Date(x.date||Date.now()).toLocaleDateString())+' · '+(x.reviewStatus==='completed'?'已复盘':'待复盘')+'</small></span><b>'+x.correct+'/'+x.total+' · '+(x.total?Math.round(x.correct/x.total*100):0)+'%</b></summary><div class="attempt-wrong-list"><div class="attempt-actions"><button data-attempt-review="'+esc(x.id||'')+'">'+(x.reviewStatus==='completed'?'查看 / 重新编辑复盘':'继续错题复盘')+'</button><button data-attempt-original="'+esc(x.title)+'">打开原文 / 重新做</button><button data-attempt-intensive="'+esc(x.title)+'">进入精听</button></div>'+(details||'<p class="empty-analysis">本次还没有逐题复盘，点击“继续错题复盘”即可补充。</p>')+'</div></details>';
    }).join('') : '<p class="empty-analysis">这个分类暂无记录。</p>');
    document.querySelectorAll('[data-attempt-filter]').forEach(btn=>btn.onclick=()=>{analysisFilter=btn.dataset.attemptFilter;try{localStorage.setItem(analysisFilterKey,analysisFilter)}catch(_){}renderAnalysis()});
    document.querySelectorAll('[data-attempt-review]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();activate('practice');setTimeout(()=>openAttemptEditor(btn.dataset.attemptReview),60)});
    document.querySelectorAll('[data-analysis-part]').forEach(card=>card.onclick=()=>{
      const part=card.dataset.analysisPart,rows=[...document.querySelectorAll('.attempt-details')];
      rows.forEach(x=>x.classList.remove('part-focus'));
      const target=part==='ALL'?rows[0]:rows.find(x=>x.dataset.attemptPart===part);
      if(target){target.open=true;target.classList.add('part-focus');target.scrollIntoView({behavior:'smooth',block:'center'})}
    });
    document.querySelectorAll('[data-attempt-original]').forEach(btn=>btn.onclick=async e=>{e.stopPropagation();const record=(await dbAll()).find(x=>x.title===btn.dataset.attemptOriginal);if(!record)return alert('原题文件当前不在这台设备，请先下载云端题库或重新导入这一篇。');activate('practice');await launchTest(record.html,record.audio,record.title,record.part)});
    document.querySelectorAll('[data-attempt-analysis]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();const box=btn.closest('.attempt-details');box.open=true;box.querySelector('.attempt-wrong')?.scrollIntoView({behavior:'smooth',block:'center'})});
    document.querySelectorAll('[data-attempt-intensive]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();activate('intensive');setTimeout(()=>{const open=[...document.querySelectorAll('[data-intensive-open]')].find(x=>x.dataset.intensiveOpen===btn.dataset.attemptIntensive);open?.click()},120)});
  }
  const intensiveKey='ielts-listening-intensive-v1';
  let intensiveRecord=null,intensiveUrl=null,intensiveLines=[];
  function loadIntensiveNotes(){try{return JSON.parse(localStorage.getItem(intensiveKey)||'{}')}catch(_){return {}}}
  function plainHtml(value){const node=document.createElement('div');node.innerHTML=String(value||'');return node.textContent.replace(/\s+/g,' ').trim()}
  function decodeJsString(raw){try{return JSON.parse(raw)}catch(_){return String(raw||'').replace(/^['"]|['"]$/g,'').replace(/\\n/g,' ').replace(/\\(['"\\])/g,'$1')}}
  function transcriptFromPackage(record,attempts){
    const html=String(record?.html||''),marker=html.search(/transcriptLines\s*:/i),found=[];
    if(marker>=0){
      const block=html.slice(marker,marker+500000);
      const rx=/\bhtml\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;let match;
      while((match=rx.exec(block))&&found.length<500){const text=plainHtml(decodeJsString(match[1]));if(text.length>2&&!found.includes(text))found.push(text)}
    }
    if(!found.length){
      (attempts||[]).forEach(a=>Object.values(a.questionDetails||{}).forEach(d=>{const text=plainHtml(d.transcript||d.analysis||'');if(text&&!found.includes(text))found.push(text)}));
      (attempts||[]).forEach(a=>Object.values(a.reviews||{}).forEach(r=>{const text=plainHtml(r.evidence||r.autoAnalysis||'');if(text&&!found.includes(text))found.push(text)}));
    }
    return found;
  }
  function timedTranscript(lines,duration){
    const usable=Math.max(Number(duration)||0,lines.length*5),step=usable/Math.max(lines.length,1);
    return lines.map((line,index)=>{const seconds=Math.floor(index*step),m=Math.floor(seconds/60),s=seconds%60;return '['+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'] '+line}).join('\n');
  }
  function parseTimedTranscript(raw){return String(raw||'').split(/\r?\n/).map((line,index)=>{const m=line.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);return m?{time:Number(m[1])*60+Number(m[2]),text:m[3]}:{time:index*5,text:line.trim()}}).filter(x=>x.text)}
  function drawSyncTranscript(){
    intensiveLines=parseTimedTranscript($('#intensiveTranscript').value);
    $('#intensiveSyncList').innerHTML=intensiveLines.length?intensiveLines.map((x,i)=>'<button type="button" data-sync-line="'+i+'"><time>'+Math.floor(x.time/60)+':'+String(Math.floor(x.time%60)).padStart(2,'0')+'</time><span>'+esc(x.text)+'</span></button>').join(''):'<p>还没有可同步的原文。</p>';
    document.querySelectorAll('[data-sync-line]').forEach(btn=>btn.onclick=()=>{const row=intensiveLines[Number(btn.dataset.syncLine)];$('#intensiveAudio').currentTime=row.time;$('#intensiveAudio').play().catch(()=>{})});
  }
  async function renderIntensive(){
    const records=await dbAll(),history=loadHistory(),doneTitles=new Set(history.map(x=>x.title));
    const done=records.filter(x=>doneTitles.has(x.title)).sort((a,b)=>testOrder(a)-testOrder(b));
    $('#intensiveDoneList').innerHTML=done.length?done.map(x=>{const attempts=history.filter(a=>a.title===x.title),last=attempts[0],rate=last?.total?Math.round(last.correct/last.total*100):0;return '<button class="intensive-entry" data-intensive-open="'+esc(x.title)+'"><span><b>'+esc(x.part)+' · '+esc(x.title)+'</b><small>'+attempts.length+' 次练习</small></span><strong>'+rate+'%</strong></button>'}).join(''):'<p>完成真题后，这里会自动出现。</p>';
    document.querySelectorAll('[data-intensive-open]').forEach(btn=>btn.onclick=async()=>{
      intensiveRecord=records.find(x=>x.title===btn.dataset.intensiveOpen);if(!intensiveRecord)return;
      const attempts=history.filter(x=>x.title===intensiveRecord.title),last=attempts[0],saved=loadIntensiveNotes()[intensiveRecord.id]||{};
      if(intensiveUrl)URL.revokeObjectURL(intensiveUrl);intensiveUrl=URL.createObjectURL(intensiveRecord.audio);
      $('#intensiveAudio').src=intensiveUrl;$('#intensiveTitle').textContent=intensiveRecord.part+' · '+intensiveRecord.title;$('#intensiveAccuracy').textContent=last?.total?last.correct+'/'+last.total+' · '+Math.round(last.correct/last.total*100)+'%':'暂无成绩';
      $('#intensiveTranscript').value=saved.transcript||'';$('#intensiveNotes').value=saved.notes||'';$('#intensiveWorkspace').hidden=false;drawSyncTranscript();$('#intensiveWorkspace').scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  $('#buildIntensiveSync')?.addEventListener('click',()=>{
    if(!intensiveRecord)return alert('请先从左侧选择一篇做过的题。');
    const packageLines=transcriptFromPackage(intensiveRecord,loadHistory().filter(x=>x.title===intensiveRecord.title));
    if(packageLines.length)$('#intensiveTranscript').value=timedTranscript(packageLines,$('#intensiveAudio').duration);
    else if(!$('#intensiveTranscript').value.trim())return alert('这篇题包没有内置原文，系统不能凭空生成录音文本。请粘贴原文后再生成同步对照。');
    drawSyncTranscript();
  });
  $('#intensiveAudio')?.addEventListener('timeupdate',()=>{let current=-1;intensiveLines.forEach((x,i)=>{if(x.time<=$('#intensiveAudio').currentTime)current=i});document.querySelectorAll('[data-sync-line]').forEach((x,i)=>x.classList.toggle('active',i===current));document.querySelector('[data-sync-line].active')?.scrollIntoView({block:'nearest'})});
  $('#intensiveSpeed')?.addEventListener('change',()=>{$('#intensiveAudio').playbackRate=Number($('#intensiveSpeed').value)||1});
  $('#markSegmentStart')?.addEventListener('click',()=>{$('#segmentStart').value=$('#intensiveAudio').currentTime.toFixed(1)});
  $('#markSegmentEnd')?.addEventListener('click',()=>{$('#segmentEnd').value=$('#intensiveAudio').currentTime.toFixed(1)});
  $('#repeatSegment')?.addEventListener('click',()=>{const audio=$('#intensiveAudio'),a=Number($('#segmentStart').value)||0,b=Number($('#segmentEnd').value)||audio.duration;audio.currentTime=a;audio.play();const loop=()=>{if(audio.currentTime>=b){audio.currentTime=a;audio.play()}else if(!audio.paused)requestAnimationFrame(loop)};requestAnimationFrame(loop)});
  $('#openIntensiveOriginal')?.addEventListener('click',()=>{if(intensiveRecord)launchTest(intensiveRecord.html,intensiveRecord.audio,intensiveRecord.title,intensiveRecord.part,intensiveRecord.assets||[]).then(()=>activate('practice'))});
  $('#saveIntensiveNotes')?.addEventListener('click',()=>{if(!intensiveRecord)return;const all=loadIntensiveNotes();all[intensiveRecord.id]={title:intensiveRecord.title,transcript:$('#intensiveTranscript').value,notes:$('#intensiveNotes').value,updatedAt:new Date().toISOString()};localStorage.setItem(intensiveKey,JSON.stringify(all));window.dispatchEvent(new CustomEvent('ielts-review-data-changed',{detail:{key:intensiveKey}}));alert('精听原文与笔记已保存。')});
  $('#clearListeningHistory')?.addEventListener('click', () => {
    if (!confirm('确认清空全部听力真题统计吗？')) return;
    saveHistory([]);
    renderAnalysis();
  });
  window.openIELTSListeningTestByTitle = async title => {
    const record=(await dbAll()).find(x=>x.title===title);
    if(!record){alert('原题文件当前不在这台设备，请先下载云端题库或重新导入这一篇。');return false}
    activate('practice');await launchTest(record.html,record.audio,record.title,record.part);return true;
  };
  window.openIELTSListeningAnalysis = attemptId => {
    activate('analysis');
    setTimeout(()=>{const box=document.querySelector('[data-attempt-id="'+CSS.escape(String(attemptId||''))+'"]');if(box){box.open=true;box.classList.add('part-focus');box.scrollIntoView({behavior:'smooth',block:'center'})}},80);
  };
  let initial = 'reaction';
  try { initial = localStorage.getItem(pageKey) || initial; } catch (_) {}
  (async()=>{
    try{
      const backup=await dbGetMeta(historyKey),local=loadHistory();
      if(Array.isArray(backup)&&backup.length){const map=new Map(backup.map(x=>[x.id||[x.title,x.part,x.date].join('|'),x]));local.forEach(x=>map.set(x.id||[x.title,x.part,x.date].join('|'),x));saveHistory([...map.values()].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,2000))}
      await renderPrivateBank();
      if(initial==='analysis')renderAnalysis();
      if(initial==='intensive')await renderIntensive();
    }catch(_){status('当前浏览器无法读取私人题库存储。', true)}
  })();
  activate(initial);
  setTimeout(() => { if (location.hash === '#listening-hub') activate(initial); }, 0);
})();
