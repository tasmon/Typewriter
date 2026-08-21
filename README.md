# ⌨ Typewriter Web v1.4.0

A modern typewriter-themed Progressive Web App for distraction-free writing.

![Version](https://img.shields.io/badge/Version-1.4.0-brown)
![PWA](https://img.shields.io/badge/PWA-installable-success)
![Privacy](https://img.shields.io/badge/privacy-zero%20tracking-blue)


## ✨ What's New in v1.4.0

### 📑 Real Pagination
- Page breaks are now measured from your actual rendered content, not estimated — nothing is ever clipped or hidden regardless of how much you write
- Prev/Next/jump-to-page scroll accurately to the real page boundary

### 📄 Real .docx Export
- Export now produces a genuine Office Open XML (.docx) file — opens correctly in Word, Google Docs, and LibreOffice
- Preserves headings, bold/italic/underline/strikethrough, alignment, lists, tables, and embedded images

### 🖼 Image Resize & Crop
- Click any inserted image to select it — drag the corner handle to resize, or use the S/M/L/Original quick sizes
- New **Crop** tool with a draggable, resizable crop box

### 🎨 Minimal, White-First Design
- White theme is now the default
- Decluttered top bar — fewer redundant icons, cleaner layout

### 🔇 Focus Mode, Reworked
- Top bar and toolbar now fade out on idle in Focus Mode, just like the status bar
- New **Hide Header** button fully collapses the top bar — a small tab reappears to bring it back

### 🔊 New Sound Scheme: Calm
- A soft, soothing "Calmly Writer"-style typing sound — now the default
- Typewriter sound refined for a more authentic mechanical clack

### 🧵 Configurable Page Background
- Choose the paper background style in Settings: Ruled Lines, Grid, Dotted, or Blank

## What's New in v1.3.0

### 📝 Word Processing
- **Bold, Italic, Underline, Strikethrough**
- **Headings** (H1, H2, H3, P, Blockquote)
- **Alignment** — Left, Center, Right, Justify
- **Lists** — Bullet & Numbered; Indent / Outdent
- **Links** (Ctrl+K)
- **Clear formatting**
- Ctrl+B / Ctrl+I / Ctrl+U / Alt+1 / Alt+2 / Alt+3 / Alt+0

### 🖼 Images
- Click toolbar 🖼 icon → pick file → resized + inserted inline
- **Paste images directly** from clipboard (Ctrl+V in editor)

### ⊞ Tables
- Click ⊞ icon → drag-select grid (1×1 to 8×8) → insert
- Tables become editable grids with `border-collapse: collapse`

### 🎨 New Theme: White
- Pure white background, pure black text
- Pure blue accents

### 🔊 Better Sounds (calmer)
- All sounds have **soft attack** (smooth ramp-in instead of sharp transient)
- Lower default volume (40% instead of 50%)
- Less harsh frequencies
- More natural hammer decay

### 📑 Fixed Top-Bar Page Navigation
- Prev / Next buttons actually work
- Direct page number input — type `5` and press Enter to jump to page 5
- Percentage progress shown
- Removed redundant page list from sidebar

### 📦 New Export Formats
- **.docx** — opens in Word, Google Docs, LibreOffice
- **.html** — standalone web page

### 🎯 Collapsed Panels by Default
- Both side panels start hidden
- Click the toggle button to expand
- State persisted in localStorage

### 🆕 Cleaner Status Bar
- Pill-shaped stat indicators
- Better spacing & alignment

### 🔒 Top Bar Always Visible
- Header no longer hides in focus mode

## ⌨ Keyboard Shortcuts

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
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Bold / Italic / Underline |
| `Ctrl+K` | Insert link |
| `Alt+1` / `Alt+2` / `Alt+3` | Heading 1/2/3 |
| `Alt+0` | Paragraph |
| `Esc` | Close modals |


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

Developer: Tasmon Islam | Email: tasmon@outlook.com | v1.4.0
