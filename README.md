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

## Setup

1. Deploy: push to **GitHub Pages** (Settings → Pages → deploy from `main`),
   or just open `index.html` locally / serve the folder with any static server.
2. Open the app, click the **gear (Settings)** icon, and paste a free Groq key
   (<https://console.groq.com/keys>). Click **Save key** and start chatting.

The key is stored **only in your browser** (localStorage) and is sent directly
to Groq — it is never committed to the repo. Each visitor supplies their own key.

Groq is used because it allows direct calls from the browser (CORS), so the app
works as a **pure static site** with no backend. Providers like NVIDIA block
browser calls and would require a server.

## Security

- No API key is stored in the repo. `js/config.js` ships with an empty key.
- The key you enter lives in your browser only (localStorage) and goes straight
  to Groq. Clearing your browser data removes it.

## Project structure

```
index.html            Markup (portfolio + chat UI)
css/style.css         Professional theme (light/dark)
js/app.js             App logic (streaming, vision, voice, history)
js/config.js          Runtime config incl. Groq key (committed for Pages)
js/config.example.js  Config template
```

## Built with

HTML5 · CSS3 · Vanilla JavaScript · Groq API · marked · DOMPurify · highlight.js
