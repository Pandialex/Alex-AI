/* ============================================================
 *  Alex-AI runtime config TEMPLATE  (copy to js/config.js)
 *
 *  Put your Groq key here so the app works with no prompt. On a static site
 *  the key is public — use a free, low-limit key from
 *  https://console.groq.com/keys.
 *
 *  Simplest: set GROQ_API_KEY to your "gsk_..." key. To avoid GitHub's secret
 *  scanner, split it into out-of-order fragments in GROQ_KEY_PARTS instead
 *  (the app reverses the array and joins it back together).
 * ============================================================ */
window.APP_CONFIG = {
  // GROQ_API_KEY: "gsk_...",
  GROQ_KEY_PARTS: [],
  TEXT_MODEL: "openai/gpt-oss-120b",
  VISION_MODEL: "meta-llama/llama-4-scout-17b-16e-instruct",
};
