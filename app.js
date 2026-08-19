/* ========================================
   TYPEWRITER WEB v1.3.0
   Major rewrite: formatting, images, tables, paging, export
   Developer: Tasmon Islam
   Email: tasmon@outlook.com
   ======================================== */

'use strict';

const CONFIG = {
  version: '1.3.0',
  appName: 'Typewriter Web',
  developer: 'Tasmon Islam',
  email: 'tasmon@outlook.com'
};

// ============================================
// UTILITIES
// ============================================
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      e.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) {
      e.setAttribute(k, '');
    } else if (v !== false && v != null) {
      e.setAttribute(k, v);
    }
  });
  children.forEach(c => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); });
  return e;
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function formatTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function formatDate(ts) {
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return d.toLocaleDateString();
}
function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
function slugify(str) {
  return (str || 'untitled').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'untitled';
}
function countWords(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  const text = (tmp.innerText || tmp.textContent || '').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}
function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const PLACEHOLDER_TEXT = "Begin typing... Click anywhere and start writing. All your work is saved automatically.";

// ============================================
// SETTINGS
// ============================================
class Settings {
  constructor() {
    this.defaults = {
      theme: 'classic',
      fontFamily: "'Courier Prime', monospace",
      fontSize: 18,
      lineHeight: 1.8,
      paperWidth: 800,
      soundType: 'off',
      volume: 40,            // Slightly lower default for calmer feel
      bellEnabled: true,
      carriageEnabled: true,
      charsPerLine: 80,
      strikeAnim: false,
      pageGuide: true,
      goal: 500,
      autoSave: true,
      autoSaveInterval: 10,
      panelLeftCollapsed: true,  // NEW: collapsed by default
      panelRightCollapsed: true
    };
    this.data = { ...this.defaults };
    this.load();
  }
  load() {
    try {
      const saved = localStorage.getItem('tw-settings');
      if (saved) this.data = { ...this.defaults, ...JSON.parse(saved) };
    } catch (e) {}
  }
  save() { try { localStorage.setItem('tw-settings', JSON.stringify(this.data)); } catch (e) {} }
  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); }
  reset() { this.data = { ...this.defaults }; this.save(); }
}
let settings;

// ============================================
// AUDIO — calmer, smoother, more rounded envelopes
// ============================================
class AudioEngine {
  constructor() {
    this.ctx = null; this.masterGain = null; this.noiseBuffer = null;
    this.lastBellTime = 0; this.lastReturnTime = 0;
  }
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = settings.get('volume') / 100;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(0.2);
    } catch (e) {}
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) {
    if (!this.masterGain || !this.ctx) return;
    const gain = Math.max(0, Math.min(1, v / 100));
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.linearRampToValueAtTime(gain, now + 0.08);
  }
  createNoiseBuffer(d) {
    if (!this.ctx) return null;
    const n = Math.floor(this.ctx.sampleRate * d);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
  noiseSrc() {
    if (!this.ctx || !this.noiseBuffer) return null;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuffer; return s;
  }
  play(type) {
    const st = settings.get('soundType');
    if (st === 'off' || !st) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    this.resume();
    const now = this.ctx.currentTime;
    if (type === 'key') this.playKey(st, now);
    else if (type === 'bell' && settings.get('bellEnabled')) this.playBell(now);
    else if (type === 'return' && settings.get('carriageEnabled')) this.playReturn(now);
  }
  // Smoother envelope — exponential ramp with shorter peak
  _oscBurst(now, freq, peakGain, attack, decay, type = 'sine', freqEnd) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(freqEnd, now + decay * 0.5);
    const g = this.ctx.createGain();
    // Soft attack, exponential decay (much smoother than before)
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peakGain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    osc.connect(g).connect(this.masterGain);
    osc.start(now);
    osc.stop(now + attack + decay + 0.02);
  }
  _noiseBurst(now, freq, q, peakGain, attack, decay) {
    const src = this.noiseSrc(); if (!src) return null;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = freq; filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peakGain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
    src.connect(filt).connect(g).connect(this.masterGain);
    src.start(now);
    src.stop(now + attack + decay + 0.02);
    return { src, filt, g };
  }
  playKey(s, now) {
    switch (s) {
      case 'click': this.soundClick(now); break;
      case 'typewriter': this.soundTypewriter(now); break;
      case 'royal': this.soundRoyal(now); break;
      case 'thock': this.soundThock(now); break;
      case 'soft': this.soundSoft(now); break;
    }
  }
  // CLICK: gentle, smooth, rounded — no harsh attack
  soundClick(now) {
    const vel = 0.55 + Math.random() * 0.20;
    this._noiseBurst(now, 3500, 1.0, vel * 0.35, 0.002, 0.025);
    this._oscBurst(now, 380, vel * 0.08, 0.003, 0.045, 'sine', 280);
  }
  // TYPEWRITER: layered but softer
  soundTypewriter(now) {
    const vel = 0.55 + Math.random() * 0.25;
    const pv = 0.96 + Math.random() * 0.08;
    this._noiseBurst(now, 3000 * pv, 1.3, vel * 0.4, 0.002, 0.030);
    this._oscBurst(now, 170 * pv, vel * 0.40, 0.003, 0.110, 'sine', 80 * pv);
    this._oscBurst(now, 400 * pv, vel * 0.20, 0.003, 0.080, 'sine', 270 * pv);
    this._oscBurst(now, 2100 * pv, vel * 0.13, 0.004, 0.090, 'triangle', 1500 * pv);
  }
  // ROYAL: heavier but rounded
  soundRoyal(now) {
    const vel = 0.65 + Math.random() * 0.20;
    const pv = 0.97 + Math.random() * 0.06;
    this._oscBurst(now, 90 * pv, vel * 0.55, 0.004, 0.180, 'sine', 48 * pv);
    this._oscBurst(now, 185 * pv, vel * 0.28, 0.003, 0.130, 'sine', 105 * pv);
    this._noiseBurst(now, 2800, 1.6, vel * 0.30, 0.002, 0.020);
    this._oscBurst(now, 1880 * pv, vel * 0.16, 0.005, 0.260, 'triangle');
  }
  // THOCK: deep, rounded
  soundThock(now) {
    const vel = 0.60 + Math.random() * 0.25;
    const pv = 0.94 + Math.random() * 0.12;
    this._oscBurst(now, 135 * pv, vel * 0.55, 0.004, 0.090, 'sine', 70 * pv);
    this._oscBurst(now, 275 * pv, vel * 0.28, 0.003, 0.070, 'sine', 155 * pv);
    this._noiseBurst(now, 2200, 2.2, vel * 0.22, 0.002, 0.018);
  }
  // SOFT: very gentle membrane
  soundSoft(now) {
    const vel = 0.45 + Math.random() * 0.20;
    const pv = 0.96 + Math.random() * 0.08;
    const src = this.noiseSrc(); if (!src) return;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 650 * pv; lp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vel * 0.40, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.064);
    src.connect(lp).connect(g).connect(this.masterGain);
    src.start(now); src.stop(now + 0.07);
  }
  // BELL: clean chime with rounded attack
  playBell(now) {
    if (now - this.lastBellTime < 0.3) return;
    this.lastBellTime = now;
    this._noiseBurst(now, 3300, 2.5, 0.14, 0.002, 0.012);
    [{ f: 1180, g: 0.22, d: 0.85 },
     { f: 1770, g: 0.14, d: 0.65 },
     { f: 2620, g: 0.10, d: 0.55 },
     { f: 3680, g: 0.06, d: 0.40 },
     { f: 4920, g: 0.03, d: 0.25 }].forEach(p => {
      this._oscBurst(now, p.f, p.g, 0.003, p.d, 'sine');
    });
  }
  // CARRIAGE RETURN: smoother whirr + ding
  playReturn(now) {
    if (now - this.lastReturnTime < 0.3) return;
    this.lastReturnTime = now;
    this._oscBurst(now, 78, 0.32, 0.004, 0.150, 'sine', 42);
    const src = this.noiseSrc(); if (src) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(520, now);
      lp.frequency.exponentialRampToValueAtTime(170, now + 0.20);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.30, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.210);
      src.connect(lp).connect(g).connect(this.masterGain);
      src.start(now); src.stop(now + 0.23);
    }
    const ba = now + 0.22;
    [{ f: 1180, g: 0.20, d: 0.7 },
     { f: 1770, g: 0.12, d: 0.5 },
     { f: 2620, g: 0.07, d: 0.4 }].forEach(p => this._oscBurst(ba, p.f, p.g, 0.004, p.d, 'sine'));
  }
  test() {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    this.resume();
    if (settings.get('soundType') === 'off') { this.playBell(this.ctx.currentTime); return; }
    this.play('key');
    setTimeout(() => this.play('key'), 110);
    setTimeout(() => this.play('return'), 300);
    setTimeout(() => this.play('key'), 620);
    setTimeout(() => this.play('bell'), 820);
  }
}
let audio;

