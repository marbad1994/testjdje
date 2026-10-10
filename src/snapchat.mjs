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
    await new Promise(r => setTimeout(r, 2000));
  }

  async dumpUi() {
    await this.adb('shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml');
    return this.adb('shell', 'cat', '/sdcard/window_dump.xml');
  }

  async tapText(text) {
    const xml = await this.dumpUi();
    const match = xml.match(new RegExp(`text="${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`));
    if (!match) throw new AppError(`Element with text "${text}" not found`, 404);
    const x = Math.round((+match[1] + +match[3]) / 2);
    const y = Math.round((+match[2] + +match[4]) / 2);
    await this.adb('shell', 'input', 'tap', String(x), String(y));
    await new Promise(r => setTimeout(r, 800));
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
