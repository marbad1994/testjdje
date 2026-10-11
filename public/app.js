const $=id=>document.getElementById(id);
const pageNames={compose:'Compose & route',communities:'Communities',schedule:'Schedule',engagement:'Engagement',analytics:'Analytics',history:'History',snapchat:'Snapchat',settings:'Settings'};
let currentRules=null;let busy=false;let apiKey=sessionStorage.getItem('router-api-key')||'';

function notify(message,good=false){
 $('notice').innerHTML=(good?'<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>':'<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>')+'<span>'+message+'</span>';
 $('notice').className='notice show'+(good?' good':'');
}
async function api(path,data,auth=true){
 const headers=auth?{Authorization:'Bearer '+apiKey}:{};
 if(data)headers['content-type']='application/json';
 const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined});
 const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j;
}
async function act(button,fn){if(busy)return;busy=true;const original=button.innerHTML;button.disabled=true;button.innerHTML='Working…';try{await fn()}catch(e){notify(e.message)}finally{busy=false;button.disabled=false;button.innerHTML=original;}}
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}

/* navigation */
function go(page){
 document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===page));
 document.querySelectorAll('.nav[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
 $('pageName').textContent=pageNames[page]||page;
 $('sidebar').classList.remove('open');
 if(page==='settings')$('apiKey').value=apiKey;
 if(page==='history')history();
 if(page==='communities')communities();
 if(page==='schedule')loadSchedule();
 if(page==='engagement')loadEngagement();
 if(page==='analytics')loadAnalytics();
 if(page==='snapchat')loadSnapchat();
}
document.querySelectorAll('.nav[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
$('connection').onclick=()=>go('settings');
$('menuToggle').onclick=()=>$('sidebar').classList.toggle('open');

/* compose */
function draft(){const d={title:$('title').value,text:$('text').value,kind:$('kind').value,url:$('url').value};if(!d.title.trim())throw Error('Write a title first.');if(d.kind==='link'&&!d.url)throw Error('Enter your website URL.');return d;}
function postType(){$('textField').hidden=$('kind').value==='link';$('urlField').hidden=$('kind').value!=='link';$('count').textContent=$('title').value.length+' / 300';}
for(const id of ['title','text','kind','url'])$(id).addEventListener('input',postType);
postType();

function renderResults(rows){
 $('results').replaceChildren();
 if(!rows.length){$('results').append(element('p','No communities found. Add relevant communities in the Communities tab.','help'));return;}
 for(const r of rows){
  const box=element('div',undefined,'result');
  box.append(element('span',r.score+' / 100','score'),element('strong','r/'+r.name));
  box.append(element('p',r.eligible?'Eligible for automatic posting':r.reasons.join(' · ')));
  if(r.topic!==undefined)box.append(element('p','Topic overlap '+r.topic+'% · '+r.sampleSize+' recent posts sampled · '+r.medianComments+' median replies'));
  box.append(element('span',r.eligible?'APPROVED':'REVIEW NEEDED','badge'+(r.eligible?' green':' orange')));
  if(r.url){const link=element('a',' View community');link.href=r.url;link.target='_blank';link.rel='noopener';box.append(link);}
  $('results').append(box);
 }
}
$('rank').onclick=()=>act($('rank'),async()=>{const data=await api('rank',draft());renderResults(data.results);notify('Ranking complete. Scores measure fit, not guaranteed leads.',true);});
$('publish').onclick=()=>act($('publish'),async()=>{const d=draft();const result=await api('publish',d);if(result.state==='published'){notify((result.duplicate?'Already published':'Published')+' in r/'+result.subreddit+'. See History for the post link.',true);}else notify(result.error||'Submission is already in progress. Check history before trying again.');});

/* communities */
$('review').onclick=()=>act($('review'),async()=>{
 currentRules=await api('community',{name:$('sub').value});$('ruleReview').hidden=false;$('allowed').checked=false;
 $('subDescription').textContent=currentRules.description;
 $('rules').textContent=currentRules.rules.length?currentRules.rules.map((r,i)=>(i+1)+'. '+r.short_name+'\n'+r.description).join('\n\n'):'No readable browser rules. Read the full community sidebar and guidelines on Reddit before approving.';
 $('rulesLink').href='https://www.reddit.com/r/'+currentRules.name+'/about/rules';
});
$('approve').onclick=()=>act($('approve'),async()=>{if(!currentRules||!$('allowed').checked)throw Error('Review the rules and confirm your content is permitted.');await api('community',{action:'approve',name:currentRules.name,rulesHash:currentRules.rulesHash,promotionAllowed:true});notify('r/'+currentRules.name+' approved.',true);await communities();});
async function communities(){
 try{
  const rows=await api('communities');$('communityList').replaceChildren();
  if(!rows.length){$('communityList').append(element('p','No approved communities yet.','help'));return;}
  for(const r of rows){
   const item=element('div',undefined,'item');item.append(element('strong','r/'+r.name,'main'));
   const b=element('button','Remove','small');b.onclick=()=>act(b,async()=>{await api('community',{action:'remove',name:r.name});await communities();});
   item.append(b);$('communityList').append(item);
  }
 }catch(e){notify(e.message)}
}

/* schedule */
function sDraft(){const d={title:$('sTitle').value,text:$('sText').value,kind:$('sKind').value,url:$('sUrl').value};if(!d.title.trim())throw Error('Write a title first.');if(d.kind==='link'&&!d.url)throw Error('Enter your website URL.');if(!$('sWhen').value)throw Error('Pick a date and time.');return d;}
function sPostType(){$('sTextField').hidden=$('sKind').value==='link';$('sUrlField').hidden=$('sKind').value!=='link';}
$('sKind').addEventListener('input',sPostType);
sPostType();
$('scheduleBtn').onclick=()=>act($('scheduleBtn'),async()=>{const d=sDraft();await api('schedule',{...d,scheduledAt:new Date($('sWhen').value).toISOString()});for(const id of ['sTitle','sText','sUrl'])$(id).value='';notify('Added to the schedule queue.',true);await loadSchedule();});
async function loadSchedule(){
 try{
  const rows=await api('schedule');$('scheduleList').replaceChildren();
  if(!rows.length){$('scheduleList').append(element('p','Nothing queued.','help'));return;}
  for(const r of rows){
   const item=element('div',undefined,'item');
   const main=element('div',undefined,'main');main.append(element('strong',r.title));main.append(document.createElement('br'));
   main.append(element('span',new Date(r.scheduled_at).toLocaleString(),'muted'));
   item.append(main);item.append(element('span',r.state,'st '+r.state));
   if(r.state==='pending'){const b=element('button','Cancel','small');b.onclick=()=>act(b,async()=>{await api('schedule',{action:'cancel',id:r.id});await loadSchedule();});item.append(b);}
   if(r.error)item.append(element('p',r.error,'help'));
   $('scheduleList').append(item);
  }
 }catch(e){notify(e.message)}
}

/* engagement */
async function loadEngagement(){
 try{
  const data=await api('engagement');
  $('engagementTargets').replaceChildren();
  const published=(await api('history')).filter(h=>h.state==='published');
  if(!published.length){$('engagementTargets').append(element('p','Publish a post first, then enable auto-reply on it here.','help'));}
  for(const h of published){
   const target=data.targets.find(t=>t.id===h.id);
   const item=element('div',undefined,'item');
   const main=element('div',undefined,'main');main.append(element('strong',h.title));main.append(document.createElement('br'));main.append(element('span','r/'+h.subreddit,'muted'));item.append(main);
   const toggle=element('label','','check');const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!target;toggle.append(cb,document.createTextNode(' Auto-reply'));item.append(toggle);
   const template=document.createElement('input');template.placeholder='Reply template';template.value=target?target.reply_template:'';template.style.minWidth='220px';item.append(template);
   const save=element('button','Save','small');
   save.onclick=()=>act(save,async()=>{await api('engagement',{id:h.id,enabled:cb.checked,template:template.value});notify('Saved.',true);await loadEngagement();});
   item.append(save);$('engagementTargets').append(item);
  }
  $('engagementHistory').replaceChildren();
  if(!data.history.length){$('engagementHistory').append(element('p','No replies sent yet.','help'));}
  for(const r of data.history){const item=element('div',undefined,'item');item.append(element('span',new Date(r.created_at).toLocaleString(),'muted'));$('engagementHistory').append(item);}
 }catch(e){notify(e.message)}
}
$('runEngagement').onclick=()=>act($('runEngagement'),async()=>{const r=await api('engagement/run',{});notify('Checked '+r.checked+' post(s); sent '+r.replied+' repl'+(r.replied===1?'y':'ies')+'.',true);await loadEngagement();});

/* analytics */
async function loadAnalytics(){
 try{
  const rows=await api('analytics');$('analyticsRows').replaceChildren();
  if(!rows.length){const tr=element('tr'),td=element('td','No published posts yet.');td.colSpan=6;tr.append(td);$('analyticsRows').append(tr);return;}
  for(const r of rows){
   const tr=element('tr');
   tr.append(element('td','r/'+r.subreddit),element('td',String(r.posts)),element('td',r.avg_score??'—'),element('td',String(r.clicks||0)),element('td',String(r.leads||0)),element('td',r.conversion!=null?(r.conversion*100).toFixed(1)+'%':'—'));
   $('analyticsRows').append(tr);
  }
 }catch(e){notify(e.message)}
}

/* history */
async function history(){
 try{
  const rows=await api('history');$('historyRows').replaceChildren();
  if(!rows.length){const tr=element('tr'),td=element('td','No posts submitted yet.');td.colSpan=4;tr.append(td);$('historyRows').append(tr);return;}
  for(const r of rows){
   const tr=element('tr'),td=element('td');
   if(r.reddit_url){const a=element('a',r.title);a.href=r.reddit_url;a.target='_blank';a.rel='noopener';td.append(a);}else td.textContent=r.title;
   td.append(element('p',r.created_at,'muted'));
   tr.append(td,element('td','r/'+r.subreddit));
   const state=element('td');state.append(element('span',r.state,'st '+r.state));if(r.error)state.append(element('p',r.error,'help'));
   tr.append(state);
   const outcome=element('td',r.clicks+' clicks / '+r.leads+' leads');
   if(r.state==='published'){
    const b=element('button','Record outcomes','small');
    b.onclick=()=>act(b,async()=>{const clicks=prompt('Total attributed website clicks for this post',r.clicks);if(clicks===null)return;const leads=prompt('Total attributed leads for this post',r.leads);if(leads===null)return;await api('outcomes',{id:r.id,clicks:Number(clicks),leads:Number(leads)});await history();});
    outcome.append(document.createElement('br'),b);
   }
   tr.append(outcome);$('historyRows').append(tr);
  }
 }catch(e){notify(e.message)}
}

/* snapchat */
function snapActionType(){$('snapUsernameField').hidden=$('snapAction').value!=='send';}
$('snapAction').addEventListener('input',snapActionType);
snapActionType();
function renderSnapStatus(j){$('snapConnTag').textContent=j.connected?'Connected':'Not connected';$('snapConnTag').className='tag'+(j.connected?' badge green':'');}
$('snapStatusBtn').onclick=()=>act($('snapStatusBtn'),async()=>{renderSnapStatus(await api('snapchat/status'));});
$('snapRecord').onclick=()=>act($('snapRecord'),async()=>{const r=await api('snapchat/run',{action:'record-draft',durationMs:5000});notify(r.note||('Recording: '+r.state),r.state==='saved');await loadSnapchat();});
$('snapPostDraft').onclick=()=>act($('snapPostDraft'),async()=>{const r=await api('snapchat/run',{action:'post-draft',caption:$('snapCaption').value,asStory:true});notify(r.note||('State: '+r.state),r.state==='published');await loadSnapchat();});
$('snapStory').onclick=()=>act($('snapStory'),async()=>{const r=await api('snapchat/run',{action:'story',caption:$('snapCaption').value});notify(r.note||('State: '+r.state),r.state==='published');await loadSnapchat();});
$('snapScheduleBtn').onclick=()=>act($('snapScheduleBtn'),async()=>{
 if(!$('snapWhen').value)throw Error('Pick a date and time.');
 const action=$('snapAction').value;
 const body={action,scheduledAt:new Date($('snapWhen').value).toISOString(),caption:$('snapCaption').value};
 if(action==='send')body.username=$('snapUsername').value;
 await api('snapchat/schedule',body);
 notify('Added to the Snapchat queue.',true);
 await loadSnapchat();
});
async function loadSnapchat(){
 try{
  const [status,queue,hist]=await Promise.all([api('snapchat/status'),api('snapchat/schedule'),api('snapchat/history')]);
  renderSnapStatus(status);
  $('snapScheduleList').replaceChildren();
  if(!queue.length)$('snapScheduleList').append(element('p','Nothing queued.','help'));
  for(const r of queue){
   const payload=r.payload?JSON.parse(r.payload):{};
   const item=element('div',undefined,'item');
   const main=element('div',undefined,'main');main.append(element('strong',payload.action||'action'));main.append(document.createElement('br'));main.append(element('span',new Date(r.scheduled_at).toLocaleString(),'muted'));
   item.append(main);item.append(element('span',r.state,'st '+r.state));
   if(r.state==='pending'){const b=element('button','Cancel','small');b.onclick=()=>act(b,async()=>{await api('snapchat/schedule',{action:'cancel',id:r.id});await loadSnapchat();});item.append(b);}
   $('snapScheduleList').append(item);
  }
  $('snapHistory').replaceChildren();
  if(!hist.length)$('snapHistory').append(element('p','No actions yet.','help'));
  for(const r of hist){
   const item=element('div',undefined,'item');
   const main=element('div',undefined,'main');main.append(element('strong',r.action));if(r.caption){main.append(document.createElement('br'));main.append(element('span',r.caption,'muted'));}
   item.append(main);item.append(element('span',r.state,'st '+r.state));
   if(r.error)item.append(element('p',r.error,'help'));
   $('snapHistory').append(item);
  }
 }catch(e){notify(e.message)}
}

/* settings: signup + connection */
$('signupBtn').onclick=()=>act($('signupBtn'),async()=>{
 const result=await api('signup',{label:$('signupLabel').value},false);
 $('signupResult').hidden=false;$('signupId').textContent=result.id;$('signupKey').textContent=result.apiKey;
 $('signupLoginCmd').textContent='npm run login -- '+result.id;
 apiKey=result.apiKey;sessionStorage.setItem('router-api-key',apiKey);
 notify('Account created. Save the API key above — it will not be shown again.',true);
 status();
});
$('copyKey').onclick=()=>{navigator.clipboard?.writeText($('signupKey').textContent);notify('API key copied.',true);};

$('test').onclick=()=>act($('test'),async()=>{const j=await api('connection',{});notify('Connected as u/'+j.username+'.',true);$('connectionText').textContent='Connected as u/'+j.username;$('connection').classList.add('ok');});
async function status(){
 try{
  const j=await api('status');
  $('connectionText').textContent=j.connected?'Browser session saved':'Reddit not connected';
  $('connection').classList.toggle('ok',j.connected);
  $('setupStatus').textContent='User: '+j.label+' · ID: '+j.userId+' · '+(j.connected?'Session saved. Test to verify live access.':'Run browser login for this user on the server machine.');
 }catch(e){$('connectionText').textContent='Connect your app key';$('connection').classList.remove('ok');}
}
$('saveKey').onclick=()=>{
 const next=$('apiKey').value.trim();
 if(next!==apiKey){for(const id of ['title','text','url'])$(id).value='';$('results').replaceChildren();$('ruleReview').hidden=true;currentRules=null;postType();}
 apiKey=next;sessionStorage.setItem('router-api-key',apiKey);status();
};
status();
