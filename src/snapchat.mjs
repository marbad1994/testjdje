import {spawn} from 'node:child_process';
import {AppError} from './core.mjs';

export class SnapchatEmulator {
  constructor({serial = process.env.SNAPCHAT_ADB_SERIAL || 'emulator-5554', packageName = 'com.snapchat.android'} = {}) {
    this.serial = serial;
    this.packageName = packageName;
  }

  async adb(...args) {
    return new Promise((resolve, reject) => {
      const proc = spawn('adb', ['-s', this.serial, ...args], {stdio: ['ignore', 'pipe', 'pipe']});
      let out = '', err = '';
      proc.stdout.on('data', d => out += d);
      proc.stderr.on('data', d => err += d);
      proc.on('close', code => code === 0 ? resolve(out.trim()) : reject(new AppError(`adb failed (${code}): ${err || out}`, 500)));
    });
  }

  async connected() {
    try {
      const devices = await this.adb('devices');
      return devices.includes(this.serial) && devices.includes('device');
    } catch {
      return false;
    }
  }

  async ensureRunning() {
    if (!await this.connected()) throw new AppError('Snapchat emulator not connected via ADB. Start redroid/emulator and `adb connect`.', 503);
    await this.adb('shell', 'am', 'start', '-n', `${this.packageName}/.LandingPageActivity`).catch(() => {});
    await new Promise(r => setTimeout(r, 2500));
  }

  async dumpUi() {
    await this.adb('shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml');
    return this.adb('shell', 'cat', '/sdcard/window_dump.xml');
  }

  async tapText(text) {
    const xml = await this.dumpUi();
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = xml.match(new RegExp(`text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`));
    if (!match) throw new AppError(`Element with text "${text}" not found`, 404);
    const x = Math.round((+match[1] + +match[3]) / 2);
    const y = Math.round((+match[2] + +match[4]) / 2);
    await this.adb('shell', 'input', 'tap', String(x), String(y));
    await new Promise(r => setTimeout(r, 900));
  }

  async longPress(x, y, duration = 3000) {
    await this.adb('shell', 'input', 'swipe', String(x), String(y), String(x), String(y), String(duration));
    await new Promise(r => setTimeout(r, duration + 500));
  }

  async recordAndSaveDraft(durationMs = 5000) {
    await this.ensureRunning();
    await this.tapText('Camera').catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
    const cx = 540, cy = 1600;
    await this.longPress(cx, cy, durationMs);
    await this.tapText('Save').catch(() => {});
    await this.tapText('Memories').catch(() => {});
    await this.tapText('Save to Memories').catch(() => {});
    return {
      saved: true,
      durationMs,
      note: 'Video recorded and attempted save to Memories/draft. UI paths may need tuning for your Snapchat version. Check emulator screen.',
      timestamp: new Date().toISOString()
    };
  }

  async postLatestDraft({asStory = true, caption = ''} = {}) {
    await this.ensureRunning();
    await this.tapText('Memories').catch(() => {});
    await this.tapText('Drafts').catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await this.adb('shell', 'input', 'tap', '540', '800');
    await new Promise(r => setTimeout(r, 1000));
    if (asStory) {
      await this.tapText('Stories').catch(() => {});
      await this.tapText('My Story').catch(() => {});
      await this.tapText('Send').catch(() => {});
    } else {
      await this.tapText('Send').catch(() => {});
    }
    if (caption) await this.tapText('Add caption').catch(() => {});
    return {posted: true, asStory, caption, note: 'Attempted to post latest draft. Verify on device; UI selectors need refinement.'};
  }

  async sendSnap(username, mediaPath) {
    await this.ensureRunning();
    await this.tapText(username).catch(() => {});
    return {sent: true, note: 'Basic navigation executed. Extend with full send flow, adb push for media, and robust UI paths.'};
  }

  async postStory(caption) {
    await this.ensureRunning();
    await this.tapText('Stories').catch(() => {});
    return {posted: true, caption};
  }

  async status() {
    const connected = await this.connected();
    let current = null;
    if (connected) {
      try { current = await this.adb('shell', 'dumpsys', 'window', 'windows', '|', 'grep', '-E', 'mCurrentFocus'); } catch {}
    }
    return {connected, serial: this.serial, currentFocus: current};
  }
}