// ============================================
// DOCUMENTS
// ============================================
class DocumentStore {
  constructor() {
    this.docs = []; this.currentId = null;
    this.history = []; this.historyIndex = -1;
    this.maxHistory = 80; this._suspendHistory = false;
    this.load();
  }
  load() {
    try {
      const saved = localStorage.getItem('tw-docs');
      if (saved) {
        const data = JSON.parse(saved);
        this.docs = data.docs || [];
        this.currentId = data.currentId;
      }
    } catch (e) {}
    if (this.docs.length === 0) {
      this.create('Welcome to Typewriter Web',
        '<h1>Welcome to Typewriter Web</h1><p>This is a distraction-free writing space with <strong>rich text editing</strong>, images, tables, and more. All your work is saved locally in your browser — nothing leaves this device.</p><p>You can use the toolbar above to format text, add images, or insert tables. Use Ctrl+1/2/3 for headings, Ctrl+B for bold, Ctrl+I for italic.</p><p>Try the Focus mode with <em>Ctrl+.</em> for a clean writing environment.</p>');
    } else if (!this.docs.find(d => d.id === this.currentId)) {
      this.currentId = this.docs[0].id;
    }
  }
  save() {
    try {
      localStorage.setItem('tw-docs', JSON.stringify({
        docs: this.docs, currentId: this.currentId, lastModified: Date.now()
      }));
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        if (typeof ui !== 'undefined') ui.notify('error', 'Storage full. Export and clear old documents.');
      }
    }
  }
  get current() { return this.docs.find(d => d.id === this.currentId); }
  create(title, html) {
    const now = Date.now();
    const doc = { id: now.toString(36) + Math.random().toString(36).slice(2, 6),
      title: title || 'Untitled', content: html || '',
      created: now, modified: now, wordCount: countWords(html || '') };
    this.docs.unshift(doc); this.currentId = doc.id; this.save(); this.resetHistory(doc.content);
    return doc;
  }
  update(html, title) {
    if (!this.current) return;
    if (this.current.content !== html) { this.current.content = html; this.current.wordCount = countWords(html); }
    if (title !== undefined && this.current.title !== title) this.current.title = title;
    this.current.modified = Date.now(); this.save();
  }
  select(id) { const d = this.docs.find(x => x.id === id); if (d) { this.currentId = id; this.save(); this.resetHistory(d.content); } }
  delete(id) {
    const i = this.docs.findIndex(d => d.id === id); if (i === -1) return;
    this.docs.splice(i, 1);
    if (this.currentId === id) { this.currentId = this.docs[0]?.id || null; if (!this.currentId) this.create(); }
    this.save();
  }
  rename(id, t) { const d = this.docs.find(x => x.id === id); if (d) { d.title = t || 'Untitled'; d.modified = Date.now(); this.save(); } }
  resetHistory(c) { this._suspendHistory = true; this.history = [c || '']; this.historyIndex = 0; this._suspendHistory = false; }
  pushHistory(c) {
    if (this._suspendHistory) return;
    if (this.history[this.historyIndex] === c) return;
    if (this.historyIndex >= this.history.length - 1) { this.history.push(c); this.historyIndex = this.history.length - 1; }
    else { this.history = this.history.slice(0, this.historyIndex + 1); this.history.push(c); this.historyIndex++; }
    if (this.history.length > this.maxHistory) { this.history.shift(); this.historyIndex--; }
  }
  undo() { if (this.historyIndex > 0) { this.historyIndex--; return this.history[this.historyIndex]; } return null; }
  redo() { if (this.historyIndex < this.history.length - 1) { this.historyIndex++; return this.history[this.historyIndex]; } return null; }
  exportAll() { return { app: 'Typewriter Web', version: CONFIG.version, exported: new Date().toISOString(), docs: this.docs }; }
  importAll(d) {
    if (!d || !Array.isArray(d.docs)) throw new Error('Invalid file format');
    this.docs = d.docs; this.currentId = this.docs[0]?.id || null;
    if (!this.currentId) this.create(); this.save();
    if (typeof stats !== 'undefined') stats.rebaseAll();
  }
}
let docs;

// ============================================
// STATS
// ============================================
class StatsTracker {
  constructor() {
    this.sessionStart = Date.now();
    this.dailyWords = parseInt(localStorage.getItem('tw-daily-words') || '0', 10);
    this.dailyDate = localStorage.getItem('tw-daily-date');
    this.wordCounts = {}; this._saveTimer = null;
    this.rebaseAll(); this.checkDaily();
  }
  rebaseAll() { this.wordCounts = {}; if (typeof docs !== 'undefined') docs.docs.forEach(d => { this.wordCounts[d.id] = d.wordCount || 0; }); }
  checkDaily() {
    const today = new Date().toDateString();
    if (this.dailyDate !== today) { this.dailyWords=0; this.dailyDate=today; this.rebaseAll(); localStorage.setItem('tw-daily-date', today); localStorage.setItem('tw-daily-words','0'); }
  }
  update(docId, wc) {
    if (!docId) return;
    const old = this.wordCounts[docId] ?? 0;
    if (wc > old) { this.dailyWords += (wc - old); this._scheduleSave(); }
    this.wordCounts[docId] = wc;
  }
  _scheduleSave() { clearTimeout(this._saveTimer); this._saveTimer = setTimeout(() => { try { localStorage.setItem('tw-daily-words', this.dailyWords.toString()); } catch (e) {} }, 2000); }
  getSessionTime() { return Math.floor((Date.now() - this.sessionStart) / 1000); }
}
let stats;

// ============================================
// PAGINATION (visual only)
// ============================================
class Pagination {
  constructor() { this.pages = []; this.currentPage = 0; this._lastText = null; }
  computeCapacity() {
    const fontSize = parseFloat(settings.get('fontSize'));
    const lineHeight = parseFloat(settings.get('lineHeight'));
    const paperWidth = parseFloat(settings.get('paperWidth'));
    const paperHeight = 1100;
    const padding = 120;
    const lineHeightPx = fontSize * lineHeight;
    const linesPerPage = Math.max(8, Math.floor((paperHeight - padding - 40) / lineHeightPx));
    const charWidth = fontSize * 0.6;
    const charsPerLine = Math.max(40, Math.floor((paperWidth - 120) / charWidth));
    return { linesPerPage, charsPerLine, charsPerPage: Math.max(800, linesPerPage * charsPerLine) };
  }
  // Estimate pages from plain text content (stripped HTML)
  rebuild(html) {
    const text = htmlToText(html || '');
    if (text === this._lastText && this.pages.length > 0) return;
    this._lastText = text;
    const cap = this.computeCapacity();
    const pages = []; let pos = 0;
    if (!text) {
      pages.push({ start: 0, end: 0, text: '', preview: '' });
    } else {
      while (pos < text.length) {
        const remaining = text.length - pos;
        let endPos = remaining <= cap.charsPerPage ? text.length : this._findBreakPoint(text, pos, pos + cap.charsPerPage);
        if (endPos <= pos) endPos = Math.min(text.length, pos + cap.charsPerPage);
        const pt = text.slice(pos, endPos);
        pages.push({ start: pos, end: endPos, text: pt, preview: pt.trim().split('\n')[0].slice(0, 40) });
        pos = endPos;
        if (pages.length > 9999) break;
      }
    }
    this.pages = pages;
    if (this.currentPage >= pages.length) this.currentPage = Math.max(0, pages.length - 1);
  }
  _findBreakPoint(text, start, idealEnd) {
    const cap = this.computeCapacity();
    const max = Math.min(text.length, start + Math.floor(cap.charsPerPage * 1.2));
    for (let i = idealEnd; i > start + 100; i--) if (text[i] === '\n' && text[i + 1] === '\n') return i + 2;
    for (let i = idealEnd; i > start + 50; i--) { const c = text[i]; if ((c === '.' || c === '!' || c === '?') && text[i + 1] === ' ') return i + 2; }
    for (let i = idealEnd; i > start; i--) if (text[i] === ' ' || text[i] === '\n') return i + 1;
    return Math.min(max, idealEnd);
  }
  getPageContaining(globalPos) {
    for (let i = 0; i < this.pages.length; i++) if (globalPos >= this.pages[i].start && globalPos < this.pages[i].end) return i;
    return Math.max(0, this.pages.length - 1);
  }
}
function htmlToText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  // Convert <br> and block elements to newlines
  tmp.querySelectorAll('br').forEach(b => b.replaceWith(document.createTextNode('\n')));
  tmp.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, tr').forEach(b => {
    b.appendChild(document.createTextNode('\n'));
  });
  return (tmp.innerText || tmp.textContent || '').replace(/\n{3,}/g, '\n\n');
}
let pagination;

