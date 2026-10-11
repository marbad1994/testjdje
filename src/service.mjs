import {draft,subreddit,digest,scoreCommunity,choose,AppError,terms} from './core.mjs';
export class RouterService {
 constructor(store,browser){this.store=store;this.browser=browser;}
 async rankOnPage(user,d,page){
  const approvals=this.store.approvals(user.id);const names=approvals.length?approvals.map(c=>c.name):await this.browser.discovery(page,[...terms(d.title+' '+d.text)].slice(0,5).join(' '));const outcomes=this.store.outcomes(user.id);const results=[];
  for(const name of names){try{const c=await this.browser.community(page,name);results.push(scoreCommunity(d,c,approvals.find(x=>x.name===name),outcomes.find(x=>x.subreddit===name)));}catch(e){results.push({name,score:0,eligible:false,reasons:[e.message],rules:[]});}}
  return results.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.score-a.score);
 }
 async rank(user,input){const d=draft(input);return this.browser.session(user.id,async page=>({results:await this.rankOnPage(user,d,page)}));}
 async publish(user,input){
  const d=draft(input);const fingerprint=digest(JSON.stringify(d));const existing=this.store.existing(user.id,fingerprint);if(existing)return {...existing,duplicate:true};
  return this.browser.session(user.id,async page=>{
   const results=await this.rankOnPage(user,d,page);const picked=choose(results);
   if(!this.store.lock(user.id,fingerprint,d,picked.name))return {...this.store.existing(user.id,fingerprint),duplicate:true};
   try{const result=await this.browser.submit(page,d,picked.name);this.store.finish(user.id,fingerprint,result.state,result.reddit_url||null,result.error||null,picked.score);return {...result,id:fingerprint,subreddit:picked.name,score:picked.score};}
   catch(e){this.store.finish(user.id,fingerprint,'blocked',null,e.message,picked.score);throw e;}
  });
 }
 async community(user,input){const name=subreddit(input.name);if(input.action==='remove'){this.store.remove(user.id,name);return {saved:true};}
  return this.browser.session(user.id,async page=>{const c=await this.browser.community(page,name);if(input.action==='approve'){if(input.rulesHash!==c.rulesHash||input.promotionAllowed!==true)throw new AppError('Review current rules and confirm this content is permitted.');this.store.approve(user.id,name,c.rulesHash);return {saved:true};}return c;});
 }
 async setEngagement(user,input){
  const fingerprint=input.id;if(typeof fingerprint!=='string'||!fingerprint)throw new AppError('A submission id is required.');
  const enabled=!!input.enabled;const template=enabled?String(input.template||'').trim():'';
  if(enabled&&(!template||template.length>10000))throw new AppError('A reply template (1-10,000 characters) is required to enable auto-reply.');
  this.store.setEngagement(user.id,fingerprint,enabled,template);return {saved:true};
 }
 async runEngagement(user,limit=5){
  const targets=this.store.engagementTargets(user.id);if(!targets.length)return {checked:0,replied:0};
  let replied=0;
  await this.browser.session(user.id,async page=>{
   for(const t of targets){
    if(replied>=limit)break;
    let found;try{found=await this.browser.comments(page,t.reddit_url);}catch{continue;}
    for(const c of found){
     if(replied>=limit)break;
     if(this.store.replied(user.id,c.id))continue;
     try{await this.browser.reply(page,c.permalink,t.reply_template);this.store.recordReply(user.id,c.id,t.id);replied++;await page.waitForTimeout(2000+Math.floor(Math.random()*2000));}
     catch{/* skip this comment, keep going */}
    }
   }
  });
  return {checked:targets.length,replied};
 }
 async schedule(user,input){
  const d=draft(input);const when=new Date(input.scheduledAt);
  if(Number.isNaN(when.getTime())||when.getTime()<=Date.now())throw new AppError('scheduledAt must be a valid future date/time.');
  const id=this.store.schedule(user.id,'reddit',when.toISOString(),{title:d.title,kind:d.kind,text:d.text,url:d.url});return {id,scheduledAt:when.toISOString()};
 }
 async cancelScheduled(user,id){this.store.scheduledCancel(user.id,id);return {canceled:true};}
 async runDue(){
  const due=this.store.due(new Date().toISOString(),'reddit');let processed=0;
  for(const item of due){
   if(!this.store.scheduledClaim(item.user_id,item.id))continue;
   try{const result=await this.publish({id:item.user_id},{title:item.title,kind:item.kind,text:item.text,url:item.url});this.store.scheduledFinish(item.user_id,item.id,result.duplicate?'published':result.state,JSON.stringify(result),result.error||null);}
   catch(e){this.store.scheduledFinish(item.user_id,item.id,'failed',null,e.message);}
   processed++;
  }
  return {processed};
 }
}

export class SnapchatService {
 constructor(store,snapchat){this.store=store;this.snapchat=snapchat;}
 status(){return this.snapchat.status();}
 async run(user,action,fields={}){
  let result;
  if(action==='record-draft')result=await this.snapchat.recordAndSaveDraft(fields.durationMs||5000);
  else if(action==='post-draft')result=await this.snapchat.postLatestDraft({asStory:fields.asStory!==false,caption:fields.caption||''});
  else if(action==='story')result=await this.snapchat.postStory(fields.caption||'');
  else if(action==='send'){if(!fields.username)throw new AppError('username is required.',400);result=await this.snapchat.sendSnap(fields.username,fields.mediaPath);}
  else throw new AppError('Unknown Snapchat action: '+action,400);
  this.store.snapchatRecord(user.id,action,fields.caption||null,fields.username||null,result.state,result.error||null);
  return result;
 }
 async schedule(user,input){
  const when=new Date(input.scheduledAt);
  if(Number.isNaN(when.getTime())||when.getTime()<=Date.now())throw new AppError('scheduledAt must be a valid future date/time.');
  const action=input.action;
  if(!['record-draft','post-draft','story','send'].includes(action))throw new AppError('action must be record-draft, post-draft, story, or send.');
  if(action==='send'&&!input.username)throw new AppError('username is required to schedule a direct send.');
  const payload={action,caption:String(input.caption||'').slice(0,500),asStory:input.asStory!==false,username:input.username?String(input.username).slice(0,100):undefined,durationMs:input.durationMs,mediaPath:input.mediaPath?String(input.mediaPath):undefined};
  const id=this.store.schedule(user.id,'snapchat',when.toISOString(),{payload});
  return {id,scheduledAt:when.toISOString()};
 }
 async cancelScheduled(user,id){this.store.scheduledCancel(user.id,id);return {canceled:true};}
 history(user){return this.store.snapchatHistory(user.id);}
 scheduledList(user){return this.store.scheduledList(user.id,'snapchat');}
 async runDue(){
  const due=this.store.due(new Date().toISOString(),'snapchat');let processed=0;
  for(const item of due){
   if(!this.store.scheduledClaim(item.user_id,item.id))continue;
   try{
    const payload=item.payload?JSON.parse(item.payload):{};
    const result=await this.run({id:item.user_id},payload.action,payload);
    this.store.scheduledFinish(item.user_id,item.id,result.state,JSON.stringify(result),result.error||null);
   }catch(e){this.store.scheduledFinish(item.user_id,item.id,'failed',null,e.message);}
   processed++;
  }
  return {processed};
 }
}
