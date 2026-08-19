(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = (key, fallback=[]) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const write = (key, value) => { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new CustomEvent('ielts-review-data-changed',{detail:{key}})); };
  const uid = prefix => prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
  const pct = (correct,total) => total ? Math.round(correct / total * 100) : 0;
  const splitLines = text => String(text||'').split(/\n+/).map(x=>x.replace(/^[-*•\d.、)\s]+/,'').trim()).filter(Boolean);

  function setupWritingMemory(){
    if(!$('#writingMemorySection')) return;
    const key='ielts-writing-memory-cards-v1';
    const categories={
      task2:['动物与自然','教育','科技与媒体','政府与社会','工作与经济','健康与生活','犯罪与法律','城市与交通','文化与全球化','逻辑词与连接词','其他'],
      task1:['动态图','静态图','地图','流程图','表格','混合图','其他'],
      logic:['因果链','问题→影响→对策','让步反驳','个人→社会→政府','短期→长期','其他']
    };
    let kind='task2',filter='全部',studyIndex=0;
    const cards=()=>read(key,[]),save=x=>write(key,x);
    function categoryOptions(){
      const customs=cards().filter(x=>x.kind===kind).map(x=>x.category);
      const values=[...new Set([...(categories[kind]||[]),...customs])];
      $('#wmCategory').innerHTML=values.map(x=>'<option>'+esc(x)+'</option>').join('');
      $('#wmFilters').innerHTML=['全部',...values].map(x=>'<button class="'+(x===filter?'active':'')+'" data-wm-filter="'+esc(x)+'">'+esc(x)+'</button>').join('');
      $$('[data-wm-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.wmFilter;render()});
    }
    function visible(){return cards().filter(x=>x.kind===kind&&!x.archived&&(filter==='全部'||x.category===filter));}
    function renderStudy(){
      const rows=visible(),card=rows[studyIndex%Math.max(rows.length,1)],box=$('#wmStudyCard');
      box.classList.remove('revealed');
      if(!card){box.innerHTML='<span>当前分类还没有卡片</span><div class="answer">先在左侧添加表达或逻辑链。</div>';$('#wmStudyCount').textContent='0 张';return;}
      box.innerHTML='<span>'+esc(card.category)+'</span><b>'+esc(card.front)+'</b><div class="answer"><strong>'+esc(card.back||'')+'</strong><p>'+esc(card.example||'')+'</p></div>';
      $('#wmStudyCount').textContent=(studyIndex%rows.length+1)+' / '+rows.length;
    }
    function render(){
      categoryOptions();const rows=visible();
      $('#wmList').innerHTML=rows.length?rows.map(x=>'<article class="memory-row"><header><div><small>'+esc(x.kind==='task2'?'大作文':x.kind==='task1'?'小作文':'逻辑链')+' · '+esc(x.category)+'</small><h3>'+esc(x.front)+'</h3></div></header><p>'+esc(x.back||'')+'</p>'+(x.example?'<small>'+esc(x.example)+'</small>':'')+'<div class="row-actions"><button data-wm-study="'+x.id+'">复习这张</button><button data-wm-master="'+x.id+'">✓ 已熟练</button><button class="danger" data-wm-delete="'+x.id+'">删除</button></div></article>').join(''):'<div class="empty-state">这个分类还没有记忆卡。</div>';
      $('#wmTotal').textContent=cards().filter(x=>!x.archived).length+' 张在学';
      $$('[data-wm-study]').forEach(b=>b.onclick=()=>{const i=rows.findIndex(x=>x.id===b.dataset.wmStudy);studyIndex=Math.max(0,i);renderStudy();$('#wmStudyCard').scrollIntoView({behavior:'smooth',block:'center'})});
      $$('[data-wm-master]').forEach(b=>b.onclick=()=>{const all=cards(),x=all.find(v=>v.id===b.dataset.wmMaster);if(x)x.archived=true;save(all);render()});
      $$('[data-wm-delete]').forEach(b=>b.onclick=()=>{if(confirm('删除这张作文记忆卡吗？')){save(cards().filter(x=>x.id!==b.dataset.wmDelete));render()}});
      renderStudy();
    }
    $$('[data-writing-memory-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.writingMemoryKind;filter='全部';studyIndex=0;$$('[data-writing-memory-kind]').forEach(x=>x.classList.toggle('active',x===b));render()});
    $('#wmAdd').onclick=()=>{
      const custom=$('#wmCustomCategory').value.trim(),front=$('#wmFront').value.trim(),back=$('#wmBack').value.trim(),example=$('#wmExample').value.trim();
      if(!front)return alert(kind==='logic'?'请填写逻辑链。':'请填写要记忆的表达或句式。');
      const category=custom||$('#wmCategory').value||'其他',all=cards();
      all.unshift({id:uid('wm'),kind,category,front,back,example,archived:false,createdAt:new Date().toISOString()});save(all);
      $('#wmCustomCategory').value='';$('#wmFront').value='';$('#wmBack').value='';$('#wmExample').value='';filter='全部';render();
    };
    $('#wmStudyCard').onclick=()=>$('#wmStudyCard').classList.toggle('revealed');
    $('#wmNext').onclick=()=>{studyIndex++;renderStudy()};
    $('#wmRestore').onclick=()=>{const all=cards();all.forEach(x=>x.archived=false);save(all);render()};
    window.addIELTSWritingMemoryCard = item => {const all=cards();if(all.some(x=>x.front.toLowerCase()===String(item.front||'').toLowerCase()))return false;all.unshift({id:uid('wm'),kind:item.kind||'task2',category:item.category||'其他',front:item.front,back:item.back||item.meaning||'',example:item.example||'',archived:false,createdAt:new Date().toISOString()});save(all);render();return true};
    render();
  }

  function setupSpeakingMemory(){
    if(!$('#speakingMemorySection'))return;
    const key='ielts-speaking-memory-cards-v1',categoryKey='ielts-speaking-memory-categories-v1',seedKey='ielts-speaking-memory-seed-oral-md-v1';
    const presets=['Part 1','人物类','地点类','经历类','物品类','活动类','观点与习惯','Part 3 观点'];
    async function importPracticeNoteSeed(){
      if(localStorage.getItem(seedKey)==='done')return;
      try{
        const seed=await fetch('data/speaking-memory-seed.json?v=1').then(r=>{if(!r.ok)throw new Error('seed '+r.status);return r.json()});
        const all=cards(),known=new Set(all.map(x=>String(x.front||'').trim().toLowerCase()));let added=0;
        seed.forEach(item=>{const front=String(item.front||'').trim(),norm=front.toLowerCase();if(front&&!known.has(norm)){all.push({...item,id:item.id||uid('sm'),archived:false,createdAt:item.createdAt||new Date().toISOString()});known.add(norm);added++}});
        if(added)save(all);
        const custom=read(categoryKey,[]);let changed=false;
        seed.map(x=>x.category).filter(Boolean).forEach(x=>{if(!custom.includes(x)&&!presets.includes(x)){custom.push(x);changed=true}});
        if(changed)write(categoryKey,custom);
        localStorage.setItem(seedKey,'done');render();
        if(added)setTimeout(()=>alert('已从《口语.md》整理并导入 '+added+' 张口语记忆卡。'),300);
      }catch(err){console.warn('Speaking memory seed import failed',err)}
    }
    let filter='全部',partView='全部',studyIndex=0;
    const cards=()=>read(key,[]),save=x=>write(key,x),cats=()=>[...new Set([...presets,...read(categoryKey,[])])];
    const categoryPart=x=>/^P1\b|^Part 1\b/i.test(x)?'P1':/^P2\b/i.test(x)?'P2':'其他';
    const activeCategory=()=>filter!=='全部'?filter:($('#smCategory').value||cats()[0]||'Part 1');
    function updateAutoTarget(){if($('#smAutoTarget'))$('#smAutoTarget').textContent='当前分类：'+activeCategory()}
    function renderCats(){
      const all=cats(),select=$('#smCategory'),previous=select.value;
      select.innerHTML=all.map(x=>'<option>'+esc(x)+'</option>').join('');if(all.includes(previous))select.value=previous;
      const shown=partView==='全部'?all:all.filter(x=>categoryPart(x)===partView);
      $('#smFilters').innerHTML=['全部',...shown].map(x=>'<button class="'+(x===filter?'active':'')+'" data-sm-filter="'+esc(x)+'">'+esc(x)+'</button>').join('');
      document.querySelectorAll('[data-sm-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.smFilter;if(filter!=='全部')select.value=filter;studyIndex=0;render()});
      document.querySelectorAll('[data-sm-part]').forEach(b=>b.classList.toggle('active',b.dataset.smPart===partView));updateAutoTarget();
    }
    function visible(){return cards().filter(x=>!x.archived&&(filter==='全部'||x.category===filter))}
    function renderStudy(){const rows=visible(),x=rows[studyIndex%Math.max(rows.length,1)],box=$('#smStudyCard');box.classList.remove('revealed');box.innerHTML=x?'<span>'+esc(x.category)+'</span><b>'+esc(x.front)+'</b><div class="answer"><strong>'+esc(x.back||'')+'</strong><p>'+esc(x.example||'')+'</p></div>':'<span>当前分类还没有卡片</span><div class="answer">先添加口语表达。</div>';$('#smStudyCount').textContent=x?(studyIndex%rows.length+1)+' / '+rows.length:'0 张'}
    function render(){renderCats();const rows=visible();$('#smList').innerHTML=rows.length?rows.map(x=>'<article class="memory-row"><header><div><small>'+esc(x.category)+'</small><h3>'+esc(x.front)+'</h3></div></header><p>'+esc(x.back||'')+'</p>'+(x.example?'<small>'+esc(x.example)+'</small>':'')+'<div class="row-actions"><button data-sm-study="'+x.id+'">复习这张</button><button data-sm-master="'+x.id+'">✓ 已熟练</button><button class="danger" data-sm-delete="'+x.id+'">删除</button></div></article>').join(''):'<div class="empty-state">这个分类还没有口语卡片。</div>';$('#smTotal').textContent=cards().filter(x=>!x.archived).length+' 张在学';$$('[data-sm-study]').forEach(b=>b.onclick=()=>{studyIndex=Math.max(0,rows.findIndex(x=>x.id===b.dataset.smStudy));renderStudy()});$$('[data-sm-master]').forEach(b=>b.onclick=()=>{const all=cards(),x=all.find(v=>v.id===b.dataset.smMaster);if(x)x.archived=true;save(all);render()});$$('[data-sm-delete]').forEach(b=>b.onclick=()=>{if(confirm('删除这张口语卡片吗？')){save(cards().filter(x=>x.id!==b.dataset.smDelete));render()}});renderStudy()}
    document.querySelectorAll('[data-sm-part]').forEach(b=>b.onclick=()=>{partView=b.dataset.smPart;filter='全部';studyIndex=0;render()});
    $('#smCategory').onchange=()=>{filter=$('#smCategory').value;partView=categoryPart(filter);studyIndex=0;render()};
    $('#smAddCategory').onclick=()=>{const v=$('#smNewCategory').value.trim();if(!v)return;const all=read(categoryKey,[]);if(!all.includes(v)){all.push(v);write(categoryKey,all)}$('#smNewCategory').value='';partView=categoryPart(v);filter=v;renderCats();$('#smCategory').value=v;render()};
    $('#smAutoAdd').onclick=()=>{const raw=$('#smAutoInput').value.trim();if(!raw)return alert('请先粘贴要加入的表达。');const category=activeCategory(),all=cards(),known=new Set(all.map(x=>String(x.front||'').trim().toLowerCase()));let added=0;splitLines(raw).forEach(line=>{const parts=line.replace(/^\*+|\*+$/g,'').split(/\s*(?:—|–|->|→|：|:|=|\|)\s*/).map(x=>x.replace(/^\*+|\*+$/g,'').trim()).filter(Boolean);const front=parts.shift()||'';if(/[A-Za-z]{2}/.test(front)&&front.length<220&&!known.has(front.toLowerCase())){all.unshift({id:uid('sm'),category,front,back:parts.shift()||'自动整理加入',example:parts.join(' — '),archived:false,createdAt:new Date().toISOString()});known.add(front.toLowerCase());added++}});if(!added)return alert('没有识别到新卡片；请使用“一行一条，英文 — 中文 — 例句”的格式。');save(all);$('#smAutoInput').value='';filter=category;partView=categoryPart(category);render();alert('已自动整理并加入 '+added+' 张卡片到“'+category+'”。')};
    $('#smAdd').onclick=()=>{const front=$('#smFront').value.trim();if(!front)return alert('请填写口语表达。');const all=cards();all.unshift({id:uid('sm'),category:$('#smCategory').value,front,back:$('#smBack').value.trim(),example:$('#smExample').value.trim(),archived:false,createdAt:new Date().toISOString()});save(all);$('#smFront').value='';$('#smBack').value='';$('#smExample').value='';render()};
    $('#smImportFeedback').onclick=()=>{const text=($('#speakingAIImport')?.value||$('#speakingAIReport')?.textContent||$('#speakingExtractedLanguage')?.textContent||'').trim();const lines=splitLines(text).filter(x=>/[A-Za-z]{3}/.test(x)).slice(0,20);if(!lines.length)return alert('当前没有可导入的口语反馈。先完成一次练习，或把 ChatGPT 反馈粘贴到练习页。');const all=cards(),known=new Set(all.map(x=>x.front.toLowerCase()));let added=0;lines.forEach(line=>{const parts=line.split(/\s*(?:—|->|→|：|:)\s*/);const front=parts.shift().replace(/^\*+|\*+$/g,'').trim();if(front&&front.length<180&&!known.has(front.toLowerCase())){all.unshift({id:uid('sm'),category:$('#smCategory').value,front,back:parts.join(' — ')||'来自口语练习反馈',example:'',archived:false,createdAt:new Date().toISOString()});known.add(front.toLowerCase());added++}});save(all);render();alert('已导入 '+added+' 张口语记忆卡。')};
    $('#smStudyCard').onclick=()=>$('#smStudyCard').classList.toggle('revealed');$('#smNext').onclick=()=>{studyIndex++;renderStudy()};$('#smRestore').onclick=()=>{const all=cards();all.forEach(x=>x.archived=false);save(all);render()};
    window.addIELTSSpeakingCard=item=>{const all=cards(),front=String(item.front||'').trim();if(!front||all.some(x=>x.front.toLowerCase()===front.toLowerCase()))return false;all.unshift({id:uid('sm'),category:item.category||'Part 1',front,back:item.back||item.meaning||'',example:item.example||'',archived:false,createdAt:new Date().toISOString()});save(all);render();return true};
    render();importPracticeNoteSeed();
  }

  function setupReadingSuite(){
    if(!$('#readingReviewSuite'))return;
    const linkKey='ielts-reading-test-link-v1',historyKey='ielts-reading-practice-history-v1',memoryKey='ielts-reading-question-memory-v1';
    const defaultLink='file:///C:/Users/86180/Downloads/网页版260810/网页版260810/index.html?view=overview';
    $('#readingBankLink').value=localStorage.getItem(linkKey)||defaultLink;
    $('#saveReadingLink').onclick=()=>{localStorage.setItem(linkKey,$('#readingBankLink').value.trim());alert('入口已保存；它会随账号同步，但 file:/// 地址只能在原电脑打开。')};
    $('#openReadingLink').onclick=()=>{const url=$('#readingBankLink').value.trim();localStorage.setItem(linkKey,url);if(!url)return alert('请先填写题库地址。');const w=window.open(url,'_blank');if(!w||location.protocol==='https:'&&url.startsWith('file:'))alert('浏览器为安全起见通常不允许在线网页直接打开 C 盘。请点“选择本机 index.html”打开，或把整个题库文件夹上传后改成线上地址。')};
    $('#readingLocalFile').onchange=e=>{const file=e.target.files?.[0];if(!file)return;const url=URL.createObjectURL(file);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000)};
    function renderHistory(){const rows=read(historyKey,[]),correct=rows.reduce((n,x)=>n+x.correct,0),total=rows.reduce((n,x)=>n+x.total,0);$('#readingSummary').innerHTML='<article><span>总正确率</span><strong>'+pct(correct,total)+'%</strong><small>'+correct+'/'+total+' 题</small></article><article><span>已完成</span><strong>'+rows.length+'</strong><small>篇练习</small></article><article><span>待复盘</span><strong>'+rows.filter(x=>x.notes).length+'</strong><small>篇有错因</small></article>';$('#readingHistory').innerHTML=rows.length?rows.map(x=>'<article class="memory-row"><header><div><small>'+new Date(x.date).toLocaleDateString()+' · '+esc(x.type||'阅读真题')+'</small><h3>'+esc(x.title)+'</h3></div><b class="accuracy-badge">'+pct(x.correct,x.total)+'%</b></header><p>'+esc(x.notes||'暂无错题总结')+'</p><div class="row-actions"><button data-reading-repeat="'+x.id+'">加入背题</button><button class="danger" data-reading-history-delete="'+x.id+'">删除</button></div></article>').join(''):'<div class="empty-state">完成题目后在左侧记录正确题数，刷新后也会保留。</div>';$$('[data-reading-history-delete]').forEach(b=>b.onclick=()=>{write(historyKey,rows.filter(x=>x.id!==b.dataset.readingHistoryDelete));renderHistory()});$$('[data-reading-repeat]').forEach(b=>b.onclick=()=>{const x=rows.find(v=>v.id===b.dataset.readingRepeat);if(x){const mem=read(memoryKey,[]);mem.unshift({id:uid('rq'),category:x.type||'阅读真题',front:x.title,back:x.notes||'补充本题原文定位与同义替换',archived:false});write(memoryKey,mem);renderMemory()}})}
    $('#saveReadingAttempt').onclick=()=>{const title=$('#readingAttemptTitle').value.trim(),correct=Number($('#readingCorrect').value),total=Number($('#readingTotal').value);if(!title||!total||correct<0||correct>total)return alert('请填写题目，并确认正确题数不超过总题数。');const rows=read(historyKey,[]);rows.unshift({id:uid('rh'),title,correct,total,type:$('#readingAttemptType').value,notes:$('#readingAttemptNotes').value.trim(),date:new Date().toISOString()});write(historyKey,rows);$('#readingAttemptTitle').value='';$('#readingCorrect').value='';$('#readingTotal').value='';$('#readingAttemptNotes').value='';renderHistory()};
    let memoryIndex=0;
    function renderMemory(){const rows=read(memoryKey,[]).filter(x=>!x.archived);$('#readingBacklogList').innerHTML=rows.length?rows.map(x=>'<article class="memory-row"><small>'+esc(x.category)+'</small><h3>'+esc(x.front)+'</h3><p>'+esc(x.back)+'</p><div class="row-actions"><button data-rq-study="'+x.id+'">背这题</button><button data-rq-master="'+x.id+'">✓ 已掌握</button></div></article>').join(''):'<div class="empty-state">还没有背题卡。</div>';const x=rows[memoryIndex%Math.max(rows.length,1)],box=$('#readingBacklogCard');box.classList.remove('revealed');box.innerHTML=x?'<span>'+esc(x.category)+'</span><b>'+esc(x.front)+'</b><div class="answer">'+esc(x.back)+'</div>':'<span>暂无背题卡</span><div class="answer">从练习记录加入，或在左侧新建。</div>';$('#readingBacklogCount').textContent=x?(memoryIndex%rows.length+1)+' / '+rows.length:'0 张';$$('[data-rq-study]').forEach(b=>b.onclick=()=>{memoryIndex=Math.max(0,rows.findIndex(x=>x.id===b.dataset.rqStudy));renderMemory()});$$('[data-rq-master]').forEach(b=>b.onclick=()=>{const all=read(memoryKey,[]),x=all.find(v=>v.id===b.dataset.rqMaster);if(x)x.archived=true;write(memoryKey,all);renderMemory()})}
    $('#addReadingBacklog').onclick=()=>{const front=$('#readingBacklogFront').value.trim();if(!front)return alert('请填写要背的题目或题干。');const rows=read(memoryKey,[]);rows.unshift({id:uid('rq'),category:$('#readingBacklogCategory').value.trim()||'阅读真题',front,back:$('#readingBacklogBack').value.trim(),archived:false});write(memoryKey,rows);$('#readingBacklogFront').value='';$('#readingBacklogBack').value='';renderMemory()};$('#readingBacklogCard').onclick=()=>$('#readingBacklogCard').classList.toggle('revealed');$('#readingBacklogNext').onclick=()=>{memoryIndex++;renderMemory()};
    renderHistory();renderMemory();
  }

  function setupListeningIntensive(){
    if(!$('#listeningIntensive'))return;
    const historyKey='ielts-listening-test-history-v1',notesKey='ielts-listening-intensive-notes-v1';let current=null,records=[],objectUrl='';
    function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('ielts-private-listening-bank-v1',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('tests'))r.result.createObjectStore('tests',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
    async function allRecords(){try{const db=await openDb();return await new Promise((resolve,reject)=>{const r=db.transaction('tests').objectStore('tests').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}catch(_){return[]}}
    function history(){return read(historyKey,[])}
    async function render(){records=await allRecords();const attempts=history(),seen=new Map();attempts.forEach(x=>{if(!seen.has(x.title))seen.set(x.title,x)});const rows=[...seen.values()];$('#intensiveDoneList').innerHTML=rows.length?rows.map(x=>'<article class="memory-row"><header><div><small>'+esc(x.part)+' · '+new Date(x.date||Date.now()).toLocaleDateString()+'</small><h3>'+esc(x.title)+'</h3></div><b class="accuracy-badge">'+pct(x.correct,x.total)+'%</b></header><div class="row-actions"><button class="primary" data-intensive-open="'+esc(x.title)+'">开始精听</button><button data-intensive-analysis="'+esc(x.id||'')+'">错题解析</button></div></article>').join(''):'<div class="empty-state">完成并保存一篇听力真题后，会出现在这里。</div>';$$('[data-intensive-open]').forEach(b=>b.onclick=()=>openAttempt(b.dataset.intensiveOpen));$$('[data-intensive-analysis]').forEach(b=>b.onclick=()=>window.openIELTSListeningAnalysis?.(b.dataset.intensiveAnalysis))}
    function openAttempt(title){const attempt=history().find(x=>x.title===title),record=records.find(x=>x.title===title);current={attempt,record,title};$('#intensiveWorkspace').hidden=false;$('#intensiveTitle').textContent=title;$('#intensiveAccuracy').textContent=pct(attempt?.correct||0,attempt?.total||0)+'%';const audio=$('#intensiveAudio');if(objectUrl)URL.revokeObjectURL(objectUrl);if(record?.audio){objectUrl=URL.createObjectURL(record.audio);audio.src=objectUrl}else{audio.removeAttribute('src');audio.load()}const notes=read(notesKey,{});$('#intensiveNotes').value=notes[title]?.notes||'';$('#intensiveTranscript').value=notes[title]?.transcript||'';$('#intensiveWorkspace').scrollIntoView({behavior:'smooth',block:'start'})}
    $('#intensiveSpeed').onchange=e=>$('#intensiveAudio').playbackRate=Number(e.target.value);$('#markSegmentStart').onclick=()=>$('#segmentStart').value=$('#intensiveAudio').currentTime.toFixed(1);$('#markSegmentEnd').onclick=()=>$('#segmentEnd').value=$('#intensiveAudio').currentTime.toFixed(1);$('#repeatSegment').onclick=()=>{const a=$('#intensiveAudio'),start=Number($('#segmentStart').value)||0,end=Number($('#segmentEnd').value)||a.duration;if(!a.src)return alert('这篇题目的音频不在当前设备，请先下载云端题库或重新导入音频。');a.currentTime=start;a.play();const stop=()=>{if(a.currentTime>=end){a.pause();a.removeEventListener('timeupdate',stop)}};a.addEventListener('timeupdate',stop)};$('#saveIntensiveNotes').onclick=()=>{if(!current)return;const all=read(notesKey,{});all[current.title]={notes:$('#intensiveNotes').value.trim(),transcript:$('#intensiveTranscript').value.trim(),updatedAt:new Date().toISOString()};write(notesKey,all);alert('精听记录已保存并会随账号同步。')};$('#openIntensiveOriginal').onclick=()=>{if(!current)return;window.openIELTSListeningTestByTitle?.(current.title)};
    window.addEventListener('ielts-review-data-changed',e=>{if(e.detail?.key===historyKey)render()});render();
  }

  document.addEventListener('DOMContentLoaded',()=>{setupWritingMemory();setupSpeakingMemory();setupReadingSuite();setupListeningIntensive()});
})();