// ============================================
// EDITOR — rich-text contenteditable
// ============================================
class Editor {
  constructor() {
    this.textarea = $('#editor'); // hidden data mirror
    this.paperStack = $('#paperStack');
    this.editorEl = null;
    this._lastTap = 0;
    this._suspendInput = false;
    this._renderDebounce = debounce(() => this.repaginate(), 100);
    this._setupListeners();
  }
  _setupListeners() {
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.paper-editor-input')) this._onInput();
    });
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.paper-editor-input') && e.key === 'Enter') audio.play('return');
    }, true);
    // Focus editor on click anywhere inside paper
    this.paperStack.addEventListener('mousedown', (e) => {
      const pageEl = e.target.closest && e.target.closest('.paper-page');
      if (!pageEl) return;
      if (pageEl.dataset.page !== '0') {
        e.preventDefault();
        const first = this.paperStack.querySelector('.paper-page[data-page="0"]');
        if (first) {
          first.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setTimeout(() => this.editorEl && this.editorEl.focus(), 200);
        }
        return;
      }
      if (e.target !== this.editorEl) {
        setTimeout(() => this.editorEl && this.editorEl.focus(), 0);
      }
    });
    // Paste handler — sanitize pasted HTML, allow images
    document.addEventListener('paste', (e) => {
      if (!this.editorEl || !this.editorEl.contains(document.activeElement) && document.activeElement !== this.editorEl) return;
      const items = e.clipboardData;
      if (!items) return;
      // If there are images in clipboard, handle them
      const imageItems = Array.from(items.items || []).filter(it => it.type && it.type.startsWith('image/'));
      if (imageItems.length > 0) {
        e.preventDefault();
        imageItems.forEach(it => {
          const blob = it.getAsFile();
          if (blob) this._insertImageFromBlob(blob);
        });
        return;
      }
      // For HTML/Text paste — let browser handle but sanitize
      // (browser will strip <style>, scripts, etc. by default)
    });
  }
  _insertImageFromBlob(blob) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      this.insertImage(dataUrl);
    };
    reader.readAsDataURL(blob);
  }
  get value() {
    return this.editorEl ? (this.editorEl.innerHTML || '') : (this.textarea.value || '');
  }
  set value(html) {
    const h = html || '';
    this.textarea.value = h;
    if (this.editorEl) {
      this._suspendInput = true;
      this.editorEl.innerHTML = h;
      this._suspendInput = false;
    }
    pagination.rebuild(h);
  }
  focus() {
    if (!this.editorEl) return;
    this.editorEl.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.toString().length === 0) {
      const r = document.createRange();
      r.selectNodeContents(this.editorEl);
      r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }
  }
  render() {
    const html = docs.current ? (docs.current.content || '') : (this.textarea.value || '');
    pagination.rebuild(html);
    let caret = 0, wasFocused = false;
    if (this.editorEl && document.activeElement === this.editorEl) {
      caret = this._getCaretOffset(this.editorEl); wasFocused = true;
    }
    this.paperStack.innerHTML = '';
    const total = Math.max(1, pagination.pages.length);
    for (let i = 0; i < total; i++) {
      const isActive = i === pagination.currentPage;
      const p = el('div', { class: 'paper-page' + (isActive ? ' active' : ''), 'data-page': String(i) });
      p.append(
        el('div', { class: 'paper-page-margin-left' }),
        el('div', { class: 'paper-page-margin-right' }),
        el('div', { class: 'paper-page-texture' }),
        el('div', { class: 'paper-page-guide' + (settings.get('pageGuide') ? ' visible' : '') })
      );
      const c = el('div', {
        class: 'paper-page-content' + (i === 0 ? ' paper-editor-input' : ' paper-page-content-readonly'),
        contenteditable: i === 0 ? 'true' : 'false',
        spellcheck: 'true',
        'data-placeholder': PLACEHOLDER_TEXT,
        autocorrect: 'on', autocapitalize: 'on', autocomplete: 'on',
        role: 'textbox', 'aria-multiline': 'true'
      });
      if (i === 0) c.innerHTML = html;
      p.append(c);
      p.append(el('div', { class: 'paper-page-num' }, `— ${i + 1} —`));
      this.paperStack.appendChild(p);
    }
    this.editorEl = this.paperStack.querySelector('.paper-editor-input');
    if (wasFocused && this.editorEl) {
      this.editorEl.focus();
      setTimeout(() => this._setCaretOffset(this.editorEl, caret), 0);
    }
    if (typeof ui !== 'undefined') { ui.updatePageIndicator(); ui.renderPageJumper(); }
    this.updatePosition();
  }
  repaginate() {
    const html = this.value;
    pagination.rebuild(html);
    const total = Math.max(1, pagination.pages.length);
    const currentTotal = this.paperStack.querySelectorAll('.paper-page').length;
    if (total !== currentTotal) this.render();
  }
  _getCaretOffset(root) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 0;
    const r = sel.getRangeAt(0);
    if (!root.contains(r.startContainer)) return 0;
    const pre = document.createRange();
    pre.setStart(root, 0); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length;
  }
  _setCaretOffset(root, offset) {
    const stack = [root]; let remaining = offset;
    while (stack.length) {
      const n = stack.pop();
      if (n.nodeType === Node.TEXT_NODE) {
        const len = n.nodeValue.length;
        if (remaining <= len) {
          const r = document.createRange(); r.setStart(n, remaining); r.collapse(true);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          return true;
        }
        remaining -= len;
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        for (let i = n.childNodes.length - 1; i >= 0; i--) stack.push(n.childNodes[i]);
      }
    }
    const r = document.createRange(); r.selectNodeContents(root); r.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    return false;
  }
  _onInput() {
    if (this._suspendInput) return;
    const html = this.editorEl ? (this.editorEl.innerHTML || '') : '';
    const text = htmlToText(html);
    this.textarea.value = html;
    if (!docs.current) return;
    docs.update(html);
    docs.pushHistory(html);
    audio.play('key');
    this.triggerTap();
    this._renderDebounce();
    const caretOffset = this._getCaretOffset(this.editorEl);
    const newPage = pagination.getPageContaining(caretOffset);
    if (newPage !== pagination.currentPage) pagination.currentPage = newPage;
    if (typeof ui !== 'undefined') {
      ui.updatePageIndicator();
      ui.updateStats();
      ui.renderPageJumper();
      ui.refreshToolbarState();
    }
    stats.update(docs.current.id, countWords(html));
    this.updateSaveStatus('typing');
    this.updatePosition();
  }
  triggerTap() {
    if (!settings.get('strikeAnim')) return;
    const now = performance.now();
    if (now - this._lastTap < 120) return;
    this._lastTap = now;
    const ap = this.paperStack.querySelector('.paper-page.active');
    if (!ap) return;
    ap.classList.remove('tap'); void ap.offsetWidth; ap.classList.add('tap');
    setTimeout(() => ap.classList.remove('tap'), 60);
  }
  updatePosition() {
    if (!this.editorEl) return;
    const text = htmlToText(this.editorEl.innerHTML || '');
    const caretOffset = this._getCaretOffset(this.editorEl);
    let line = 1, col = 1;
    for (let i = 0; i < caretOffset; i++) { if (text[i] === '\n') { line++; col = 1; } else col++; }
    const $e1 = $('#lineNum'); if ($e1) $e1.textContent = line;
    const $e2 = $('#colNum'); if ($e2) $e2.textContent = col;
  }
  updateSaveStatus(state) {
    const e = $('#saveStatus'); if (!e || state !== 'typing') return;
    e.textContent = '● Saving…';
    e.classList.add('saving');
    clearTimeout(this._saveTO);
    this._saveTO = setTimeout(() => {
      e.textContent = '✓ Saved';
      e.classList.remove('saving');
      if (typeof ui !== 'undefined') { ui.updateDocTabs(); ui.updateDocList(); }
    }, 800);
  }
  onSettingsChange() {
    let c = 0, w = false;
    if (this.editorEl && document.activeElement === this.editorEl) { c = this._getCaretOffset(this.editorEl); w = true; }
    this.render();
    if (w && this.editorEl) { this.editorEl.focus(); setTimeout(() => this._setCaretOffset(this.editorEl, c), 0); }
  }
  setCursorToPage(idx) {
    if (idx !== 0 || !this.editorEl) return;
    this.editorEl.focus();
    const page = pagination.pages[0];
    if (page) this._setCaretOffset(this.editorEl, page.start);
  }
  refresh() { this.render(); }

  // ============== FORMATTING COMMANDS ==============
  exec(cmd, val) {
    if (!this.editorEl) return;
    this.editorEl.focus();
    document.execCommand(cmd, false, val);
    this._onInput();
  }
  toggleInline(tag) {
    this.exec(tag);
  }
  toggleBlock(tag) {
    this.exec('formatBlock', '<' + tag + '>');
    this._onInput();
  }
  align(value) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    this.editorEl.focus();
    document.execCommand('justify' + value, false);
    this._onInput();
  }
  insertHTML(html) {
    this.editorEl.focus();
    document.execCommand('insertHTML', false, html);
    this._onInput();
  }
  insertImage(src, alt = '') {
    const safeAlt = escapeHtml(alt || 'Image');
    this.insertHTML(`<img src="${escapeHtml(src)}" alt="${safeAlt}" />`);
  }
  insertTable(rows, cols) {
    let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;"><tbody>';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<td style="border:1px solid var(--paper-line);padding:8px;min-width:40px;min-height:24px;">&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p>&nbsp;</p>';
    this.insertHTML(html);
  }
  insertLink() {
    const url = prompt('Enter URL:', 'https://');
    if (url) this.exec('createLink', url);
  }
  bulletList() { this.exec('insertUnorderedList'); }
  numberedList() { this.exec('insertOrderedList'); }
  outdent() { this.exec('outdent'); }
  indent() { this.exec('indent'); }
  removeFormat() { this.exec('removeFormat'); }

  // Returns formatting state at current selection: {bold, italic, underline, h1, ...}
  getFormatState() {
    const states = {};
    try {
      states.bold = document.queryCommandState('bold');
      states.italic = document.queryCommandState('italic');
      states.underline = document.queryCommandState('underline');
      states.strike = document.queryCommandState('strikeThrough');
      // For block, we need to walk up to find block ancestor
      let n = window.getSelection()?.anchorNode;
      while (n && n !== this.editorEl) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          const tag = n.tagName.toLowerCase();
          if (['h1','h2','h3','h4','p','blockquote','pre'].includes(tag)) { states.block = tag; break; }
        }
        n = n.parentNode;
      }
      if (!states.block) states.block = 'p';
    } catch (e) { states.block = 'p'; }
    return states;
  }
}
let editor;

