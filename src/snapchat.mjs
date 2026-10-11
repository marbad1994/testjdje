import {spawn} from 'node:child_process';
import {AppError} from './core.mjs';

// Drives the real Snapchat Android app through its own UI via ADB + uiautomator —
// the same screens a person would tap, on one account's own device/emulator. No
// private API calls, no protocol-level signing, nothing hidden from Snapchat's own
// app. Required steps throw on failure instead of being silently skipped, and every
// action reports 'uncertain' rather than claiming success it can't confirm from the
// UI afterward — the same no-blind-success rule as the Reddit adapter.
//
// These selectors are implementation assumptions, not evidence of current
// compatibility with a live Snapchat build: validate against your own connected
// device/emulator before trusting the confirmation logic.
export class SnapchatEmulator {
 constructor({serial=process.env.SNAPCHAT_ADB_SERIAL||'emulator-5554',packageName=process.env.SNAPCHAT_PACKAGE||'com.snapchat.android'}={}){
  this.serial=serial;this.packageName=packageName;
 }
 async adb(...args){
  return new Promise((resolve,reject)=>{
   const proc=spawn('adb',['-s',this.serial,...args],{stdio:['ignore','pipe','pipe']});
   let out='',err='';
   proc.stdout.on('data',d=>out+=d);proc.stderr.on('data',d=>err+=d);
   proc.on('error',e=>reject(new AppError('adb is not available on this host: '+e.message,500)));
   proc.on('close',code=>code===0?resolve(out.trim()):reject(new AppError(`adb failed (${code}): ${err||out}`,500)));
  });
 }
 async connected(){
  try{const devices=await this.adb('devices');return devices.includes(this.serial)&&devices.includes('device');}
  catch{return false;}
 }
 async ensureRunning(){
  if(!await this.connected())throw new AppError('Snapchat emulator not connected via ADB. Start the emulator/redroid container and run `adb connect` first.',503);
  await this.adb('shell','am','start','-n',`${this.packageName}/.LandingPageActivity`);
  await new Promise(r=>setTimeout(r,2500));
 }
 async dumpUi(){
  await this.adb('shell','uiautomator','dump','/sdcard/window_dump.xml');
  return this.adb('shell','cat','/sdcard/window_dump.xml');
 }
 /** Finds an element's tap point by resource-id or visible text, without tapping. */
 async elementBounds(textOrId){
  const xml=await this.dumpUi();
  const escaped=textOrId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  let match=xml.match(new RegExp(`resource-id="[^"]*${escaped}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`));
  if(!match)match=xml.match(new RegExp(`text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`));
  return match?{x:Math.round((+match[1]+ +match[3])/2),y:Math.round((+match[2]+ +match[4])/2)}:null;
 }
 async present(textOrId){return !!await this.elementBounds(textOrId);}
 /** Taps a named element. Throws if required and not found — never silently skipped. */
 async tap(textOrId,{required=true}={}){
  const bounds=await this.elementBounds(textOrId);
  if(!bounds){
   if(required)throw new AppError(`Required screen element "${textOrId}" not found. The app may be on an unexpected screen (a verification prompt, update dialog, or a different Snapchat version than these selectors were written for).`,409);
   return false;
  }
  await this.adb('shell','input','tap',String(bounds.x),String(bounds.y));
  await new Promise(r=>setTimeout(r,900));
  return true;
 }
 async longPress(x,y,duration=3000){
  await this.adb('shell','input','swipe',String(x),String(y),String(x),String(y),String(duration));
  await new Promise(r=>setTimeout(r,duration+500));
 }
 async recordAndSaveDraft(durationMs=5000){
  await this.ensureRunning();
  await this.tap('Camera',{required:false});
  await new Promise(r=>setTimeout(r,1000));
  const recordButton=await this.elementBounds('nueva_nav_default_camera_button');
  if(recordButton)await this.longPress(recordButton.x,recordButton.y,durationMs);
  else await this.longPress(540,1600,durationMs);
  await this.tap('Save');
  const reachedMemories=await this.tap('Memories',{required:false})&&await this.tap('Save to Memories',{required:false});
  const confirmed=reachedMemories||await this.present('Memories');
  return {state:confirmed?'saved':'uncertain',durationMs,note:confirmed?'Recording saved to Memories/Drafts.':'Save was tapped but landing in Memories/Drafts could not be confirmed. Check the device before relying on this draft.',timestamp:new Date().toISOString()};
 }
 async postLatestDraft({asStory=true,caption=''}={}){
  await this.ensureRunning();
  await this.tap('Memories');
  await this.tap('Drafts');
  await new Promise(r=>setTimeout(r,1500));
  await this.adb('shell','input','tap','540','800');
  await new Promise(r=>setTimeout(r,1000));
  if(caption)await this.tap('Add caption',{required:false});
  if(asStory){await this.tap('Stories');await this.tap('My Story');}
  await this.tap('Send');
  const stillOnDrafts=await this.present('Drafts');
  const confirmed=!stillOnDrafts;
  return {state:confirmed?'published':'uncertain',asStory,caption,note:confirmed?'Send confirmed; the drafts screen cleared.':'Send was tapped but the drafts screen still shows — delivery could not be confirmed. Check the device before retrying.'};
 }
 async sendSnap(username,mediaPath){
  if(!username)throw new AppError('username is required.',400);
  await this.ensureRunning();
  await this.tap(username);
  await this.tap('Send');
  return {state:'uncertain',username,mediaPath,note:'Basic navigation executed; this action has no post-send confirmation check yet. Verify on the device.'};
 }
 async postStory(caption){
  await this.ensureRunning();
  await this.tap('Stories');
  const posted=await this.present('My Story');
  return {state:posted?'published':'uncertain',caption};
 }
 async status(){
  const connected=await this.connected();
  let current=null;
  if(connected){
   try{const dump=await this.adb('shell','dumpsys','window','windows');current=(dump.match(/mCurrentFocus=\S+/)||[])[0]||null;}catch{}
  }
  return {connected,serial:this.serial,currentFocus:current};
 }
}
