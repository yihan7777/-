(() => {
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  if(!$('#writingMock'))return;
  const esc=v=>String(v??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const wordList=t=>(String(t).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]);
  const draftKey='ielts-writing-mock-draft-v2',historyKey='ielts-writing-mock-history-v1',modeKey='ielts-writing-mode-v1';
  let banks={task1:[],task2:[]},task='task2',questions=[],category='全部',theme='全部主题',activeQuestion=null,endAt=0,timer=null,currentSession=null,reportPage=0;
  const task2Categories=['全部','观点型','好坏型','比较型','讨论型','报告型','混搭型'];
  const task1Categories=['全部','折线图','柱状图','饼图','表格','地图题','流程图','混合图','图表题'];
  const packCache={};
  const config=()=>task==='task1'?{minutes:20,seconds:1200,minWords:150,label:'TASK 1',criterion:'Task Achievement'}:{minutes:40,seconds:2400,minWords:250,label:'TASK 2',criterion:'Task Response'};
  function activateMode(mode){
    $$('[data-writing-mode]').forEach(b=>b.classList.toggle('active',b.dataset.writingMode===mode));
    $$('[data-writing-view]').forEach(v=>v.hidden=v.dataset.writingView!==mode);
    localStorage.setItem(modeKey,mode);
  }
  $$('[data-writing-mode]').forEach(b=>b.onclick=()=>activateMode(b.dataset.writingMode));
  document.querySelector('[data-page="writing"]')?.addEventListener('click',()=>setTimeout(()=>activateMode(localStorage.getItem(modeKey)||'mock')));
  function getHistory(){try{return JSON.parse(localStorage.getItem(historyKey)||'[]')}catch(_){return[]}}
  function saveHistory(items){localStorage.setItem(historyKey,JSON.stringify(items.slice(0,100)))}
  function filtered(){const q=$('#writingQuestionSearch').value.trim().toLowerCase();return questions.filter(x=>(category==='全部'||(task==='task1'?x.type:x.category)===category)&&(theme==='全部主题'||(task==='task1'?x.topic===theme:(x.themes||[x.theme]).includes(theme)))&&(!q||(`${x.prompt} ${x.topic} ${x.theme||''}`).toLowerCase().includes(q)))}
  function renderCategories(){
    const categories=task==='task1'?task1Categories:task2Categories;
    $('#writingCategoryTabs').innerHTML=categories.map(c=>`<button class="${c===category?'active':''}" data-writing-category="${c}">${c}（${c==='全部'?questions.length:questions.filter(x=>(task==='task1'?x.type:x.category)===c).length}）</button>`).join('');
    $$('[data-writing-category]').forEach(b=>b.onclick=()=>{category=b.dataset.writingCategory;renderCategories();renderQuestions()});
  }
  function renderThemes(){
    const all=[...new Set(questions.flatMap(x=>task==='task1'?[x.topic]:(x.themes||[x.theme])).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    const themes=['全部主题',...all];
    $('#writingThemeTabs').innerHTML='<span>主题：</span>'+themes.map(c=>`<button class="${c===theme?'active':''}" data-writing-theme="${esc(c)}">${esc(c)}</button>`).join('');
    $$('[data-writing-theme]').forEach(b=>b.onclick=()=>{theme=b.dataset.writingTheme;renderThemes();renderQuestions()});
  }
  function switchTask(next){
    task=next;questions=banks[task]||[];category='全部';theme='全部主题';
    $$('[data-writing-task]').forEach(b=>b.classList.toggle('active',b.dataset.writingTask===task));
    $('#writingBankTitle').textContent=task==='task1'?'小作文真题模拟':'大作文真题模拟';
    $('#writingBankKicker').textContent=task==='task1'?'171 REAL TASK 1 QUESTIONS':'252 REAL TASK 2 QUESTIONS';
    $('#writingBankAside').textContent=task==='task1'?'查看原题图表，进入20分钟全真计时；交卷后按Task Achievement等四项标准复盘。':'按题型和媒体、教育、科技等主题筛选，进入40分钟全真计时。';
    $('#writingQuestionSearch').placeholder=task==='task1'?'搜索图表、流程、地图或数据主题…':'搜索英文题目、题型或媒体/教育等主题…';
    renderCategories();renderThemes();renderQuestions();renderHistory();
  }
  function renderQuestions(){
    const rows=filtered(),c=config();$('#writingQuestionCount').textContent=`当前 ${rows.length} 题 · 点击题目开始${c.minutes}分钟模拟`;
    $('#writingQuestionList').innerHTML=rows.map(x=>`<button class="writing-question-card" data-writing-question="${x.id}"><span><b>${esc(task==='task1'?x.type:x.category)} · ${x.number}</b><em>${esc(task==='task1'?x.topic:(x.theme||x.topic||'综合话题'))}</em></span><p>${esc(x.prompt)}</p><small>${c.minutes}分钟 · 至少${c.minWords}词 · 点击开始</small></button>`).join('')||'<p>没有匹配的题目。</p>';
    $$('[data-writing-question]').forEach(b=>b.onclick=()=>startExam(questions.find(x=>x.id===b.dataset.writingQuestion)));
  }
  function renderHistory(){
    const items=getHistory();$('#writingMockHistoryCount').textContent=items.length+' 次';
    $('#writingMockHistory').innerHTML=items.length?items.map(x=>`<details class="writing-history-item"><summary><span><b>${x.task==='task1'?'小作文':'大作文'} · ${esc(x.topic||x.category)}</b><small>${new Date(x.date).toLocaleDateString()} · ${x.words}词 · ${x.minutes}分钟</small></span><strong>${x.report?.overall||'—'}</strong></summary><div class="writing-history-body"><p>${esc(x.question)}</p><button data-open-writing-history="${x.id}">查看批改</button><button data-repeat-writing="${x.questionId}" data-repeat-task="${x.task||'task2'}">再次练习</button></div></details>`).join(''):'<p>完成第一次模拟后，记录会保存在这里。</p>';
    $$('[data-open-writing-history]').forEach(b=>b.onclick=()=>{const s=getHistory().find(x=>x.id===b.dataset.openWritingHistory);if(s)renderReport(s)});
    $$('[data-repeat-writing]').forEach(b=>b.onclick=()=>{switchTask(b.dataset.repeatTask);startExam(questions.find(x=>x.id===b.dataset.repeatWriting))});
  }
  function draft(){try{return JSON.parse(localStorage.getItem(draftKey)||'null')}catch(_){return null}}
  function saveDraft(){if(!activeQuestion)return;const c=config();localStorage.setItem(draftKey,JSON.stringify({task,questionId:activeQuestion.id,text:$('#writingExamInput').value,endAt,startedAt:endAt-c.seconds*1000}));$('#writingAutosave').textContent='已保存 '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
  async function questionImage(question){
    if(task!=='task1')return '';
    if(!packCache[question.pack]){const r=await fetch(`data/writing-task1-packs/pack-${String(question.pack).padStart(2,'0')}.json?v=1`,{cache:'force-cache'});packCache[question.pack]=await r.json()}
    return packCache[question.pack][String(question.number)]||'';
  }
  async function startExam(question,restored=null){
    if(!question)return;
    if(draft()&&!restored&&!confirm('开始新题会覆盖当前未完成草稿，确认继续吗？'))return;
    activeQuestion=question;const c=config();endAt=restored?.endAt>Date.now()?restored.endAt:Date.now()+c.seconds*1000;
    $('#writingExamTaskLabel').textContent=`${c.label} · ${c.minutes} MINUTES`;$('#writingExamTimer').textContent=`${c.minutes}:00`;$('#writingExamMinimum').textContent=`Write at least ${c.minWords} words.`;
    $('#writingExamTopic').textContent=`${task==='task1'?question.type:question.category} · ${question.topic||c.label}`;$('#writingExamQuestion').textContent=question.prompt;$('#writingExamInput').value=restored?.text||'';
    const img=$('#writingExamImage');img.classList.add('hidden');img.removeAttribute('src');
    if(task==='task1'){img.src=await questionImage(question);img.classList.remove('hidden')}
    $('#writingBankView').classList.add('hidden');$('#writingReview').classList.add('hidden');$('#writingExam').classList.remove('hidden');
    clearInterval(timer);timer=setInterval(tick,1000);tick();updateWords();saveDraft();$('#writingExamInput').focus();
  }
  function tick(){const left=Math.max(0,Math.ceil((endAt-Date.now())/1000));$('#writingExamTimer').textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;$('#writingExamTimer').classList.toggle('timer-warning',left<=300);if(!left){clearInterval(timer);finishExam(true)}}
  function updateWords(){const n=wordList($('#writingExamInput').value).length;$('#writingExamWords').textContent=n+' words';saveDraft()}
  const half=n=>Math.max(3,Math.min(8,Math.round(n*2)/2));
  function analyzeEssay(text){
    const words=wordList(text),lower=words.map(x=>x.toLowerCase()),paragraphs=text.trim().split(/\n\s*\n/).filter(Boolean),sentences=(text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[]).map(x=>x.trim()).filter(Boolean);
    const connectors=['however','therefore','moreover','furthermore','nevertheless','consequently','although','while','whereas','for example','for instance','as a result','in conclusion','on the other hand'];
    const connectorCount=connectors.reduce((n,x)=>n+(text.toLowerCase().match(new RegExp('\\b'+x.replace(' ','\\s+')+'\\b','g'))||[]).length,0);
    const stop=new Set('the a an and or but to of in on for with is are was were be been being that this these those it they people have has had can could should would may might from as at by their them our we you i'.split(' '));
    const freq={};lower.filter(x=>x.length>3&&!stop.has(x)).forEach(x=>freq[x]=(freq[x]||0)+1);
    const repeated=Object.entries(freq).filter(([,n])=>n>=4).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const errors=[];
    const add=(re,bad,good,why)=>{if(re.test(text))errors.push({bad,good,why})};
    add(/\bi\b/,'i','I','第一人称代词必须大写');add(/\s+[,.!?]/,'标点前多余空格','删除标点前空格','英文标点前通常不加空格');add(/\bmore better\b/i,'more better','better / much better','比较级不能重复');add(/\bdiscuss about\b/i,'discuss about','discuss','discuss 是及物动词');add(/\b(informations|advices|equipments)\b/i,'不可数名词复数','information / advice / equipment','这些词通常不可数');add(/\bpeople is\b/i,'people is','people are','主谓一致');add(/\bgovernment have\b/i,'government have','the government has','将 government 视为单数时用 has');add(/\bthere have\b/i,'there have','there are / there have been','there be 结构需要 be 动词');add(/\b(\w+)\s+\1\b/i,'重复单词','删除重复词','检查输入时的重复');
    const c=config();if(words.length<c.minWords)errors.push({bad:`全文 ${words.length} 词`,good:`扩展到至少${c.minWords}词`,why:`未达到${c.label}最低字数要求`});
    const expected=task==='task1'?3:4;if(paragraphs.length<expected)errors.push({bad:`仅 ${paragraphs.length} 段`,good:task==='task1'?'建议使用引言＋概述＋两个细节段':'建议使用引言＋两个主体段＋结论',why:'段落结构不足会影响任务完成和衔接'});
    const unique=new Set(lower).size/Math.max(1,lower.length),complex=(text.match(/\b(although|while|whereas|which|who|because|if|unless|despite|not only)\b/gi)||[]).length;
    let tr=4.5+(words.length>=c.minWords-30?.5:0)+(words.length>=c.minWords?.5:0)+(paragraphs.length>=expected?.5:0);
    let cc=4.5+(paragraphs.length>=expected?.5:0)+(connectorCount>=4?.5:0)+(connectorCount>=8?.5:0);
    let lr=4.5+(unique>.42?.5:0)+(unique>.52?.5:0)+(repeated.length<=2?.5:0);
    let gra=4.5+(complex>=4?.5:0)+(complex>=8?.5:0)-(Math.min(2,errors.length)*.25);
    tr=half(tr);cc=half(cc);lr=half(lr);gra=half(gra);const overall=half((tr+cc+lr+gra)/4);
    const patterns=[/there (?:is|are) no denying that[^.!?]*/ig,/(?:play|plays) an? (?:important|crucial|essential|significant) role in[^.!?]*/ig,/(?:have|has) an? (?:positive|negative|significant|profound) (?:impact|effect) on[^.!?]*/ig,/(?:lead|leads) to[^.!?]*/ig,/(?:contribute|contributes) to[^.!?]*/ig,/not only[^.!?]*but also[^.!?]*/ig,/this (?:problem|trend|phenomenon) can be attributed to[^.!?]*/ig];
    const language=[...new Set(patterns.flatMap(re=>[...text.matchAll(re)].map(m=>m[0].trim())).filter(x=>x.split(/\s+/).length<=22))].slice(0,10);
    const marked=sentences.map(s=>errors.some(e=>e.bad&&s.toLowerCase().includes(e.bad.toLowerCase().split(' ')[0]))?`<mark>${esc(s)}</mark>`:esc(s)).join(' ');
    return {overall,tr,cc,lr,gra,words:words.length,paragraphs:paragraphs.length,sentences:sentences.length,connectorCount,repeated,errors,language,marked};
  }
  function finishExam(auto=false){
    if(!activeQuestion)return;const text=$('#writingExamInput').value.trim();if(!auto&&wordList(text).length<30&&!confirm('目前不足30词，仍然交卷吗？'))return;
    clearInterval(timer);const c=config(),report=analyzeEssay(text),used=Math.min(c.seconds,Math.max(0,c.seconds-Math.ceil((endAt-Date.now())/1000)));
    currentSession={id:'wm-'+Date.now(),task,questionId:activeQuestion.id,question:activeQuestion.prompt,topic:activeQuestion.topic,category:task==='task1'?activeQuestion.type:activeQuestion.category,essay:text,date:new Date().toISOString(),words:report.words,minutes:Math.max(1,Math.round(used/60)),report,aiReport:''};
    const items=getHistory();items.unshift(currentSession);saveHistory(items);localStorage.removeItem(draftKey);renderHistory();renderReport(currentSession);
  }
  const score=(v,fallback='—')=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(9,Math.round(n*2)/2)):fallback};
  const cleanAI=s=>String(s||'').replace(/^\s{0,3}(?:#{1,6}|[-*+]\s+|\d+[.)、]\s*)/gm,'').replace(/\*\*|__/g,'').trim();
  function splitAISections(text){
    const sections={intro:[]};let key='intro';
    const names=[['overall',/(总体|总评|overall|评分|四项)/i],['corrections',/(逐句|逐条|纠错|修改|错误标注|sentence)/i],['revised',/(6\.5|7分|修改稿|范文|改写|revised|model essay|improved)/i],['vocabulary',/(词汇|表达|短语|同义替换|vocabulary|useful language)/i],['next',/(下次|建议|优先改进|提醒|next step)/i]];
    text.split(/\r?\n/).forEach(line=>{const heading=line.replace(/^\s*(?:#{1,6}|\*\*|\d+[.)、])\s*/,'').replace(/\*\*\s*$/,'').trim();const hit=heading.length<80&&names.find(([,re])=>re.test(heading));if(hit){key=hit[0];sections[key]??=[];if(!/^(?:#{1,6}|\*\*|\d+[.)、])/i.test(line.trim()))sections[key].push(line)}else{sections[key]??=[];sections[key].push(line)}});return sections;
  }
  function parsePlainAI(text,session,findScore){
    const s=splitAISections(text),lines=(s.corrections||[]).map(cleanAI).filter(Boolean),corrections=[];
    lines.forEach(line=>{let m=line.match(/(?:原句\s*[:：]\s*)?(.+?)\s*(?:→|->|⇒)\s*(?:修改句\s*[:：]\s*)?(.+?)(?:\s*(?:原因|说明|问题)\s*[:：]\s*(.+))?$/i);if(m)corrections.push({original:m[1].trim(),revised:m[2].trim(),reason:(m[3]||'').trim(),type:'逐句修改'})});
    if(!corrections.length){const joined=(s.corrections||[]).join('\n');const re=/(?:原句|Original)\s*[:：]\s*([^\n]+)\s*\n+(?:修改句|修改|Revised|Correction)\s*[:：]\s*([^\n]+)(?:\s*\n+(?:原因|Reason|Explanation)\s*[:：]\s*([^\n]+))?/gi;let m;while((m=re.exec(joined)))corrections.push({original:cleanAI(m[1]),revised:cleanAI(m[2]),reason:cleanAI(m[3]),type:'逐句修改'})}
    const vocab=(s.vocabulary||[]).map(cleanAI).filter(x=>/[A-Za-z]{2}/.test(x)&&x.length<280).slice(0,30).map(line=>{const parts=line.split(/\s*(?:—|–|：|:|\|)\s*/);return {expression:parts.shift()||line,meaning:parts.shift()||'',example:parts.join(' — ')}});
    const next=(s.next||[]).map(cleanAI).filter(x=>x.length>5).slice(0,10),overallText=cleanAI((s.overall||s.intro||[]).join('\n'));
    return {legacy:true,overall:findScore(['总分','overall(?: band)?']),taskScore:findScore([session.task==='task1'?'TA|Task Achievement':'TR|Task Response']),cc:findScore(['CC|Coherence(?: & | and )Cohesion']),lr:findScore(['LR|Lexical Resource']),gra:findScore(['GRA|Grammatical Range(?: & | and )Accuracy']),overallFeedback:overallText||'ChatGPT 批改已自动归类并覆盖站内初评。',sentenceCorrections:corrections,revisedEssay:cleanAI((s.revised||[]).join('\n')),vocabulary:vocab,nextSteps:next,raw:text};
  }
  function parseAIReport(text,session){
    if(!text)return null;let data=null;
    const blocks=[...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map(x=>x[1]);
    const raw=text.match(/\{[\s\S]*\}/)?.[0];if(raw)blocks.push(raw);
    for(const block of blocks){try{const x=JSON.parse(block);if(x&&typeof x==='object'){data=x;break}}catch(_){}}
    const findScore=(names)=>{for(const name of names){const m=text.match(new RegExp(`(?:${name})\\s*(?:分数|score)?\\s*[:：|]?\\s*\\*{0,2}([0-9](?:\\.[05])?)`,'i'));if(m)return score(m[1])}return '—'};
    if(!data)return parsePlainAI(text,session,findScore);
    const corrections=Array.isArray(data.sentenceCorrections)?data.sentenceCorrections:Array.isArray(data.corrections)?data.corrections:[];
    const vocabulary=Array.isArray(data.vocabulary)?data.vocabulary:Array.isArray(data.usefulLanguage)?data.usefulLanguage:[];
    return {overall:score(data.overall??data.overallBand),taskScore:score(data.taskScore??data.ta??data.tr),cc:score(data.cc),lr:score(data.lr),gra:score(data.gra),overallFeedback:String(data.overallFeedback||data.feedback||''),sentenceCorrections:corrections.map(x=>typeof x==='string'?{original:'',revised:x,reason:'',type:'修改建议'}:{original:String(x.original||x.before||''),revised:String(x.revised||x.after||''),reason:String(x.reason||x.explanation||''),type:String(x.type||'逐句修改')}),revisedEssay:String(data.revisedEssay||data.modelEssay||data.improvedEssay||''),vocabulary:vocabulary.map(x=>typeof x==='string'?{expression:x,meaning:'',example:''}:{expression:String(x.expression||x.phrase||''),meaning:String(x.meaning||''),example:String(x.example||'')}),nextSteps:(Array.isArray(data.nextSteps)?data.nextSteps:[]).map(String),raw:text};
  }
  function renderLocalReport(session){
    const r=session.report;$('#writingReportSource').textContent='站内初评 · 保存 ChatGPT 报告后自动替换';$('#writingReportSource').classList.remove('ai');$('#writingScoreSourceLabel').textContent='站内参考分';$('#writingScoreSourceNote').textContent='等待 ChatGPT 深度批改';
    $('#writingOverallBand').textContent=r.overall;$('#writingTR').textContent=r.tr;$('#writingCC').textContent=r.cc;$('#writingLR').textContent=r.lr;$('#writingGRA').textContent=r.gra;
    $('#writingOverallFeedback').innerHTML=`<p>本次完成 <b>${r.words}</b> 词、${r.paragraphs} 个段落、${r.sentences} 个句子，使用了约 ${r.connectorCount} 处显性连接表达。站内规则分析给出的参考区间为 <b>${r.overall}</b>，用于发现结构和语言问题，不替代官方或教师评分。</p>${r.repeated.length?`<p>重复较多的实词：${r.repeated.map(x=>`${esc(x[0])}（${x[1]}次）`).join('、')}。</p>`:''}`;
    $('#writingAnnotatedEssay').innerHTML=r.marked||'<p>本次未输入正文。</p>';$('#writingCorrections').innerHTML=r.errors.length?r.errors.map((e,i)=>`<div class="writing-correction"><del>${i+1}. ${esc(e.bad)}<small>${esc(e.why)}</small></del><ins>${esc(e.good)}</ins></div>`).join(''):'<p>基础规则暂未发现明显错误；请使用 ChatGPT 深度批改检查语义、论证与复杂语法。</p>';
    const languageItems=r.language.length?r.language:['本次没有命中内置表达规则'];renderLanguage(languageItems.map(x=>({expression:x,meaning:'',example:''})),session);$('#writingRevisedEssay').innerHTML='<p class="writing-empty">保存 ChatGPT 批改后，这里会显示保留你原有观点的 6.5–7 分修改稿。</p>';
    const isT1=session.task==='task1',steps=[];if(r.words<(isT1?150:250))steps.push(isT1?'先保证20分钟内写到160–190词。':'先保证40分钟内写到260–290词。');if(r.paragraphs<(isT1?3:4))steps.push(isT1?'固定结构：引言、Overview、两个细节段。':'固定四段结构：引言、主体一、主体二、结论。');if(r.connectorCount<4)steps.push(isT1?'用 while、whereas、respectively 等准确比较。':'每个主体段补充因果、举例或转折衔接。');if(r.errors.length)steps.push('交卷前预留3分钟检查语法与拼写。');if(!steps.length)steps.push('下一次重点提升论证深度和表达准确度。');$('#writingNextSteps').innerHTML='<ol>'+steps.map(x=>`<li>${x}</li>`).join('')+'</ol>';
  }
  function renderLanguage(items,session){const valid=items.filter(x=>x.expression&&!x.expression.startsWith('本次没有'));$('#writingUsefulLanguage').innerHTML=valid.length?`<div class="writing-language-list">${valid.map((x,i)=>`<button data-writing-language-index="${i}"><b>${esc(x.expression)}</b>${x.meaning?`<span>${esc(x.meaning)}</span>`:''}${x.example?`<em>${esc(x.example)}</em>`:''}<small>点击加入词汇记忆卡</small></button>`).join('')}</div>`:'<p>本次报告暂未提取表达。</p>';$$('[data-writing-language-index]').forEach(b=>b.onclick=()=>{const x=valid[Number(b.dataset.writingLanguageIndex)];const ok=window.addIELTSVocabularyCard?.({category:'写作表达',front:x.expression,meaning:x.meaning||`来自${session.task==='task1'?'小作文':'大作文'}批改`,example:x.example||session.essay,note:session.topic||session.category});alert(ok?'已加入词汇记忆卡。':'这条表达已经存在。')})}
  function renderAIReport(ai,session){
    $('#writingReportSource').textContent='ChatGPT 深度批改已覆盖站内初评';$('#writingReportSource').classList.add('ai');$('#writingScoreSourceLabel').textContent='ChatGPT 评分';$('#writingScoreSourceNote').textContent='优先显示 · 可恢复站内初评';
    $('#writingOverallBand').textContent=ai.overall;$('#writingTR').textContent=ai.taskScore;$('#writingCC').textContent=ai.cc;$('#writingLR').textContent=ai.lr;$('#writingGRA').textContent=ai.gra;$('#writingOverallFeedback').innerHTML=`<p>${esc(ai.overallFeedback||'ChatGPT 批改已保存。')}</p>`;$('#writingAnnotatedEssay').textContent=session.essay||'本次未输入正文。';
    $('#writingCorrections').innerHTML=ai.sentenceCorrections.length?ai.sentenceCorrections.map((x,i)=>`<article class="writing-sentence-correction"><span>${esc(x.type||'逐句修改')} · ${i+1}</span><div><del>${esc(x.original||'原句未提供')}</del><b>→</b><ins>${esc(x.revised||'修改句未提供')}</ins></div><p>${esc(x.reason||'ChatGPT 未单独说明原因')}</p></article>`).join(''):`<div class="writing-legacy-report"><p>这份回复中没有识别到“原句 → 修改句”格式，因此完整内容暂时保留在这里。你可以直接编辑为箭头格式后再次保存。</p><pre>${esc(ai.raw)}</pre></div>`;
    renderLanguage(ai.vocabulary,session);$('#writingRevisedEssay').innerHTML=ai.revisedEssay?`<div>${esc(ai.revisedEssay)}</div>`:'<p class="writing-empty">这份 ChatGPT 回复未识别到独立修改稿；重新使用上方新版提示即可自动生成。</p>';$('#writingNextSteps').innerHTML=ai.nextSteps.length?'<ol>'+ai.nextSteps.map(x=>`<li>${esc(x)}</li>`).join('')+'</ol>':'<p>请查看逐句批改中的完整 ChatGPT 建议。</p>';
  }
  function showReportPage(index,scroll=false){
    const pages=$$('#writingReviewPages>article');if(!pages.length)return;reportPage=(index+pages.length)%pages.length;
    pages.forEach((page,i)=>{page.hidden=i!==reportPage;page.classList.toggle('active',i===reportPage)});$$('[data-writing-report-page]').forEach((b,i)=>b.classList.toggle('active',i===reportPage));$('#writingReviewPageCount').textContent=`${reportPage+1} / ${pages.length}`;
    if(scroll)$('#writingReviewTabs').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function setupReportPager(){
    const pages=$$('#writingReviewPages>article'),labels=['总体评价','原文错误','逐句批改','词汇表达','修改稿','下次建议'];$('#writingReviewTabs').innerHTML=pages.map((_,i)=>`<button data-writing-report-page="${i}"><b>${String(i+1).padStart(2,'0')}</b>${labels[i]}</button>`).join('');$$('[data-writing-report-page]').forEach(b=>b.onclick=()=>showReportPage(Number(b.dataset.writingReportPage),true));$('#writingReviewPrev').onclick=()=>showReportPage(reportPage-1,true);$('#writingReviewNext').onclick=()=>showReportPage(reportPage+1,true);
    const box=$('#writingReviewPages');if(!box.dataset.swipeBound){let startX=0;box.addEventListener('touchstart',e=>{startX=e.changedTouches[0].clientX},{passive:true});box.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-startX;if(Math.abs(dx)>55)showReportPage(reportPage+(dx<0?1:-1),true)},{passive:true});box.dataset.swipeBound='1'}showReportPage(0);
  }
  function renderReport(session){
    currentSession=session;$('#writingBankView').classList.add('hidden');$('#writingExam').classList.add('hidden');$('#writingReview').classList.remove('hidden');
    $('#writingReviewMeta').textContent=`${session.task==='task1'?'Task 1':'Task 2'} · ${session.category} · ${session.words}词 · ${session.minutes}分钟 · ${new Date(session.date).toLocaleString()}`;$('#writingReviewQuestion').textContent=session.question;$('#writingTaskCriterion').textContent=session.task==='task1'?'Task Achievement':'Task Response';
    const ai=session.aiReport?parseAIReport(session.aiReport,session):null;if(ai)renderAIReport(ai,session);else renderLocalReport(session);$('#writingAIImport').value=session.aiReport||'';$('#removeWritingAI').hidden=!session.aiReport;$('#writingAIReport').innerHTML=session.aiReport?`<details><summary>查看 ChatGPT 原始回复</summary><pre>${esc(session.aiReport)}</pre></details>`:'';setupReportPager();
    $('#writingReview').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function aiPrompt(s){const t1=s.task==='task1';return `你是严格但实用的 IELTS Academic Writing ${t1?'Task 1':'Task 2'} 批改老师。请根据 IELTS 四项标准批改，不要虚高分数。\n\n【题目】\n${s.question}\n\n【考生作文】\n${s.essay}\n\n请逐句覆盖全文，并把结果严格输出为下面这一个 JSON 对象。不要输出 Markdown、代码围栏、表格、星号、标题或 JSON 之外的解释。字符串中不要使用未转义的换行。字段不可省略：\n{\"overall\":6.5,\"taskScore\":6.5,\"cc\":6.5,\"lr\":6.5,\"gra\":6.5,\"overallFeedback\":\"中文总体评价\",\"sentenceCorrections\":[{\"original\":\"考生完整原句\",\"revised\":\"修改后的完整句\",\"reason\":\"中文具体原因\",\"type\":\"确定错误/搭配/逻辑/风格优化\"}],\"revisedEssay\":\"${t1?'一版6.5–7分范文，不得编造题图数据':'保留考生原观点的一版6.5–7分完整修改稿'}\",\"vocabulary\":[{\"expression\":\"英文表达\",\"meaning\":\"中文含义\",\"example\":\"英文例句\"}],\"nextSteps\":[\"最优先建议1\",\"建议2\",\"建议3\"]}\n\nsentenceCorrections 必须逐句覆盖考生全文；vocabulary 提取10条本题可复用表达。`;}
  async function copyText(text){
    const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';area.style.left='-9999px';document.body.append(area);area.focus();area.select();area.setSelectionRange(0,area.value.length);
    let ok=false;try{ok=document.execCommand('copy')}catch(_){}
    if(!ok&&navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);ok=true}catch(_){}}
    area.remove();return ok;
  }
  $('#openWritingAI').onclick=async()=>{
    if(!currentSession)return;
    const prompt=aiPrompt(currentSession),ok=await copyText(prompt);
    if(!ok){$('#writingAIImport').value=prompt;$('#writingAIImport').focus();$('#writingAIImport').select();alert('浏览器阻止了自动复制。完整批改指令已放进下面文本框并全选，请按 Ctrl+C 复制；复制后先清空文本框，再粘贴 ChatGPT 的回复。');return}
    const chat=window.open('https://chatgpt.com/','_blank');
    alert('✓ 完整批改指令已复制（包含题目、作文、逐句批改要求和自动归类 JSON 格式）。请在 ChatGPT 中按 Ctrl+V 粘贴并发送，再把完整回复粘贴回本页。');
    if(!chat)location.href='https://chatgpt.com/';
  };
  $('#saveWritingAI').onclick=()=>{if(!currentSession)return;const text=$('#writingAIImport').value.trim();if(!text)return alert('请先粘贴 ChatGPT 的完整批改结果。');const parsed=parseAIReport(text,currentSession);const recognized=[parsed.taskScore,parsed.cc,parsed.lr,parsed.gra,parsed.overall].some(x=>x&&x!=='—')||parsed.sentenceCorrections.length||parsed.vocabulary.length||parsed.revisedEssay;if(!recognized)return alert('没有识别到结构化批改内容。请重新点击“复制作文并打开 ChatGPT”，把复制好的完整指令粘贴给 ChatGPT，再将它返回的 JSON 完整复制到这里。');const items=getHistory(),item=items.find(x=>x.id===currentSession.id);if(item)item.aiReport=text;currentSession.aiReport=text;saveHistory(items);renderReport(currentSession);alert(`已自动归类并覆盖站内初评：逐句修改 ${parsed.sentenceCorrections.length} 条，表达 ${parsed.vocabulary.length} 条${parsed.revisedEssay?'，修改稿已归档':'。'}`)};
  $('#removeWritingAI').onclick=()=>{if(!currentSession||!confirm('恢复站内初评并删除本次保存的 ChatGPT 批改吗？'))return;const items=getHistory(),item=items.find(x=>x.id===currentSession.id);if(item)item.aiReport='';currentSession.aiReport='';saveHistory(items);renderReport(currentSession)};
  $('#writingQuestionSearch').oninput=renderQuestions;$('#randomWritingQuestion').onclick=()=>{const rows=filtered();if(rows.length)startExam(rows[Math.floor(Math.random()*rows.length)])};
  $('#restoreWritingExam').onclick=()=>{const d=draft();if(!d)return alert('没有未完成的考试草稿。');switchTask(d.task||'task2');const q=questions.find(x=>x.id===d.questionId);if(q)startExam(q,d)};
  $('#writingExamInput').addEventListener('input',updateWords);$('#submitWritingExam').onclick=()=>finishExam(false);$('#exitWritingExam').onclick=()=>{saveDraft();clearInterval(timer);$('#writingExam').classList.add('hidden');$('#writingBankView').classList.remove('hidden')};
  $('#fullscreenWritingExam').onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await $('#writingExam').requestFullscreen()}catch(_){}};
  $('#backWritingBank').onclick=()=>{$('#writingReview').classList.add('hidden');$('#writingBankView').classList.remove('hidden');renderHistory()};
  $$('[data-writing-task]').forEach(b=>b.onclick=()=>switchTask(b.dataset.writingTask));
  Promise.all([fetch('data/writing-task1.json?v=1',{cache:'no-store'}).then(r=>r.json()),fetch('data/writing-questions.json?v=2',{cache:'no-store'}).then(r=>r.json())]).then(([t1,t2])=>{banks={task1:t1,task2:t2};switchTask('task2');activateMode(localStorage.getItem(modeKey)||'mock')}).catch(()=>{$('#writingQuestionCount').textContent='题库加载失败，请刷新页面重试。'});
})();