// ============================================
// EXPORT — DocX (HTML-based, real .docx content)
// ============================================
function exportDocx(title, htmlContent) {
  // Build a minimal but valid Word doc using HTML; not a true OOXML .docx but
  // a .docx extension on an HTML file works in Word/Google Docs (it'll import).
  // For a real OOXML we'd need a zip library. HTML-in-.docx is a pragmatic
  // solution that opens everywhere.
  const docHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: 'Courier Prime', 'Courier New', monospace; font-size: 11pt; line-height: 1.5; }
  h1, h2, h3 { color: #000; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #888; padding: 6pt; }
  img { max-width: 100%; height: auto; }
</style>
</head><body>
<h1>${escapeHtml(title)}</h1>
${htmlContent || '<p></p>'}
</body></html>`;
  return docHtml;
}

// ============================================
// DOCX EXPORT (proper Office Open XML using JSZip fallback / or HTML-in-docx)
// We'll provide both .docx (HTML-based, works everywhere) and .pdf via print
// ============================================

// ============================================
// CONFIRM MODAL
// ============================================
let _confirmCallback = null;
function showConfirm(title, msg, onConfirm) {
  const m = $('#confirmModal');
  if (m.classList.contains('open')) { m.classList.remove('open'); _confirmCallback = null; }
  $('#confirmTitle').textContent = title; $('#confirmMessage').textContent = msg;
  _confirmCallback = onConfirm; m.classList.add('open');
}
function closeConfirm() { $('#confirmModal').classList.remove('open'); _confirmCallback = null; }

// ============================================
// UI
// ============================================
class UI {
  constructor() {
    this._celebrated = false; this._focusTimer = null; this._autoSaveInterval = null;
    this._setupConfirmHandlers();
    this.setupListeners();
    this.populateThemes();
    this.populateFontSelects();
    this.populateSoundSelects();
    this.applySettings();
    this.renderDocTabs();
    this.renderDocList();
    this.applyPanelStates();  // restore panel collapsed state
    this.loadCurrentDoc();
    this.updateStats();
    this.startSessionTimer();
    this.setupAutoSaveTimer();
    this.updateAppInfo();
    setInterval(() => stats.checkDaily(), 60000);
    // Track selection changes for toolbar state
    document.addEventListener('selectionchange', () => {
      if (editor && editor.editorEl && document.activeElement === editor.editorEl) {
        this.refreshToolbarState();
      }
    });
  }
  _setupConfirmHandlers() {
    $('#confirmOk').addEventListener('click', () => { const cb = _confirmCallback; closeConfirm(); if (cb) cb(); });
    $('#confirmCancel').addEventListener('click', closeConfirm);
    $('#confirmBackdrop').addEventListener('click', closeConfirm);
    $('#confirmCloseBtn').addEventListener('click', closeConfirm);
  }
  setupListeners() {
    // Settings
    $('#settingsBtn').addEventListener('click', () => this.toggleSettings(true));
    $('#closeSettingsBtn').addEventListener('click', () => this.toggleSettings(false));
    $('#settingsPanel').addEventListener('click', (e) => { if (e.target.id === 'settingsPanel') this.toggleSettings(false); });

    // Panel toggles - collapsed by default
    $('#docListBtn')?.addEventListener('click', () => this.togglePanel('left'));
    $('#statsBtn')?.addEventListener('click', () => this.togglePanel('right'));
    $('#panelLeftToggle')?.addEventListener('click', () => this.togglePanel('left'));
    $('#panelRightToggle')?.addEventListener('click', () => this.togglePanel('right'));
    $('#newDocSidebarBtn')?.addEventListener('click', () => this.createNewDoc());

    // Theme + settings (settings-panel controls only — theme uses the swatch grid)
    $('#fontSelectS').addEventListener('change', (e) => { settings.set('fontFamily', e.target.value); this.applyFont(); editor.onSettingsChange(); });
    $('#fontSizeSlider').addEventListener('input', (e) => { const v=parseInt(e.target.value,10); settings.set('fontSize',v); $('#fontSizeValue').textContent=v+'px'; this.applyFont(); editor.onSettingsChange(); });
    $('#lineHeightSlider').addEventListener('input', (e) => { const v=parseFloat(e.target.value); settings.set('lineHeight',v); $('#lineHeightValue').textContent=v.toFixed(1); this.applyFont(); editor.onSettingsChange(); });
    $('#pageWidthSlider').addEventListener('input', (e) => { const v=parseInt(e.target.value,10); settings.set('paperWidth',v); $('#pageWidthValue').textContent=v+'px'; document.documentElement.style.setProperty('--paper-width',v+'px'); editor.onSettingsChange(); });
    $('#soundSelectS').addEventListener('change', (e) => { settings.set('soundType', e.target.value); });
    $('#volumeSliderS').addEventListener('input', (e) => { const v=parseInt(e.target.value,10); settings.set('volume',v); $('#volumeValue').textContent=v+'%'; audio.setVolume(v); });
    $('#bellToggle').addEventListener('change', (e) => settings.set('bellEnabled', e.target.checked));
    $('#carriageToggle').addEventListener('change', (e) => settings.set('carriageEnabled', e.target.checked));
    $('#testSoundBtn').addEventListener('click', () => { audio.init(); audio.resume(); setTimeout(()=>audio.test(),60); });
    $('#cplInput').addEventListener('input', (e) => { settings.set('charsPerLine', parseInt(e.target.value,10)); $('#cplValue').textContent=e.target.value; });
    $('#pageGuideToggle').addEventListener('change', (e) => { settings.set('pageGuide', e.target.checked); document.querySelectorAll('.paper-page-guide').forEach(g => g.classList.toggle('visible', e.target.checked)); });
    $('#strikeAnimToggle').addEventListener('change', (e) => settings.set('strikeAnim', e.target.checked));

    $('#goalInput').addEventListener('change', (e) => { settings.set('goal', parseInt(e.target.value,10)||0); this._celebrated=false; this.updateStats(); });
    $('#setGoalBtn').addEventListener('click', () => { const v=parseInt($('#goalInput').value,10)||0; settings.set('goal',v); this._celebrated=false; this.updateStats(); this.notify(v>0?'success':'info', v>0?`Goal set to ${v} words!`:'Goal cleared'); });
    $('#autoSaveToggle').addEventListener('change', (e) => { settings.set('autoSave', e.target.checked); this.setupAutoSaveTimer(); });
    $('#autoSaveInterval').addEventListener('input', (e) => { settings.set('autoSaveInterval', parseInt(e.target.value,10)); $('#autoSaveValue').textContent=e.target.value+'s'; this.setupAutoSaveTimer(); });

    // Top bar actions
    $('#newDocBtn').addEventListener('click', () => this.createNewDoc());
    $('#undoBtn').addEventListener('click', () => this.undo());
    $('#redoBtn').addEventListener('click', () => this.redo());
    $('#fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
    $('#pagePrevBtn').addEventListener('click', () => this.goToPrevPage());
    $('#pageNextBtn').addEventListener('click', () => this.goToNextPage());
    $('#pageJumpBtn').addEventListener('click', () => this.showPageJumper());
    $('#exportBtn').addEventListener('click', () => this.openExport());
    $('#printBtn').addEventListener('click', () => window.print());
    $('#goalBtn').addEventListener('click', () => this.openGoalModal());

    // Formatting toolbar
    $('#fmtBold').addEventListener('click', () => editor.exec('bold'));
    $('#fmtItalic').addEventListener('click', () => editor.exec('italic'));
    $('#fmtUnderline').addEventListener('click', () => editor.exec('underline'));
    $('#fmtStrike').addEventListener('click', () => editor.exec('strikeThrough'));
    $('#fmtH1').addEventListener('click', () => editor.toggleBlock('h1'));
    $('#fmtH2').addEventListener('click', () => editor.toggleBlock('h2'));
    $('#fmtH3').addEventListener('click', () => editor.toggleBlock('h3'));
    $('#fmtP').addEventListener('click', () => editor.toggleBlock('p'));
    $('#fmtQuote').addEventListener('click', () => editor.toggleBlock('blockquote'));
    $('#fmtAlignLeft').addEventListener('click', () => editor.align('Left'));
    $('#fmtAlignCenter').addEventListener('click', () => editor.align('Center'));
    $('#fmtAlignRight').addEventListener('click', () => editor.align('Right'));
    $('#fmtAlignJustify').addEventListener('click', () => editor.align('Full'));
    $('#fmtBullet').addEventListener('click', () => editor.bulletList());
    $('#fmtNumbered').addEventListener('click', () => editor.numberedList());
    $('#fmtIndent').addEventListener('click', () => editor.indent());
    $('#fmtOutdent').addEventListener('click', () => editor.outdent());
    $('#fmtClear').addEventListener('click', () => editor.removeFormat());
    $('#fmtLink').addEventListener('click', () => editor.insertLink());

    // Image insert
    $('#fmtImage').addEventListener('click', () => {
      const input = el('input', { type: 'file', accept: 'image/*' });
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          // Resize image to reasonable dimensions before storing
          resizeImage(reader.result, 1200, (resized) => {
            editor.insertImage(resized, f.name);
            this.notify('success', 'Image inserted');
          });
        };
        reader.readAsDataURL(f);
      };
      input.click();
    });

    // Table insert
    $('#fmtTable').addEventListener('click', () => this.showTablePicker());

    // Data management
    $('#exportAllBtn').addEventListener('click', () => this.exportAllJson());
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => this.importJson(e.target.files[0]));
    $('#exportPlainBtn').addEventListener('click', () => this.exportAllText());
    $('#clearAllBtn').addEventListener('click', () => showConfirm('Clear All Documents?', 'This will permanently delete all your documents. This cannot be undone.',
      () => { docs.docs=[]; stats.rebaseAll(); docs.create(); editor.value=''; this.renderDocList(); this.renderDocTabs(); this.updateStats(); this.renderPageJumper(); this.notify('success','All documents cleared'); }));
    $('#resetSettingsBtn').addEventListener('click', () => showConfirm('Reset All Settings?', 'This will restore all settings to defaults.',
      () => { settings.reset(); this.applySettings(); this.populateThemes(); this.applyFont(); editor.onSettingsChange(); this.applyPanelStates(); this.notify('success','Settings reset'); }));

    // Export modal
    $('#closeExportBtn').addEventListener('click', () => this.closeExport());
    $('#exportBackdrop').addEventListener('click', () => this.closeExport());
    $('#exportTxtBtn').addEventListener('click', () => this.exportTxt());
    $('#exportMdBtn').addEventListener('click', () => this.exportMd());
    $('#exportDocxBtn').addEventListener('click', () => this.exportDocx());
    $('#exportHtmlBtn').addEventListener('click', () => this.exportHtml());
    $('#copyTextBtn').addEventListener('click', () => this.copyToClipboard());
    $('#printDocBtn').addEventListener('click', () => { this.closeExport(); window.print(); });
    $('#shareDocBtn').addEventListener('click', () => this.shareDoc());

    // Goal modal
    $('#closeGoalBtn').addEventListener('click', () => this.closeGoalModal());
    $('#goalBackdrop').addEventListener('click', () => this.closeGoalModal());
    $$('.goal-preset').forEach(b => b.addEventListener('click', () => {
      $$('.goal-preset').forEach(x => x.classList.remove('active')); b.classList.add('active');
      $('#goalCustomInput').value = b.dataset.goal;
    }));
    $('#goalSetBtn').addEventListener('click', () => {
      const v = parseInt($('#goalCustomInput').value, 10);
      if (v > 0) { settings.set('goal', v); $('#goalInput').value = v; this._celebrated=false; this.updateStats(); this.notify('success',`Goal set to ${v} words!`); this.closeGoalModal(); }
      else { this.notify('warning','Please enter a positive number'); }
    });

    // Doc events
    $('#docTabs').addEventListener('click', (e) => this.handleTabClick(e));
    $('#docList').addEventListener('click', (e) => this.handleDocListClick(e));
    $('#pageJumpInput')?.addEventListener('change', (e) => this.jumpToPage(parseInt(e.target.value, 10)));
    $('#pageJumpInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.jumpToPage(parseInt(e.target.value, 10)); e.target.blur(); } });

    // Shortcuts
    document.addEventListener('keydown', (e) => this.handleShortcuts(e));
    document.addEventListener('mousemove', () => {
      if (document.body.classList.contains('focus-mode')) {
        document.body.classList.add('show-ui');
        clearTimeout(this._focusTimer);
        this._focusTimer = setTimeout(() => document.body.classList.remove('show-ui'), 2000);
      }
    });

    // PWA install
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installPromptEvent = e; $('#installPrompt').classList.remove('hidden'); });
    $('#installAccept').addEventListener('click', async () => {
      if (this.installPromptEvent) {
        this.installPromptEvent.prompt();
        try { const { outcome } = await this.installPromptEvent.userChoice; if (outcome === 'accepted') this.notify('success','Installed!'); } catch (e) {}
        this.installPromptEvent = null; $('#installPrompt').classList.add('hidden');
      }
    });
    $('#installDismiss').addEventListener('click', () => $('#installPrompt').classList.add('hidden'));

    window.addEventListener('online', () => this.notify('success','Back online'));
    window.addEventListener('offline', () => this.notify('warning','Offline — works locally'));
  }

  populateThemes() {
    const themes = ['classic','white','paper','dark','sepia','midnight','forest','retro','blueprint','cyberpunk','newspaper','vintage'];
    const grid = $('#themeGrid'); if (!grid) return; grid.innerHTML = '';
    themes.forEach(t => {
      const sw = el('div', { class: `theme-swatch sw-${t}` + (settings.get('theme') === t ? ' active' : ''), title: t, onclick: () => this.setTheme(t) });
      sw.innerHTML = '<div class="theme-swatch-bg"></div><div class="theme-swatch-preview">AaBb</div>';
      grid.appendChild(sw);
    });
  }
  populateFontSelects() {
    const fonts = [
      ["'Inter', -apple-system, sans-serif", 'Inter (Sans)'],
      ["Georgia, 'Times New Roman', serif", 'Georgia (Serif)'],
      ["'Courier Prime', monospace", 'Courier Prime'],
      ["'Special Elite', monospace", 'Special Elite'],
      ["'IBM Plex Mono', monospace", 'IBM Plex Mono'],
      ["'JetBrains Mono', monospace", 'JetBrains Mono'],
      ["'VT323', monospace", 'VT323 (Pixel)']
    ];
    [$('#fontSelect'), $('#fontSelectS')].forEach(sel => {
      if (!sel) return; sel.innerHTML = '';
      fonts.forEach(([v, label]) => { const opt = el('option', { value: v }, label); if (v === settings.get('fontFamily')) opt.selected = true; sel.appendChild(opt); });
    });
  }
  populateSoundSelects() {
    const sounds = [['off','Off (Muted)'],['click','Click'],['typewriter','Typewriter'],['royal','Royal'],['thock','Thock'],['soft','Soft']];
    [$('#soundSelect'), $('#soundSelectS')].forEach(sel => {
      if (!sel) return; sel.innerHTML = '';
      sounds.forEach(([v, label]) => { const opt = el('option', { value: v }, label); if (v === settings.get('soundType')) opt.selected = true; sel.appendChild(opt); });
    });
  }
  applySettings() {
    this.setTheme(settings.get('theme'));
    const sV = (s,v) => { const e=$(s); if(e) e.value=v; };
    const sT = (s,v) => { const e=$(s); if(e) e.textContent=v; };
    const sC = (s,v) => { const e=$(s); if(e) e.checked=v; };
    sV('#fontSelect', settings.get('fontFamily')); sV('#fontSelectS', settings.get('fontFamily'));
    sV('#fontSizeSelect', settings.get('fontSize')); sV('#fontSizeSlider', settings.get('fontSize'));
    sT('#fontSizeValue', settings.get('fontSize') + 'px');
    sV('#lineHeightSlider', settings.get('lineHeight')); sT('#lineHeightValue', settings.get('lineHeight').toFixed(1));
    sV('#pageWidthSlider', settings.get('paperWidth')); sT('#pageWidthValue', settings.get('paperWidth') + 'px');
    document.documentElement.style.setProperty('--paper-width', settings.get('paperWidth') + 'px');
    sV('#volumeSlider', settings.get('volume')); sV('#volumeSliderS', settings.get('volume')); sT('#volumeValue', settings.get('volume') + '%');
    sC('#bellToggle', settings.get('bellEnabled')); sC('#carriageToggle', settings.get('carriageEnabled'));
    sV('#cplInput', settings.get('charsPerLine')); sT('#cplValue', settings.get('charsPerLine'));
    sC('#pageGuideToggle', settings.get('pageGuide'));
    sC('#strikeAnimToggle', settings.get('strikeAnim'));
    sV('#goalInput', settings.get('goal'));
    sC('#autoSaveToggle', settings.get('autoSave'));
    sV('#autoSaveInterval', settings.get('autoSaveInterval')); sT('#autoSaveValue', settings.get('autoSaveInterval') + 's');
    this.applyFont();
  }
  applyFont() {
    document.documentElement.style.setProperty('--font-family', settings.get('fontFamily'));
    document.documentElement.style.setProperty('--font-size', settings.get('fontSize') + 'px');
    document.documentElement.style.setProperty('--line-height', settings.get('lineHeight'));
  }

  // Panel state restoration + toggles
  applyPanelStates() {
    const $left = $('#panelLeftCollapse');
    const $right = $('#panelRightCollapse');
    if ($left) $left.classList.toggle('collapsed', !!settings.get('panelLeftCollapsed'));
    if ($right) $right.classList.toggle('collapsed', !!settings.get('panelRightCollapsed'));
  }
  togglePanel(which) {
    if (which === 'left') {
      const $el = $('#panelLeftCollapse');
      const collapsed = $el.classList.toggle('collapsed');
      settings.set('panelLeftCollapsed', collapsed);
    } else {
      const $el = $('#panelRightCollapse');
      const collapsed = $el.classList.toggle('collapsed');
      settings.set('panelRightCollapsed', collapsed);
    }
  }

  setTheme(theme) {
    document.body.dataset.theme = theme;
    settings.set('theme', theme);
    const $ts = $('#themeSelect'); if ($ts) $ts.value = theme;
    document.querySelectorAll('.theme-swatch').forEach(s => { s.classList.toggle('active', s.classList.contains('sw-' + theme)); });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors = { classic:'#2c2825', white:'#ffffff', paper:'#d4c5a0', dark:'#0f0f0f', sepia:'#3a2e1f', midnight:'#0a1929', forest:'#1a2e1a', retro:'#000', blueprint:'#0a1f3a', cyberpunk:'#0d001a', newspaper:'#1a1a1a', vintage:'#2d1f15' };
      meta.content = colors[theme] || '#2c2825';
    }
    if (typeof editor !== 'undefined') editor.refresh();
  }
  toggleSettings(open) {
    const p = $('#settingsPanel'); if (!p) return;
    if (open === undefined) p.classList.toggle('open'); else p.classList.toggle('open', open);
  }
  toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{}); else document.exitFullscreen?.();
  }
  createNewDoc() {
    docs.create(); editor.value = '';
    this.renderDocList(); this.renderDocTabs(); this.updateStats(); this.renderPageJumper();
    setTimeout(() => editor.focus(), 50); this.notify('success','New document created');
  }
  loadCurrentDoc() {
    const d = docs.current; if (!d || !editor) return;
    editor.value = d.content || ''; pagination.currentPage = 0;
    this.renderDocList(); this.renderDocTabs(); this.renderPageJumper();
    setTimeout(() => { try { editor.focus(); editor.updatePosition(); } catch (e) {} }, 100);
  }
  renderDocTabs() {
    const c = $('#docTabs'); if (!c) return; c.innerHTML = '';
    docs.docs.slice(0, 10).forEach(doc => {
      const isActive = doc.id === docs.currentId;
      const t = el('div', { class: 'doc-tab' + (isActive ? ' active' : ''), 'data-id': doc.id });
      t.append(el('span', { class: 'doc-tab-name', title: doc.title }, doc.title||'Untitled'),
               el('span', { class: 'doc-tab-close', title: 'Close' }, '×'));
      c.appendChild(t);
    });
  }
  renderDocList() {
    const l = $('#docList'); if (!l) return; l.innerHTML = '';
    const dc = $('#docCount'); if (dc) dc.textContent = docs.docs.length;
    docs.docs.forEach(doc => {
      const item = el('div', { class: 'doc-item' + (doc.id === docs.currentId ? ' active' : ''), 'data-id': doc.id });
      const info = el('div', { class: 'doc-item-info' });
      info.append(el('div', { class: 'doc-item-title', title: doc.title }, doc.title||'Untitled'),
                  el('div', { class: 'doc-item-meta' }, `${doc.wordCount} words · ${formatDate(doc.modified)}`));
      const actions = el('div', { class: 'doc-item-actions' });
      actions.append(el('button', { class: 'doc-item-action', title: 'Rename' }, '✎'),
                     el('button', { class: 'doc-item-action', title: 'Delete' }, '🗑'));
      item.append(info, actions); l.appendChild(item);
    });
  }

  // ============== PAGE NAVIGATION (TOP BAR) ==============
  renderPageJumper() {
    const total = Math.max(1, pagination.pages.length);
    const cur = pagination.currentPage + 1;
    const $e2 = $('#pageTotal'); if ($e2) $e2.textContent = total;
    const $e3 = $('#pageProgressText'); if ($e3) $e3.textContent = Math.round((cur/total)*100) + '%';
    const $e4 = $('#statusPageInfo'); if ($e4) $e4.textContent = `${cur} of ${total}`;
    const $ji = $('#pageJumpInput'); if ($ji && document.activeElement !== $ji) { $ji.max = total; $ji.value = cur; }
    document.querySelectorAll('.paper-page').forEach((p, i) => p.classList.toggle('active', i === pagination.currentPage));
  }
  goToPrevPage() {
    const target = Math.max(0, pagination.currentPage - 1);
    pagination.currentPage = target;
    this.renderPageJumper();
    const pageEl = document.querySelector(`#paperStack [data-page="${target}"]`);
    if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (target === 0) editor.setCursorToPage(0);
  }
  goToNextPage() {
    const target = Math.min(pagination.pages.length - 1, pagination.currentPage + 1);
    pagination.currentPage = target;
    this.renderPageJumper();
    const pageEl = document.querySelector(`#paperStack [data-page="${target}"]`);
    if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (target === 0) editor.setCursorToPage(0);
  }
  jumpToPage(idx) {
    if (isNaN(idx) || idx < 1) idx = 1;
    if (idx > pagination.pages.length) idx = pagination.pages.length;
    pagination.currentPage = idx - 1;
    this.renderPageJumper();
    const pageEl = document.querySelector(`#paperStack [data-page="${pagination.currentPage}"]`);
    if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (pagination.currentPage === 0) editor.setCursorToPage(0);
  }
  showPageJumper() {
    const input = $('#pageJumpInput');
    if (input) { input.focus(); input.select(); }
  }

  updatePageIndicator() { this.renderPageJumper(); }

  handleTabClick(e) {
    const t = e.target.closest('.doc-tab'); if (!t) return;
    const id = t.dataset.id;
    if (e.target.classList.contains('doc-tab-close')) {
      e.stopPropagation();
      showConfirm('Delete Document?', 'Are you sure you want to delete this document?', () => {
        docs.delete(id); editor.refresh(); this.renderDocList(); this.renderDocTabs(); this.renderPageJumper(); this.updateStats(); this.notify('success','Document deleted');
      });
      return;
    }
    docs.select(id); this.loadCurrentDoc(); this.renderDocTabs(); this.renderDocList();
  }
  handleDocListClick(e) {
    const item = e.target.closest('.doc-item'); if (!item) return;
    const id = item.dataset.id;
    if (e.target.title === 'Delete') {
      showConfirm('Delete Document?', 'Are you sure you want to delete this document?', () => {
        docs.delete(id); stats.rebaseAll(); editor.refresh(); this.renderDocList(); this.renderDocTabs(); this.renderPageJumper(); this.updateStats(); this.notify('success','Document deleted');
      });
      return;
    }
    if (e.target.title === 'Rename') {
      const doc = docs.docs.find(d => d.id === id);
      if (doc) { const nt = prompt('Rename document:', doc.title); if (nt !== null) { docs.rename(id, nt.trim()||'Untitled'); this.renderDocList(); this.renderDocTabs(); } }
      return;
    }
    docs.select(id); this.loadCurrentDoc(); this.renderDocTabs(); this.renderDocList();
  }

  // ============== FORMATTING TOOLBAR STATE ==============
  refreshToolbarState() {
    if (!editor || !editor.editorEl) return;
    try {
      const st = editor.getFormatState();
      const setActive = (id, active) => {
        const $b = $(id); if ($b) $b.classList.toggle('active', !!active);
      };
      setActive('#fmtBold', st.bold);
      setActive('#fmtItalic', st.italic);
      setActive('#fmtUnderline', st.underline);
      setActive('#fmtStrike', st.strike);
      setActive('#fmtH1', st.block === 'h1');
      setActive('#fmtH2', st.block === 'h2');
      setActive('#fmtH3', st.block === 'h3');
      setActive('#fmtP', st.block === 'p');
      setActive('#fmtQuote', st.block === 'blockquote');
    } catch (e) {}
  }

  // ============== TABLE PICKER ==============
  showTablePicker() {
    const m = $('#tableModal'); if (!m) return;
    const grid = $('#tableGrid'); grid.innerHTML = '';
    let sel = { rows: 2, cols: 2 };
    const label = $('#tableSizeLabel');
    const buildGrid = () => {
      grid.innerHTML = '';
      for (let r = 1; r <= 8; r++) {
        for (let c = 1; c <= 8; c++) {
          const cell = el('div', {
            class: 'table-cell-pick' + (r <= sel.rows && c <= sel.cols ? ' active' : ''),
            'data-r': r, 'data-c': c,
            onclick: () => { sel = { rows: r, cols: c }; label.textContent = `${r} × ${c}`; buildGrid(); }
          });
          grid.appendChild(cell);
        }
      }
      label.textContent = `${sel.rows} × ${sel.cols}`;
    };
    buildGrid();
    m.classList.add('open');
    $('#tableCancelBtn').onclick = () => m.classList.remove('open');
    $('#tableInsertBtn').onclick = () => {
      m.classList.remove('open');
      editor.insertTable(sel.rows, sel.cols);
    };
  }

  // ============== STATS / UI ==============
  updateStats() {
    const d = docs.current;
    const html = d?.content || '';
    const wordCount = countWords(html);
    const charCount = htmlToText(html).length;
    const readingMin = Math.ceil(wordCount / 200);
    const $wc = $('#wordCount'); if ($wc) $wc.textContent = wordCount.toLocaleString();
    const $cc = $('#charCount'); if ($cc) $cc.textContent = charCount.toLocaleString();
    const $st = $('#statToday'); if ($st) $st.textContent = stats.dailyWords.toLocaleString();
    const goal = settings.get('goal');
    const $sg = $('#statGoal'); if ($sg) $sg.textContent = `${stats.dailyWords}/${goal}`;
    const pct = goal > 0 ? Math.min(100, (stats.dailyWords / goal) * 100) : 0;
    const $gp = $('#goalProgress'); if ($gp) $gp.style.width = pct + '%';
    const totalWords = docs.docs.reduce((s, d) => s + (d.wordCount || 0), 0);
    const $tot = $('#statTotal'); if ($tot) $tot.textContent = totalWords.toLocaleString();
    const $rd = $('#statReading'); if ($rd) $rd.textContent = readingMin + 'm';
    const goalReached = goal > 0 && stats.dailyWords >= goal;
    if (goalReached && !this._celebrated) { this._celebrated = true; this.notify('success','🎉 Daily goal reached!'); }
    else if (!goalReached) this._celebrated = false;
  }
  startSessionTimer() {
    setInterval(() => {
      const t = stats.getSessionTime();
      const eT = $('#statTime'); if (!eT) return;
      if (t < 3600) eT.textContent = String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0');
      else eT.textContent = formatTime(t).slice(0,5);
    }, 1000);
  }
  setupAutoSaveTimer() {
    if (this._autoSaveInterval) clearInterval(this._autoSaveInterval);
    const ms = Math.max(5, settings.get('autoSaveInterval')) * 1000;
    this._autoSaveInterval = setInterval(() => { if (settings.get('autoSave') && docs.docs.length > 0) docs.save(); }, ms);
  }
  updateAppInfo() { const $av = $('#appVersion'); if ($av) $av.textContent = CONFIG.version; const $avs = $('#appVersionS'); if ($avs) $avs.textContent = CONFIG.version; }
  openExport() {
    const $em = $('#exportModal'); if ($em) $em.classList.add('open');
    const $et = $('#exportTitle'); if ($et) $et.textContent = `Export "${docs.current?.title || 'Document'}"`;
  }
  closeExport() { $('#exportModal')?.classList.remove('open'); }
  openGoalModal() { $('#goalModal')?.classList.add('open'); const $ci = $('#goalCustomInput'); if ($ci) $ci.value = settings.get('goal'); }
  closeGoalModal() { $('#goalModal')?.classList.remove('open'); }

  // ============== EXPORTS ==============
  exportTxt() {
    if (!docs.current) return;
    downloadFile(slugify(docs.current.title) + '.txt', htmlToText(docs.current.content));
    this.closeExport(); this.notify('success','Exported as TXT');
  }
  exportMd() {
    if (!docs.current) return;
    // Convert simple HTML to markdown
    const md = htmlToMarkdown(docs.current.content);
    downloadFile(slugify(docs.current.title) + '.md', md, 'text/markdown');
    this.closeExport(); this.notify('success','Exported as Markdown');
  }
  exportDocx() {
    if (!docs.current) return;
    const content = exportDocx(docs.current.title, docs.current.content);
    downloadFile(slugify(docs.current.title) + '.docx', content, 'application/vnd.ms-word');
    this.closeExport(); this.notify('success','Exported as Word document');
  }
  exportHtml() {
    if (!docs.current) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(docs.current.title)}</title>
