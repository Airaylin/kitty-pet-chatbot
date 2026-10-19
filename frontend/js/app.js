/**
 * app.js —— KITTY PET 像素对话机主逻辑
 */
(function () {
  "use strict";

  const api = window.KittyAPI;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const view = $("view");
  const welcome = $("welcome");
  const messagesEl = $("messages");
  const typingEl = $("typing");
  const inputEl = $("input");
  const btnSend = $("btnSend");
  const btnNew = $("btnNew");
  const btnClearAll = $("btnClearAll");
  const btnTheme = $("btnTheme");
  const keySend = $("keySend");
  const keyNew = $("keyNew");
  const keyStop = $("keyStop");
  const sessionListEl = $("sessionList");
  const logEl = $("log");
  const statConn = $("statConn");
  const statMood = $("statMood");
  const statLevel = $("statLevel");
  const statModel = $("statModel");

  // 初始化流程
  const setupPersonalityEl = $("setupPersonality");
  const setupNameEl = $("setupName");
  const charGridEl = $("charGrid");
  const pickedBadgeEl = $("pickedBadge");
  const petNameInputEl = $("petNameInput");
  const btnStartChat = $("btnStartChat");
  const btnBackStep = $("btnBackStep");
  const btnChangePet = $("btnChangePet");
  const petNameplate = $("petNameplate");
  const welcomeTitle = $("welcomeTitle");
  const welcomeText = $("welcomeText");

  // ---------- 状态 ----------
  const state = {
    sessionId: null,
    history: [], // [{role, content}]
    sessions: [],
    busy: false,
    controller: null,
    theme: localStorage.getItem("kitty-theme") || "day",
    // 宠物人设
    personalities: [],
    personalityId: localStorage.getItem("kitty-personality") || "",
    petName: localStorage.getItem("kitty-pet-name") || "",
  };

  const STORAGE = {
    personality: "kitty-personality",
    petName: "kitty-pet-name",
  };

  // ---------- Markdown ----------
  marked.setOptions({
    gfm: true,
    breaks: true,
    mangle: false,
    headerIds: false,
  });

  function renderMarkdown(text) {
    try {
      const html = marked.parse(text || "");
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          "p", "br", "strong", "em", "del", "code", "pre", "blockquote",
          "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
          "a", "table", "thead", "tbody", "tr", "th", "td", "hr", "span", "div",
        ],
        ALLOWED_ATTR: ["href", "title", "target", "rel", "class", "colspan", "rowspan"],
      });
    } catch {
      return escapeHtml(text || "");
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- 日志 ----------
  function log(msg, tag = "sys") {
    const t = new Date().toTimeString().slice(0, 8);
    logEl.textContent += `\n[${t}] [${tag}] ${msg}`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ---------- 主题 ----------
  function applyTheme() {
    document.body.classList.toggle("theme-night", state.theme === "night");
    localStorage.setItem("kitty-theme", state.theme);
    log(`主题切换 → ${state.theme}`, "ui");
  }

  btnTheme.addEventListener("click", () => {
    state.theme = state.theme === "night" ? "day" : "night";
    applyTheme();
  });

  // ============================================================
  // 初始化流程：选性格 → 起名字 → 进入聊天
  // ============================================================
  function getPersonality(id) {
    return state.personalities.find((p) => p.id === id) || state.personalities[0] || null;
  }

  function renderCharGrid() {
    charGridEl.innerHTML = "";
    for (const p of state.personalities) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "char-card" + (p.id === state.personalityId ? " is-selected" : "");
      card.style.setProperty("--card-color", p.color);
      card.dataset.id = p.id;
      card.innerHTML = `
        <span class="char-card__emoji">${p.emoji}</span>
        <span class="char-card__name">${escapeHtml(p.name)}</span>
        <span class="char-card__tag">${escapeHtml(p.tagline)}</span>
      `;
      card.addEventListener("click", () => {
        state.personalityId = p.id;
        renderCharGrid();
        log(`选择性格 → ${p.name}`, "ui");
        // 稍作停顿，让选中态可见
        setTimeout(() => showNameStep(), 220);
      });
      charGridEl.appendChild(card);
    }
  }

  function showPersonalityStep() {
    setupPersonalityEl.hidden = false;
    setupNameEl.hidden = true;
    welcome.hidden = true;
    messagesEl.hidden = true;
    typingEl.hidden = true;
    renderCharGrid();
  }

  function showNameStep() {
    const p = getPersonality(state.personalityId);
    if (!p) {
      showPersonalityStep();
      return;
    }
    pickedBadgeEl.style.setProperty("--card-color", p.color);
    pickedBadgeEl.innerHTML = `
      <span class="picked-badge__emoji">${p.emoji}</span>
      <span>${escapeHtml(p.name)} · ${escapeHtml(p.tagline)}</span>
    `;
    setupPersonalityEl.hidden = true;
    setupNameEl.hidden = false;
    welcome.hidden = true;
    messagesEl.hidden = true;
    petNameInputEl.value = state.petName || "";
    setTimeout(() => petNameInputEl.focus(), 40);
  }

  function enterChat() {
    const name = petNameInputEl.value.trim();
    if (!name) {
      petNameInputEl.focus();
      petNameInputEl.style.borderColor = "var(--red)";
      setTimeout(() => (petNameInputEl.style.borderColor = ""), 600);
      return;
    }
    if (name.length > 12) {
      alert("名字最多 12 个字哦");
      return;
    }

    state.petName = name;
    localStorage.setItem(STORAGE.petName, name);
    localStorage.setItem(STORAGE.personality, state.personalityId);

    const p = getPersonality(state.personalityId);
    petNameplate.textContent = `★ ${name} ★`;
    petNameplate.classList.add("is-named");

    setupPersonalityEl.hidden = true;
    setupNameEl.hidden = true;
    messagesEl.innerHTML = "";
    messagesEl.hidden = true;
    showWelcome(true);

    welcomeTitle.textContent = "READY!";
    welcomeText.innerHTML = `我是 <b>${escapeHtml(name)}</b>，性格「${escapeHtml(p ? p.name : "")}」<br />主人想聊点什么呀～`;

    log(`宠物诞生：${name} · ${p ? p.name : "?"}`, "pet");
    inputEl.focus();
    scrollToBottom(false);
  }

  function resetToSetup() {
    if (state.controller) state.controller.abort();
    state.sessionId = null;
    state.history = [];
    state.petName = "";
    state.personalityId = "";
    localStorage.removeItem(STORAGE.petName);
    localStorage.removeItem(STORAGE.personality);
    messagesEl.innerHTML = "";
    petNameplate.textContent = "TALKING MACHINE";
    petNameplate.classList.remove("is-named");
    setBusy(false);
    setTyping(false);
    renderSessions(null);
    log("重新挑选宠物", "ui");
    showPersonalityStep();
  }

  btnStartChat.addEventListener("click", enterChat);
  btnBackStep.addEventListener("click", showPersonalityStep);
  btnChangePet.addEventListener("click", resetToSetup);

  petNameInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      enterChat();
    }
  });

  // ---------- 滚动 ----------
  function scrollToBottom(smooth = true) {
    requestAnimationFrame(() => {
      view.scrollTo({
        top: view.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    });
  }

  // ---------- 消息渲染 ----------
  function showWelcome(show) {
    // 一旦调用，说明已离开初始化流程
    setupPersonalityEl.hidden = true;
    setupNameEl.hidden = true;
    welcome.hidden = !show;
    messagesEl.hidden = show;
  }

  function appendMessage(role, content, { streaming = false } = {}) {
    if (!welcome.hidden) showWelcome(false);

    const wrap = document.createElement("div");
    wrap.className = `msg msg--${role === "user" ? "user" : "ai"}`;

    const avatar = document.createElement("div");
    avatar.className = "msg__avatar";
    avatar.textContent = role === "user" ? "U" : "K";

    const body = document.createElement("div");
    body.className = "msg__body";

    const contentEl = document.createElement("div");
    contentEl.className = "msg__content";
    contentEl.innerHTML = renderMarkdown(content);
    body.appendChild(contentEl);

    const meta = document.createElement("div");
    meta.className = "msg__meta";
    meta.textContent = role === "user" ? "PLAYER" : "KITTY";
    body.appendChild(meta);

    wrap.appendChild(avatar);
    wrap.appendChild(body);
    messagesEl.appendChild(wrap);

    if (!streaming) scrollToBottom();
    return { wrap, contentEl };
  }

  function updateMessage(contentEl, text) {
    contentEl.innerHTML = renderMarkdown(text);
    scrollToBottom(false);
  }

  function setTyping(on) {
    typingEl.hidden = !on;
    if (on) scrollToBottom();
  }

  function setBusy(on) {
    state.busy = on;
    btnSend.disabled = on && false; // 发送键始终可点，用于「停止」
    btnSend.classList.toggle("is-stop", on);
    btnSend.textContent = on ? "■" : "▶";
    btnSend.title = on ? "停止生成 (Esc)" : "发送 (Enter)";
    inputEl.disabled = false;
    statMood.textContent = on ? "50" : "100";
  }

  // ---------- 会话列表 ----------
  async function refreshSessions(activeId) {
    try {
      state.sessions = await api.listSessions();
    } catch (e) {
      log(`加载存档失败：${e.message}`, "err");
      return;
    }
    renderSessions(activeId ?? state.sessionId);
  }

  function renderSessions(activeId) {
    sessionListEl.innerHTML = "";
    for (const s of state.sessions) {
      const li = document.createElement("li");
      li.className = "session-item" + (s.session_id === activeId ? " is-active" : "");
      li.dataset.id = s.session_id;

      const icon = document.createElement("span");
      icon.className = "session-item__icon";
      icon.textContent = "▶";

      const title = document.createElement("span");
      title.className = "session-item__title";
      title.textContent = s.title;
      title.title = s.title;

      const del = document.createElement("button");
      del.className = "session-item__del";
      del.type = "button";
      del.textContent = "×";
      del.title = "删除存档";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await api.deleteSession(s.session_id);
          log(`删除存档 ${s.session_id.slice(0, 6)}`, "data");
          if (state.sessionId === s.session_id) newChat();
          else refreshSessions();
        } catch (err) {
          log(`删除失败：${err.message}`, "err");
        }
      });

      li.appendChild(icon);
      li.appendChild(title);
      li.appendChild(del);

      li.addEventListener("click", () => loadSession(s.session_id));
      sessionListEl.appendChild(li);
    }
  }

  async function loadSession(sessionId) {
    try {
      const msgs = await api.getSessionMessages(sessionId);
      state.sessionId = sessionId;
      state.history = msgs.map((m) => ({ role: m.role, content: m.content }));
      messagesEl.innerHTML = "";
      if (msgs.length === 0) {
        showWelcome(true);
      } else {
        showWelcome(false);
        for (const m of msgs) appendMessage(m.role, m.content);
      }
      renderSessions(sessionId);
      log(`载入存档 ${sessionId.slice(0, 6)} · ${msgs.length} 条记录`, "data");
      scrollToBottom(false);
    } catch (e) {
      log(`载入失败：${e.message}`, "err");
    }
  }

  // ---------- 新对话 ----------
  function newChat() {
    if (state.controller) state.controller.abort();
    state.sessionId = null;
    state.history = [];
    messagesEl.innerHTML = "";
    setBusy(false);
    setTyping(false);
    renderSessions(null);
    inputEl.value = "";
    autoGrow();

    if (state.petName && state.personalityId) {
      const p = getPersonality(state.personalityId);
      setupPersonalityEl.hidden = true;
      setupNameEl.hidden = true;
      showWelcome(true);
      welcomeTitle.textContent = "NEW GAME!";
      welcomeText.innerHTML = `我是 <b>${escapeHtml(state.petName)}</b>，性格「${escapeHtml(p ? p.name : "")}」<br />主人想聊点什么呀～`;
      inputEl.focus();
    } else {
      showPersonalityStep();
    }
    log("开新对话", "ui");
  }

  btnNew.addEventListener("click", newChat);
  keyNew.addEventListener("click", newChat);

  btnClearAll.addEventListener("click", async () => {
    if (!confirm("确定清空所有存档？此操作不可恢复。")) return;
    try {
      await api.clearSessions();
      log("已清空全部存档", "data");
      newChat();
    } catch (e) {
      log(`清空失败：${e.message}`, "err");
    }
  });

  // ---------- 发送 ----------
  async function send() {
    const text = inputEl.value.trim();
    if (!text) return;

    // 尚未完成宠物初始化时不允许聊天
    if (!state.petName || !state.personalityId) {
      log("请先挑选性格并给宠物起名", "err");
      if (!setupPersonalityEl.hidden) {
        charGridEl.scrollIntoView({ block: "nearest" });
      } else if (!setupNameEl.hidden) {
        petNameInputEl.focus();
      }
      return;
    }

    if (state.busy) {
      // 「停止」
      if (state.controller) state.controller.abort();
      setBusy(false);
      setTyping(false);
      log("已中断生成", "ui");
      return;
    }

    inputEl.value = "";
    autoGrow();
    appendMessage("user", text);
    state.history.push({ role: "user", content: text });

    setBusy(true);
    setTyping(true);
    log(`发送 → ${text.slice(0, 24)}${text.length > 24 ? "…" : ""}`, "chat");

    // 创建占位的 AI 消息
    let aiNode = null;
    let acc = "";

    const startAiBubble = () => {
      if (aiNode) return;
      setTyping(false);
      aiNode = appendMessage("assistant", "…", { streaming: true });
    };

    state.controller = new AbortController();

    try {
      await api.chatStream({
        message: text,
        history: state.history.slice(0, -1), // 不重复发送本轮
        sessionId: state.sessionId,
        petName: state.petName,
        personality: state.personalityId,
        signal: state.controller.signal,
        onMeta: (meta) => {
          state.sessionId = meta.session_id;
          statModel.textContent = meta.model || "mimo";
        },
        onDelta: (t) => {
          startAiBubble();
          acc += t;
          updateMessage(aiNode.contentEl, acc);
        },
        onDone: (d) => {
          if (d && d.session_id) state.sessionId = d.session_id;
        },
      });

      if (acc.trim()) {
        state.history.push({ role: "assistant", content: acc });
        log(`回复完成 · ${acc.length} 字`, "chat");
      } else if (aiNode) {
        // 中断导致的空回复
        aiNode.wrap.remove();
        log("回复被中断或为空", "chat");
      } else {
        log("⚠ 未收到模型回复", "err");
      }

      refreshSessions(state.sessionId);
    } catch (e) {
      setTyping(false);
      log(`出错：${e.message}`, "err");
      if (aiNode) {
        updateMessage(aiNode.contentEl, `⚠️ ${e.message}`);
      } else {
        appendMessage("assistant", `⚠️ ${e.message}`);
      }
    } finally {
      setBusy(false);
      state.controller = null;
      setTyping(false);
      inputEl.focus();
    }
  }

  btnSend.addEventListener("click", send);
  keySend.addEventListener("click", send);
  keyStop.addEventListener("click", () => {
    if (state.busy) send();
  });

  // ---------- 输入框 ----------
  function autoGrow() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  }

  inputEl.addEventListener("input", autoGrow);

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape" && state.busy) {
      e.preventDefault();
      send();
    }
  });

  // ---------- 快捷提示 ----------
  document.querySelectorAll(".chip[data-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      inputEl.value = btn.dataset.prompt;
      autoGrow();
      inputEl.focus();
      send();
    });
  });

  // ---------- 全局快捷键 ----------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.busy) {
      e.preventDefault();
      send();
    }
  });

  // ---------- 初始化 ----------
  async function init() {
    applyTheme();
    autoGrow();

    // 模拟开机自检
    const bootLines = [
      "[boot] kitty pet v1.0",
      "[boot] mounting screen ......... ok",
      "[boot] loading sprite kit ...... ok",
      "[boot] connecting to backend ...",
    ];
    logEl.textContent = bootLines.join("\n");

    try {
      const h = await api.health();
      statModel.textContent = h.model;
      statConn.innerHTML = '<i class="conn-dot"></i> ONLINE';
      statConn.classList.remove("is-offline");
      log(`backend online · model=${h.model}`, "net");
      if (!h.api_key_configured) {
        log("⚠ 未检测到 API_KEY，请检查 backend/.env", "err");
      }
    } catch (e) {
      statConn.innerHTML = '<i class="conn-dot"></i> OFFLINE';
      statConn.classList.add("is-offline");
      log(`backend offline：${e.message}`, "err");
    }

    // 拉取性格列表（失败时用内置兜底，保证界面仍可操作）
    try {
      state.personalities = await api.listPersonalities();
      log(`载入 ${state.personalities.length} 种性格`, "net");
    } catch (e) {
      state.personalities = [
        { id: "gentle", name: "温柔", emoji: "🌸", tagline: "治愈系", color: "#ffb3d1" },
        { id: "tsundere", name: "暴躁", emoji: "🔥", tagline: "嘴硬心软", color: "#ff6b6b" },
        { id: "sharp", name: "犀利", emoji: "⚡", tagline: "一针见血", color: "#7dd3fc" },
      ];
      log(`性格列表加载失败，使用内置默认：${e.message}`, "err");
    }

    // 已有宠物 → 直接进聊天；否则走初始化流程
    const savedName = state.petName;
    const savedPid = state.personalityId;
    const hasValidPersonality = state.personalities.some((p) => p.id === savedPid);

    if (savedName && hasValidPersonality) {
      const p = getPersonality(savedPid);
      petNameplate.textContent = `★ ${savedName} ★`;
      petNameplate.classList.add("is-named");
      setupPersonalityEl.hidden = true;
      setupNameEl.hidden = true;
      showWelcome(true);
      welcomeTitle.textContent = "WELCOME BACK!";
      welcomeText.innerHTML = `我是 <b>${escapeHtml(savedName)}</b>，性格「${escapeHtml(p ? p.name : "")}」<br />主人今天想聊点什么呀～`;
      log(`欢迎回来，${savedName}`, "pet");
    } else {
      showPersonalityStep();
      log("首次使用：请挑选性格", "ui");
    }

    await refreshSessions();
    if (!setupPersonalityEl.hidden || !setupNameEl.hidden) {
      // 初始化阶段焦点交给卡片/输入框
    } else {
      inputEl.focus();
    }

    // 小彩蛋：等级随时间上涨
    let tick = 0;
    setInterval(() => {
      tick++;
      statLevel.textContent = String(1 + Math.floor(tick / 30));
    }, 2000);
  }

  init();
})();
