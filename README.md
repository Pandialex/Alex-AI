# Alex-AI

A fast, **ChatGPT-style AI assistant** built into Alex Pandian's portfolio site.
Plain HTML / CSS / JavaScript frontend, with a tiny **Python proxy** that talks to
the **NVIDIA API** (OpenAI-compatible) and keeps your key server-side.

## Features

- **Streaming responses** — answers appear token-by-token like ChatGPT
- **Vision** — upload images (or snap a photo) and ask about them
- **Voice** — speak your question (mic) and have replies read aloud (auto-speak)
- **Multiple conversations** — saved locally, switchable sidebar history
- **Rich rendering** — Markdown, tables, and syntax-highlighted code blocks with copy buttons
- **Stop / Regenerate**, export chat, drag-drop & paste images, light/dark theme
- **Responsive** — clean layout on desktop and mobile

## Models

| Use | Model |
|-----|-------|
| Text | `openai/gpt-oss-120b` |
| Vision (images) | `meta/llama-3.2-11b-vision-instruct` |

The vision model is selected automatically when you attach an image. The model
dropdown is also populated live from the NVIDIA `/v1/models` list, so you can
switch to any model your key can access. Change the defaults in `js/config.js`.

> Note: some NVIDIA models (e.g. `z-ai/glm-5.2`, `meta/llama-3.3-70b-instruct`)
> can be very slow or time out. The defaults above are chosen for reliable,
> fast streaming.

## Why a proxy?

NVIDIA's `integrate.api.nvidia.com` does **not** send CORS headers, so a browser
cannot call it directly (you get `Failed to fetch`). `server.py` solves this: it
serves the site and forwards `/v1/*` to NVIDIA with your key attached, so the key
never reaches the browser.

## Setup (1 minute)

Requires **Python 3** (no pip packages needed — standard library only).

1. Get a free NVIDIA key: <https://build.nvidia.com/>
2. Create your secrets and config files from the templates:
   ```bash
   copy .env.example .env                     # Windows
   copy js\config.example.js js\config.js     # Windows
   # cp .env.example .env                      # macOS/Linux
   # cp js/config.example.js js/config.js      # macOS/Linux
   ```
   Then edit `.env` and set `API_KEY` to your NVIDIA key.
3. Start the server and open the app:
   ```bash
   python server.py
   ```
   Visit <http://localhost:8000>.

> Do **not** just open `index.html` as a file — the app must be served by
> `server.py` so the `/v1` proxy is available.

## Security

- `.env` and `js/config.js` are **git-ignored**; only the `*.example` templates
  are tracked, so your key never gets committed.
- The key stays **server-side** in `.env`. The browser only talks to the local
  `/v1` proxy, so visitors never see the key in dev-tools.
- **Regenerate your key** at build.nvidia.com if it was ever committed or shared.

## Project structure

```
server.py             Static server + NVIDIA /v1 proxy (reads .env)
index.html            Markup (portfolio + chat UI)
css/style.css         Professional theme (light/dark)
js/app.js             App logic (streaming, vision, voice, history)
js/config.js          Frontend config  (git-ignored — create from example)
js/config.example.js  Config template (tracked)
.env / .env.example   Server secrets / template
```

## Built with

Python (stdlib) · HTML5 · CSS3 · Vanilla JavaScript · NVIDIA API · marked · DOMPurify · highlight.js