<style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}
h1,h2,h3{color:#111} table{border-collapse:collapse;width:100%} td,th{border:1px solid #ccc;padding:8px}
img{max-width:100%}</style></head><body><h1>${escapeHtml(docs.current.title)}</h1>${docs.current.content || ''}</body></html>`;
    downloadFile(slugify(docs.current.title) + '.html', html, 'text/html');
    this.closeExport(); this.notify('success','Exported as HTML');
  }
  async copyToClipboard() {
    if (!docs.current) return;
    try { await navigator.clipboard.writeText(htmlToText(docs.current.content)); }
    catch (e) { try { document.execCommand('copy'); } catch (err) {} }
    this.closeExport(); this.notify('success','Copied to clipboard');
  }
  async shareDoc() {
    if (!docs.current) return;
    if (navigator.share) { try { await navigator.share({ title: docs.current.title, text: htmlToText(docs.current.content) }); } catch (e) {} }
    else this.copyToClipboard();
  }
  exportAllJson() { downloadFile('typewriter-web-export.json', JSON.stringify(docs.exportAll(), null, 2), 'application/json'); this.notify('success','Exported all documents'); }
  exportAllText() {
    let txt = `Typewriter Web Export - ${new Date().toLocaleString()}\n` + '='.repeat(60) + '\n\n';
    docs.docs.forEach(d => { txt += `\n# ${d.title}\n(${d.wordCount} words · modified ${formatDate(d.modified)})\n\n${htmlToText(d.content)}\n\n` + '-'.repeat(60) + '\n'; });
    downloadFile('typewriter-web-all.txt', txt, 'text/plain');
    this.notify('success','Exported all as text');
  }
  importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.docs || !Array.isArray(data.docs)) throw new Error('Invalid file structure');
        showConfirm('Import Documents?', 'This will replace all your current documents. Continue?',
          () => {
            try { docs.importAll(data); editor.refresh(); this.renderDocList(); this.renderDocTabs(); this.renderPageJumper(); this.updateStats(); this.notify('success',`Imported ${data.docs.length} documents`); }
            catch (err) { this.notify('error','Import failed: ' + err.message); }
          });
      } catch (err) { this.notify('error','Import failed: invalid JSON'); }
    };
    reader.onerror = () => this.notify('error','Failed to read file');
    reader.readAsText(file); $('#importFile').value = '';
  }

  undo() {
    const v = docs.undo();
    if (v !== null) { editor.value = v; docs.update(v); this.updateStats(); this.renderPageJumper(); editor.updatePosition(); }
  }
  redo() {
    const v = docs.redo();
    if (v !== null) { editor.value = v; docs.update(v); this.updateStats(); this.renderPageJumper(); editor.updatePosition(); }
  }

  notify(type, message) {
    const icons = { success:'✓', warning:'⚠', error:'✕', info:'ⓘ' };
    const container = $('#notifications'); if (!container) return;
    const n = el('div', { class: `notification ${type}` });
    n.append(el('span', { class: 'notification-icon' }, icons[type] || 'ⓘ'),
             el('span', { class: 'notification-text' }, message));
    container.appendChild(n);
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 300); }, 3000);
  }

  handleShortcuts(e) {
    const inEditor = editor.editorEl && document.activeElement === editor.editorEl;
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); docs.save(); this.notify('success','Saved'); }
      else if (k === 'n') { e.preventDefault(); this.createNewDoc(); }
      else if (k === 'p') { e.preventDefault(); window.print(); }
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
      else if (k === 'e') { e.preventDefault(); this.openExport(); }
      else if (k === ',') { e.preventDefault(); this.toggleSettings(true); }
      else if (k === '.') { e.preventDefault(); document.body.classList.toggle('focus-mode'); this.notify('info','Focus mode toggled'); }
      else if (k === 'b') { e.preventDefault(); editor.exec('bold'); }
      else if (k === 'i') { e.preventDefault(); editor.exec('italic'); }
      else if (k === 'u') { e.preventDefault(); editor.exec('underline'); }
      else if (k === 'k') { e.preventDefault(); editor.insertLink(); }
      else if (k === 'arrowup' && inEditor) { e.preventDefault(); this.goToPrevPage(); }
      else if (k === 'arrowdown' && inEditor) { e.preventDefault(); this.goToNextPage(); }
      else if (e.altKey && k === '1') { e.preventDefault(); editor.toggleBlock('h1'); }
      else if (e.altKey && k === '2') { e.preventDefault(); editor.toggleBlock('h2'); }
      else if (e.altKey && k === '3') { e.preventDefault(); editor.toggleBlock('h3'); }
      else if (e.altKey && k === '0') { e.preventDefault(); editor.toggleBlock('p'); }
    } else if (e.key === 'Escape') {
      if ($('#settingsPanel')?.classList.contains('open')) this.toggleSettings(false);
      else if ($('#exportModal')?.classList.contains('open')) this.closeExport();
      else if ($('#goalModal')?.classList.contains('open')) this.closeGoalModal();
      else if ($('#confirmModal')?.classList.contains('open')) closeConfirm();
      else if ($('#tableModal')?.classList.contains('open')) $('#tableModal').classList.remove('open');
      else if (document.body.classList.contains('focus-mode')) { document.body.classList.remove('focus-mode'); this.notify('info','Focus mode exited'); }
    }
  }
}
let ui;

