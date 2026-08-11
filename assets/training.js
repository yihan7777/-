(() => {
  const $ = s => document.querySelector(s);
  const words = text => (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).map(x => x.toLowerCase().replace('’', "'"));
  const esc = text => text.replace(/[&<>]/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[x]));
  const unique = arr => [...new Set(arr)];
  const formatTime = seconds => `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;

  // ---------- Essay typing trainer ----------
  let source='', startedAt=0, timer=null, lastReport=null;
  const draftKey='ielts-typing-draft-v1', typoKey='ielts-typing-typos-v1', historyKey='ielts-typing-history-v1';
  $('#essaySource').value=localStorage.getItem(draftKey)||'';

  function commonPrefix(a,b){let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return i}
  function renderReference(){
    const typed=$('#typingInput').value, matched=commonPrefix(source,typed);
    $('#typingReference').innerHTML=`<span class="source-matched">${esc(source.slice(0,matched))}</span><span class="source-current">${esc(source.slice(matched,matched+1))}</span>${esc(source.slice(matched+1))}`;
  }
  function liveMetrics(){
    if(!startedAt)return;const typed=$('#typingInput').value, seconds=Math.max(1,Math.round((Date.now()-startedAt)/1000));
    const correct=[...typed].filter((c,i)=>c===source[i]).length;
    $('#typingWpm').textContent=Math.round(words(typed).length/(seconds/60));
    $('#typingAccuracy').textContent=`${Math.round(correct/Math.max(1,typed.length)*100)}%`;
    $('#typingProgress').textContent=`${Math.min(100,Math.round(typed.length/Math.max(1,source.length)*100))}%`;
    $('#typingTime').textContent=formatTime(seconds);renderReference();
  }
  function beginTyping(){
    source=$('#essaySource').value.trim();if(words(source).length<20){alert('请先粘贴一篇完整范文（至少 20 个英文单词）。');return}
    localStorage.setItem(draftKey,source);$('#typingSetup').classList.add('hidden');$('#typingWorkspace').classList.remove('hidden');$('#typingReport').classList.add('hidden');
    $('#typingInput').value='';startedAt=Date.now();clearInterval(timer);timer=setInterval(liveMetrics,1000);renderReference();$('#typingInput').focus();
  }
  function wordDiff(expected,actual){
    const a=words(expected),b=words(actual),n=a.length,m=b.length,dp=Array.from({length:n+1},()=>Array(m+1).fill(0));
    for(let i=0;i<=n;i++)dp[i][0]=i;for(let j=0;j<=m;j++)dp[0][j]=j;
    for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j-1],dp[i-1][j],dp[i][j-1]);
    const wrong=[],missing=[],extra=[];let i=n,j=m;
    while(i||j){if(i&&j&&a[i-1]===b[j-1]){i--;j--}else if(i&&j&&dp[i][j]===dp[i-1][j-1]+1){wrong.push({expected:a[i-1],typed:b[j-1]});i--;j--}else if(i&&dp[i][j]===dp[i-1][j]+1){missing.push(a[i-1]);i--}else{extra.push(b[j-1]);j--}}
    return {wrong:wrong.reverse(),missing:missing.reverse(),extra:extra.reverse(),distance:dp[n][m],total:n};
  }
  function extractExpressions(text){
    const found=[];
    const patterns=[
      /there (?:is|are) no denying that[^.!?]{0,100}/gi,
      /(?:play|plays|played) (?:a|an) (?:crucial|essential|important|significant|vital|key) role in(?: [A-Za-z'-]+){1,7}/gi,
      /(?:have|has|had) (?:a|an) (?:positive|negative|significant|profound|lasting) (?:impact|effect) on(?: [A-Za-z'-]+){1,7}/gi,
      /(?:contribute|contributes|contributed) to(?: [A-Za-z'-]+){1,7}/gi,
      /(?:lead|leads|led) to(?: [A-Za-z'-]+){1,7}/gi,
      /(?:result|results|resulted) in(?: [A-Za-z'-]+){1,7}/gi,
      /(?:be|is|are|was|were) associated with(?: [A-Za-z'-]+){1,7}/gi,
      /not only[^.!?]{1,80}but also[^.!?]{1,80}/gi,
      /in terms of(?: [A-Za-z'-]+){1,5}/gi,
      /to some extent/gi,
      /not necessarily/gi
    ];
    patterns.forEach(re=>{for(const m of text.matchAll(re))found.push(m[0].trim())});
    const frames=(text.match(/(?:^|[.!?]\s+)(Although|While|Admittedly|This is because|As a result|From my perspective|It is (?:widely|often|generally) (?:believed|argued|accepted))[^.!?]{15,140}/gi)||[])
      .map(s=>s.trim().split(/\s+/).slice(0,14).join(' ')+'…');
    return unique([...found,...frames]).slice(0,12);
  }
  const chips=(items,kind='plain')=>items.length?items.map(x=>kind==='wrong'?`<span class="error-chip"><del>${esc(x.typed)}</del><ins>${esc(x.expected)}</ins></span>`:`<span class="error-chip">${esc(x)}</span>`).join(''):'<p class="empty-report">本次没有发现。</p>';
  function finishTyping(){
    clearInterval(timer);liveMetrics();const typed=$('#typingInput').value, diff=wordDiff(source,typed), expressions=extractExpressions(source);
    const bank=JSON.parse(localStorage.getItem(typoKey)||'{}');diff.wrong.forEach(x=>{const key=`${x.typed}→${x.expected}`;bank[key]=(bank[key]||0)+1});diff.missing.forEach(x=>{const key=`漏:${x}`;bank[key]=(bank[key]||0)+1});localStorage.setItem(typoKey,JSON.stringify(bank));
    const seconds=Math.max(1,Math.round((Date.now()-startedAt)/1000));lastReport={source,typed,diff,expressions,seconds,bank};
    const history=JSON.parse(localStorage.getItem(historyKey)||'[]');history.push({date:new Date().toISOString(),wpm:Math.round(words(typed).length/(seconds/60)),accuracy:Math.round((1-diff.distance/Math.max(1,diff.total))*100),errors:diff.wrong.length+diff.missing.length+diff.extra.length});localStorage.setItem(historyKey,JSON.stringify(history.slice(-30)));
    $('#wrongWords').innerHTML=diff.wrong.length?diff.wrong.map(x=>`<span class="error-chip"><del>${esc(x.typed)}</del><ins>${esc(x.expected)}</ins><small>累计 ${bank[`${x.typed}→${x.expected}`]} 次</small></span>`).join(''):'<p class="empty-report">没有拼写或替换错误。</p>';
    $('#missingWords').innerHTML=chips(unique(diff.missing));$('#extraWords').innerHTML=chips(unique(diff.extra));
    $('#writingExpressions').innerHTML=expressions.length?expressions.map(x=>`<span class="expression-chip"><b>${esc(x)}</b><small>来自范文；复制给 ChatGPT 后可获得中文、结构拆解和迁移例句。</small></span>`).join(''):'<p class="empty-report">未命中内置句式规则，建议复制给 ChatGPT 做语义分析。</p>';
    $('#typingErrorBank').innerHTML=Object.entries(bank).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([x,n])=>`<span class="error-chip"><b>${esc(x)}</b><small>累计 ${n} 次</small></span>`).join('')||'<p class="empty-report">还没有累计错词。</p>';
    $('#typingReport').classList.remove('hidden');$('#typingReport').scrollIntoView({behavior:'smooth'});
  }
  $('#startTyping').addEventListener('click',beginTyping);$('#loadEssayDraft').addEventListener('click',()=>{$('#essaySource').value=localStorage.getItem(draftKey)||''});
  $('#typingInput').addEventListener('input',liveMetrics);$('#finishTyping').addEventListener('click',finishTyping);$('#restartTyping').addEventListener('click',()=>{startedAt=Date.now();$('#typingInput').value='';$('#typingReport').classList.add('hidden');renderReference();$('#typingInput').focus()});
  $('#copyWritingContext').addEventListener('click',async()=>{if(!lastReport)return;const d=lastReport.diff;const prompt=`你是我的 IELTS Writing 教练。请分析下面的范文和打字训练结果：\n\n【范文】\n${lastReport.source}\n\n【我的输入】\n${lastReport.typed}\n\n【拼写/替换】\n${d.wrong.map(x=>x.typed+' → '+x.expected).join('\n')}\n【漏词】${d.missing.join(', ')}\n【多词】${d.extra.join(', ')}\n\n请：1. 归纳我反复拼错的规律；2. 提取10个最值得背的表达；3. 提取5个可迁移句式并拆解；4. 每个表达给中文和新例句；5. 最后按“英文表达 | 中文含义 | 英文例句 | 使用提示”的格式输出卡片。`;await navigator.clipboard.writeText(prompt);alert('已复制。现在粘贴给 ChatGPT 即可。')});

  // ---------- Audio-only listening reaction cards ----------
  const customKey='ielts-listening-custom-v1', stateKey='ielts-listening-state-v1';let listening=[],listenState={},listenQueue=[],listenCurrent=null,revealed=false;
  const norm=s=>s.toLowerCase().replace(/[^a-z]/g,'');
  function speak(text,rate=.78){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-GB';u.rate=rate;speechSynthesis.speak(u)}
  function saveListen(){localStorage.setItem(stateKey,JSON.stringify(listenState))}
  function buildListenQueue(){listenQueue=listening.filter(c=>(listenState[c.id]?.due||0)<=Date.now());if(!listenQueue.length)listenQueue=[...listening].sort((a,b)=>(listenState[a.id]?.due||0)-(listenState[b.id]?.due||0)).slice(0,5);showListen()}
  function showListen(){listenCurrent=listenQueue.shift();revealed=false;$('#audioAnswer').classList.add('hidden');$('#audioRating').classList.remove('ready');$('#heardAnswer').value='';$('#heardAnswer').disabled=false;$('#revealAudio').disabled=false;if(!listenCurrent){$('#listeningDue').textContent='0';$('#revealAudio').textContent='今天完成了';return}$('#listeningDue').textContent=listenQueue.length+1;$('#revealAudio').textContent='翻面查看答案';$('#heardAnswer').focus()}
  function revealListen(){if(!listenCurrent||revealed)return;revealed=true;const answer=$('#heardAnswer').value.trim(),correct=norm(answer)===norm(listenCurrent.word);$('#listenWord').textContent=listenCurrent.word;$('#listenMeaning').textContent=listenCurrent.meaning;$('#listenExample').textContent=listenCurrent.example;$('#listenResult').textContent=answer?(correct?'✓ 拼写正确':'✕ 你写的是：'+answer):'请先在脑中反应，再查看答案';$('#listenResult').className=correct?'listen-correct':'listen-wrong';$('#audioAnswer').classList.remove('hidden');$('#audioRating').classList.add('ready');$('#heardAnswer').disabled=true}
  Promise.all([fetch('data/listening-defaults.json').then(r=>r.json())]).then(([defaults])=>{listening=[...defaults,...JSON.parse(localStorage.getItem(customKey)||'[]')];listenState=JSON.parse(localStorage.getItem(stateKey)||'{}');buildListenQueue()});
  $('#playWord').addEventListener('click',()=>listenCurrent&&speak(listenCurrent.word,.68));$('#playExample').addEventListener('click',()=>listenCurrent&&speak(listenCurrent.example,.78));$('#revealAudio').addEventListener('click',revealListen);$('#heardAnswer').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();revealListen()}});
  $('#audioRating').addEventListener('click',e=>{const b=e.target.closest('[data-audio-grade]');if(!b||!revealed||!listenCurrent)return;const grade=b.dataset.audioGrade,old=listenState[listenCurrent.id]||{interval:0,reps:0};let delay=0,interval=old.interval;if(grade==='again'){old.reps=0;listenQueue.splice(Math.min(3,listenQueue.length),0,listenCurrent)}if(grade==='hard'){delay=10*60*1000;interval=Math.max(.01,old.interval*.7)}if(grade==='good'){interval=old.interval?Math.max(1,old.interval*2):1;delay=interval*86400000;old.reps++}if(grade==='easy'){interval=old.interval?Math.max(4,old.interval*2.5):4;delay=interval*86400000;old.reps++}listenState[listenCurrent.id]={due:Date.now()+delay,interval,reps:old.reps,lastGrade:grade};saveListen();showListen()});
  $('#addListeningWords').addEventListener('click',()=>{const existing=new Set(listening.map(x=>norm(x.word))),custom=JSON.parse(localStorage.getItem(customKey)||'[]');let added=0;for(const line of $('#listeningImport').value.splitlines?.()||$('#listeningImport').value.split('\n')){const p=line.split(/[|｜]/).map(x=>x.trim());if(p.length<3||!p[0]||existing.has(norm(p[0])))continue;const card={id:`LC-${Date.now()}-${added}`,word:p[0],meaning:p[1],example:p[2]};custom.push(card);listening.push(card);existing.add(norm(p[0]));added++}localStorage.setItem(customKey,JSON.stringify(custom));$('#listeningImport').value='';buildListenQueue();alert(`已加入 ${added} 张听力反应卡。`) });

  // ---------- Reading vocabulary and expression cards ----------
  const readingCustomKey='ielts-reading-custom-v1',readingStateKey='ielts-reading-state-v1';
  let readingCards=[],readingState={},readingQueue=[],readingCurrent=null,readingReviewed=0,readingInitial=0;
  const readingKey=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  function saveReading(){localStorage.setItem(readingStateKey,JSON.stringify(readingState))}
  function buildReadingQueue(force=false){readingQueue=readingCards.filter(c=>force||(readingState[c.id]?.due||0)<=Date.now());if(!readingQueue.length)readingQueue=[...readingCards].sort((a,b)=>(readingState[a.id]?.due||0)-(readingState[b.id]?.due||0)).slice(0,5);readingInitial=readingQueue.length;readingReviewed=0;showReading()}
  function showReading(){readingCurrent=readingQueue.shift();$('#readingCard').classList.remove('flipped');$('#readingBack').classList.add('hidden');$('#readingRating').classList.remove('ready');if(!readingCurrent){$('#readingFront').textContent='今天完成了！';$('#readingDue').textContent='0';$('#readingCounter').textContent=`本轮完成 ${readingReviewed} 张`;return}$('#readingFront').textContent=readingCurrent.front;$('#readingMeaning').textContent=readingCurrent.meaning;$('#readingExample').textContent=readingCurrent.example||'暂无原文例句';$('#readingNote').textContent=readingCurrent.note||'来自阅读生词积累';$('#readingTag').textContent=readingCurrent.front.includes(' ')?'EXPRESSION':'WORD';$('#readingDue').textContent=readingQueue.length+1;$('#readingCounter').textContent=`本轮 ${readingReviewed+1} / ${Math.max(readingInitial,readingReviewed+readingQueue.length+1)}`}
  Promise.all([fetch('data/reading-defaults.json').then(r=>r.json())]).then(([defaults])=>{readingCards=[...defaults,...JSON.parse(localStorage.getItem(readingCustomKey)||'[]')];readingState=JSON.parse(localStorage.getItem(readingStateKey)||'{}');buildReadingQueue()});
  $('#readingCard').addEventListener('click',()=>{if(!readingCurrent)return;$('#readingCard').classList.toggle('flipped');const flipped=$('#readingCard').classList.contains('flipped');$('#readingBack').classList.toggle('hidden',!flipped);$('#readingRating').classList.toggle('ready',flipped)});
  $('#readExpression').addEventListener('click',()=>readingCurrent&&speak(readingCurrent.front,.76));
  $('#readingRating').addEventListener('click',e=>{const b=e.target.closest('[data-reading-grade]');if(!b||!readingCurrent||!$('#readingRating').classList.contains('ready'))return;const grade=b.dataset.readingGrade,old=readingState[readingCurrent.id]||{interval:0,reps:0};let delay=0,interval=old.interval;if(grade==='again'){old.reps=0;readingQueue.splice(Math.min(3,readingQueue.length),0,readingCurrent)}if(grade==='hard'){delay=10*60*1000;interval=Math.max(.01,old.interval*.7)}if(grade==='good'){interval=old.interval?Math.max(1,old.interval*2):1;delay=interval*86400000;old.reps++}if(grade==='easy'){interval=old.interval?Math.max(4,old.interval*2.5):4;delay=interval*86400000;old.reps++}readingState[readingCurrent.id]={due:Date.now()+delay,interval,reps:old.reps,lastGrade:grade};saveReading();readingReviewed++;showReading()});
  $('#addReadingCards').addEventListener('click',()=>{const existing=new Set(readingCards.map(x=>readingKey(x.front))),custom=JSON.parse(localStorage.getItem(readingCustomKey)||'[]'),newCards=[];let skipped=0;for(const line of $('#readingImport').value.split('\n')){const p=line.split(/[|｜\t]/).map(x=>x.trim()),front=p[0]||'';if(!front)continue;if(existing.has(readingKey(front))){skipped++;continue}const card={id:`RC-${Date.now()}-${newCards.length}`,front,meaning:p[1]||'中文含义待补充',example:p[2]||'原文例句待补充',note:p[3]||'来自阅读生词积累'};custom.push(card);readingCards.push(card);newCards.push(card);existing.add(readingKey(front))}if(!newCards.length){alert(skipped?'这些单词已经在卡片库里了。':'请至少输入一个英文单词。');return}localStorage.setItem(readingCustomKey,JSON.stringify(custom));$('#readingImport').value='';readingQueue=[...newCards];readingInitial=newCards.length;readingReviewed=0;showReading();alert(`已加入 ${newCards.length} 张阅读卡${skipped?`，另有 ${skipped} 张重复卡已跳过`:''}。新卡已显示在右侧。`) });
  $('#resetReadingSession').addEventListener('click',()=>buildReadingQueue(true));
  $('#exportReading').addEventListener('click',async()=>{const text=readingCards.map(c=>`${c.front} | ${c.meaning} | ${c.example||''} | ${c.note||''}`).join('\n');await navigator.clipboard.writeText(text);alert(`已复制 ${readingCards.length} 张阅读卡。`)});
})();
