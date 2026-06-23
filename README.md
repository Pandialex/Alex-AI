# Alex-AI

A fast, **ChatGPT-style AI assistant** built into Alex Pandian's portfolio site.
Plain HTML / CSS / JavaScript, powered by the **Groq API** (OpenAI-compatible).

## Features

- **Streaming responses** — answers appear token-by-token like ChatGPT
- **Vision** — upload images (or snap a photo) and ask about them
- **Voice** — speak your question (mic) and have replies read aloud (auto-speak)
- **Multiple conversations** — saved locally, switchable sidebar history
- **Rich rendering** — Markdown, tables, and syntax-highlighted code blocks with copy buttons
- **Stop / Regenerate**, export chat, drag-drop & paste images, light/dark theme
- **Responsive** — clean layout on desktop and mobile

## Models (verified live on Groq, June 2026)

| Use | Model |
|-----|-------|
| Text | `openai/gpt-oss-120b` |
| Vision (images) | `meta-llama/llama-4-scout-17b-16e-instruct` |

The vision model is selected automatically when you attach an image.

## Setup (1 minute)

1. Get a free Groq key: <https://console.groq.com/keys>
2. Copy the config template and paste your key:
   ```bash
   copy js\config.example.js js\config.js   # Windows
   # cp js/config.example.js js/config.js   # macOS/Linux
   ```
   Then edit `js/config.js` and set `GROQ_API_KEY`.
3. Open `index.html` in your browser (or serve the folder with any static server).

> The same values also live in `.env` (a copy of `.env.example`) for use if you
> later add a backend. A no-build static site can't read `.env` directly, so the
> browser reads `js/config.js`.

## Security — important

- `js/config.js` and `.env` are **git-ignored**, so your key never gets committed
  to GitHub again. Only the `*.example` templates are tracked.
- **Regenerate your key** at console.groq.com/keys if it was ever committed or shared.
- ⚠️ Note: in any *static* site the key is still readable by visitors via browser
  dev-tools. To fully hide it you need a small backend proxy (e.g. Node/Express
  reading `.env`) that the frontend calls instead of Groq directly. Git-ignoring
  the key here fixes the "secret committed to repo" exposure error.

## Project structure

```
index.html            Markup (portfolio + chat UI)
css/style.css         Professional theme (light/dark)
js/app.js             App logic (streaming, vision, voice, history)
js/config.js          Your secrets  (git-ignored — create from example)
js/config.example.js  Config template (tracked)
.env / .env.example   Secret store / template
```

## Built with

HTML5 · CSS3 · Vanilla JavaScript · Groq API · marked · DOMPurify · highlight.js
