# ⌨ Typewriter Web

A modern typewriter-themed Progressive Web App for distraction-free writing,
with real paginated pages, beautiful themes, and procedural typewriter sounds.

![Version](https://img.shields.io/badge/version-1.1.1-brown)
![PWA](https://img.shields.io/badge/PWA-installable-success)
![Privacy](https://img.shields.io/badge/privacy-zero%20tracking-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 📄 Real Pagination
Your text flows through real book-like pages. Pagination auto-recalculates when you change:
- Font family
- Font size
- Line spacing
- Paper width

Pages break intelligently at paragraph → sentence → word boundaries.

### 🎨 11 Built-in Themes
Classic · Paper · Dark · Sepia · Midnight · Forest · Retro Green · Blueprint · Cyberpunk · Newspaper · Vintage

All themes have **proper text contrast** on every UI element (modals, sidebars, notifications, settings).

### 🔊 6 Procedural Sound Themes
All sounds are **synthesized at runtime** via Web Audio API — no audio files needed.

| Sound | Character |
|-------|-----------|
| **Off** | Silent (default) |
| **Click** | Crisp mechanical click |
| **Typewriter** | Authentic hammer strike — 5 layered voices |
| **Royal** | Heavy desktop — sustained body + long ring |
| **Thock** | Deep, focused |
| **Soft** | Gentle membrane tap |

Plus realistic margin bell (5 inharmonic partials) and carriage return (thud + sliding whirr + ding).

### 📝 Document Management
- Multiple documents with tabs
- Auto-save to localStorage (configurable interval)
- Undo / Redo (50 steps)
- Per-document word count baselines for accurate daily goal tracking
- Daily word goal with progress bar & celebration

### 📑 Page Navigation
- Page indicator in top bar (`Page 3 of 7 · 42%`)
- Clickable page navigator in sidebar with first-line previews
- Click any page to jump to it
- **Ctrl+↑ / Ctrl+↓** — Previous / Next page
- Toolbar buttons for mouse navigation

### 📤 Export & Print
- Export single doc as **TXT** or **Markdown**
- Export all as **JSON** (backup) or combined **TXT**
- Import from JSON backup
- **Print / PDF** — uses native browser print with proper page breaks
- Copy to clipboard
- Web Share API integration

### ⌨ Keyboard Shortcuts
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

### 🎯 Focus Mode
Toggle with `Ctrl+.`. All UI fades away, mouse movement briefly shows UI.

### 📱 Progressive Web App
- **Installable** on desktop and mobile
- **Offline-first** after first load
- Splash screen
- Standalone display — feels like a native app
- App shortcuts (long-press app icon for "New Document")

### 🔒 Privacy First
- Zero servers, zero tracking
- All data stored locally in your browser
- No accounts, no signups
- Export anytime as JSON or TXT

## 🚀 Installation

### From Source
1. Clone this repository
2. Add your `icon.png` (recommended: 512×512px)
3. Serve over HTTP/HTTPS — PWA requires a secure context (localhost also works)

### Local Development
```bash
# Python 3
python -m http.server 8000

# Node.js (recommended)
npx serve

# Then open http://localhost:8000