// ============================================
// HTML → Markdown (basic)
// ============================================
function htmlToMarkdown(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  let md = '';
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) { md += node.textContent; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(c => '').join(''); // placeholder
    if (tag === 'h1') md += '\n\n# '; if (tag === 'h2') md += '\n\n## ';
    if (tag === 'h3') md += '\n\n### '; if (tag === 'strong' || tag === 'b') md += '**';
    if (tag === 'em' || tag === 'i') md += '*'; if (tag === 'u') md += '__';
    if (tag === 'code') md += '`'; if (tag === 'a') md += '[';
    if (tag === 'br') md += '  \n';
    if (tag === 'p') md += '\n\n';
    if (tag === 'li') md += '\n- ';
    if (tag === 'ul' || tag === 'ol') md += '\n';
    if (tag === 'img') md += `![${node.alt || ''}](${node.src || ''})`;
    if (tag === 'a') { node.childNodes.forEach(walk); md += `](${node.href || ''})`; return; }
    node.childNodes.forEach(walk);
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') md += '\n\n';
    if (tag === 'p') md += '\n\n';
    if (tag === 'strong' || tag === 'b') md += '**';
    if (tag === 'em' || tag === 'i') md += '*';
    if (tag === 'u') md += '__';
    if (tag === 'code') md += '`';
  }
  tmp.childNodes.forEach(walk);
  return md.replace(/\n{3,}/g, '\n\n').trim();
}

