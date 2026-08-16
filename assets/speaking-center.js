(() => {
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  if(!$('#speakingPractice'))return;
  const esc=v=>String(v??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const historyKey='ielts-speaking-attempts-v1',viewKey='ielts-speaking-view-v1';
  let topics=[],part1=[],bankMode='part2',session=null,index=0,media=null,chunks=[],recordStarted=0,clockTimer=null,recognition=null,currentAttempt=null;

  function activate(view){
    $$('[data-speaking-page]').forEach(b=>b.classList.toggle('active',b.dataset.speakingPage===view));
    $$('[data-speaking-view]').forEach(s=>{if(s.dataset.speakingView!=='all')s.hidden=s.dataset.speakingView!==view});
    localStorage.setItem(viewKey,view);if(view==='history')renderHistory();
  }
  $$('[data-speaking-page]').forEach(b=>b.onclick=()=>activate(b.dataset.speakingPage));
  document.querySelector('[data-page="speaking"]')?.addEventListener('click',()=>setTimeout(()=>activate(localStorage.getItem(viewKey)||'bank')));

  const getHistory=()=>{try{return JSON.parse(localStorage.getItem(historyKey)||'[]')}catch(_){return[]}};
  const saveHistory=a=>localStorage.setItem(historyKey,JSON.stringify(a.slice(0,200)));
  const formatTime=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  function setClock(seconds){$('#speakingClock').textContent=formatTime(seconds)}

  function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('ielts-speaking-audio',1);r.onupgradeneeded=()=>r.result.createObjectStore('clips');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  async function saveClip(id,blob){try{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction('clips','readwrite');tx.objectStore('clips').put(blob,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}catch(_){}}
  async function loadClip(id){try{const db=await openDB(),blob=await new Promise((res,rej)=>{const r=db.transaction('clips').objectStore('clips').get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return blob}catch(_){return null}}

  function renderP1(){
    const q=$('#search').value.trim().toLowerCase();
    $('#speakingP1List').innerHTML=part1.filter(x=>(`${x.title} ${x.questions.join(' ')}`).toLowerCase().includes(q)).map(x=>`<article class="speaking-bank-card"><span>PART 1 · ${x.questions.length}题</span><h3>${esc(x.title)}</h3><p>${esc(x.questions[0])}</p><button data-start-p1="${x.id}">打开并逐题录音 →</button></article>`).join('')||'<p>没有匹配的 Part 1 主题。</p>';
  }
  function switchBank(mode){
    bankMode=mode;$$('[data-speaking-bank]').forEach(b=>b.classList.toggle('active',b.dataset.speakingBank===mode));
    const showP1=mode==='part1'||mode==='all',showP2=mode==='part2'||mode==='all';
    $('#speakingP1List').classList.toggle('hidden',!showP1);$('#topicList').classList.toggle('hidden',!showP2);$('#filters').classList.toggle('hidden',!showP2);renderP1();
  }
  $$('[data-speaking-bank]').forEach(b=>b.onclick=()=>switchBank(b.dataset.speakingBank));
  $('#search').addEventListener('input',()=>renderP1());

  function beginSession(kind,item){
    if(kind==='part1')session={part:'Part 1',id:item.id,title:item.title,questions:item.questions.map((text,i)=>({text,label:`QUESTION ${i+1}`}))};
    else session={part:'Part 2 & 3',id:item.id,title:item.title_zh,questions:[{text:item.cue,label:'PART 2',bullets:item.bullets},...item.part3.map((text,i)=>({text,label:`PART 3 · QUESTION ${i+1}`}))]};
    index=0;activate('practice');showQuestion();document.querySelector('.app-tabs-shell')?.scrollIntoView({behavior:'smooth'});
  }
  $('#speakingP1List').addEventListener('click',e=>{const b=e.target.closest('[data-start-p1]');if(b)beginSession('part1',part1.find(x=>x.id===b.dataset.startP1))});
  $('#topicList').addEventListener('click',e=>{const b=e.target.closest('[data-start-topic]');if(b)beginSession('part2',topics.find(x=>x.id===b.dataset.startTopic))});
  function showQuestion(){
    if(!session)return;const q=session.questions[index];$('#speakingPartLabel').textContent=q.label;$('#speakingPracticeTitle').textContent=session.title;$('#speakingQuestionText').textContent=q.text;$('#speakingQuestionProgress').textContent=`${index+1} / ${session.questions.length}`;
    $('#speakingCueBullets').innerHTML=q.bullets?'<ul>'+q.bullets.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>':'';$('#prevSpeakingQuestion').disabled=index===0;$('#nextSpeakingQuestion').disabled=index===session.questions.length-1;
    $('#speakingTranscript').value='';$('#speakingNotes').value='';$('#speakingPlayback').hidden=true;$('#speakingPlayback').removeAttribute('src');$('#speakingFeedback').classList.add('hidden');$('#speakingRecorderStatus').textContent='准备录音';setClock(0);currentAttempt=null;
  }
  $('#prevSpeakingQuestion').onclick=()=>{if(session&&index>0){index--;showQuestion()}};$('#nextSpeakingQuestion').onclick=()=>{if(session&&index<session.questions.length-1){index++;showQuestion()}};
  $('#backSpeakingBank').onclick=()=>activate('bank');

  function startRecognition(){
    const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return;
    try{recognition=new R();recognition.lang='en-GB';recognition.continuous=true;recognition.interimResults=true;let final='';recognition.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)final+=t+' ';else interim+=t}$('#speakingTranscript').value=(final+interim).trim()};recognition.start()}catch(_){recognition=null}
  }
  async function startRecording(){
    if(!session)return alert('请先从题库选择一个主题。');if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return alert('当前浏览器不支持网页录音，请使用最新版 Safari、Chrome 或 Edge。');
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks=[];media=new MediaRecorder(stream);media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};media.onstop=()=>stream.getTracks().forEach(t=>t.stop());media.start();recordStarted=Date.now();clearInterval(clockTimer);clockTimer=setInterval(()=>setClock(Math.floor((Date.now()-recordStarted)/1000)),250);$('#startSpeakingRecording').disabled=true;$('#stopSpeakingRecording').disabled=false;$('#speakingRecorderStatus').textContent='正在录音 · 可直接作答';$('#speakingMeter').classList.add('active');startRecognition()}catch(_){alert('没有获得麦克风权限。请在浏览器设置中允许该网站使用麦克风。')}
  }
  function stopRecording(){if(!media||media.state==='inactive')return;media.stop();recognition?.stop();clearInterval(clockTimer);const duration=Math.max(1,Math.round((Date.now()-recordStarted)/1000));setClock(duration);$('#startSpeakingRecording').disabled=false;$('#stopSpeakingRecording').disabled=true;$('#speakingRecorderStatus').textContent='录音完成 · 请回听并检查转写';$('#speakingMeter').classList.remove('active');setTimeout(()=>{const blob=new Blob(chunks,{type:media.mimeType||'audio/webm'}),audio=$('#speakingPlayback');audio.src=URL.createObjectURL(blob);audio.hidden=false;audio.dataset.duration=duration;audio._blob=blob},100)}
  $('#startSpeakingRecording').onclick=startRecording;$('#stopSpeakingRecording').onclick=stopRecording;

  function analyze(text,duration){
    const words=(text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]),lower=text.toLowerCase(),fillers={uh:(lower.match(/\buh+\b/g)||[]).length,um:(lower.match(/\bum+\b/g)||[]).length,'you know':(lower.match(/\byou know\b/g)||[]).length,'I mean':(lower.match(/\bi mean\b/g)||[]).length};
    const issues=[],add=(re,bad,good,why)=>{if(re.test(text))issues.push({bad,good,why})};
    add(/\blearned skateboard\b/i,'learned skateboard','learned to skateboard','learn 后接动作通常用 to do');add(/\bplay skateboard\b/i,'play skateboard','skateboard / ride a skateboard','skateboard 通常作动词，或用 ride a skateboard');add(/\bpeople is\b/i,'people is','people are','主谓一致');add(/\bmore better\b/i,'more better','much better','比较级不能重复');add(/\bvery enjoy\b/i,'very enjoy','really enjoy','修饰动词 enjoy 用 really');add(/\bdiscuss about\b/i,'discuss about','discuss','discuss 后直接接宾语');
    const fillerTotal=Object.values(fillers).reduce((a,b)=>a+b,0);if(fillerTotal>3)issues.push({bad:`填充词共 ${fillerTotal} 次`,good:'停顿代替 uh / um / you know',why:'频繁填充词会影响流利度'});
    const sentences=(text.match(/[^.!?]+[.!?]?/g)||[]).map(x=>x.trim()).filter(Boolean),language=sentences.filter(x=>x.split(/\s+/).length>=7&&x.split(/\s+/).length<=24&&!/\b(uh|um)\b/i.test(x)).slice(0,8);
    return {words:words.length,duration,wpm:duration?Math.round(words.length/(duration/60)):0,fillers,fillerTotal,issues,language};
  }
  function renderFeedback(attempt){
    currentAttempt=attempt;const a=attempt.analysis;$('#speakingFeedback').classList.remove('hidden');$('#speakingFeedbackQuestion').textContent=attempt.question;$('#speakingFeedbackStats').innerHTML=`<article><span>时长</span><b>${formatTime(a.duration)}</b></article><article><span>词数</span><b>${a.words}</b></article><article><span>语速</span><b>${a.wpm} WPM</b></article><article><span>填充词</span><b>${a.fillerTotal}</b></article>`;
    $('#speakingRuleFeedback').innerHTML=a.issues.length?a.issues.map(x=>`<div class="speaking-correction"><del>${esc(x.bad)}</del><ins>${esc(x.good)}</ins><small>${esc(x.why)}</small></div>`).join(''):'<p>基础规则没有发现明显问题；继续用 ChatGPT 检查语义、发音和自然度。</p>';
    $('#speakingExtractedLanguage').innerHTML=a.language.length?a.language.map((x,i)=>`<button data-speaking-language="${i}">${esc(x)}<small>加入口语记忆卡</small></button>`).join(''):'<p>转写内容较短，暂未提取出完整表达。</p>';$('#speakingAIImport').value=attempt.aiReport||'';$('#speakingAIReport').innerHTML=attempt.aiReport?`<pre>${esc(attempt.aiReport)}</pre>`:'';
    $$('[data-speaking-language]').forEach(b=>b.onclick=()=>{const x=a.language[Number(b.dataset.speakingLanguage)],ok=window.addIELTSVocabularyCard?.({category:'口语表达',front:x,meaning:'来自口语练习，中文待补充',example:attempt.transcript,note:attempt.title});alert(ok?'已加入口语记忆卡。':'这条表达已存在。')});$('#speakingFeedback').scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('#saveSpeakingAttempt').onclick=async()=>{
    if(!session)return alert('请先选择题目。');const transcript=$('#speakingTranscript').value.trim(),audio=$('#speakingPlayback'),duration=Number(audio.dataset.duration)||0;if(!transcript&&!audio._blob)return alert('请先录音，或粘贴本题的答案转写。');
    const q=session.questions[index],attempt={id:'sp-'+Date.now(),sessionId:session.id,part:session.part,title:session.title,question:q.text,questionIndex:index,transcript,notes:$('#speakingNotes').value.trim(),date:new Date().toISOString(),analysis:analyze(transcript,duration),hasAudio:Boolean(audio._blob),aiReport:''};const h=getHistory();h.unshift(attempt);saveHistory(h);if(audio._blob)await saveClip(attempt.id,audio._blob);renderFeedback(attempt);renderHistory();
  };
  function aiPrompt(a){return `你是严格、实用的 IELTS Speaking 考官和口语教练。请保留我的原意，不要把答案改得过难。\n\n【部分】${a.part}\n【主题】${a.title}\n【题目】${a.question}\n【答案转写】\n${a.transcript}\n【我的备注】${a.notes||'无'}\n\n请按以下结构用中文反馈：\n1. 预估总分及 Fluency & Coherence、Lexical Resource、Grammar、Pronunciation 四项分数（没有音频时明确说明发音无法判断）\n2. 逐句指出：原句 → 6.5分自然改法 → 原因\n3. 区分语法错误、搭配不自然、时态不一致和只是风格优化\n4. 在不改变我个人经历的前提下，给出一版6.5–7分口语答案\n5. 提取8个可迁移表达，附中文和新例句\n6. 给我下一次回答本题最重要的3条提醒。`;}
  async function copyText(t){try{await navigator.clipboard.writeText(t)}catch(_){const x=document.createElement('textarea');x.value=t;document.body.append(x);x.select();document.execCommand('copy');x.remove()}}
  $('#copySpeakingAI').onclick=async()=>{if(!currentAttempt)return;await copyText(aiPrompt(currentAttempt));window.open('https://chatgpt.com/','_blank','noopener');alert('题目、转写和固定批改要求已经复制，直接粘贴发送即可。')};
  $('#saveSpeakingAI').onclick=()=>{if(!currentAttempt)return;const t=$('#speakingAIImport').value.trim();if(!t)return alert('请先粘贴 ChatGPT 的反馈。');const h=getHistory(),x=h.find(v=>v.id===currentAttempt.id);if(x)x.aiReport=t;currentAttempt.aiReport=t;saveHistory(h);$('#speakingAIReport').innerHTML=`<pre>${esc(t)}</pre>`;renderHistory();alert('AI反馈已保存到本次口语记录。')};

  function renderHistory(){
    const h=getHistory(),words=h.reduce((n,x)=>n+(x.analysis?.words||0),0),minutes=Math.round(h.reduce((n,x)=>n+(x.analysis?.duration||0),0)/60);$('#speakingHistorySummary').innerHTML=`<article><span>累计练习</span><b>${h.length} 题</b></article><article><span>累计口语</span><b>${words} 词</b></article><article><span>录音时长</span><b>${minutes} 分钟</b></article>`;
    $('#speakingHistoryList').innerHTML=h.length?h.map(x=>`<details class="speaking-history-item"><summary><div><span>${esc(x.part)} · ${new Date(x.date).toLocaleDateString()}</span><b>${esc(x.title)}</b><p>${esc(x.question)}</p></div><strong>${x.analysis?.wpm||0}<small>WPM</small></strong></summary><div class="speaking-history-body"><p>${esc(x.transcript)||'没有转写文本'}</p>${x.notes?`<small>备注：${esc(x.notes)}</small>`:''}<div><button data-history-audio="${x.id}" ${x.hasAudio?'':'disabled'}>▶ 回听录音</button><button data-history-open="${x.id}">查看反馈</button><button data-history-repeat="${x.id}">再次练习</button></div><audio data-history-player="${x.id}" controls hidden></audio>${x.aiReport?`<details><summary>展开 ChatGPT 反馈</summary><pre>${esc(x.aiReport)}</pre></details>`:''}</div></details>`).join(''):'<p>完成第一次录音练习后，记录会保存在这里。</p>';
  }
  $('#speakingHistoryList').addEventListener('click',async e=>{const audio=e.target.closest('[data-history-audio]'),open=e.target.closest('[data-history-open]'),repeat=e.target.closest('[data-history-repeat]'),id=(audio||open||repeat)?.dataset.historyAudio||(open||repeat)?.dataset.historyOpen||(repeat?.dataset.historyRepeat);if(!id)return;const a=getHistory().find(x=>x.id===id);if(audio){const blob=await loadClip(id);if(!blob)return alert('这段录音没有保存在当前设备。');const p=$(`[data-history-player="${id}"]`);p.src=URL.createObjectURL(blob);p.hidden=false;p.play()}if(open){activate('practice');renderFeedback(a)}if(repeat){const item=a.part==='Part 1'?part1.find(x=>x.id===a.sessionId):topics.find(x=>x.id===a.sessionId);if(item){beginSession(a.part==='Part 1'?'part1':'part2',item);index=Math.min(a.questionIndex,session.questions.length-1);showQuestion()}}});
  $('#clearSpeakingHistory').onclick=()=>{if(confirm('清空全部口语练习文字记录吗？录音也将不再显示。')){localStorage.removeItem(historyKey);renderHistory()}};

  Promise.all([fetch('data/topics.json?v=5').then(r=>r.json()),fetch('data/part1.json?v=5').then(r=>r.json())]).then(([t,p])=>{topics=t;part1=p;renderP1();renderHistory();switchBank('part2');activate(localStorage.getItem(viewKey)||'bank')});
})();
