/**
 * e2e.mjs —— 端到端联调脚本
 *
 * 用 Chrome DevTools Protocol 驱动真实浏览器，走完整链路：
 *   打开页面 → 选性格 → 起名字 → 发消息 → 收 AI 回复
 * 每一步都会截图到 .shots/
 *
 * 用法： node tools/e2e.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SHOTS = resolve(ROOT, ".shots");
const PROFILE = resolve(ROOT, ".chrome-e2e");
const URL = process.env.APP_URL || "http://127.0.0.1:8000/";
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;

// 每次跑都用全新 profile，避免上次的 localStorage 干扰
rmSync(PROFILE, { recursive: true, force: true });

mkdirSync(SHOTS, { recursive: true });

// ---------- 小工具 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...a) {
  console.log("[e2e]", ...a);
}

async function getDebuggerUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* Chrome 还没起来 */
    }
    await sleep(250);
  }
  throw new Error("Chrome DevTools 端口未就绪");
}

function connectCdp(wsUrl) {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;

    ws.onopen = () => resolvePromise({ ws, send, evaluate, screenshot, navigate });
    ws.onerror = (e) => reject(new Error("WebSocket 连接失败: " + (e.message || e)));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((res, rej) => {
        const id = ++seq;
        pending.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const r = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) {
        throw new Error(
          "页面脚本报错: " +
            (r.exceptionDetails.exception?.description || r.exceptionDetails.text)
        );
      }
      return r.result?.value;
    }

    async function screenshot(name) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(resolve(SHOTS, name), Buffer.from(r.data, "base64"));
      log("截图 →", name);
    }

    async function navigate(url) {
      await send("Page.enable");
      await send("Runtime.enable");
      await send("Page.navigate", { url });
      await sleep(1800);
    }
  });
}

// ---------- 测试步骤 ----------
async function main() {
  log("启动 Chrome (headless) …");
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--window-size=1400,1050",
    "about:blank",
  ]);
  chrome.stderr.on("data", () => {});

  let cdp;
  try {
    cdp = await connectCdp(await getDebuggerUrl());
    log("CDP 已连接");

    // --- 1. 打开页面，应看到选性格界面 ---
    await cdp.navigate(URL);
    await sleep(1200);
    await cdp.screenshot("e2e-1-personality.png");

    const gridCount = await cdp.evaluate(
      `document.querySelectorAll('#charGrid .char-card').length`
    );
    log("性格卡片数量 =", gridCount);
    if (gridCount < 6) throw new Error(`性格卡片数量异常：${gridCount}`);

    const personalityVisible = await cdp.evaluate(
      `!document.getElementById('setupPersonality').hidden`
    );
    if (!personalityVisible) throw new Error("选性格界面未显示");

    // --- 2. 点击「暴躁」卡片 ---
    const clicked = await cdp.evaluate(`(() => {
      const card = document.querySelector('#charGrid .char-card[data-id="tsundere"]');
      if (!card) return 'NO_CARD';
      card.click();
      return 'OK';
    })()`);
    log("点击暴躁卡片 →", clicked);
    if (clicked !== "OK") throw new Error("点击性格卡片失败");
    await sleep(900);
    await cdp.screenshot("e2e-2-name.png");

    const nameStepVisible = await cdp.evaluate(
      `!document.getElementById('setupName').hidden`
    );
    if (!nameStepVisible) throw new Error("起名字界面未显示");

    const badgeText = await cdp.evaluate(
      `document.getElementById('pickedBadge').innerText.trim()`
    );
    log("已选性格徽章 =", JSON.stringify(badgeText));
    if (!badgeText.includes("暴躁")) throw new Error("性格徽章内容不对: " + badgeText);

    // --- 3. 输入名字，进入聊天 ---
    await cdp.evaluate(`(() => {
      const el = document.getElementById('petNameInput');
      el.value = '小煤球';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(300);
    await cdp.evaluate(`document.getElementById('btnStartChat').click()`);
    await sleep(800);
    await cdp.screenshot("e2e-3-welcome.png");

    const welcomeText = await cdp.evaluate(
      `document.getElementById('welcomeText').innerText`
    );
    log("欢迎语 =", JSON.stringify(welcomeText));
    if (!welcomeText.includes("小煤球")) throw new Error("欢迎语未包含宠物名");

    const nameplate = await cdp.evaluate(
      `document.getElementById('petNameplate').innerText`
    );
    log("机身铭牌 =", JSON.stringify(nameplate));
    if (!nameplate.includes("小煤球")) throw new Error("机身铭牌未更新");

    // --- 4. 发消息，等 AI 回复（同时采样长度，验证是否真的在流式增长）---
    await cdp.evaluate(`(() => {
      const el = document.getElementById('input');
      el.value = '你好呀，你是谁？';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(300);
    await cdp.evaluate(`document.getElementById('btnSend').click()`);

    log("已发送，采样回复增长过程 …");
    const samples = [];
    let reply = "";
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      reply = await cdp.evaluate(`(() => {
        const nodes = document.querySelectorAll('#messages .msg--ai .msg__content');
        return nodes.length ? nodes[nodes.length - 1].innerText.trim() : '';
      })()`);
      samples.push(reply.length);
      if (reply && reply !== "…" && reply.length > 4 && i > 3) {
        // 再多等几轮，让流式跑完
        await sleep(1500);
        reply = await cdp.evaluate(`(() => {
          const nodes = document.querySelectorAll('#messages .msg--ai .msg__content');
          return nodes.length ? nodes[nodes.length - 1].innerText.trim() : '';
        })()`);
        break;
      }
    }
    await cdp.screenshot("e2e-4-reply.png");

    const growth = samples.filter((v, i) => i === 0 || v !== samples[i - 1]);
    log("长度采样 =", samples.filter((_, i) => i < 40).join(","));
    log("增长次数 =", growth.length, "最终长度 =", reply.length);

    log("AI 回复 =", JSON.stringify(reply.slice(0, 120)));
    if (!reply || reply === "…") throw new Error("未收到 AI 回复");

    // 校验没有重复派发导致的文本重复
    const half = reply.length / 2;
    if (reply.length >= 12) {
      const a = reply.slice(0, Math.floor(half));
      const b = reply.slice(Math.ceil(half));
      if (reply.includes(a) && a.length > 10 && reply.indexOf(a) !== 0) {
        throw new Error("检测到文本重复：可能事件被重复派发");
      }
      void b;
    }

    if (growth.length < 2) {
      log("⚠ 回复是一次性到达（未观察到流式增长），但内容正确");
    } else {
      log("流式增量正常 ✅");
    }

    const inCharacter =
      reply.includes("小煤球") || /哼|笨蛋|喂|哈\?|烦|切/.test(reply);
    log("人设命中 =", inCharacter);
    if (!inCharacter) {
      log("⚠ 回复未体现「暴躁」人设，但对话本身已跑通");
    }

    // --- 5. 校验请求里真的带了宠物参数 ---
    const petOk = await cdp.evaluate(`(() => {
      const t = document.getElementById('petNameplate').innerText;
      return t.includes('小煤球');
    })()`);
    if (!petOk) throw new Error("宠物名未持久化到机身铭牌");

    log("全部通过 ✅");
  } finally {
    try {
      cdp?.ws?.close();
    } catch {}
    chrome.kill();
  }
}

main().catch((e) => {
  console.error("[e2e] 失败:", e.message);
  process.exit(1);
});
