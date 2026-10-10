import {createHash} from 'node:crypto';
export class AppError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function subreddit(s){if(typeof s!=='string')throw new AppError('Subreddit required.');s=s.trim().replace(/^r\//i,'');if(!/^[a-z0-9_]{2,21}$/i.test(s))throw new AppError('Invalid subreddit.');return s.toLowerCase();}
export function draft(d){if(typeof d?.title!=='string'||!d.title.trim()||d.title.length>300)throw new AppError('Title must contain 1–300 characters.');if(!['self','link'].includes(d.kind))throw new AppError('Post kind must be self or link.');if(d.kind==='self'&&(typeof d.text!=='string'||!d.text.trim()||d.text.length>40000))throw new AppError('Text must contain 1–40,000 characters.');if(d.kind==='link'){try{if(!['http:','https:'].includes(new URL(d.url).protocol))throw 0;}catch{throw new AppError('A valid HTTP(S) URL is required.');}}return {title:d.title.trim(),kind:d.kind,text:d.kind==='self'?d.text:'',url:d.kind==='link'?d.url:''};}
const stop=new Set('the and for that this with from your you our have has are was will how what when does can its into about'.split(' '));
export const terms=s=>new Set((s.toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(w=>!stop.has(w)));
export function overlap(a,b){return a.size?[...a].filter(w=>b.has(w)).length/a.size:0;}
export function scoreCommunity(d,c,approval,outcome){
 const words=terms(d.title+' '+d.text);const topic=overlap(words,terms(c.name+' '+c.description+' '+c.posts.map(p=>p.title).join(' ')));
 const relevant=c.posts.filter(p=>overlap(words,terms(p.title))>=.12);
 const comments=relevant.map(p=>p.comments||0).sort((a,b)=>a-b);const median=comments.length?comments[Math.floor(comments.length/2)]:0;
 const latest=Math.max(0,...c.posts.map(p=>p.created||0));const freshness=latest?Math.max(0,1-(Date.now()-latest)/86400000):0;
 const conversion=outcome?.clicks?Math.min(1,outcome.leads/outcome.clicks):0;
 const reasons=[];if(!approval)reasons.push('Review and approve this community first');else if(approval.rules_hash!==c.rulesHash)reasons.push('Rules changed; review again');
 if(c.nsfw)reasons.push('NSFW communities are excluded');if(topic<.12)reasons.push('Insufficient topic overlap');
 return {...c,score:Math.round(topic*70+Math.min(1,median/10)*15+freshness*10+conversion*5),topic:Math.round(topic*100),medianComments:median,sampleSize:c.posts.length,eligible:!reasons.length,reasons,history:outcome||null};
}
export function choose(results){const eligible=results.filter(x=>x.eligible).sort((a,b)=>b.score-a.score);if(!eligible[0])throw new AppError('No eligible community. Review and approve relevant communities first.');if(eligible[0].score<20||(eligible[1]&&eligible[0].score-eligible[1].score<3))throw new AppError('Match is too weak or uncertain for automatic posting. Narrow the approved destinations.');return eligible[0];}
