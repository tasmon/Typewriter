# ⌨ Typewriter Web v1.2.1

A modern typewriter-themed Progressive Web App for distraction-free writing.

![Version](https://img.shields.io/badge/Version-1.2.1-brown)
![PWA](https://img.shields.io/badge/PWA-installable-success)
![Privacy](https://img.shields.io/badge/privacy-zero%20tracking-blue)

## ✨ What's New in v1.2.1 — MAJOR REWRITE

### 🎯 Native Cursor — Real Text Editing Experience

The biggest problem is solved! The editor is now a **true `contenteditable` surface** — same as Google Docs, Notion, or any modern web editor:

- ✅ **Click anywhere on text** — caret jumps exactly to that character
- ✅ **Click between characters** — caret sits precisely between them
- ✅ **Arrow keys** — move character-by-character, line-by-line
- ✅ **Shift+Click / Shift+Arrow** — select text naturally
- ✅ **Backspace/Delete** — deletes the actual character next to the cursor
- ✅ **Selection** — drag-select text just like any other editor
- ✅ **Browser-native spell check** — works automatically
- ✅ **Copy/Paste** — works exactly as expected
- ✅ **Undo/Redo** — captured automatically per-page

How it works: the first page contains a real `<div contenteditable="true">` element. As you type, the text flows naturally with the browser's built-in reflow. Pagination is computed for visual page indicators and stats, but the actual editing surface is one continuous native editor.

When your text overflows one page, additional `.paper-page` elements appear below as visual continuations showing your document's progress (with the editor still anchored to the first page until you Ctrl+↓ to navigate).

### 🎨 All Themes Readable — Settings Panel Fixed
- **Paper theme** now uses dark text on cream background
- **Vintage** uses warm cream text on dark cocoa
- **Newspaper** uses cream text on dark UI
- Every widget (inputs, buttons, selects, modals) uses guaranteed-contrast color variables

### 🎯 Click-to-Edit Anywhere
The entire first page is clickable text. Click directly between two letters of any word to position the cursor exactly there. Click and drag to select.

## 🚀 Quick Start

1. Open `index.html` in a browser (use `python -m http.server 8000` for PWA features)
2. Click on the page
3. Start typing — the cursor blinks **natively right where you're typing**

## ⌨ Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New document |
| `Ctrl+S` | Save |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+P` | Print / PDF |
| `Ctrl+E` | Export menu |
| `Ctrl+,` | Settings |
| `Ctrl+.` | Focus mode |
| `Ctrl+↑` / `Ctrl+↓` | Previous / Next page |
| `Esc` | Close modals / Exit focus |

## 📱 PWA

Installable on desktop & mobile, works offline, splash screen, standalone display.

## 🔒 Privacy

100% local. No servers, no tracking, no accounts. Export anytime.

## 💖 Credits

Developer: Tasmon Islam | Email: tasmon@outlook.com | v1.2.1
