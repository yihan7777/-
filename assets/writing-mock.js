(() => {
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  if(!$('#writingMock'))return;
  const esc=v=>String(v??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const wordList=t=>(String(t).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]);
  const draftKey='ielts-writing-mock-draft-v1',historyKey='ielts-writing-mock-history-v1',modeKey='ielts-writing-mode-v1';
  let questions=[],category='全部',activeQuestion=null,endAt=0,timer=null,currentSession=null;
  const categories=['全部','观点型','好坏型','比较型','讨论型','报告型','混搭型'];
  function activateMode(mode){
    $$('[data-writing-mode]').forEach(b=>b.classList.toggle('active',b.dataset.writingMode===mode));
    $$('[data-writing-view]').forEach(v=>v.hidden=v.dataset.writingView!==mode);
    localStorage.setItem(modeKey,mode);
  }
  $$('[data-writing-mode]').forEach(b=>b.onclick=()=>activateMode(b.dataset.writingMode));
  document.querySelector('[data-page="writing"]')?.addEventListener('click',()=>setTimeout(()=>activateMode(localStorage.getItem(modeKey)||'mock')));
  function getHistory(){try{return JSON.parse(localStorage.getItem(historyKey)||'[]')}catch(_){return[]}}
  function saveHistory(items){localStorage.setItem(historyKey,JSON.stringify(items.slice(0,100)))}
  function filtered(){const q=$('#writingQuestionSearch').value.trim().toLowerCase();return questions.filter(x=>(category==='全部'||x.category===category)&&(!q||(`${x.prompt} ${x.topic}`).toLowerCase().includes(q)))}
  function renderCategories(){
    $('#writingCategoryTabs').innerHTML=categories.map(c=>`<button class="${c===category?'active':''}" data-writing-category="${c}">${c}（${c==='全部'?questions.length:questions.filter(x=>x.category===c).length}）</button>`).join('');
    $$('[data-writing-category]').forEach(b=>b.onclick=()=>{category=b.dataset.writingCategory;renderCategories();renderQuestions()});
  }
  function renderQuestions(){
    const rows=filtered();$('#writingQuestionCount').textContent=`当前 ${rows.length} 题 · 点击题目开始40分钟模拟`;
    $('#writingQuestionList').innerHTML=rows.map(x=>`<button class="writing-question-card" data-writing-question="${x.id}"><span><b>${x.category} · ${x.number}</b><em>${esc(x.topic||'综合话题')}</em></span><p>${esc(x.prompt)}</p><small>40分钟 · 至少250词 · 点击开始</small></button>`).join('')||'<p>没有匹配的题目。</p>';
    $$('[data-writing-question]').forEach(b=>b.onclick=()=>startExam(questions.find(x=>x.id===b.dataset.writingQuestion)));
  }
  function renderHistory(){
    const items=getHistory();$('#writingMockHistoryCount').textContent=items.length+' 次';
    $('#writingMockHistory').innerHTML=items.length?items.map(x=>`<details class="writing-history-item"><summary><span><b>${esc(x.topic||x.category)}</b><small>${new Date(x.date).toLocaleDateString()} · ${x.words}词 · ${x.minutes}分钟</small></span><strong>${x.report?.overall||'—'}</strong></summary><div class="writing-history-body"><p>${esc(x.question)}</p><button data-open-writing-history="${x.id}">查看批改</button><button data-repeat-writing="${x.questionId}">再次练习</button></div></details>`).join(''):'<p>完成第一次模拟后，记录会保存在这里。</p>';
    $$('[data-open-writing-history]').forEach(b=>b.onclick=()=>{const s=getHistory().find(x=>x.id===b.dataset.openWritingHistory);if(s)renderReport(s)});
    $$('[data-repeat-writing]').forEach(b=>b.onclick=()=>startExam(questions.find(x=>x.id===b.dataset.repeatWriting)));
  }
  function draft(){try{return JSON.parse(localStorage.getItem(draftKey)||'null')}catch(_){return null}}
  function saveDraft(){if(!activeQuestion)return;localStorage.setItem(draftKey,JSON.stringify({questionId:activeQuestion.id,text:$('#writingExamInput').value,endAt,startedAt:endAt-2400000}));$('#writingAutosave').textContent='已保存 '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
  function startExam(question,restored=null){
    if(!question)return;
    if(draft()&&!restored&&!confirm('开始新题会覆盖当前未完成草稿，确认继续吗？'))return;
    activeQuestion=question;endAt=restored?.endAt>Date.now()?restored.endAt:Date.now()+2400000;
    $('#writingExamTopic').textContent=`${question.category} · ${question.topic||'Task 2'}`;$('#writingExamQuestion').textContent=question.prompt;$('#writingExamInput').value=restored?.text||'';
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
    if(words.length<250)errors.push({bad:`全文 ${words.length} 词`,good:'扩展到至少250词',why:'未达到Task 2最低字数要求'});
    if(paragraphs.length<4)errors.push({bad:`仅 ${paragraphs.length} 段`,good:'建议使用引言＋两个主体段＋结论',why:'段落结构不足会影响任务回应和衔接'});
    const unique=new Set(lower).size/Math.max(1,lower.length),complex=(text.match(/\b(although|while|whereas|which|who|because|if|unless|despite|not only)\b/gi)||[]).length;
    let tr=4.5+(words.length>=220?.5:0)+(words.length>=250?.5:0)+(paragraphs.length>=4?.5:0);
    let cc=4.5+(paragraphs.length>=4?.5:0)+(connectorCount>=4?.5:0)+(connectorCount>=8?.5:0);
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
    clearInterval(timer);const report=analyzeEssay(text),used=Math.min(2400,Math.max(0,2400-Math.ceil((endAt-Date.now())/1000)));
    currentSession={id:'wm-'+Date.now(),questionId:activeQuestion.id,question:activeQuestion.prompt,topic:activeQuestion.topic,category:activeQuestion.category,essay:text,date:new Date().toISOString(),words:report.words,minutes:Math.max(1,Math.round(used/60)),report,aiReport:''};
    const items=getHistory();items.unshift(currentSession);saveHistory(items);localStorage.removeItem(draftKey);renderHistory();renderReport(currentSession);
  }
  function renderReport(session){
    currentSession=session;const r=session.report;$('#writingBankView').classList.add('hidden');$('#writingExam').classList.add('hidden');$('#writingReview').classList.remove('hidden');
    $('#writingReviewMeta').textContent=`${session.category} · ${session.words}词 · ${session.minutes}分钟 · ${new Date(session.date).toLocaleString()}`;$('#writingReviewQuestion').textContent=session.question;
    $('#writingOverallBand').textContent=r.overall;$('#writingTR').textContent=r.tr;$('#writingCC').textContent=r.cc;$('#writingLR').textContent=r.lr;$('#writingGRA').textContent=r.gra;
    $('#writingOverallFeedback').innerHTML=`<p>本次完成 <b>${r.words}</b> 词、${r.paragraphs} 个段落、${r.sentences} 个句子，使用了约 ${r.connectorCount} 处显性连接表达。站内规则分析给出的参考区间为 <b>${r.overall}</b>，用于发现结构和语言问题，不替代官方或教师评分。</p>${r.repeated.length?`<p>重复较多的实词：${r.repeated.map(x=>`${esc(x[0])}（${x[1]}次）`).join('、')}。</p>`:''}`;
    $('#writingAnnotatedEssay').innerHTML=r.marked||'<p>本次未输入正文。</p>';
    $('#writingCorrections').innerHTML=r.errors.length?r.errors.map((e,i)=>`<div class="writing-correction"><del>${i+1}. ${esc(e.bad)}<small>${esc(e.why)}</small></del><ins>${esc(e.good)}</ins></div>`).join(''):'<p>基础规则暂未发现明显错误；建议继续使用 ChatGPT 深度批改检查语义、论证与复杂语法。</p>';
    const languageItems=r.language.length?r.language:['本次没有命中内置表达规则'];
    $('#writingUsefulLanguage').innerHTML=`<div class="writing-language-list">${languageItems.map((x,i)=>`<button data-writing-language-index="${i}">${esc(x)}<small>点击加入词汇记忆卡</small></button>`).join('')}</div>`;
    const steps=[];if(r.words<250)steps.push('先保证在40分钟内写到260–290词。');if(r.paragraphs<4)steps.push('固定四段结构：引言、主体一、主体二、结论。');if(r.connectorCount<4)steps.push('每个主体段补充因果、举例或转折衔接，但避免机械堆连接词。');if(r.errors.length)steps.push('交卷前预留3分钟检查主谓一致、不可数名词和比较级。');if(r.repeated.length)steps.push('替换高频重复词，建立本题同义表达组。');if(!steps.length)steps.push('下一次重点提升论证深度，并检查每个例子是否直接支持中心句。');$('#writingNextSteps').innerHTML='<ol>'+steps.map(x=>`<li>${x}</li>`).join('')+'</ol>';
    $('#writingAIImport').value=session.aiReport||'';$('#writingAIReport').innerHTML=session.aiReport?`<pre>${esc(session.aiReport)}</pre>`:'';
    $$('[data-writing-language-index]').forEach(b=>b.onclick=()=>{const text=languageItems[Number(b.dataset.writingLanguageIndex)];if(text.startsWith('本次没有'))return;const ok=window.addIELTSVocabularyCard?.({category:'写作表达',front:text,meaning:'来自大作文真题批改，中文待补充',example:session.essay,note:session.topic||session.category});alert(ok?'已加入词汇记忆卡。':'这条表达已经存在。')});
    $('#writingReview').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function aiPrompt(s){return `你是严格但实用的 IELTS Writing Task 2 批改老师。请根据 IELTS 四项标准批改，不要虚高分数。\n\n【题目】\n${s.question}\n\n【考生作文】\n${s.essay}\n\n请按以下固定结构输出中文报告：\n1. 总分及 TR/CC/LR/GRA 四项分数（0.5分档）\n2. 总体评价：论点、逻辑、任务回应\n3. 原文逐句纠错：每条写“原句 → 修改句 → 原因”\n4. 按原有观点给出一版更自然的6.5–7分修改稿，不要完全换掉考生思路\n5. 提取10个本题高频词组或同义替换，附中文和例句\n6. 下次写作前最优先的3条提醒\n请明确区分确定错误和风格优化。`;}
  async function copyText(text){try{await navigator.clipboard.writeText(text)}catch(_){const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove()}}
  $('#openWritingAI').onclick=async()=>{if(!currentSession)return;await copyText(aiPrompt(currentSession));const w=window.open('https://chatgpt.com/','_blank','noopener');alert('完整题目、作文和批改格式已经复制。打开 ChatGPT 后直接粘贴发送，再把报告粘贴回本页。');if(!w)location.href='https://chatgpt.com/'};
  $('#saveWritingAI').onclick=()=>{if(!currentSession)return;const text=$('#writingAIImport').value.trim();if(!text)return alert('请先粘贴 ChatGPT 的批改报告。');const items=getHistory(),item=items.find(x=>x.id===currentSession.id);if(item)item.aiReport=text;currentSession.aiReport=text;saveHistory(items);$('#writingAIReport').innerHTML=`<pre>${esc(text)}</pre>`;alert('AI批改已内嵌保存到本次考试记录。')};
  $('#writingQuestionSearch').oninput=renderQuestions;$('#randomWritingQuestion').onclick=()=>{const rows=filtered();if(rows.length)startExam(rows[Math.floor(Math.random()*rows.length)])};
  $('#restoreWritingExam').onclick=()=>{const d=draft();if(!d)return alert('没有未完成的考试草稿。');const q=questions.find(x=>x.id===d.questionId);if(q)startExam(q,d)};
  $('#writingExamInput').addEventListener('input',updateWords);$('#submitWritingExam').onclick=()=>finishExam(false);$('#exitWritingExam').onclick=()=>{saveDraft();clearInterval(timer);$('#writingExam').classList.add('hidden');$('#writingBankView').classList.remove('hidden')};
  $('#fullscreenWritingExam').onclick=async()=>{try{document.fullscreenElement?await document.exitFullscreen():await $('#writingExam').requestFullscreen()}catch(_){}};
  $('#backWritingBank').onclick=()=>{$('#writingReview').classList.add('hidden');$('#writingBankView').classList.remove('hidden');renderHistory()};
  fetch('data/writing-questions.json?v=1',{cache:'no-store'}).then(r=>r.json()).then(data=>{questions=data;renderCategories();renderQuestions();renderHistory();activateMode(localStorage.getItem(modeKey)||'mock')}).catch(()=>{$('#writingQuestionCount').textContent='题库加载失败，请刷新页面重试。'});
})();
