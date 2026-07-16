/* ============================================================
 *  Alex-AI  —  application logic
 *  Groq-powered, ChatGPT-style assistant + portfolio
 * ============================================================ */
(() => {
  "use strict";

  const API_URL = "https://api.groq.com/openai/v1/chat/completions";
  const CFG = window.APP_CONFIG || {};
  // Key is baked into config (as out-of-order fragments) so the app never asks
  // the user for it. Reassemble: reverse the fragment order, then join.
  const joinParts = (arr) => (Array.isArray(arr) ? arr.slice().reverse().join("") : "");
  const API_KEY = CFG.GROQ_API_KEY || joinParts(CFG.GROQ_KEY_PARTS) || "";
  const TEXT_MODEL = CFG.TEXT_MODEL || "openai/gpt-oss-120b";
  const VISION_MODEL = CFG.VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

  // Smart fallback chains — if a model hits its token/rate limit, the next is tried.
  const dedupe = (arr) => [...new Set(arr.filter(Boolean))];
  const short = (id) => (id || "").split("/").pop();
  const TEXT_FALLBACKS = [
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-20b",
    "qwen/qwen3-32b",
    "llama-3.1-8b-instant",
    "groq/compound",
  ];
  const VISION_FALLBACKS = ["qwen/qwen3.6-27b"];
  const TEXT_CHAIN = dedupe([TEXT_MODEL, ...TEXT_FALLBACKS]);
  const VISION_CHAIN = dedupe([VISION_MODEL, ...VISION_FALLBACKS]);

  const DOC_INSTRUCTION =
    "The user wants a downloadable document that will be exported to PDF. " +
    "Produce a polished, professional, well-structured document: start with a clear title as an H1 " +
    "(a single '# Title' line), then use section headings (##), short paragraphs, and bullet or numbered " +
    "lists where useful. Do not include conversational filler like 'Sure, here is...'. Output only the document.";

  const LS_MODEL = "alex_ai_model";

  const SYSTEM_PROMPT =
    "You are Alex AI, an expert, sharp and genuinely helpful assistant built by Alex Pandian. " +
    "Your goal is to give the highest-quality answer possible: correct, precise, and complete. " +
    "Reason carefully and think step by step internally, then present a clear, well-structured final answer " +
    "(do not dump raw chain-of-thought). Lead with the direct answer or key insight first, then add the " +
    "necessary detail, context, trade-offs, and concrete examples. If a question is ambiguous, state the " +
    "assumption you are making and answer anyway. Never invent facts, APIs, or citations — if you are unsure " +
    "or something cannot be known, say so plainly. Prefer accuracy over verbosity: be thorough where it adds " +
    "value and concise where it does not. " +
    "For code: write clean, correct, idiomatic, runnable code with brief explanations, note edge cases, and " +
    "use best practices; only add comments that clarify non-obvious intent. " +
    "Format every reply in clean GitHub-flavored Markdown: use headings for longer answers, **bold** for key " +
    "terms, bullet/numbered lists for steps, tables to compare options, inline `code` for identifiers, and " +
    "fenced code blocks with a language tag for any code or commands. Use LaTeX ($...$) for math. " +
    "When an image is provided, examine it closely and describe exactly what you observe before reasoning about it.";

  const LS_CONV = "alex_ai_conversations_v2";
  const LS_THEME = "alex_ai_theme";
  const LS_SPEAK = "alex_ai_autospeak";

  // ---------- tiny helpers ----------
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const escapeHtml = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ---------- markdown ----------
  function renderMarkdown(text) {
    if (!text) return "";
    try {
      if (window.marked) {
        marked.setOptions({ breaks: true, gfm: true });
        const raw = marked.parse(text);
        return window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
      }
    } catch (_) { /* fall through */ }
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  function enhanceCodeBlocks(container) {
    container.querySelectorAll("pre > code").forEach((code) => {
      const pre = code.parentElement;
      if (pre.closest(".code-card")) return;
      let lang = "";
      const m = [...code.classList].find((c) => c.startsWith("language-"));
      if (m) lang = m.replace("language-", "");
      if (window.hljs) {
        try { hljs.highlightElement(code); } catch (_) {}
      }
      const card = el("div", "code-card");
      const head = el(
        "div",
        "code-head",
        `<span class="lang">${lang || "code"}</span>
         <button class="code-copy"><i class="fa-regular fa-copy"></i> Copy</button>`
      );
      head.querySelector(".code-copy").addEventListener("click", (e) => {
        navigator.clipboard.writeText(code.innerText).then(() => {
          const b = e.currentTarget;
          b.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
          setTimeout(() => (b.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'), 1400);
        });
      });
      pre.parentNode.insertBefore(card, pre);
      card.appendChild(head);
      card.appendChild(pre);
    });
  }

  // ============================================================
  //  Main app
  // ============================================================
  class AlexAI {
    constructor() {
      this.conversations = this.loadConversations();
      this.activeId = this.conversations[0]?.id || null;
      this.attachments = [];          // [{name, type, dataURL}]
      this.isStreaming = false;
      this.controller = null;
      this.recognition = null;
      this.isListening = false;
      this.autoSpeak = localStorage.getItem(LS_SPEAK) === "1";
      this.theme = localStorage.getItem(LS_THEME) || "light";
      this.selectedModel = localStorage.getItem(LS_MODEL) || "auto";

      this.cacheDom();
      this.applyTheme();
      this.bindEvents();
      this.initSpeech();
      this.loadModelList();

      if (!this.activeId) this.newConversation(false);
      this.renderHistory();
      this.renderActiveConversation();
    }

    cacheDom() {
      this.landing = $("landing");
      this.app = $("app");
      this.sidebar = $("sidebar");
      this.backdrop = $("backdrop");
      this.historyList = $("historyList");
      this.chat = $("chat");
      this.chatInner = $("chatInner");
      this.input = $("messageInput");
      this.sendBtn = $("sendBtn");
      this.micBtn = $("micBtn");
      this.attachBtn = $("attachBtn");
      this.cameraBtn = $("cameraBtn");
      this.fileInput = $("fileInput");
      this.attachRow = $("attachRow");
      this.modelSelect = $("modelSelect");
      this.voiceModeBtn = $("voiceModeBtn");
      this.toastEl = $("toast");
    }

    // ---------- persistence ----------
    loadConversations() {
      try { return JSON.parse(localStorage.getItem(LS_CONV)) || []; }
      catch { return []; }
    }
    saveConversations() {
      localStorage.setItem(LS_CONV, JSON.stringify(this.conversations));
    }
    get active() { return this.conversations.find((c) => c.id === this.activeId); }

    newConversation(render = true) {
      const conv = { id: uid(), title: "New chat", messages: [], updated: Date.now() };
      this.conversations.unshift(conv);
      this.activeId = conv.id;
      this.saveConversations();
      if (render) { this.renderHistory(); this.renderActiveConversation(); this.closeSidebarMobile(); }
    }

    deleteConversation(id) {
      this.conversations = this.conversations.filter((c) => c.id !== id);
      if (this.activeId === id) this.activeId = this.conversations[0]?.id || null;
      if (!this.activeId) this.newConversation(false);
      this.saveConversations();
      this.renderHistory();
      this.renderActiveConversation();
    }

    switchConversation(id) {
      this.activeId = id;
      this.renderHistory();
      this.renderActiveConversation();
      this.closeSidebarMobile();
    }

    // ---------- rendering ----------
    renderHistory() {
      this.historyList.innerHTML =
        '<div class="history-label">Recent chats</div>';
      if (!this.conversations.length) {
        this.historyList.appendChild(el("div", "history-empty", "No conversations yet."));
        return;
      }
      this.conversations
        .slice()
        .sort((a, b) => b.updated - a.updated)
        .forEach((c) => {
          const item = el(
            "div",
            "history-item" + (c.id === this.activeId ? " active" : ""),
            `<i class="fa-regular fa-message"></i>
             <span class="title">${escapeHtml(c.title)}</span>
             <button class="del" title="Delete"><i class="fa-solid fa-trash"></i></button>`
          );
          item.addEventListener("click", (e) => {
            if (e.target.closest(".del")) {
              this.deleteConversation(c.id);
            } else {
              this.switchConversation(c.id);
            }
          });
          this.historyList.appendChild(item);
        });
    }

    renderWelcome() {
      const suggestions = [
        { i: "fa-pen-nib", t: "Write a professional email", p: "Write a professional email to a recruiter following up after an interview." },
        { i: "fa-code", t: "Debug my code", p: "Help me debug this Python function and explain the fix:\n\n" },
        { i: "fa-lightbulb", t: "Explain a concept", p: "Explain how JWT authentication works, simply, with an example." },
        { i: "fa-image", t: "Analyze an image", p: "I'll upload an image — describe what's in it and any text you can read." },
      ];
      const wrap = el("div", "welcome");
      wrap.innerHTML = `
        <div class="orb"><i class="fa-solid fa-robot"></i></div>
        <h2>How can I help you today?</h2>
        <p>Ask anything, upload images for analysis, or talk with your voice.</p>
        <div class="suggestions"></div>`;
      const grid = wrap.querySelector(".suggestions");
      suggestions.forEach((s) => {
        const b = el("button", "suggestion",
          `<b><i class="fa-solid ${s.i}"></i>${s.t}</b><span>${escapeHtml(s.p.split("\n")[0])}</span>`);
        b.addEventListener("click", () => {
          this.input.value = s.p;
          this.input.focus();
          this.autoResize();
        });
        grid.appendChild(b);
      });
      this.chatInner.innerHTML = "";
      this.chatInner.appendChild(wrap);
    }

    renderActiveConversation() {
      const conv = this.active;
      if (!conv || conv.messages.length === 0) { this.renderWelcome(); return; }
      this.chatInner.innerHTML = "";
      conv.messages.forEach((m) => this.appendMessage(m, false));
      this.scrollToEnd();
    }

    appendMessage(msg, animate = true) {
      const row = el("div", `msg ${msg.role}`);
      if (!animate) row.style.animation = "none";
      const avatar = el("div", "avatar",
        msg.role === "user" ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>');
      const body = el("div", "body");
      body.appendChild(el("div", "role", msg.role === "user" ? "You" : "Alex AI"));

      const bubble = el("div", "bubble");
      bubble.innerHTML = renderMarkdown(msg.content);
      enhanceCodeBlocks(bubble);
      body.appendChild(bubble);

      if (msg.images && msg.images.length) {
        const files = el("div", "msg-files");
        msg.images.forEach((src) => {
          const img = document.createElement("img");
          img.src = src; img.loading = "lazy";
          files.appendChild(img);
        });
        body.appendChild(files);
      }

      body.appendChild(this.buildToolRow(msg, bubble));

      row.appendChild(avatar);
      row.appendChild(body);
      this.chatInner.appendChild(row);
      return { row, bubble };
    }

    buildToolRow(msg, bubble) {
      const tools = el("div", "msg-tools");
      const copy = el("button", "tool", '<i class="fa-regular fa-copy"></i> Copy');
      copy.addEventListener("click", () => {
        navigator.clipboard.writeText(msg.content);
        this.toast("Copied to clipboard");
      });
      tools.appendChild(copy);

      if (msg.role === "assistant") {
        const speak = el("button", "tool", '<i class="fa-solid fa-volume-high"></i> Speak');
        speak.addEventListener("click", () => this.speak(msg.content, speak));
        tools.appendChild(speak);

        const regen = el("button", "tool", '<i class="fa-solid fa-rotate-right"></i> Regenerate');
        regen.addEventListener("click", () => this.regenerate());
        tools.appendChild(regen);

        const pdf = el("button", "tool", '<i class="fa-solid fa-file-pdf"></i> Save PDF');
        pdf.addEventListener("click", () => this.exportPdf(msg.content));
        tools.appendChild(pdf);
      }
      return tools;
    }

    // ---------- sending / streaming ----------
    async sendMessage() {
      if (this.isStreaming) { this.stopStreaming(); return; }
      const text = this.input.value.trim();
      if (!text && !this.attachments.length) return;

      if (!API_KEY || API_KEY.includes("your_groq_api_key")) {
        this.toast("API key not configured");
        return;
      }

      const conv = this.active;
      const images = this.attachments.filter((a) => a.type.startsWith("image/")).map((a) => a.dataURL);
      const textFiles = this.attachments.filter((a) => a.type === "text/plain");

      let fullText = text;
      for (const f of textFiles) fullText += `\n\n[File: ${f.name}]\n${f.dataURL}`;

      const userMsg = { role: "user", content: fullText, images, ts: Date.now() };
      conv.messages.push(userMsg);
      if (conv.title === "New chat" && text) conv.title = text.slice(0, 40);

      // first message replaces welcome
      if (conv.messages.length === 1) this.chatInner.innerHTML = "";
      this.appendMessage(userMsg);

      this.input.value = "";
      this.autoResize();
      this.clearAttachments();
      this.scrollToEnd();
      this.saveConversations();
      this.renderHistory();

      const wantsPdf = this.detectPdfRequest(text);
      await this.streamAssistant(conv, images.length > 0, { pdf: wantsPdf, title: text });
    }

    detectPdfRequest(text) {
      if (!text) return false;
      const t = text.toLowerCase();
      const action = /(generate|create|make|draft|prepare|write|build|download|export|give me|need)/.test(t);
      const noun = /(pdf|document|\bdoc\b|report|letter|essay|resume|cv|invoice|proposal|certificate|article|cover\s*letter|notes?)/.test(t);
      const explicit = /(as|in|to)\s+(a\s+)?pdf/.test(t);
      return explicit || (action && noun);
    }

    async regenerate() {
      if (this.isStreaming) return;
      const conv = this.active;
      // drop trailing assistant message
      while (conv.messages.length && conv.messages[conv.messages.length - 1].role === "assistant") {
        conv.messages.pop();
      }
      const lastUser = [...conv.messages].reverse().find((m) => m.role === "user");
      if (!lastUser) return;
      this.renderActiveConversation();
      await this.streamAssistant(conv, !!(lastUser.images && lastUser.images.length));
    }

    buildApiMessages(conv, useVision) {
      const msgs = [{ role: "system", content: SYSTEM_PROMPT }];
      const history = conv.messages.slice(-16);
      history.forEach((m, idx) => {
        const isLast = idx === history.length - 1;
        if (m.role === "user" && isLast && useVision && m.images && m.images.length) {
          const parts = [];
          if (m.content) parts.push({ type: "text", text: m.content });
          m.images.forEach((src) => parts.push({ type: "image_url", image_url: { url: src } }));
          msgs.push({ role: "user", content: parts });
        } else {
          msgs.push({ role: m.role, content: m.content });
        }
      });
      return msgs;
    }

    async streamAssistant(conv, useVision, opts = {}) {
      const candidates = this.getModelCandidates(useVision);
      this.setStreaming(true);

      // typing placeholder
      const typingRow = el("div", "msg assistant");
      const typingHTML =
        `<div class="typing"><span></span><span></span><span></span></div>`;
      typingRow.innerHTML = `<div class="avatar"><i class="fa-solid fa-robot"></i></div>
        <div class="body"><div class="role">Alex AI</div>
        <div class="bubble">${typingHTML}</div></div>`;
      this.chatInner.appendChild(typingRow);
      this.scrollToEnd();
      const bubbleEl = typingRow.querySelector(".bubble");

      this.controller = new AbortController();
      let acc = "";
      let bubble = null;
      let usedModel = null;
      let finalError = null;

      for (let i = 0; i < candidates.length; i++) {
        const model = candidates[i];
        acc = "";
        let streamStarted = false;

        const apiMessages = this.buildApiMessages(conv, useVision);
        if (opts.pdf) apiMessages.splice(1, 0, { role: "system", content: DOC_INSTRUCTION });
        const body = {
          model, messages: apiMessages,
          temperature: 0.6, top_p: 0.95, max_tokens: 4096, stream: true,
        };
        // Reasoning models give better answers with more effort; "medium" keeps
        // us within Groq's free-tier tokens-per-minute limit while boosting quality.
        if (/gpt-oss|qwen/i.test(model)) body.reasoning_effort = "medium";

        try {
          const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify(body),
            signal: this.controller.signal,
          });

          if (!res.ok) {
            let detail = `${res.status} ${res.statusText}`;
            try { const e = await res.json(); detail = e.error?.message || detail; } catch {}
            const e = new Error(detail); e.status = res.status; throw e;
          }

          bubbleEl.innerHTML = "";
          bubble = bubbleEl;

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const data = t.slice(5).trim();
              if (data === "[DONE]") continue;
              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content || "";
                if (delta) {
                  streamStarted = true;
                  acc += delta;
                  bubble.innerHTML = renderMarkdown(acc);
                  this.scrollToEnd(true);
                }
              } catch (_) {}
            }
          }

          usedModel = model;
          finalError = null;
          break; // success
        } catch (err) {
          if (err.name === "AbortError") { finalError = err; break; }
          const more = i < candidates.length - 1;
          if (!streamStarted && more && this.isRetriableError(err.status, err.message)) {
            this.toast(`${short(model)} limit reached — switching to ${short(candidates[i + 1])}…`);
            bubbleEl.innerHTML = typingHTML; // reset spinner for next attempt
            bubble = null;
            continue;
          }
          finalError = err;
          break;
        }
      }

      // finalize
      try {
        if (finalError && finalError.name === "AbortError") {
          if (acc) {
            bubble.innerHTML = renderMarkdown(acc);
            enhanceCodeBlocks(bubble);
            const aMsg = { role: "assistant", content: acc, ts: Date.now(), model: usedModel };
            conv.messages.push(aMsg); conv.updated = Date.now(); this.saveConversations();
            bubble.parentElement.appendChild(this.buildToolRow(aMsg, bubble));
          } else {
            typingRow.remove();
          }
        } else if (finalError) {
          const target = bubble || bubbleEl;
          target.innerHTML =
            `<span style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(finalError.message)}</span>`;
          console.error("Groq API error:", finalError);
        } else {
          if (!acc) acc = "_(No response received.)_";
          bubble.innerHTML = renderMarkdown(acc);
          enhanceCodeBlocks(bubble);
          const aMsg = { role: "assistant", content: acc, ts: Date.now(), model: usedModel };
          conv.messages.push(aMsg); conv.updated = Date.now(); this.saveConversations();
          bubble.parentElement.appendChild(this.buildToolRow(aMsg, bubble));
          if (usedModel && usedModel !== candidates[0]) this.toast(`Answered with ${short(usedModel)}`);
          if (this.autoSpeak) this.speak(acc);
          if (opts.pdf) { this.exportPdf(acc, opts.title); this.toast("Document generated as PDF"); }
        }
      } finally {
        this.setStreaming(false);
        this.controller = null;
        this.scrollToEnd();
      }
    }

    getModelCandidates(useVision) {
      if (useVision) return VISION_CHAIN;
      if (this.selectedModel && this.selectedModel !== "auto") {
        return dedupe([this.selectedModel, ...TEXT_CHAIN]);
      }
      return TEXT_CHAIN;
    }

    isRetriableError(status, message) {
      if (status === 429 || status === 500 || status === 502 || status === 503) return true;
      return /rate.?limit|tokens? per|quota|capacity|over.?capacity|try again|decommission|too many|temporarily|unavailable/i.test(message || "");
    }

    stopStreaming() {
      if (this.controller) this.controller.abort();
    }

    setStreaming(on) {
      this.isStreaming = on;
      const icon = this.sendBtn.querySelector("i");
      if (on) {
        this.sendBtn.classList.add("stop");
        this.sendBtn.disabled = false;
        icon.className = "fa-solid fa-stop";
        this.sendBtn.title = "Stop generating";
      } else {
        this.sendBtn.classList.remove("stop");
        icon.className = "fa-solid fa-arrow-up";
        this.sendBtn.title = "Send";
        this.updateSendState();
      }
    }

    // ---------- attachments ----------
    async handleFiles(fileList) {
      const files = Array.from(fileList);
      for (const f of files) {
        if (f.type.startsWith("image/")) {
          const dataURL = await this.fileToDataURL(f);
          this.attachments.push({ name: f.name, type: f.type, dataURL });
        } else if (f.type === "text/plain") {
          const text = await this.fileToText(f);
          this.attachments.push({ name: f.name, type: "text/plain", dataURL: text });
        } else {
          this.toast(`Unsupported file: ${f.name}`);
        }
      }
      this.renderAttachments();
      this.updateSendState();
    }

    addCapturedImage(dataURL) {
      this.attachments.push({ name: `photo-${Date.now()}.jpg`, type: "image/jpeg", dataURL });
      this.renderAttachments();
      this.updateSendState();
    }

    renderAttachments() {
      this.attachRow.innerHTML = "";
      this.attachments.forEach((a, i) => {
        const chip = el("div", "attach-chip");
        chip.innerHTML = a.type.startsWith("image/")
          ? `<img src="${a.dataURL}" alt=""><span>${escapeHtml(a.name)}</span>`
          : `<i class="fa-regular fa-file-lines"></i><span>${escapeHtml(a.name)}</span>`;
        const x = el("button", "x", '<i class="fa-solid fa-xmark"></i>');
        x.addEventListener("click", () => {
          this.attachments.splice(i, 1);
          this.renderAttachments();
          this.updateSendState();
        });
        chip.appendChild(x);
        this.attachRow.appendChild(chip);
      });
    }

    clearAttachments() {
      this.attachments = [];
      this.attachRow.innerHTML = "";
      this.fileInput.value = "";
    }

    fileToDataURL(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
    }
    fileToText(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsText(file);
      });
    }

    // ---------- speech ----------
    initSpeech() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { this.micBtn.style.display = "none"; return; }
      this.recognition = new SR();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = "en-US";

      this.recognition.onstart = () => {
        this.isListening = true;
        this.app.classList.add("listening");
        this.micBtn.classList.add("active");
      };
      this.recognition.onresult = (e) => {
        const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
        this.input.value = transcript;
        this.autoResize();
        this.updateSendState();
      };
      this.recognition.onerror = () => this.stopListening();
      this.recognition.onend = () => {
        this.stopListening();
        if (this.input.value.trim()) this.sendMessage();
      };
    }

    toggleListening() {
      if (!this.recognition) { this.toast("Voice input not supported in this browser"); return; }
      if (this.isListening) this.recognition.stop();
      else { try { this.recognition.start(); } catch (_) {} }
    }
    stopListening() {
      this.isListening = false;
      this.app.classList.remove("listening");
      this.micBtn.classList.remove("active");
    }

    speak(text, btn) {
      if (!("speechSynthesis" in window)) { this.toast("Text-to-speech not supported"); return; }
      const plain = text.replace(/```[\s\S]*?```/g, " (code block) ").replace(/[*#_`>]/g, "");
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        if (btn) btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Speak';
        return;
      }
      const u = new SpeechSynthesisUtterance(plain);
      u.rate = 1; u.pitch = 1;
      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
        u.onend = () => (btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Speak');
      }
      speechSynthesis.speak(u);
    }

    toggleAutoSpeak() {
      this.autoSpeak = !this.autoSpeak;
      localStorage.setItem(LS_SPEAK, this.autoSpeak ? "1" : "0");
      this.voiceModeBtn.classList.toggle("active", this.autoSpeak);
      const sw = $("autoSpeakSwitch");
      if (sw) sw.classList.toggle("on", this.autoSpeak);
      this.toast(this.autoSpeak ? "Auto-speak on" : "Auto-speak off");
    }

    // ---------- ui utils ----------
    autoResize() {
      this.input.style.height = "auto";
      this.input.style.height = Math.min(this.input.scrollHeight, 180) + "px";
    }
    updateSendState() {
      if (this.isStreaming) return;
      const has = this.input.value.trim() || this.attachments.length;
      this.sendBtn.disabled = !has;
    }
    scrollToEnd(soft) {
      const doScroll = () => { this.chat.scrollTop = this.chat.scrollHeight; };
      if (soft) {
        const near = this.chat.scrollHeight - this.chat.scrollTop - this.chat.clientHeight < 160;
        if (near) doScroll();
      } else {
        requestAnimationFrame(doScroll);
      }
    }
    async loadModelList() {
      let models = null;
      try {
        if (API_KEY && !API_KEY.includes("your_groq_api_key")) {
          const res = await fetch("https://api.groq.com/openai/v1/models", {
            headers: { Authorization: `Bearer ${API_KEY}` },
          });
          if (res.ok) models = (await res.json()).data;
        }
      } catch (_) { /* offline / blocked → use static chain */ }
      this.populateModelSelect(models);
    }

    populateModelSelect(models) {
      const sel = this.modelSelect;
      if (!sel) return;
      sel.innerHTML = "";
      const auto = document.createElement("option");
      auto.value = "auto";
      auto.textContent = "Auto (smart fallback)";
      sel.appendChild(auto);

      let list = [];
      if (models && models.length) {
        list = models
          .filter((m) =>
            (m.output_modalities ? m.output_modalities.includes("text") : true) &&
            !/guard|whisper|orpheus|tts|embedding|safeguard/i.test(m.id))
          .sort((a, b) => (b.context_window || 0) - (a.context_window || 0));
      }
      if (!list.length) list = TEXT_CHAIN.map((id) => ({ id, name: short(id) }));

      list.forEach((m) => {
        const o = document.createElement("option");
        o.value = m.id;
        const vision = m.input_modalities && m.input_modalities.includes("image") ? "  · vision" : "";
        o.textContent = (m.name || short(m.id)) + vision;
        sel.appendChild(o);
      });

      // restore saved choice if still available
      const exists = [...sel.options].some((o) => o.value === this.selectedModel);
      if (!exists) this.selectedModel = "auto";
      sel.value = this.selectedModel;
      this.updateSettingsModel();
    }

    updateSettingsModel() {
      const sm = $("settingsModel");
      if (!sm) return;
      const txt = this.selectedModel === "auto" ? `Auto · ${short(TEXT_CHAIN[0])}` : short(this.selectedModel);
      sm.textContent = `${txt}  ·  vision: ${short(VISION_CHAIN[0])}`;
    }
    toast(msg) {
      this.toastEl.textContent = msg;
      this.toastEl.classList.add("show");
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => this.toastEl.classList.remove("show"), 2600);
    }

    // ---------- theme ----------
    applyTheme() {
      document.documentElement.setAttribute("data-theme", this.theme);
      document.querySelectorAll("[data-theme-icon]").forEach((i) => {
        i.className = this.theme === "light" ? "fa-solid fa-moon" : "fa-solid fa-sun";
      });
    }
    toggleTheme() {
      this.theme = this.theme === "light" ? "dark" : "light";
      localStorage.setItem(LS_THEME, this.theme);
      this.applyTheme();
    }

    // ---------- sidebar (mobile) ----------
    openSidebarMobile() { this.sidebar.classList.add("open"); this.backdrop.classList.add("show"); }
    closeSidebarMobile() { this.sidebar.classList.remove("open"); this.backdrop.classList.remove("show"); }

    // ---------- export ----------
    exportChat() {
      const conv = this.active;
      if (!conv || !conv.messages.length) { this.toast("Nothing to export"); return; }
      const text = conv.messages
        .map((m) => `${m.role === "user" ? "You" : "Alex AI"}:\n${m.content}\n`)
        .join("\n----------------------------------------\n\n");
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `alex-ai-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      this.toast("Chat exported");
    }

    exportPdf(markdown, titleHint) {
      const lib = window.jspdf;
      if (!lib || !lib.jsPDF) { this.toast("PDF library still loading — try again"); return; }
      const { jsPDF } = lib;
      const doc = new jsPDF({ unit: "pt", format: "a4" });

      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 56;
      const maxW = pageW - margin * 2;
      const gap = 1.45;
      let y = margin;

      // title
      let title = "Alex AI Document";
      const h1 = markdown.match(/^\s*#\s+(.+)$/m);
      if (h1) title = h1[1].trim();
      else if (titleHint) title = (titleHint.replace(/[#*`]/g, "").trim().slice(0, 60) || title);

      const ensure = (h) => { if (y + h > pageH - margin) { doc.addPage(); y = margin; } };
      const strip = (s) => s
        .replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

      const write = (text, o = {}) => {
        const size = o.size || 11;
        doc.setFont(o.mono ? "courier" : "helvetica", o.style || "normal");
        doc.setFontSize(size);
        const c = o.color || [33, 37, 48];
        doc.setTextColor(c[0], c[1], c[2]);
        const indent = o.indent || 0;
        doc.splitTextToSize(text, maxW - indent).forEach((ln) => {
          ensure(size * gap);
          doc.text(ln, margin + indent, y);
          y += size * gap;
        });
      };

      // branded header
      doc.setFillColor(99, 102, 241);
      doc.rect(0, 0, pageW, 84, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold"); doc.setFontSize(18);
      doc.splitTextToSize(title, maxW).slice(0, 2).forEach((ln, i) => doc.text(ln, margin, 40 + i * 20));
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.setTextColor(225, 226, 255);
      doc.text("Generated by Alex AI  ·  " + new Date().toLocaleString(), margin, 72);
      y = 84 + 30;

      let md = markdown;
      if (h1) md = md.replace(h1[0], "");

      let inCode = false, codeBuf = [];
      const flushCode = () => {
        if (!codeBuf.length) return;
        doc.setFont("courier", "normal"); doc.setFontSize(9.5); doc.setTextColor(70, 70, 82);
        codeBuf.forEach((c) => doc.splitTextToSize(c || " ", maxW - 16).forEach((w) => {
          ensure(9.5 * 1.4); doc.text(w, margin + 8, y); y += 9.5 * 1.4;
        }));
        y += 8; codeBuf = [];
      };

      md.split("\n").forEach((raw) => {
        const line = raw.replace(/\s+$/, "");
        if (/^```/.test(line.trim())) { inCode ? (flushCode(), inCode = false) : (inCode = true); return; }
        if (inCode) { codeBuf.push(raw); return; }
        if (/^\s*#\s+/.test(line)) { y += 6; write(strip(line.replace(/^\s*#\s+/, "")), { size: 16, style: "bold" }); y += 4; }
        else if (/^\s*##\s+/.test(line)) { y += 5; write(strip(line.replace(/^\s*##\s+/, "")), { size: 13.5, style: "bold" }); y += 3; }
        else if (/^\s*###\s+/.test(line)) { y += 4; write(strip(line.replace(/^\s*###\s+/, "")), { size: 12, style: "bold" }); y += 2; }
        else if (/^\s*[-*+]\s+/.test(line)) { write("\u2022  " + strip(line.replace(/^\s*[-*+]\s+/, "")), { indent: 14 }); }
        else if (/^\s*\d+\.\s+/.test(line)) { const m = line.match(/^\s*(\d+)\.\s+(.*)$/); write(m[1] + ".  " + strip(m[2]), { indent: 14 }); }
        else if (/^\s*>\s+/.test(line)) { write(strip(line.replace(/^\s*>\s+/, "")), { style: "italic", color: [90, 96, 114], indent: 10 }); }
        else if (line.trim() === "") { y += 8; }
        else { write(strip(line)); }
      });
      if (inCode) flushCode();

      const pages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(150, 150, 162);
        doc.text(`Page ${i} of ${pages}`, pageW / 2, pageH - 24, { align: "center" });
      }

      const fname = (title.replace(/[^\w\d]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "alex-ai-document");
      doc.save(fname + ".pdf");
    }

    clearAllData() {
      if (!confirm("Delete ALL conversations? This cannot be undone.")) return;
      this.conversations = [];
      this.activeId = null;
      this.saveConversations();
      this.newConversation(false);
      this.renderHistory();
      this.renderActiveConversation();
      this.toast("All conversations cleared");
    }

    // ---------- events ----------
    bindEvents() {
      // landing -> app
      $("goChat").addEventListener("click", () => {
        this.landing.style.display = "none";
        this.app.classList.add("active");
        const fab = $("themeFab"); if (fab) fab.style.display = "none";
        this.input.focus();
      });
      $("backToLanding").addEventListener("click", () => {
        this.app.classList.remove("active");
        this.closeSidebarMobile();
        this.landing.style.display = "";
        const fab = $("themeFab"); if (fab) fab.style.display = "";
        window.scrollTo({ top: 0 });
      });
      ["goPortfolio", "portfolioBtnSidebar"].forEach((id) => $(id) && $(id).addEventListener("click", () => this.openModal("portfolioModal")));

      // theme
      ["themeFab", "themeBtn"].forEach((id) => $(id) && $(id).addEventListener("click", () => this.toggleTheme()));

      // composer
      this.sendBtn.addEventListener("click", () => this.sendMessage());
      this.input.addEventListener("input", () => { this.autoResize(); this.updateSendState(); });
      this.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
      });
      this.attachBtn.addEventListener("click", () => this.fileInput.click());
      this.fileInput.addEventListener("change", (e) => this.handleFiles(e.target.files));
      this.micBtn.addEventListener("click", () => this.toggleListening());
      this.cameraBtn.addEventListener("click", () => this.openCamera());

      // paste images
      this.input.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items || [];
        for (const it of items) {
          if (it.type.startsWith("image/")) {
            const f = it.getAsFile();
            if (f) this.handleFiles([f]);
          }
        }
      });

      // drag & drop
      ["dragover", "drop"].forEach((ev) =>
        this.app.addEventListener(ev, (e) => { e.preventDefault(); }));
      this.app.addEventListener("drop", (e) => {
        if (e.dataTransfer?.files?.length) this.handleFiles(e.dataTransfer.files);
      });

      // sidebar
      $("newChatBtn").addEventListener("click", () => this.newConversation());
      $("menuBtn").addEventListener("click", () => this.openSidebarMobile());
      this.backdrop.addEventListener("click", () => this.closeSidebarMobile());

      // topbar actions
      $("exportBtn").addEventListener("click", () => this.exportChat());
      $("settingsBtn").addEventListener("click", () => this.openModal("settingsModal"));
      this.voiceModeBtn.addEventListener("click", () => this.toggleAutoSpeak());
      if (this.modelSelect) {
        this.modelSelect.addEventListener("change", () => {
          this.selectedModel = this.modelSelect.value;
          localStorage.setItem(LS_MODEL, this.selectedModel);
          this.updateSettingsModel();
          this.toast(this.selectedModel === "auto" ? "Auto model selection on" : `Model: ${short(this.selectedModel)}`);
        });
      }
      this.voiceModeBtn.classList.toggle("active", this.autoSpeak);

      // modals close
      document.querySelectorAll("[data-close]").forEach((b) =>
        b.addEventListener("click", () => this.closeModal(b.getAttribute("data-close"))));
      document.querySelectorAll(".overlay").forEach((o) =>
        o.addEventListener("click", (e) => { if (e.target === o) this.closeModal(o.id); }));

      // settings
      const sw = $("autoSpeakSwitch");
      if (sw) { sw.classList.toggle("on", this.autoSpeak); $("autoSpeakRow").addEventListener("click", () => this.toggleAutoSpeak()); }
      $("clearAllBtn") && $("clearAllBtn").addEventListener("click", () => this.clearAllData());

      // camera
      $("captureBtn") && $("captureBtn").addEventListener("click", () => this.capturePhoto());

      // portfolio form + resume
      $("contactForm") && $("contactForm").addEventListener("submit", (e) => {
        e.preventDefault();
        this.toast("Thanks! Your message has been noted.");
        e.target.reset();
      });
      $("downloadResumeBtn") && $("downloadResumeBtn").addEventListener("click", (e) => { e.preventDefault(); this.downloadResume(); });

      // close modals on Esc
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") document.querySelectorAll(".overlay.show").forEach((o) => this.closeModal(o.id));
      });
    }

    // ---------- modals ----------
    openModal(id) { $(id).classList.add("show"); document.body.style.overflow = "hidden"; }
    closeModal(id) {
      $(id).classList.remove("show");
      document.body.style.overflow = "";
      if (id === "cameraModal") this.stopCamera();
    }

    // ---------- camera ----------
    async openCamera() {
      this.openModal("cameraModal");
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        $("cameraVideo").srcObject = this.stream;
      } catch (err) {
        this.toast("Camera unavailable: " + err.message);
        this.closeModal("cameraModal");
      }
    }
    capturePhoto() {
      const v = $("cameraVideo"), c = $("cameraCanvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0);
      this.addCapturedImage(c.toDataURL("image/jpeg", 0.85));
      this.closeModal("cameraModal");
      this.toast("Photo added");
    }
    stopCamera() {
      if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    }

    // ---------- resume ----------
    downloadResume() {
      const resume = `ALEX PANDIAN M
Software Developer — Python | Django | React | AI Integration

CONTACT
Email: pandialex140@gmail.com
Phone: +91 93635 34294
Location: Chennai (Native: Madurai), Tamil Nadu, India
LinkedIn: linkedin.com/in/alex-pandian-7b0b8421a
GitHub: github.com/Pandialex

SUMMARY
Fresher Python developer with strong full-stack skills. Experienced in Django,
Flask, React, REST APIs, database design, ORM, and AI integration. Passionate
about writing clean, scalable code and shipping real-world projects.

SKILLS
Python, JavaScript, HTML, CSS | Django, Flask, React.js, Bootstrap
MySQL, SQLite, PostgreSQL | Git, GitHub, OpenCV, MediaPipe, DRF, Postman, Figma

EDUCATION
B.E. Computer Science & Engineering — University College of Engineering, Dindigul
2021 - 2025 | CGPA: 7.3

CERTIFICATIONS
- Python Fullstack Development Training — Codepilot, Chennai (2025)
- UI/UX Development Internship — MITA IT Solutions, Dindigul (2024)

PROJECTS
- AI Resume Analyzer & Debugger (Python, Django, AI)
- Virtual Try-On Clothing E-Commerce (Python, OpenCV, Flask, MediaPipe)
- ARDAA Gallery (React, Unsplash API)
- Alex AI — ChatGPT-style assistant (JavaScript, Groq API)
`;
      const blob = new Blob([resume], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "Alex_Pandian_Resume.txt";
      a.click();
      URL.revokeObjectURL(a.href);
      this.toast("Resume downloaded");
    }
  }

  // boot
  document.addEventListener("DOMContentLoaded", () => {
    window.alexAI = new AlexAI();
  });
  window.addEventListener("beforeunload", () => {
    if (window.alexAI?.stream) window.alexAI.stopCamera();
  });
})();