// ============================================
// IMAGE RESIZE (compress before storing)
// ============================================
function resizeImage(dataUrl, maxWidth, cb) {
  const img = new Image();
  img.onload = () => {
    if (img.width <= maxWidth) { cb(dataUrl); return; }
    const scale = maxWidth / img.width;
    const w = maxWidth, h = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    cb(c.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = () => cb(dataUrl);
  img.src = dataUrl;
}

// ============================================
// BOOT
// ============================================
function boot() {
  try {
    settings = new Settings();
    audio = new AudioEngine();
    docs = new DocumentStore();
    stats = new StatsTracker();
    pagination = new Pagination();
    editor = new Editor();
    editor.render();
    ui = new UI();
    setTimeout(() => {
      const sp = $('#splash'); const app = $('#app');
      if (sp) sp.classList.add('hidden');
      if (app) app.classList.add('visible');
    }, 350);
    setTimeout(() => { try { editor.focus(); } catch (e) {} }, 700);
  } catch (err) {
    console.error('Boot failed:', err);
    const splash = $('#splash');
    if (splash) {
      splash.innerHTML = `<div class="splash-content"><div class="splash-logo" style="color:#d9534f">⚠</div><div class="splash-title">Failed to start</div><div style="color:#d9534f;font-family:monospace;font-size:12px;max-width:500px;text-align:left;background:rgba(0,0,0,0.3);padding:16px;border-radius:6px;margin-top:20px;"><strong>Error:</strong> ${err.message}<br><br>Open browser console (F12) for details.</div></div>`;
    }
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => setInterval(() => reg.update(), 60*60*1000))
      .catch(err => console.warn('SW registration failed:', err));
  });
}

function initAudioOnce() { if (audio) { audio.init(); audio.resume(); } document.removeEventListener('click', initAudioOnce); document.removeEventListener('keydown', initAudioOnce); }

window.addEventListener('DOMContentLoaded', () => {
  boot();
  document.addEventListener('click', initAudioOnce);
  document.addEventListener('keydown', initAudioOnce);
});

window.addEventListener('beforeunload', () => { try { docs?.save(); } catch (e) {} });

console.log(`%c${CONFIG.appName} v${CONFIG.version}`, 'font-size:18px;color:#8b4513;font-weight:bold;');
