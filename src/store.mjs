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
 CREATE TABLE IF NOT EXISTS submissions(user_id TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,subreddit TEXT NOT NULL,state TEXT NOT NULL,reddit_url TEXT,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,clicks INTEGER NOT NULL DEFAULT 0,leads INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,id),FOREIGN KEY(user_id) REFERENCES users(id));`);
 return {root,db,
 createUser(label){if(!label?.trim())throw new AppError('User label required.');const id=randomUUID(),key=randomBytes(32).toString('hex');db.prepare('INSERT INTO users VALUES(?,?,?)').run(id,label,digest(key));return {id,apiKey:key};},
 user(key){return typeof key==='string'?db.prepare('SELECT id,label FROM users WHERE key_hash=?').get(digest(key)):undefined;},
 approvals(id){return db.prepare('SELECT * FROM communities WHERE user_id=? AND approved=1 ORDER BY name').all(id);},
 approve(id,name,rulesHash){if(this.approvals(id).length>=12&&!this.approvals(id).some(c=>c.name===name))throw new AppError('Maximum 12 approved communities per user.');db.prepare('INSERT INTO communities VALUES(?,?,?,1) ON CONFLICT(user_id,name) DO UPDATE SET rules_hash=excluded.rules_hash,approved=1').run(id,name,rulesHash);},
 remove(id,name){db.prepare('DELETE FROM communities WHERE user_id=? AND name=?').run(id,name);},
 history(id){return db.prepare('SELECT * FROM submissions WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(id);},
 outcomes(id){return db.prepare("SELECT subreddit,SUM(clicks) clicks,SUM(leads) leads FROM submissions WHERE user_id=? AND state='published' GROUP BY subreddit").all(id);},
 existing(id,fingerprint){return db.prepare('SELECT * FROM submissions WHERE user_id=? AND id=?').get(id,fingerprint);},
 resetLock(id,fingerprint){const row=this.existing(id,fingerprint);if(!row)throw new AppError('No submission found for that user ID and fingerprint.',404);if(row.state==='published')throw new AppError('Published posts cannot be reset. If this is a duplicate on Reddit, remove it there manually.',409);db.prepare('DELETE FROM submissions WHERE user_id=? AND id=?').run(id,fingerprint);return row;},
 lock(id,fingerprint,d,name){return db.prepare('INSERT OR IGNORE INTO submissions(user_id,id,title,subreddit,state) VALUES(?,?,?,?,?)').run(id,fingerprint,d.title,name,'submitting').changes===1;},
 finish(id,fingerprint,state,url=null,error=null){db.prepare('UPDATE submissions SET state=?,reddit_url=?,error=? WHERE user_id=? AND id=?').run(state,url,error,id,fingerprint);},
 record(id,fingerprint,clicks,leads){if(!Number.isSafeInteger(clicks)||clicks<0||!Number.isSafeInteger(leads)||leads<0||leads>clicks)throw new AppError('Use whole numbers: 0 ≤ leads ≤ clicks.');if(!db.prepare("UPDATE submissions SET clicks=?,leads=? WHERE user_id=? AND id=? AND state='published'").run(clicks,leads,id,fingerprint).changes)throw new AppError('Published post not found.',404);},
 close(){db.close();}
 };
}
