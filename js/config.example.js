/* ============================================================
 *  Alex-AI runtime config TEMPLATE
 *  Copy this file to "js/config.js".
 *
 *  Your API key does NOT go here — it lives in .env and is read
 *  server-side by server.py. The browser only talks to the local
 *  proxy at /v1, so the key is never exposed to visitors.
 *
 *  Start with:  python server.py   then open http://localhost:8000
 * ============================================================ */
window.APP_CONFIG = {
  API_BASE: "/v1",              // same-origin proxy (server.py adds the key)
  TEXT_MODEL: "openai/gpt-oss-120b",
  VISION_MODEL: "meta/llama-3.2-11b-vision-instruct",
};
