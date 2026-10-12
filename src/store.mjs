import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {digest,AppError} from './core.mjs';
export function openStore(directory=process.env.DATA_DIR||'data'){
 const root=resolve(directory);mkdirSync(root,{recursive:true,mode:0o700});chmodSync(root,0o700);
 const db=new DatabaseSync(join(root,'app.sqlite'));chmodSync(join(root,'app.sqlite'),0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,label TEXT NOT NULL,key_hash TEXT NOT NULL UNIQUE);
 CREATE TABLE IF NOT EXISTS communities(user_id TEXT NOT NULL,name TEXT NOT NULL,rules_hash TEXT NOT NULL,approved INTEGER NOT NULL,PRIMARY KEY(user_id,name),FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS submissions(user_id TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,subreddit TEXT NOT NULL,state TEXT NOT NULL,reddit_url TEXT,error TEXT,score INTEGER,reply_enabled INTEGER NOT NULL DEFAULT 0,reply_template TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,clicks INTEGER NOT NULL DEFAULT 0,leads INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS replies(user_id TEXT NOT NULL,comment_id TEXT NOT NULL,submission_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,comment_id),FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS scheduled(user_id TEXT NOT NULL,id TEXT NOT NULL,platform TEXT NOT NULL DEFAULT 'reddit',title TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL DEFAULT '',text TEXT NOT NULL DEFAULT '',url TEXT NOT NULL DEFAULT '',payload TEXT,scheduled_at TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',result TEXT,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS snapchat_posts(user_id TEXT NOT NULL,id TEXT NOT NULL,action TEXT NOT NULL,caption TEXT,target TEXT,state TEXT NOT NULL,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS devices(platform TEXT NOT NULL,user_id TEXT NOT NULL,serial TEXT NOT NULL,assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(platform,user_id),UNIQUE(platform,serial),FOREIGN KEY(user_id) REFERENCES users(id));`);
 return {root,db,
 createUser(label){if(!label?.trim())throw new AppError('User label required.');const id=randomUUID(),key=randomBytes(32).toString('hex');db.prepare('INSERT INTO users VALUES(?,?,?)').run(id,label,digest(key));return {id,apiKey:key};},
 user(key){return typeof key==='string'?db.prepare('SELECT id,label FROM users WHERE key_hash=?').get(digest(key)):undefined;},
 approvals(id){return db.prepare('SELECT * FROM communities WHERE user_id=? AND approved=1 ORDER BY name').all(id);},
 approve(id,name,rulesHash){if(this.approvals(id).length>=12&&!this.approvals(id).some(c=>c.name===name))throw new AppError('Maximum 12 approved communities per user.');db.prepare('INSERT INTO communities VALUES(?,?,?,1) ON CONFLICT(user_id,name) DO UPDATE SET rules_hash=excluded.rules_hash,approved=1').run(id,name,rulesHash);},
 remove(id,name){db.prepare('DELETE FROM communities WHERE user_id=? AND name=?').run(id,name);},
 history(id){return db.prepare('SELECT * FROM submissions WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 100').all(id);},
 outcomes(id){return db.prepare("SELECT subreddit,SUM(clicks) clicks,SUM(leads) leads FROM submissions WHERE user_id=? AND state='published' GROUP BY subreddit").all(id);},
 analytics(id){return db.prepare("SELECT subreddit,COUNT(*) posts,ROUND(AVG(score),1) avg_score,SUM(clicks) clicks,SUM(leads) leads,CASE WHEN SUM(clicks)>0 THEN ROUND(1.0*SUM(leads)/SUM(clicks),3) ELSE NULL END conversion FROM submissions WHERE user_id=? AND state='published' GROUP BY subreddit ORDER BY posts DESC").all(id);},
 existing(id,fingerprint){return db.prepare('SELECT * FROM submissions WHERE user_id=? AND id=?').get(id,fingerprint);},
 resetLock(id,fingerprint){const row=this.existing(id,fingerprint);if(!row)throw new AppError('No submission found for that user ID and fingerprint.',404);if(row.state==='published')throw new AppError('Published posts cannot be reset. If this is a duplicate on Reddit, remove it there manually.',409);db.prepare('DELETE FROM submissions WHERE user_id=? AND id=?').run(id,fingerprint);return row;},
 lock(id,fingerprint,d,name){return db.prepare('INSERT OR IGNORE INTO submissions(user_id,id,title,subreddit,state) VALUES(?,?,?,?,?)').run(id,fingerprint,d.title,name,'submitting').changes===1;},
 finish(id,fingerprint,state,url=null,error=null,score=null){db.prepare('UPDATE submissions SET state=?,reddit_url=?,error=?,score=? WHERE user_id=? AND id=?').run(state,url,error,score,id,fingerprint);},
 record(id,fingerprint,clicks,leads){if(!Number.isSafeInteger(clicks)||clicks<0||!Number.isSafeInteger(leads)||leads<0||leads>clicks)throw new AppError('Use whole numbers: 0 ≤ leads ≤ clicks.');if(!db.prepare("UPDATE submissions SET clicks=?,leads=? WHERE user_id=? AND id=? AND state='published'").run(clicks,leads,id,fingerprint).changes)throw new AppError('Published post not found.',404);},
 setEngagement(id,fingerprint,enabled,template){const row=this.existing(id,fingerprint);if(!row||row.state!=='published')throw new AppError('Only your own published posts can have auto-reply configured.',404);db.prepare('UPDATE submissions SET reply_enabled=?,reply_template=? WHERE user_id=? AND id=?').run(enabled?1:0,template,id,fingerprint);},
 engagementTargets(id){return db.prepare("SELECT * FROM submissions WHERE user_id=? AND state='published' AND reply_enabled=1").all(id);},
 engagementUsers(){return db.prepare("SELECT DISTINCT user_id FROM submissions WHERE state='published' AND reply_enabled=1").all().map(r=>r.user_id);},
 replied(id,commentId){return !!db.prepare('SELECT 1 FROM replies WHERE user_id=? AND comment_id=?').get(id,commentId);},
 recordReply(id,commentId,submissionId){db.prepare('INSERT OR IGNORE INTO replies(user_id,comment_id,submission_id) VALUES(?,?,?)').run(id,commentId,submissionId);},
 replyHistory(id){return db.prepare('SELECT * FROM replies WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 100').all(id);},
 schedule(id,platform,scheduledAt,fields={}){const sid=randomUUID();db.prepare('INSERT INTO scheduled(user_id,id,platform,title,kind,text,url,payload,scheduled_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,sid,platform,fields.title||'',fields.kind||'',fields.text||'',fields.url||'',fields.payload?JSON.stringify(fields.payload):null,scheduledAt);return sid;},
 scheduledList(id,platform){return platform?db.prepare('SELECT * FROM scheduled WHERE user_id=? AND platform=? ORDER BY scheduled_at DESC LIMIT 100').all(id,platform):db.prepare('SELECT * FROM scheduled WHERE user_id=? ORDER BY scheduled_at DESC LIMIT 100').all(id);},
 scheduledCancel(id,sid){if(!db.prepare("DELETE FROM scheduled WHERE user_id=? AND id=? AND state='pending'").run(id,sid).changes)throw new AppError('No pending scheduled post found to cancel.',404);},
 due(now,platform){return platform?db.prepare("SELECT * FROM scheduled WHERE state='pending' AND platform=? AND scheduled_at<=? ORDER BY scheduled_at").all(platform,now):db.prepare("SELECT * FROM scheduled WHERE state='pending' AND scheduled_at<=? ORDER BY scheduled_at").all(now);},
 scheduledClaim(id,sid){return db.prepare("UPDATE scheduled SET state='processing' WHERE user_id=? AND id=? AND state='pending'").run(id,sid).changes===1;},
 scheduledFinish(id,sid,state,result=null,error=null){db.prepare('UPDATE scheduled SET state=?,result=?,error=? WHERE user_id=? AND id=?').run(state,result,error,id,sid);},
 snapchatRecord(id,action,caption,target,state,error=null){const sid=randomUUID();db.prepare('INSERT INTO snapchat_posts(user_id,id,action,caption,target,state,error) VALUES(?,?,?,?,?,?,?)').run(id,sid,action,caption||null,target||null,state,error);return sid;},
 snapchatHistory(id){return db.prepare('SELECT * FROM snapchat_posts WHERE user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 100').all(id);},
 deviceFor(platform,userId){return db.prepare('SELECT serial FROM devices WHERE platform=? AND user_id=?').get(platform,userId)?.serial;},
 assignDevice(platform,userId,pool){
  const existing=this.deviceFor(platform,userId);if(existing)return existing;
  const used=new Set(db.prepare('SELECT serial FROM devices WHERE platform=?').all(platform).map(r=>r.serial));
  const free=pool.find(s=>!used.has(s));
  if(!free)throw new AppError('No free '+platform+' device in the pool right now. Ask the operator to add more devices, or try again once one frees up.',503);
  db.prepare('INSERT INTO devices(platform,user_id,serial) VALUES(?,?,?)').run(platform,userId,free);
  return free;
 },
 releaseDevice(platform,userId){db.prepare('DELETE FROM devices WHERE platform=? AND user_id=?').run(platform,userId);},
 close(){db.close();}
 };
}
