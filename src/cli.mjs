import {openStore} from './store.mjs';
import {RedditBrowser} from './browser.mjs';
const store=openStore();try{const [command,arg]=process.argv.slice(2);if(command==='user'){const result=store.createUser(arg);console.log(JSON.stringify(result,null,2));console.log('Save the API key securely; it is shown only once.');}else if(command==='login'){await new RedditBrowser(store).login(arg);}else throw Error('Use: npm run user -- "User label" OR npm run login -- USER_ID');}catch(e){console.error(e.message);process.exitCode=1;}finally{store.close();}
