/**
 * api.js —— 基于 axios 的后端接口封装
 *
 * 说明：
 *   常规 REST 请求一律走 axios；
 *   流式回复使用 axios 的 onDownloadProgress 读取增量响应文本，
 *   实现真正的边生成边渲染（不需要切到 fetch）。
 */
(function (global) {
  "use strict";

  const http = axios.create({
    baseURL: "/api",
    timeout: 0, // 流式请求不设总超时
    headers: { "Content-Type": "application/json" },
  });

  // 统一错误提示
  http.interceptors.response.use(
    (res) => res,
    (err) => {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "网络异常，请稍后重试";
      return Promise.reject(new Error(typeof detail === "string" ? detail : JSON.stringify(detail)));
    }
  );

  /**
   * 把 SSE 文本切成事件块。
   *
   * 注意：sse-starlette 用的是 \r\n 行分隔、\r\n\r\n 事件分隔，
   * 按 "\n\n" 直接切分会一个事件都切不出来。
   */
  function splitSSEBlocks(normalized) {
    const blocks = normalized.split("\n\n");
    return { complete: blocks.slice(0, -1), rest: blocks[blocks.length - 1] ?? "" };
  }

  function parseSSEBlock(block) {
    let event = "message";
    const dataLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    if (!dataLines.length) return null;
    try {
      return { event, data: JSON.parse(dataLines.join("\n")) };
    } catch {
      return null;
    }
  }

  const api = {
    // ---------- 元信息 ----------
    async health() {
      const { data } = await http.get("/health");
      return data;
    },

    async listPersonalities() {
      const { data } = await http.get("/personalities");
      return data;
    },

    // ---------- 会话 ----------
    async listSessions() {
      const { data } = await http.get("/sessions");
      return data;
    },

    async createSession() {
      const { data } = await http.post("/sessions");
      return data;
    },

    async getSessionMessages(sessionId) {
      const { data } = await http.get(`/sessions/${sessionId}/messages`);
      return data;
    },

    async deleteSession(sessionId) {
      const { data } = await http.delete(`/sessions/${sessionId}`);
      return data;
    },

    async clearSessions() {
      const { data } = await http.delete("/sessions");
      return data;
    },

    // ---------- 对话（非流式） ----------
    async chat({ message, history = [], sessionId = null, petName = "", personality = "gentle", temperature, maxTokens }) {
      const { data } = await http.post("/chat", {
        message,
        history,
        session_id: sessionId,
        pet_name: petName,
        personality,
        temperature,
        max_tokens: maxTokens,
      });
      return data;
    },

    /**
     * 对话（流式）
     *
     * 实现要点：
     *  1. 显式指定 adapter: 'xhr' —— fetch 适配器会把响应整包缓冲，
     *     导致 onDownloadProgress 拿不到增量，打字机效果会失效。
     *  2. 从多个位置尝试取出 XMLHttpRequest 实例读 responseText（各版本 axios 字段不同）。
     *  3. 请求结束后再对完整响应兜底解析一次，保证即使没有增量事件也能拿到回复。
     *
     * @param {object}   opts
     * @param {string}   opts.message      本轮用户输入
     * @param {Array}    opts.history      历史消息 [{role, content}]
     * @param {string}   opts.sessionId    可选会话 ID
     * @param {string}   opts.petName      宠物名字
     * @param {string}   opts.personality  性格 ID
     * @param {Function} opts.onMeta       ({session_id, model, pet_name, personality}) => void
     * @param {Function} opts.onDelta      (text) => void
     * @param {Function} opts.onDone       ({session_id}) => void
     * @param {AbortSignal} opts.signal    中断信号
     * @returns {Promise<void>}
     */
    async chatStream({
      message,
      history = [],
      sessionId = null,
      petName = "",
      personality = "gentle",
      onMeta,
      onDelta,
      onDone,
      signal,
    }) {
      let rawLen = 0; // 已消费的 responseText 字符数
      let buf = ""; // 尚未构成完整事件的尾巴
      let settled = false;
      let emitted = 0;

      // 增量喂入：只处理「新到达」的字节，绝不重复派发旧事件
      const feed = (raw) => {
        if (typeof raw !== "string" || raw.length <= rawLen) return;

        buf += raw.slice(rawLen).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        rawLen = raw.length;

        const { complete, rest } = splitSSEBlocks(buf);
        buf = rest;

        for (const block of complete) {
          if (!block.trim()) continue;
          const parsed = parseSSEBlock(block);
          if (!parsed) continue;

          const { event, data } = parsed;
          if (event === "meta") {
            onMeta && onMeta(data);
          } else if (event === "delta") {
            const t = data.text || "";
            if (!t) continue;
            emitted += t.length;
            onDelta && onDelta(t);
          } else if (event === "done") {
            if (settled) continue;
            settled = true;
            onDone && onDone(data);
          } else if (event === "error") {
            settled = true;
            throw new Error(data.message || "模型响应失败");
          }
        }
      };

      // 从 progress 事件里掏出 XHR（axios 不同版本挂的位置不一样）
      const pickXhr = (e) =>
        e?.event?.target ||
        e?.event?.currentTarget ||
        e?.target ||
        e?.currentTarget ||
        e?.event?.srcElement ||
        null;

      const handleProgress = (progressEvent) => {
        const xhr = pickXhr(progressEvent);
        const text = xhr && typeof xhr.responseText === "string" ? xhr.responseText : "";
        if (text) feed(text);
      };

      try {
        const res = await http.post(
          "/chat/stream",
          {
            message,
            history,
            session_id: sessionId,
            pet_name: petName,
            personality,
          },
          {
            adapter: "xhr",
            responseType: "text",
            onDownloadProgress: handleProgress,
            signal,
            // 关闭 axios 对返回体的解析，保持 SSE 原文
            transformResponse: [(d) => d],
          }
        );

        // 兜底：整个响应到达后再喂一次，覆盖完全没有增量事件的情况
        const finalText = typeof res.data === "string" ? res.data : "";
        if (finalText) feed(finalText);

        if (!settled) {
          onDone && onDone({ session_id: sessionId });
        }
        if (emitted === 0) {
          throw new Error("模型没有返回内容，请重试。");
        }
      } catch (err) {
        if (err?.name === "CanceledError" || err?.name === "AbortError") {
          return; // 用户主动中断，不抛错
        }
        throw err;
      }
    },
  };

  global.KittyAPI = api;
})(window);
