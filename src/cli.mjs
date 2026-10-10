import {openStore} from './store.mjs';
import {RedditBrowser} from './browser.mjs';
const store=openStore();
try{
 const [command,...args]=process.argv.slice(2);
 if(command==='user'){
  const result=store.createUser(args[0]);console.log(JSON.stringify(result,null,2));console.log('Save the API key securely; it is shown only once.');
 }else if(command==='login'){
  await new RedditBrowser(store).login(args[0]);
 }else if(command==='reset'){
  const [userId,fingerprint]=args;
  const row=store.existing(userId,fingerprint);
  if(!row)throw Error('No submission found for that user ID and fingerprint.');
  if(row.state==='published')throw Error('Published posts cannot be reset. If this is a duplicate on Reddit, remove it there manually.');
  console.log('Stuck submission found:');
  console.log('  Title:     '+row.title);
  console.log('  Subreddit: r/'+row.subreddit);
  console.log('  State:     '+row.state);
  console.log('  Error:     '+(row.error||'(none)'));
  console.log('  Created:   '+row.created_at);
  console.log('');
  console.log('Resetting does not touch Reddit. Check this user\'s Reddit profile/post history yourself');
  console.log('first to confirm whether the post actually went live before clearing this lock.');
  const {createInterface}=await import('node:readline/promises');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  const answer=await rl.question('Type RESET to clear this lock: ');
  rl.close();
  if(answer.trim()!=='RESET')console.log('Not confirmed; nothing changed.');
  else{store.resetLock(userId,fingerprint);console.log('Lock cleared. The same draft can be submitted again.');}
 }else throw Error('Use: npm run user -- "User label" OR npm run login -- USER_ID OR npm run reset -- USER_ID FINGERPRINT');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{store.close();}
