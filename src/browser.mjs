import {existsSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {digest,AppError,subreddit} from './core.mjs';
// Uses rendered Reddit pages only. No Reddit API calls, cookie injection from third parties, or challenge bypasses.
export class RedditBrowser {
 constructor(store,{headless=true}={}){this.store=store;this.headless=headless;this.active=new Set();}
 statePath(id){return join(this.store.root,id+'.session.json');}
 connected(id){return existsSync(this.statePath(id));}
 async session(id,fn){
  if(this.active.size>=2&&!this.active.has(id))throw new AppError('Browser capacity is busy. Try again later.',429);
  if(this.active.has(id))throw new AppError('A browser job is already running for this user.',409);
  if(!this.connected(id))throw new AppError('Connect a Reddit browser session with npm run login -- USER_ID.',503);
  this.active.add(id);let browser;
  try{const {chromium}=await import('playwright');browser=await chromium.launch({headless:this.headless});const context=await browser.newContext({storageState:this.statePath(id),viewport:{width:1400,height:1000}});const page=await context.newPage();page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(30000);return await fn(page);}finally{try{await browser?.close();}finally{this.active.delete(id);}}
 }
 async goto(page,path){
  const r=await page.goto('https://old.reddit.com'+path,{waitUntil:'domcontentloaded'});
  if(r&&r.status()>=400)throw new AppError('Reddit browser access failed ('+r.status()+'). Reconnect or review access manually.',502);
  const text=(await page.locator('body').innerText()).slice(0,16000);
  if(/blocked by network security|verify you are human|whoa there|security check|you.ve been blocked|captcha/i.test(text))throw new AppError('Reddit requires manual verification. Browser automation stopped.',409);
  if(!await page.locator('#header-bottom-right .user a[href*="/user/"]').count())throw new AppError('Reddit session expired or the page layout changed. Run browser login again.',409);
 }
 async identity(page){await this.goto(page,'/');return {username:(await page.locator('#header-bottom-right .user a[href*="/user/"]').first().innerText()).trim()};}
 async discovery(page,query){await this.goto(page,'/subreddits/search?q='+encodeURIComponent(query));const names=await page.locator('.search-result-subreddit a[href], .thing.subreddit a.title[href]').evaluateAll(nodes=>nodes.map(n=>{try{return new URL(n.href).pathname.match(/^\/r\/([a-z0-9_]+)\/?$/i)?.[1]}catch{return null}}).filter(Boolean));return [...new Set(names.map(subreddit))].slice(0,6);}
 async community(page,name){
  name=subreddit(name);await this.goto(page,'/r/'+name+'/about/rules/');
  const rules=await page.locator('.subreddit-rule').evaluateAll(nodes=>nodes.map(n=>({short_name:(n.querySelector('.short_name,.rule-title')?.textContent||'Community rule').trim(),description:n.textContent.trim()})));
  if(!rules.length)throw new AppError('Cannot reliably read this community’s rules. It cannot be approved automatically; inspect Reddit manually.',409);
  const rulesHash=digest(JSON.stringify(rules));await this.goto(page,'/r/'+name+'/new/');
  const description=await page.locator('.side .md').evaluateAll(nodes=>nodes.map(n=>n.textContent.trim()).join('\n'));
  const nsfw=await page.locator('body').evaluate(n=>n.classList.contains('over18'));
  const posts=await page.locator('.thing.link').evaluateAll(nodes=>nodes.slice(0,20).filter(n=>!n.classList.contains('stickied')).map(n=>({title:n.querySelector('a.title')?.textContent.trim()||'',comments:Number((n.querySelector('a.comments')?.textContent||'').match(/\d+/)?.[0]||0),created:Date.parse(n.querySelector('time')?.getAttribute('datetime')||'')||0})));
  if(!posts.length)throw new AppError('No readable post samples; Reddit layout may have changed.',409);
  return {name,rules,rulesHash,description,nsfw,posts,url:'https://www.reddit.com/r/'+name+'/'};
 }
 async submit(page,d,name){
  // Preparatory failures are safe to report. Once the submit click starts, any uncertainty is never retried.
  await this.goto(page,'/r/'+subreddit(name)+'/submit?selftext='+(d.kind==='self'?'true':'false'));
  const form=page.locator('form#newlink');if(!await form.count())throw new AppError('Reddit submission form changed; posting stopped.',409);
  const tab=page.locator(d.kind==='self'?'a.text-button':'a.link-button');if(await tab.count())await tab.first().click();
  await form.locator('textarea[name="title"]').fill(d.title);
  if(d.kind==='self')await form.locator('textarea[name="text"]').fill(d.text);else await form.locator('input[name="url"]').fill(d.url);
  // Required community flair is left to manual posting in this first version.
  const flair=form.locator('.flairselector');if(await flair.count()&&/required/i.test(await flair.innerText()))throw new AppError('This community requires flair. First version cannot submit it automatically.',409);
  const button=form.getByRole('button',{name:/^submit$/i});if(await button.count()!==1||!await button.isEnabled())throw new AppError('Submission is unavailable. Check community restrictions manually.',409);
  const verifyTitle=await form.locator('textarea[name="title"]').inputValue();if(verifyTitle!==d.title)throw new AppError('Draft verification failed.',409);
  if(d.kind==='self'&&(await form.locator('textarea[name="text"]').inputValue())!==d.text)throw new AppError('Draft body verification failed.',409);
  if(d.kind==='link'&&(await form.locator('input[name="url"]').inputValue())!==d.url)throw new AppError('Draft URL verification failed.',409);
  try{
   await button.click();
   await page.waitForURL(url=>url.hostname.endsWith('reddit.com')&&new RegExp('^/r/'+name+'/comments/','i').test(url.pathname),{timeout:20000});
   const returnedTitle=(await page.locator('.thing.link a.title').first().innerText()).trim();if(returnedTitle!==d.title)throw new Error('Published title mismatch');
   return {state:'published',reddit_url:page.url()};
  }catch{return {state:'uncertain',error:'Reddit did not confirm a matching post. Check your profile before further posting; no automatic retry.'};}
 }
 async login(id){
  if(!this.store.db.prepare('SELECT id FROM users WHERE id=?').get(id))throw new AppError('Unknown user ID.');
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:false});
  try{const context=await browser.newContext();const page=await context.newPage();await page.goto('https://www.reddit.com/login/');
   console.log('Log into Reddit in the browser, finish any manual verification, then press Enter here.');
   const {createInterface}=await import('node:readline/promises');const rl=createInterface({input:process.stdin,output:process.stdout});await rl.question('');rl.close();
   await this.identity(page);await context.storageState({path:this.statePath(id),indexedDB:true});chmodSync(this.statePath(id),0o600);console.log('Browser session saved for this user.');
  }finally{await browser.close();}
 }
}
