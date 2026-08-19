/* ========================================
   TYPEWRITER WEB v1.2.1
   Fixed: editor canvas not appearing
   Developer: Tasmon Islam
   Email: tasmon@outlook.com
   ======================================== */

'use strict';

const CONFIG = {
  version: '1.2.1',
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
  children.forEach(c => {
    if (c == null) return;
    e.append(c.nodeType ? c : document.createTextNode(c));
  });
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
function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}
const PLACEHOLDER_TEXT = "Begin typing... Click here and start writing. All your work is saved automatically.";

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
      volume: 50,
      bellEnabled: true,
      carriageEnabled: true,
      charsPerLine: 80,
      strikeAnim: false,
      pageGuide: true,
      goal: 500,
      autoSave: true,
      autoSaveInterval: 10
    };
    this.data = { ...this.defaults };
    this.load();
  }
  load() {
    try {
      const saved = localStorage.getItem('tw-settings');
      if (saved) this.data = { ...this.defaults, ...JSON.parse(saved) };
    } catch (e) { console.warn('Settings load failed', e); }
  }
  save() { try { localStorage.setItem('tw-settings', JSON.stringify(this.data)); } catch (e) {} }
  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); }
  reset() { this.data = { ...this.defaults }; this.save(); }
}
let settings;

// ============================================
// AUDIO
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
      this.noiseBuffer = this.createNoiseBuffer(0.15);
    } catch (e) { console.warn('Audio init failed', e); }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) {
    if (!this.masterGain || !this.ctx) return;
    const gain = Math.max(0, Math.min(1, v / 100));
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.linearRampToValueAtTime(gain, now + 0.05);
  }
  createNoiseBuffer(duration) {
    if (!this.ctx) return null;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  noiseSrc() {
    if (!this.ctx || !this.noiseBuffer) return null;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer; return src;
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
  _noiseBurst(now, freq, q, peakGain, decay) {
    const src = this.noiseSrc(); if (!src) return null;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = freq; filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peakGain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    src.connect(filt).connect(g).connect(this.masterGain);
    src.start(now); src.stop(now + decay + 0.02);
    return { src, filt, g };
  }
  _oscBurst(now, freq, peakGain, decay, type = 'sine', freqEnd) {
    const osc = this.ctx.createOscillator();
    osc.type = type; osc.frequency.setValueAtTime(freq, now);
    if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(freqEnd, now + decay * 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peakGain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(g).connect(this.masterGain);
    osc.start(now); osc.stop(now + decay + 0.02);
  }
  playKey(soundType, now) {
    switch (soundType) {
      case 'click': this.soundClick(now); break;
      case 'typewriter': this.soundTypewriter(now); break;
      case 'royal': this.soundRoyal(now); break;
      case 'thock': this.soundThock(now); break;
      case 'soft': this.soundSoft(now); break;
    }
  }
  soundClick(now) { const vel=0.7+Math.random()*0.3; this._noiseBurst(now,3800,1.2,vel*0.5,0.018); this._oscBurst(now,480,vel*0.10,0.03,'sine',320); this._oscBurst(now,1800,vel*0.04,0.015,'triangle',1200); }
  soundTypewriter(now) { const vel=0.65+Math.random()*0.35,pv=0.94+Math.random()*0.12; this._noiseBurst(now,3200*pv,1.5,vel*0.55,0.022); this._oscBurst(now,180*pv,vel*0.50,0.09,'sine',85*pv); this._oscBurst(now,420*pv,vel*0.25,0.07,'sine',280*pv); this._oscBurst(now,2200*pv,vel*0.18,0.08,'triangle',1500*pv); this._noiseBurst(now,1200*pv,0.8,vel*0.10,0.04); }
  soundRoyal(now) { const vel=0.75+Math.random()*0.25,pv=0.96+Math.random()*0.08; this._oscBurst(now,95*pv,vel*0.70,0.16,'sine',50*pv); this._oscBurst(now,190*pv,vel*0.35,0.12,'sine',110*pv); this._noiseBurst(now,3000,1.8,vel*0.4,0.015); this._oscBurst(now,1950*pv,vel*0.20,0.25,'triangle'); this._oscBurst(now,2900*pv,vel*0.12,0.20,'sine'); this._noiseBurst(now,400,0.5,vel*0.18,0.08); }
  soundThock(now) { const vel=0.7+Math.random()*0.3,pv=0.92+Math.random()*0.16; this._oscBurst(now,140*pv,vel*0.70,0.08,'sine',70*pv); this._oscBurst(now,280*pv,vel*0.35,0.06,'sine',160*pv); this._noiseBurst(now,2500,2.5,vel*0.30,0.012); this._noiseBurst(now,500*pv,0.6,vel*0.25,0.06); }
  soundSoft(now) { const vel=0.55+Math.random()*0.25,pv=0.95+Math.random()*0.1; const src=this.noiseSrc(); if(!src) return; const lp=this.ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=700*pv; lp.Q.value=0.7; const g=this.ctx.createGain(); g.gain.setValueAtTime(vel*0.55,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.05); src.connect(lp).connect(g).connect(this.masterGain); src.start(now); src.stop(now+0.06); }
  playBell(now) { if(now-this.lastBellTime<0.3) return; this.lastBellTime=now; this._noiseBurst(now,3500,3,0.20,0.012); this._oscBurst(now,1200,0.40,0.04,'sine',800); const p=[{f:1180,g:0.32,d:0.85},{f:1770,g:0.20,d:0.65},{f:2620,g:0.14,d:0.55},{f:3680,g:0.09,d:0.40},{f:4920,g:0.05,d:0.25}]; p.forEach(x=>this._oscBurst(now,x.f,x.g,x.d,'sine')); }
  playReturn(now) { if(now-this.lastReturnTime<0.3) return; this.lastReturnTime=now; this._oscBurst(now,80,0.45,0.14,'sine',45); const src=this.noiseSrc(); if(src){const lp=this.ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(550,now);lp.frequency.exponentialRampToValueAtTime(180,now+0.18);const g=this.ctx.createGain();g.gain.setValueAtTime(0.4,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.2);src.connect(lp).connect(g).connect(this.masterGain);src.start(now);src.stop(now+0.22);} const ba=now+0.20;[{f:1180,g:0.28,d:0.7},{f:1770,g:0.18,d:0.55},{f:2620,g:0.10,d:0.40}].forEach(p=>this._oscBurst(ba,p.f,p.g,p.d,'sine')); }
  test() { if(!this.ctx)this.init(); if(!this.ctx) return; this.resume(); const st=settings.get('soundType'); if(st==='off'){this.playBell(this.ctx.currentTime); return;} this.play('key'); setTimeout(()=>this.play('key'),100); setTimeout(()=>this.play('return'),280); setTimeout(()=>this.play('key'),600); setTimeout(()=>this.play('bell'),800); }
}
let audio;

// ============================================
// DOCUMENTS
// ============================================
class DocumentStore {
  constructor() {
    this.docs = []; this.currentId = null;
    this.history = []; this.historyIndex = -1;
    this.maxHistory = 50; this._suspendHistory = false;
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
        'Start typing your story...\n\nThis is a distraction-free writing space. All your documents are saved locally in your browser. Nothing leaves this device — you own your words.\n\nYour writing is automatically paginated like a real book. As you type, new pages appear naturally. Use the page navigator on the left, or Ctrl+Up/Ctrl+Down to jump between pages.');
    } else if (!this.docs.find(d => d.id === this.currentId)) {
      this.currentId = this.docs[0].id;
    }
  }
  save() {
    try { localStorage.setItem('tw-docs', JSON.stringify({ docs: this.docs, currentId: this.currentId, lastModified: Date.now() })); }
    catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        if (typeof ui !== 'undefined') ui.notify('error', 'Storage full. Export and delete old documents.');
      }
    }
  }
  get current() { return this.docs.find(d => d.id === this.currentId); }
  create(title = 'Untitled', content = '') {
    const now = Date.now();
    const doc = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), title: title||'Untitled', content: content||'', created: now, modified: now, wordCount: countWords(content||'') };
    this.docs.unshift(doc); this.currentId = doc.id; this.save(); this.resetHistory(doc.content); return doc;
  }
  update(content, title) {
    if (!this.current) return;
    if (this.current.content !== content) { this.current.content = content; this.current.wordCount = countWords(content); }
    if (title !== undefined && this.current.title !== title) this.current.title = title;
    this.current.modified = Date.now(); this.save();
  }
  select(id) { const doc = this.docs.find(d => d.id === id); if (doc) { this.currentId = id; this.save(); this.resetHistory(doc.content); } }
  delete(id) {
    const idx = this.docs.findIndex(d => d.id === id); if (idx === -1) return;
    this.docs.splice(idx, 1);
    if (this.currentId === id) { this.currentId = this.docs[0]?.id || null; if (!this.currentId) this.create(); }
    this.save();
  }
  rename(id, title) { const doc = this.docs.find(d => d.id === id); if (doc) { doc.title = title||'Untitled'; doc.modified = Date.now(); this.save(); } }
  resetHistory(content) { this._suspendHistory=true; this.history=[content||'']; this.historyIndex=0; this._suspendHistory=false; }
  pushHistory(content) {
    if (this._suspendHistory) return;
    if (this.history[this.historyIndex] === content) return;
    if (this.historyIndex >= this.history.length - 1) { this.history.push(content); this.historyIndex = this.history.length - 1; }
    else { this.history = this.history.slice(0, this.historyIndex + 1); this.history.push(content); this.historyIndex++; }
    if (this.history.length > this.maxHistory) { this.history.shift(); this.historyIndex--; }
  }
  undo() { if (this.historyIndex > 0) { this.historyIndex--; return this.history[this.historyIndex]; } return null; }
  redo() { if (this.historyIndex < this.history.length - 1) { this.historyIndex++; return this.history[this.historyIndex]; } return null; }
  exportAll() { return { app: 'Typewriter Web', version: CONFIG.version, exported: new Date().toISOString(), docs: this.docs }; }
  importAll(data) {
    if (!data || !Array.isArray(data.docs)) throw new Error('Invalid file format');
    this.docs = data.docs; this.currentId = this.docs[0]?.id || null;
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
    if (this.dailyDate !== today) { this.dailyWords=0; this.dailyDate=today; this.rebaseAll(); localStorage.setItem('tw-daily-date', today); localStorage.setItem('tw-daily-words', '0'); }
  }
  update(docId, wordCount) {
    if (!docId) return;
    const old = this.wordCounts[docId] ?? 0;
    if (wordCount > old) { this.dailyWords += (wordCount - old); this._scheduleSave(); }
    this.wordCounts[docId] = wordCount;
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
    const usableHeight = paperHeight - padding - 40;
    const linesPerPage = Math.max(8, Math.floor(usableHeight / lineHeightPx));
    const charWidth = fontSize * 0.6;
    const usableWidth = paperWidth - 120;
    const charsPerLine = Math.max(40, Math.floor(usableWidth / charWidth));
    return { linesPerPage, charsPerLine, charsPerPage: Math.max(800, linesPerPage * charsPerLine) };
  }
  rebuild(text) {
    if (text === this._lastText && this.pages.length > 0) return;
    this._lastText = text;
    const cap = this.computeCapacity();
    const pages = []; let pos = 0;
    if (!text) pages.push({ start: 0, end: 0, text: '', preview: '' });
    else {
      while (pos < text.length) {
        const remaining = text.length - pos;
        let endPos;
        if (remaining <= cap.charsPerPage) endPos = text.length;
        else endPos = this._findBreakPoint(text, pos, pos + cap.charsPerPage);
        if (endPos <= pos) endPos = Math.min(text.length, pos + cap.charsPerPage);
        const pageText = text.slice(pos, endPos);
        pages.push({ start: pos, end: endPos, text: pageText, preview: pageText.trim().split('\n')[0].slice(0, 40) });
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
    for (let i = 0; i < this.pages.length; i++) {
      if (globalPos >= this.pages[i].start && globalPos < this.pages[i].end) return i;
    }
    return Math.max(0, this.pages.length - 1);
  }
}
let pagination;

// ============================================
// EDITOR — REAL contenteditable. One continuous editor on page 0;
// additional pages appear as visual continuations as text grows.
// ============================================
class Editor {
  constructor() {
    this.textarea = $('#editor'); // off-screen data-source mirror
    this.paperStack = $('#paperStack');
    this.editorEl = null;
    this._lastTap = 0;
    this._suspendInput = false;
    this._renderDebounce = debounce(() => this.repaginate(), 80);
    this._setupListeners();
  }

  _setupListeners() {
    // Use a single document-level listener; works even if content is rebuilt
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('paper-page-content')) {
        this._onInput(t);
      }
    });
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('paper-page-content')) {
        if (e.key === 'Enter') audio.play('return');
        // Allow normal typing — DO NOT preventDefault
      }
    }, true);

    // Click anywhere on the first paper page → focus the contenteditable
    this.paperStack.addEventListener('mousedown', (e) => {
      const target = e.target;
      const pageEl = target.closest && target.closest('.paper-page');
      if (!pageEl) return;
      // Click on page 0 -> focus; click on continuation pages -> scroll to & focus page 0
      if (pageEl.dataset.page !== '0') {
        e.preventDefault();
        const first = this.paperStack.querySelector('.paper-page[data-page="0"]');
        if (first) {
          first.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setTimeout(() => { if (this.editorEl) this.editorEl.focus(); }, 200);
        }
        return;
      }
      // For page 0, ensure editor is the contenteditable
      if (target !== this.editorEl) {
        setTimeout(() => {
          if (this.editorEl) {
            const sel = window.getSelection();
            const range = document.createRange();
            // Place caret where user clicked (browser default), but if no range, place at end
            range.selectNodeContents(this.editorEl);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            this.editorEl.focus();
          }
        }, 0);
      }
    });
  }

  get value() {
    // Sync from contenteditable first
    return (this.editorEl ? (this.editorEl.innerText || '') : (this.textarea.value || ''));
  }

  set value(v) {
    const text = v || '';
    this.textarea.value = text;
    if (this.editorEl) {
      this._suspendInput = true;
      // Preserve as a single text node (avoids spurious <br>/<div> nodes)
      this.editorEl.textContent = text;
      this._suspendInput = false;
    }
    pagination.rebuild(text);
  }

  focus() {
    if (!this.editorEl) return;
    this.editorEl.focus();
    // Place caret at end if no existing selection
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.toString().length === 0) {
      const range = document.createRange();
      range.selectNodeContents(this.editorEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  /**
   * Build the page stack with ONE contenteditable on page 0,
   * plus empty continuation pages for visual pagination.
   * This is idempotent: it can be called multiple times safely.
   */
  render() {
    const text = docs.current ? (docs.current.content || '') : (this.textarea.value || '');
    pagination.rebuild(text);

    // Capture caret position BEFORE rebuild (to preserve user's typing spot)
    let caretOffset = 0;
    let wasFocused = false;
    if (this.editorEl && document.activeElement === this.editorEl) {
      caretOffset = this._getCaretOffset(this.editorEl);
      wasFocused = true;
    }

    // Reset paper stack
    this.paperStack.innerHTML = '';
    const total = Math.max(1, pagination.pages.length);

    for (let i = 0; i < total; i++) {
      const isActive = i === pagination.currentPage;
      const pageDiv = el('div', {
        class: 'paper-page' + (isActive ? ' active' : ''),
        'data-page': String(i)
      });
      pageDiv.append(
        el('div', { class: 'paper-page-margin-left' }),
        el('div', { class: 'paper-page-margin-right' }),
        el('div', { class: 'paper-page-texture' }),
        el('div', { class: 'paper-page-guide' + (settings.get('pageGuide') ? ' visible' : '') })
      );

      // PAGE 0 contains the contenteditable; other pages are static
      if (i === 0) {
        const editorDiv = el('div', {
          class: 'paper-page-content paper-editor-input',
          contenteditable: 'true',
          spellcheck: 'false',
          'data-placeholder': PLACEHOLDER_TEXT,
          autocorrect: 'off',
          autocapitalize: 'off',
          autocomplete: 'off',
          role: 'textbox',
          'aria-multiline': 'true'
        });
        // Fill with text using textContent (safest for plain text)
        editorDiv.textContent = text;
        pageDiv.appendChild(editorDiv);
      } else {
        // Static visual continuation (empty placeholder for now;
        // the actual rendering of "what's on this page" can be added later
        // without affecting the editing surface)
        const preview = el('div', { class: 'paper-page-content paper-page-content-readonly' });
        pageDiv.appendChild(preview);
      }

      pageDiv.append(el('div', { class: 'paper-page-num' }, `— ${i + 1} —`));
      this.paperStack.appendChild(pageDiv);
    }

    // Bind editorEl reference
    this.editorEl = this.paperStack.querySelector('.paper-paper-editor-input, .paper-editor-input');

    // Restore caret
    if (wasFocused && this.editorEl) {
      this.editorEl.focus();
      // Use setTimeout to ensure DOM has settled
      setTimeout(() => {
        if (this.editorEl) this._setCaretOffset(this.editorEl, caretOffset);
      }, 0);
    }

    if (typeof ui !== 'undefined') ui.updatePageIndicator();
    this.updatePosition();
  }

  repaginate() {
    // Called when text changes; refresh page count
    const text = this.value;
    pagination.rebuild(text);
    const total = Math.max(1, pagination.pages.length);
    const currentTotal = this.paperStack.querySelectorAll('.paper-page').length;
    if (total !== currentTotal) {
      // Rebuild page elements while preserving caret
      this.render();
    }
  }

  _getCaretOffset(rootNode) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    if (!rootNode.contains(range.startContainer)) return 0;
    const pre = document.createRange();
    pre.setStart(rootNode, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  _setCaretOffset(rootNode, offset) {
    const stack = [rootNode];
    let remaining = offset;
    while (stack.length) {
      const node = stack.pop();
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.nodeValue.length;
        if (remaining <= len) {
          const r = document.createRange();
          r.setStart(node, remaining);
          r.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
          return true;
        }
        remaining -= len;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
      }
    }
    // Fallback: place at end
    const r = document.createRange();
    r.selectNodeContents(rootNode);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return false;
  }

  _onInput(target) {
    if (this._suspendInput) return;
    // Sync from contenteditable to off-screen textarea
    const newText = target.innerText || '';
    this.textarea.value = newText;
    if (!docs.current) return;
    docs.update(newText);
    docs.pushHistory(newText);
    audio.play('key');
    this.triggerTap();
    this.checkMargin(newText);
    this._renderDebounce();
    // Detect page change (cursor jumped over page boundary)
    const caretOffset = this._getCaretOffset(this.editorEl);
    const newPage = pagination.getPageContaining(caretOffset);
    if (newPage !== pagination.currentPage) pagination.currentPage = newPage;
    if (typeof ui !== 'undefined') {
      ui.updatePageIndicator();
      ui.updateStats();
      ui.renderPageNavigator();
    }
    stats.update(docs.current.id, countWords(newText));
    this.updateSaveStatus('typing');
    this.updatePosition();
  }

  triggerTap() {
    if (!settings.get('strikeAnim')) return;
    const now = performance.now();
    if (now - this._lastTap < 120) return;
    this._lastTap = now;
    const activePage = this.paperStack.querySelector('.paper-page.active');
    if (!activePage) return;
    activePage.classList.remove('tap');
    void activePage.offsetWidth;
    activePage.classList.add('tap');
    setTimeout(() => activePage.classList.remove('tap'), 60);
  }

  checkMargin(text) {
    if (!settings.get('bellEnabled')) return;
    const cpl = settings.get('charsPerLine');
    if (!this.editorEl) return;
    const caretOffset = this._getCaretOffset(this.editorEl);
    const lastNl = text.lastIndexOf('\n', caretOffset - 1);
    const col = caretOffset - (lastNl === -1 ? 0 : lastNl + 1);
    const nearMargin = col >= cpl - 5;
    if (nearMargin && !this._wasAtMargin) audio.play('bell');
    this._wasAtMargin = nearMargin;
  }

  updatePosition() {
    if (!this.editorEl) return;
    const text = this.editorEl.innerText || '';
    const caretOffset = this._getCaretOffset(this.editorEl);
    let line = 1, col = 1;
    for (let i = 0; i < caretOffset; i++) {
      if (text[i] === '\n') { line++; col = 1; } else col++;
    }
    const $e1 = $('#lineNum'); if ($e1) $e1.textContent = line;
    const $e2 = $('#colNum'); if ($e2) $e2.textContent = col;
  }

  updateSaveStatus(state) {
    const el2 = $('#saveStatus');
    if (!el2 || state !== 'typing') return;
    el2.textContent = '● Saving...';
    el2.classList.add('saving');
    clearTimeout(this._saveTO);
    this._saveTO = setTimeout(() => {
      el2.textContent = '✓ All changes saved';
      el2.classList.remove('saving');
      if (typeof ui !== 'undefined') { ui.updateDocTabs(); ui.updateDocList(); }
    }, 800);
  }

  onSettingsChange() {
    // Save caret state
    let caret = 0; let wasFocused = false;
    if (this.editorEl && document.activeElement === this.editorEl) {
      caret = this._getCaretOffset(this.editorEl);
      wasFocused = true;
    }
    // Force repaginate
    this.render();
    if (wasFocused && this.editorEl) {
      this.editorEl.focus();
      setTimeout(() => this._setCaretOffset(this.editorEl, caret), 0);
    }
  }

  setCursorToPage(pageIdx) {
    if (pageIdx !== 0 || !this.editorEl) return;
    this.editorEl.focus();
    const page = pagination.pages[0];
    if (page) this._setCaretOffset(this.editorEl, page.start);
  }

  // Forcefully rebuild — used on doc change
  refresh() { this.render(); }
}
let editor;

// ============================================
// CONFIRM MODAL
// ============================================
let _confirmCallback = null;
function showConfirm(title, msg, onConfirm) {
  const modal = $('#confirmModal');
  if (modal.classList.contains('open')) { modal.classList.remove('open'); _confirmCallback = null; }
  $('#confirmTitle').textContent = title; $('#confirmMessage').textContent = msg;
  _confirmCallback = onConfirm; modal.classList.add('open');
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
    this.loadCurrentDoc();          // <-- THIS triggers editor.refresh() with the document content
    this.updateStats();
    this.startSessionTimer();
    this.setupAutoSaveTimer();
    this.updateAppInfo();
    setInterval(() => stats.checkDaily(), 60000);
    setInterval(() => { if (editor) editor.updatePosition(); }, 1500);
  }
  _setupConfirmHandlers() {
    $('#confirmOk').addEventListener('click', () => { const cb = _confirmCallback; closeConfirm(); if (cb) cb(); });
    $('#confirmCancel').addEventListener('click', closeConfirm);
    $('#confirmBackdrop').addEventListener('click', closeConfirm);
    $('#confirmCloseBtn').addEventListener('click', closeConfirm);
  }

  setupListeners() {
    $('#settingsBtn').addEventListener('click', () => this.toggleSettings(true));
    $('#closeSettingsBtn').addEventListener('click', () => this.toggleSettings(false));
    $('#settingsPanel').addEventListener('click', (e) => { if (e.target.id === 'settingsPanel') this.toggleSettings(false); });

    $('#docListBtn').addEventListener('click', () => this.toggleSidebar('docSidebar'));
    $('#goalSidebarClose').addEventListener('click', () => { $('#goalSidebar').classList.add('collapsed'); $('#goalSidebarShow').classList.remove('hidden'); });
    $('#goalSidebarShow').addEventListener('click', () => { $('#goalSidebar').classList.remove('collapsed'); $('#goalSidebarShow').classList.add('hidden'); });
    $('#docListShow').addEventListener('click', () => { $('#docSidebar').classList.remove('collapsed'); $('#docListShow').classList.add('hidden'); });

    $('#themeSelect').addEventListener('change', (e) => this.setTheme(e.target.value));
    $('#soundSelect').addEventListener('change', (e) => { settings.set('soundType', e.target.value); $('#soundSelectS').value = e.target.value; audio.setVolume(settings.get('volume')); });
    $('#fontSelect').addEventListener('change', (e) => { settings.set('fontFamily', e.target.value); $('#fontSelectS').value = e.target.value; this.applyFont(); editor.onSettingsChange(); });
    $('#fontSizeSelect').addEventListener('change', (e) => { const v=parseInt(e.target.value,10); settings.set('fontSize',v); $('#fontSizeSlider').value=v; $('#fontSizeValue').textContent=v+'px'; this.applyFont(); editor.onSettingsChange(); });
    $('#fontSelectS').addEventListener('change', (e) => { settings.set('fontFamily', e.target.value); $('#fontSelect').value = e.target.value; this.applyFont(); editor.onSettingsChange(); });
    $('#fontSizeSlider').addEventListener('input', (e) => { const v=parseInt(e.target.value,10); settings.set('fontSize',v); $('#fontSizeValue').textContent=v+'px'; $('#fontSizeSelect').value=v; this.applyFont(); editor.onSettingsChange(); });
    $('#lineHeightSlider').addEventListener('input', (e) => { const v=parseFloat(e.target.value); settings.set('lineHeight',v); $('#lineHeightValue').textContent=v.toFixed(1); this.applyFont(); editor.onSettingsChange(); });
    $('#pageWidthSlider').addEventListener('input', (e) => { const v=parseInt(e.target.value,10); settings.set('paperWidth',v); $('#pageWidthValue').textContent=v+'px'; document.documentElement.style.setProperty('--paper-width', v + 'px'); editor.onSettingsChange(); });
    $('#pageCountSlider')?.addEventListener('input', (e) => { const v=parseInt(e.target.value,10); settings.set('pagesPerView',v); $('#pageCountValue').textContent=v; });
    $('#soundSelectS').addEventListener('change', (e) => { settings.set('soundType', e.target.value); $('#soundSelect').value = e.target.value; });
    $('#volumeSlider').addEventListener('input', (e) => { const v=parseInt(e.target.value,10); settings.set('volume',v); $('#volumeSliderS').value=v; $('#volumeValue').textContent=v+'%'; audio.setVolume(v); });
    $('#volumeSliderS').addEventListener('input', (e) => { const v=parseInt(e.target.value,10); settings.set('volume',v); $('#volumeSlider').value=v; $('#volumeValue').textContent=v+'%'; audio.setVolume(v); });
    $('#bellToggle').addEventListener('change', (e) => settings.set('bellEnabled', e.target.checked));
    $('#carriageToggle').addEventListener('change', (e) => settings.set('carriageEnabled', e.target.checked));
    $('#testSoundBtn').addEventListener('click', () => { audio.init(); audio.resume(); setTimeout(()=>audio.test(),60); });
    $('#cplInput').addEventListener('input', (e) => { settings.set('charsPerLine', parseInt(e.target.value,10)); $('#cplValue').textContent = e.target.value; });
    $('#pageGuideToggle').addEventListener('change', (e) => { settings.set('pageGuide', e.target.checked); document.querySelectorAll('.paper-page-guide').forEach(g => g.classList.toggle('visible', e.target.checked)); });
    $('#strikeAnimToggle').addEventListener('change', (e) => settings.set('strikeAnim', e.target.checked));

    $('#goalInput').addEventListener('change', (e) => { settings.set('goal', parseInt(e.target.value,10)||0); this._celebrated=false; this.updateStats(); });
    $('#setGoalBtn').addEventListener('click', () => { const v=parseInt($('#goalInput').value,10)||0; settings.set('goal',v); this._celebrated=false; this.updateStats(); this.notify(v>0?'success':'info', v>0?`Goal set to ${v} words!`:'Goal cleared'); });
    $('#autoSaveToggle').addEventListener('change', (e) => { settings.set('autoSave', e.target.checked); this.setupAutoSaveTimer(); });
    $('#autoSaveInterval').addEventListener('input', (e) => { settings.set('autoSaveInterval', parseInt(e.target.value,10)); $('#autoSaveValue').textContent=e.target.value+'s'; this.setupAutoSaveTimer(); });

    $('#newDocBtn').addEventListener('click', () => this.createNewDoc());
    $('#newDocSidebarBtn').addEventListener('click', () => this.createNewDoc());
    $('#prevPageBtn').addEventListener('click', () => this.goToPrevPage());
    $('#nextPageBtn').addEventListener('click', () => this.goToNextPage());
    $('#exportBtn').addEventListener('click', () => this.openExport());
    $('#printBtn').addEventListener('click', () => window.print());
    $('#goalBtn').addEventListener('click', () => this.openGoalModal());
    $('#undoBtn').addEventListener('click', () => this.undo());
    $('#redoBtn').addEventListener('click', () => this.redo());
    $('#fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());

    $('#exportAllBtn').addEventListener('click', () => this.exportAllJson());
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => this.importJson(e.target.files[0]));
    $('#exportPlainBtn').addEventListener('click', () => this.exportAllText());
    $('#clearAllBtn').addEventListener('click', () => showConfirm('Clear All Documents?','This will permanently delete all your documents. This cannot be undone.', () => { docs.docs=[]; stats.rebaseAll(); docs.create(); editor.value=''; this.renderDocList(); this.renderDocTabs(); this.updateStats(); this.renderPageNavigator(); this.notify('success','All documents cleared'); }));
    $('#resetSettingsBtn').addEventListener('click', () => showConfirm('Reset All Settings?','This will restore all settings to defaults.', () => { settings.reset(); this.applySettings(); this.populateThemes(); this.applyFont(); editor.onSettingsChange(); this.notify('success','Settings reset'); }));

    $('#closeExportBtn').addEventListener('click', () => this.closeExport());
    $('#exportBackdrop').addEventListener('click', () => this.closeExport());
    $('#exportTxtBtn').addEventListener('click', () => this.exportTxt());
    $('#exportMdBtn').addEventListener('click', () => this.exportMd());
    $('#copyTextBtn').addEventListener('click', () => this.copyToClipboard());
    $('#printDocBtn').addEventListener('click', () => { this.closeExport(); window.print(); });
    $('#shareDocBtn').addEventListener('click', () => this.shareDoc());

    $('#closeGoalBtn').addEventListener('click', () => this.closeGoalModal());
    $('#goalBackdrop').addEventListener('click', () => this.closeGoalModal());
    $$('.goal-preset').forEach(b => b.addEventListener('click', () => { $$('.goal-preset').forEach(x => x.classList.remove('active')); b.classList.add('active'); $('#goalCustomInput').value = b.dataset.goal; }));
    $('#goalSetBtn').addEventListener('click', () => { const v=parseInt($('#goalCustomInput').value,10); if(v>0){settings.set('goal',v); $('#goalInput').value=v; this._celebrated=false; this.updateStats(); this.notify('success',`Goal set to ${v} words!`); this.closeGoalModal();} else {this.notify('warning','Please enter a positive number');} });

    $('#docTabs').addEventListener('click', (e) => this.handleTabClick(e));
    $('#docList').addEventListener('click', (e) => this.handleDocListClick(e));
    $('#pageNavList').addEventListener('click', (e) => this.handlePageNavClick(e));

    document.addEventListener('keydown', (e) => this.handleShortcuts(e));
    document.addEventListener('mousemove', () => {
      if (document.body.classList.contains('focus-mode')) {
        document.body.classList.add('show-ui');
        clearTimeout(this._focusTimer);
        this._focusTimer = setTimeout(() => document.body.classList.remove('show-ui'), 2000);
      }
    });

    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installPromptEvent = e; $('#installPrompt').classList.remove('hidden'); });
    $('#installAccept').addEventListener('click', async () => {
      if (this.installPromptEvent) {
        this.installPromptEvent.prompt();
        try { const { outcome } = await this.installPromptEvent.userChoice; if (outcome === 'accepted') this.notify('success','Installed!'); } catch (e) {}
        this.installPromptEvent = null; $('#installPrompt').classList.add('hidden');
      }
    });
    $('#installDismiss').addEventListener('click', () => $('#installPrompt').classList.add('hidden'));

    window.addEventListener('online', () => this.notify('success', 'Back online'));
    window.addEventListener('offline', () => this.notify('warning', 'Offline — works locally'));
  }

  populateThemes() {
    const themes = ['classic','paper','dark','sepia','midnight','forest','retro','blueprint','cyberpunk','newspaper','vintage'];
    const grid = $('#themeGrid'); if (!grid) return; grid.innerHTML = '';
    themes.forEach(t => {
      const sw = el('div', { class: `theme-swatch sw-${t}` + (settings.get('theme') === t ? ' active' : ''), title: t, onclick: () => this.setTheme(t) });
      sw.innerHTML = '<div class="theme-swatch-bg"></div><div class="theme-swatch-preview">AaBb</div>';
      grid.appendChild(sw);
    });
  }
  populateFontSelects() {
    const fonts = [
      ["'Courier Prime', monospace", 'Courier Prime'],
      ["'Special Elite', 'Courier Prime', monospace", 'Special Elite'],
      ["'IBM Plex Mono', monospace", 'IBM Plex Mono'],
      ["'JetBrains Mono', monospace", 'JetBrains Mono'],
      ["Courier New, monospace", 'Courier New'],
      ["Georgia, 'Times New Roman', serif", 'Georgia (Serif)'],
      ["'VT323', monospace", 'VT323 (Pixel)']
    ];
    [$('#fontSelect'), $('#fontSelectS')].forEach(sel => {
      if (!sel) return; sel.innerHTML = '';
      fonts.forEach(([v, label]) => { const opt = el('option', { value: v }, label); if (v === settings.get('fontFamily')) opt.selected = true; sel.appendChild(opt); });
    });
  }
  populateSoundSelects() {
    const sounds = [['off','Off (Muted)'],['click','Click'],['typewriter','Typewriter'],['royal','Royal (Heavy)'],['thock','Thock (Deep)'],['soft','Soft (Gentle)']];
    [$('#soundSelect'), $('#soundSelectS')].forEach(sel => {
      if (!sel) return; sel.innerHTML = '';
      sounds.forEach(([v, label]) => { const opt = el('option', { value: v }, label); if (v === settings.get('soundType')) opt.selected = true; sel.appendChild(opt); });
    });
  }
  applySettings() {
    this.setTheme(settings.get('theme'));
    const setVal = (s,v) => { const e=$(s); if(e) e.value=v; };
    const setText = (s,v) => { const e=$(s); if(e) e.textContent=v; };
    const setChecked = (s,v) => { const e=$(s); if(e) e.checked=v; };
    setVal('#fontSelect', settings.get('fontFamily')); setVal('#fontSelectS', settings.get('fontFamily'));
    setVal('#fontSizeSelect', settings.get('fontSize')); setVal('#fontSizeSlider', settings.get('fontSize'));
    setText('#fontSizeValue', settings.get('fontSize') + 'px');
    setVal('#lineHeightSlider', settings.get('lineHeight')); setText('#lineHeightValue', settings.get('lineHeight').toFixed(1));
    setVal('#pageWidthSlider', settings.get('paperWidth')); setText('#pageWidthValue', settings.get('paperWidth') + 'px');
    document.documentElement.style.setProperty('--paper-width', settings.get('paperWidth') + 'px');
    setVal('#volumeSlider', settings.get('volume')); setVal('#volumeSliderS', settings.get('volume')); setText('#volumeValue', settings.get('volume') + '%');
    setChecked('#bellToggle', settings.get('bellEnabled')); setChecked('#carriageToggle', settings.get('carriageEnabled'));
    setVal('#cplInput', settings.get('charsPerLine')); setText('#cplValue', settings.get('charsPerLine'));
    setChecked('#pageGuideToggle', settings.get('pageGuide'));
    setChecked('#strikeAnimToggle', settings.get('strikeAnim'));
    setVal('#goalInput', settings.get('goal'));
    setChecked('#autoSaveToggle', settings.get('autoSave'));
    setVal('#autoSaveInterval', settings.get('autoSaveInterval')); setText('#autoSaveValue', settings.get('autoSaveInterval') + 's');
    setVal('#pageCountSlider', settings.get('pagesPerView')); setText('#pageCountValue', settings.get('pagesPerView'));
    this.applyFont();
  }
  applyFont() {
    document.documentElement.style.setProperty('--font-family', settings.get('fontFamily'));
    document.documentElement.style.setProperty('--font-size', settings.get('fontSize') + 'px');
    document.documentElement.style.setProperty('--line-height', settings.get('lineHeight'));
  }
  setTheme(theme) {
    document.body.dataset.theme = theme;
    settings.set('theme', theme);
    const $ts = $('#themeSelect'); if ($ts) $ts.value = theme;
    document.querySelectorAll('.theme-swatch').forEach(s => { s.classList.toggle('active', s.classList.contains('sw-' + theme)); });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors = { classic:'#2c2825', paper:'#d4c5a0', dark:'#0f0f0f', sepia:'#3a2e1f', midnight:'#0a1929', forest:'#1a2e1a', retro:'#000', blueprint:'#0a1f3a', cyberpunk:'#0d001a', newspaper:'#1a1a1a', vintage:'#2d1f15' };
      meta.content = colors[theme] || '#2c2825';
    }
    if (typeof editor !== 'undefined') editor.refresh();
  }
  toggleSettings(open) { const panel = $('#settingsPanel'); if (!panel) return; if (open === undefined) panel.classList.toggle('open'); else panel.classList.toggle('open', open); }
  toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{}); else document.exitFullscreen?.(); }
  toggleSidebar(which) {
    const sidebar = $('#' + which); if (!sidebar) return;
    const showId = which === 'docSidebar' ? 'docListShow' : 'goalSidebarShow';
    sidebar.classList.toggle('collapsed');
    if (which === 'docSidebar') { const btn = $('#' + showId); if (btn) btn.classList.toggle('hidden', !sidebar.classList.contains('collapsed')); }
  }
  createNewDoc() {
    docs.create(); editor.value = '';
    this.renderDocList(); this.renderDocTabs(); this.updateStats(); this.renderPageNavigator();
    setTimeout(() => editor.focus(), 50);
    this.notify('success', 'New document created');
  }
  loadCurrentDoc() {
    const doc = docs.current;
    if (!doc || !editor) return;
    editor.value = doc.content || '';
    pagination.currentPage = 0;
    this.renderPageNavigator();
    // Focus on next tick — ensures the DOM has settled
    setTimeout(() => { try { editor.focus(); editor.updatePosition(); } catch (e) {} }, 100);
  }
  renderDocTabs() {
    const container = $('#docTabs'); if (!container) return; container.innerHTML = '';
    docs.docs.slice(0, 8).forEach(doc => {
      const isActive = doc.id === docs.currentId;
      const tab = el('div', { class: 'doc-tab' + (isActive ? ' active' : ''), 'data-id': doc.id });
      tab.append(el('span', { class: 'doc-tab-name', title: doc.title }, doc.title||'Untitled'), el('span', { class: 'doc-tab-close', title: 'Close' }, '×'));
      container.appendChild(tab);
    });
  }
  renderDocList() {
    const list = $('#docList'); if (!list) return; list.innerHTML = '';
    const dc = $('#docCount'); if (dc) dc.textContent = docs.docs.length;
    docs.docs.forEach(doc => {
      const item = el('div', { class: 'doc-item' + (doc.id === docs.currentId ? ' active' : ''), 'data-id': doc.id });
      const info = el('div', { class: 'doc-item-info' });
      info.append(el('div', { class: 'doc-item-title', title: doc.title }, doc.title||'Untitled'), el('div', { class: 'doc-item-meta' }, `${doc.wordCount} words · ${formatDate(doc.modified)}`));
      const actions = el('div', { class: 'doc-item-actions' });
      actions.append(el('button', { class: 'doc-item-action', title: 'Rename' }, '✎'), el('button', { class: 'doc-item-action', title: 'Delete' }, '🗑'));
      item.append(info, actions);
      list.appendChild(item);
    });
  }
  renderPageNavigator() {
    const list = $('#pageNavList'); const count = $('#pageNavCount');
    if (!list || !count) return;
    list.innerHTML = '';
    count.textContent = pagination.pages.length;
    pagination.pages.forEach((page, idx) => {
      const item = el('div', { class: 'page-nav-item' + (idx === pagination.currentPage ? ' active' : ''), 'data-page': idx, onclick: () => this.goToPage(idx) });
      item.append(el('span', { class: 'page-nav-item-num' }, `P${idx + 1}`), el('span', { class: 'page-nav-item-preview' }, page.preview || '·'));
      list.appendChild(item);
    });
  }
  handlePageNavClick(e) { const item = e.target.closest('.page-nav-item'); if (!item) return; this.goToPage(parseInt(item.dataset.page, 10)); }
  goToPage(idx) {
    if (idx < 0 || idx >= pagination.pages.length) return;
    pagination.currentPage = idx;
    this.updatePageIndicator(); this.renderPageNavigator();
    const pageEl = document.querySelector(`#paperStack [data-page="${idx}"]`);
    if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (idx === 0) editor.setCursorToPage(0);
  }
  goToPrevPage() { this.goToPage(pagination.currentPage - 1); }
  goToNextPage() { this.goToPage(pagination.currentPage + 1); }
  updatePageIndicator() {
    const total = Math.max(1, pagination.pages.length);
    const cur = pagination.currentPage + 1;
    const $e1 = $('#pageCurrent'); if ($e1) $e1.textContent = cur;
    const $e2 = $('#pageTotal'); if ($e2) $e2.textContent = total;
    const $e3 = $('#pageProgressText'); if ($e3) $e3.textContent = Math.round((cur/total)*100) + '%';
    const $e4 = $('#statusPageInfo'); if ($e4) $e4.textContent = `${cur}/${total}`;
    document.querySelectorAll('.paper-page').forEach((p, i) => p.classList.toggle('active', i === pagination.currentPage));
  }
  handleTabClick(e) {
    const tab = e.target.closest('.doc-tab'); if (!tab) return;
    const id = tab.dataset.id;
    if (e.target.classList.contains('doc-tab-close')) {
      e.stopPropagation();
      showConfirm('Delete Document?', 'Are you sure you want to delete this document?', () => { docs.delete(id); editor.refresh(); this.renderDocList(); this.renderDocTabs(); this.updateStats(); this.renderPageNavigator(); this.notify('success', 'Document deleted'); });
      return;
    }
    docs.select(id); this.loadCurrentDoc(); this.renderDocTabs(); this.renderDocList();
  }
  handleDocListClick(e) {
    const item = e.target.closest('.doc-item'); if (!item) return;
    const id = item.dataset.id;
    if (e.target.title === 'Delete') {
      showConfirm('Delete Document?', 'Are you sure you want to delete this document?', () => { docs.delete(id); stats.rebaseAll(); editor.refresh(); this.renderDocList(); this.renderDocTabs(); this.updateStats(); this.renderPageNavigator(); this.notify('success', 'Document deleted'); });
      return;
    }
    if (e.target.title === 'Rename') {
      const doc = docs.docs.find(d => d.id === id);
      if (doc) { const newTitle = prompt('Rename document:', doc.title); if (newTitle !== null) { docs.rename(id, newTitle.trim() || 'Untitled'); this.renderDocList(); this.renderDocTabs(); } }
      return;
    }
    docs.select(id); this.loadCurrentDoc(); this.renderDocTabs(); this.renderDocList();
  }
  updateStats() {
    const doc = docs.current;
    const text = doc?.content || '';
    const wordCount = countWords(text);
    const charCount = text.length;
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
    if (goalReached && !this._celebrated) { this._celebrated = true; this.notify('success', '🎉 Daily goal reached!'); }
    else if (!goalReached) this._celebrated = false;
  }
  startSessionTimer() {
    setInterval(() => {
      const t = stats.getSessionTime();
      const eT = $('#statTime'); if (!eT) return;
      if (t < 3600) eT.textContent = String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
      else eT.textContent = formatTime(t).slice(0, 5);
    }, 1000);
  }
  setupAutoSaveTimer() {
    if (this._autoSaveInterval) clearInterval(this._autoSaveInterval);
    const ms = Math.max(5, settings.get('autoSaveInterval')) * 1000;
    this._autoSaveInterval = setInterval(() => { if (settings.get('autoSave') && docs.docs.length > 0) docs.save(); }, ms);
  }
  updateAppInfo() { const $av = $('#appVersion'); if ($av) $av.textContent = CONFIG.version; const $avs = $('#appVersionS'); if ($avs) $avs.textContent = CONFIG.version; }
  openExport() { const $em = $('#exportModal'); if ($em) $em.classList.add('open'); const $et = $('#exportTitle'); if ($et) $et.textContent = `Export "${docs.current?.title || 'Document'}"`; }
  closeExport() { $('#exportModal')?.classList.remove('open'); }
  openGoalModal() { $('#goalModal')?.classList.add('open'); const $ci = $('#goalCustomInput'); if ($ci) $ci.value = settings.get('goal'); }
  closeGoalModal() { $('#goalModal')?.classList.remove('open'); }
  exportTxt() { if (!docs.current) return; downloadFile(slugify(docs.current.title)+'.txt', docs.current.content, 'text/plain'); this.closeExport(); this.notify('success', 'Exported as TXT'); }
  exportMd() { if (!docs.current) return; let md = `# ${docs.current.title}\n\n${docs.current.content}`; downloadFile(slugify(docs.current.title)+'.md', md, 'text/markdown'); this.closeExport(); this.notify('success', 'Exported as Markdown'); }
  async copyToClipboard() {
    if (!docs.current) return;
    try { await navigator.clipboard.writeText(docs.current.content); }
    catch (e) { const ta = $('#editor'); if (ta) { ta.select(); try { document.execCommand('copy'); } catch (err) {} } }
    this.closeExport(); this.notify('success', 'Copied to clipboard');
  }
  async shareDoc() {
    if (!docs.current) return;
    if (navigator.share) { try { await navigator.share({ title: docs.current.title, text: docs.current.content }); } catch (e) {} }
    else this.copyToClipboard();
  }
  exportAllJson() { downloadFile('typewriter-web-export.json', JSON.stringify(docs.exportAll(), null, 2), 'application/json'); this.notify('success', 'Exported all documents'); }
  exportAllText() {
    let txt = `Typewriter Web Export - ${new Date().toLocaleString()}\n` + '='.repeat(60) + '\n\n';
    docs.docs.forEach(d => { txt += `\n# ${d.title}\n(${d.wordCount} words · modified ${formatDate(d.modified)})\n\n${d.content}\n\n` + '-'.repeat(60) + '\n'; });
    downloadFile('typewriter-web-all.txt', txt, 'text/plain'); this.notify('success', 'Exported all as text');
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
            try { docs.importAll(data); editor.refresh(); this.renderDocList(); this.renderDocTabs(); this.updateStats(); this.renderPageNavigator(); this.notify('success', `Imported ${data.docs.length} documents`); }
            catch (err) { this.notify('error', 'Import failed: ' + err.message); }
          });
      } catch (err) { this.notify('error', 'Import failed: invalid JSON file'); }
    };
    reader.onerror = () => this.notify('error', 'Failed to read file');
    reader.readAsText(file); $('#importFile').value = '';
  }
  undo() { const v = docs.undo(); if (v !== null) { editor.value = v; docs.update(v); this.updateStats(); this.renderPageNavigator(); editor.updatePosition(); } }
  redo() { const v = docs.redo(); if (v !== null) { editor.value = v; docs.update(v); this.updateStats(); this.renderPageNavigator(); editor.updatePosition(); } }
  notify(type, message) {
    const icons = { success:'✓', warning:'⚠', error:'✕', info:'ⓘ' };
    const icon = icons[type] || 'ⓘ';
    const container = $('#notifications'); if (!container) return;
    const n = el('div', { class: `notification ${type}` });
    n.append(el('span', { class: 'notification-icon' }, icon), el('span', { class: 'notification-text' }, message));
    container.appendChild(n);
    setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 300); }, 3000);
  }
  handleShortcuts(e) {
    const inEditor = editor.editorEl && document.activeElement === editor.editorEl;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') { e.preventDefault(); docs.save(); this.notify('success', 'Saved'); }
      else if (e.key === 'n') { e.preventDefault(); this.createNewDoc(); }
      else if (e.key === 'p') { e.preventDefault(); window.print(); }
      else if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
      else if (e.key === 'e') { e.preventDefault(); this.openExport(); }
      else if (e.key === ',') { e.preventDefault(); this.toggleSettings(true); }
      else if (e.key === '.') { e.preventDefault(); document.body.classList.toggle('focus-mode'); this.notify('info', 'Focus mode toggled'); }
      else if (e.key === 'ArrowUp') { if (inEditor) { e.preventDefault(); this.goToPrevPage(); } }
      else if (e.key === 'ArrowDown') { if (inEditor) { e.preventDefault(); this.goToNextPage(); } }
    } else if (e.key === 'Escape') {
      if ($('#settingsPanel')?.classList.contains('open')) this.toggleSettings(false);
      else if ($('#exportModal')?.classList.contains('open')) this.closeExport();
      else if ($('#goalModal')?.classList.contains('open')) this.closeGoalModal();
      else if ($('#confirmModal')?.classList.contains('open')) closeConfirm();
      else if (document.body.classList.contains('focus-mode')) { document.body.classList.remove('focus-mode'); this.notify('info', 'Focus mode exited'); }
    }
  }
}
let ui;

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
    // CRITICAL: ensure the visible paper page exists BEFORE UI loads.
    // This guarantees `editor.editorEl` is set when UI calls loadCurrentDoc().
    editor.render();
    ui = new UI();
    setTimeout(() => {
      const sp = $('#splash'); const app = $('#app');
      if (sp) sp.classList.add('hidden');
      if (app) app.classList.add('visible');
    }, 400);
    setTimeout(() => { try { editor.focus(); } catch (e) {} }, 800);
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
      .then(reg => { setInterval(() => reg.update(), 60*60*1000); })
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
