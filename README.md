# ⌨ Typewriter Web

A typewriter-themed Progressive Web App for distraction-free writing — rich text formatting, images, tables, real pagination, and Word/PDF/Markdown export. 100% client-side: no accounts, no server, no tracking.

![Version](https://img.shields.io/badge/Version-1.4.0-brown)
![PWA](https://img.shields.io/badge/PWA-installable-success)
![Privacy](https://img.shields.io/badge/privacy-zero%20tracking-blue)

## Features

- Rich text: bold, italic, underline, strikethrough, headings, alignment, lists, links
- Images with resize handles and a built-in crop tool
- Tables (click-and-drag grid insert)
- Real pagination measured from actual rendered content
- Export to .docx (real Office Open XML), .pdf (via print), .txt, .md, .html
- 12 themes, configurable page background (ruled/grid/dots/blank), adjustable font/size/line-height
- Typing sound schemes, including a soothing "Calm" preset
- Focus mode with an auto-hiding header
- Installable offline PWA — everything is stored in the browser via `localStorage`

## Project structure

```
.
├── index.html      # App shell and markup
├── app.js          # All application logic (editor, pagination, export, settings, audio)
├── style.css        # Styling and themes
├── sw.js            # Service worker (offline caching)
├── manifest.json     # PWA manifest
├── icon.png          # App icon (512×512, used for all manifest sizes)
└── README.md
```

There is no build step and no dependencies — it's plain HTML/CSS/JS that runs directly in a browser.

## Local development

Because the app registers a service worker and fetches its own manifest/icons, open it through a local HTTP server rather than as a `file://` URL:

```bash
# from the project folder
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works (`npx serve`, VS Code's Live Server, etc.) — the app itself needs no build/compile step, so refreshing the browser after an edit is enough.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository (all files at the repo root, or inside a `/docs` folder — either works).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch".
4. Choose your branch (e.g. `main`) and the folder (`/` root or `/docs`), then **Save**.
5. GitHub will publish the site at `https://<your-username>.github.io/<repo-name>/`. This can take a minute or two on the first deploy.

### Notes specific to GitHub Pages

- **Relative paths**: `manifest.json`, `sw.js`, and `icon.png` are referenced with relative paths (`./`), so the app works whether it's served from the repo root or a subpath like `/repo-name/` — no changes needed.
- **HTTPS**: GitHub Pages serves over HTTPS by default, which is required for the service worker (PWA install/offline support) to register.
- **Updating after changes**: the service worker caches app files by version (see `CACHE_NAME` in `sw.js`). If you edit `app.js`/`style.css`/`index.html` and don't see changes reflected for returning visitors, bump the version string in `sw.js` — this forces the old cache to be replaced.
- **Custom domain**: optional — add a `CNAME` file to the repo root with your domain, and configure the DNS records GitHub's Pages docs specify.

## Deploying elsewhere

Since this is a static site, it can be hosted anywhere that serves static files: Netlify, Vercel, Cloudflare Pages, an S3 bucket, or your own web server. Just upload all files at the same directory level (don't separate `index.html` from `app.js`/`style.css`/`sw.js`/`manifest.json`/`icon.png` — they reference each other with relative paths) and serve over HTTPS if you want installable/offline PWA support.

## Browser support

Works in current versions of Chrome, Edge, Firefox, and Safari. PWA install prompts and offline support depend on the browser's service worker support (all major desktop and mobile browsers support this today).

## Privacy

Everything — documents, settings, stats — is stored locally in the browser via `localStorage`. Nothing is sent to a server, because there is no server. Clearing your browser's site data for this app will erase saved documents, so use the built-in **Export All (JSON)** option in Settings → Data if you want a backup.

## Credits

Developer: Tasmon Islam | Email: tasmon@outlook.com
