import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openStore} from './store.mjs';
import {RedditBrowser} from './browser.mjs';
import {RouterService} from './service.mjs';
import {AppError} from './core.mjs';
const readBody=async(req)=>{let bytes=0;const chunks=[];for await(const part of req){bytes+=part.length;if(bytes>70000)throw new AppError('Request too large.',413);chunks.push(part);}try{return JSON.parse(Buffer.concat(chunks).toString())}catch{throw new AppError('Invalid JSON.');}};
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none'";
const STATIC_FILES={'/style.css':'text/css; charset=utf-8','/app.js':'text/javascript; charset=utf-8'};
export function createApp(store,browser){
 const service=new RouterService(store,browser);const signupAttempts=new Map();
 const allowSignup=(ip)=>{const now=Date.now();const windowMs=3600000;const recent=(signupAttempts.get(ip)||[]).filter(t=>now-t<windowMs);if(recent.length>=5)return false;recent.push(now);signupAttempts.set(ip,recent);return true;};
 return createServer(async(req,res)=>{
  const send=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/'&&req.method==='GET'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':CSP});res.end(await readFile(new URL('../public/index.html',import.meta.url)));return;}
   if(path in STATIC_FILES&&req.method==='GET'){res.writeHead(200,{'content-type':STATIC_FILES[path],'cache-control':'no-store','content-security-policy':CSP});res.end(await readFile(new URL('../public'+path,import.meta.url)));return;}
   if(path==='/api/signup'&&req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))throw new AppError('Use application/json.',415);
    if(!allowSignup(req.socket.remoteAddress||'unknown'))throw new AppError('Too many accounts created from this address recently. Try again later.',429);
    const input=await readBody(req);
    return send(store.createUser(String(input.label||'New user').trim().slice(0,200)||'New user'),201);
   }
   if(!path.startsWith('/api/'))return send({error:'Not found'},404);
   const user=store.user(req.headers.authorization?.replace(/^Bearer /,''));if(!user)return send({error:'Enter your app API key in Settings.',code:'UNAUTHORIZED'},401);
   if(req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host)throw new AppError('Cross-origin requests are not allowed.',403);}
   if(req.method==='GET'){
    if(path==='/api/status')return send({connected:browser.connected(user.id),userId:user.id,label:user.label});
    if(path==='/api/history')return send(store.history(user.id));
    if(path==='/api/communities')return send(store.approvals(user.id));
    if(path==='/api/engagement')return send({targets:store.engagementTargets(user.id),history:store.replyHistory(user.id)});
    if(path==='/api/schedule')return send(store.scheduledList(user.id));
    if(path==='/api/analytics')return send(store.analytics(user.id));
   }
   if(req.method!=='POST')return send({error:'Not found'},404);
   if(!req.headers['content-type']?.startsWith('application/json'))throw new AppError('Use application/json.',415);
   const input=await readBody(req);
   if(path==='/api/rank')return send(await service.rank(user,input));
   if(path==='/api/publish')return send(await service.publish(user,input));
   if(path==='/api/community')return send(await service.community(user,input));
   if(path==='/api/connection')return send(await browser.session(user.id,p=>browser.identity(p)));
   if(path==='/api/outcomes'){store.record(user.id,input.id,input.clicks,input.leads);return send({saved:true});}
   if(path==='/api/engagement')return send(await service.setEngagement(user,input));
   if(path==='/api/engagement/run')return send(await service.runEngagement(user));
   if(path==='/api/schedule')return send(input.action==='cancel'?await service.cancelScheduled(user,input.id):await service.schedule(user,input));
   return send({error:'Not found'},404);
  }catch(e){send({error:e instanceof AppError?e.message:'Browser operation failed. Check the session and page layout; no automatic retry.',...(e.status?{}:{code:'INTERNAL_ERROR'})},e.status||500);}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const store=openStore();const browser=new RedditBrowser(store);const server=createApp(store,browser);const port=Number(process.env.PORT||3000);const host=process.env.HOST||'127.0.0.1';server.listen(port,host,()=>console.log('Reddit browser router listening on http://'+host+':'+port));
 const service=new RouterService(store,browser);
 const schedulePollMs=Math.max(1,Number(process.env.SCHEDULE_POLL_SECONDS||60))*1000;
 const scheduleTimer=setInterval(()=>{service.runDue().catch(e=>console.error('Scheduled publish check failed: '+e.message));},schedulePollMs);
 const engagementIntervalMin=Number(process.env.ENGAGEMENT_INTERVAL_MINUTES||0);let engagementTimer=null;
 if(engagementIntervalMin>0){
  engagementTimer=setInterval(async()=>{for(const userId of store.engagementUsers()){try{await service.runEngagement({id:userId},3);}catch(e){console.error('Engagement run failed for user '+userId+': '+e.message);}}},engagementIntervalMin*60000);
  console.log('Automatic engagement checks every '+engagementIntervalMin+' minute(s).');
 }
 let closing=false;const close=()=>{if(closing)return;closing=true;clearInterval(scheduleTimer);if(engagementTimer)clearInterval(engagementTimer);server.close(()=>{store.close();process.exit(0)});};process.on('SIGTERM',close);process.on('SIGINT',close);
}
