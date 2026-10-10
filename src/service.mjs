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
   try{const result=await this.browser.submit(page,d,picked.name);this.store.finish(user.id,fingerprint,result.state,result.reddit_url||null,result.error||null);return {...result,id:fingerprint,subreddit:picked.name,score:picked.score};}
   catch(e){this.store.finish(user.id,fingerprint,'blocked',null,e.message);throw e;}
  });
 }
 async community(user,input){const name=subreddit(input.name);if(input.action==='remove'){this.store.remove(user.id,name);return {saved:true};}
  return this.browser.session(user.id,async page=>{const c=await this.browser.community(page,name);if(input.action==='approve'){if(input.rulesHash!==c.rulesHash||input.promotionAllowed!==true)throw new AppError('Review current rules and confirm this content is permitted.');this.store.approve(user.id,name,c.rulesHash);return {saved:true};}return c;});
 }
}
