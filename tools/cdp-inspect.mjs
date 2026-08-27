import fs from "node:fs";

function argument(name) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

const port = Number(argument("--port") ?? "9333");
const width = Number(argument("--width") ?? "0");
const height = Number(argument("--height") ?? "0");
const waitMs = Number(argument("--wait") ?? "500");
const keyWaitMs = Number(argument("--key-wait") ?? "500");
const screenshot = argument("--screenshot");
const key = argument("--key");
const code = argument("--code");
const clickSelector = argument("--click");
const ctrlKey = process.argv.includes("--ctrl");
const shiftKey = process.argv.includes("--shift");
const setupQol = process.argv.includes("--setup-qol");
const allStorage = process.argv.includes("--all-storage");
const reload = process.argv.includes("--reload");
const url = argument("--url");

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === "page");
if (!target?.webSocketDebuggerUrl) throw new Error("No page target is available");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const events = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id === undefined) {
    if (message.method === "Runtime.consoleAPICalled") {
      events.push({ method: message.method, text: message.params.args.map((arg) => arg.value ?? arg.description).join(" ") });
    } else if (message.method === "Runtime.exceptionThrown") {
      events.push({ method: message.method, text: message.params.exceptionDetails.text });
    } else if (message.method === "Log.entryAdded") {
      events.push({ method: message.method, text: message.params.entry.text });
    }
    return;
  }
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await command("Runtime.enable");
await command("Page.enable");
await command("Log.enable");
if (url) {
  await command("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (reload) {
  await command("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (setupQol) {
  await command("Runtime.evaluate", {
    expression: `(() => {
      localStorage.setItem("neo:enabledMods", JSON.stringify(["qol"]));
      localStorage.setItem("neo:modConsents", JSON.stringify({ qol: ["ui:sidebar.replace"] }));
      localStorage.setItem("neo-angband:allow-third-party-mods", "yes");
      localStorage.setItem("neo:modPrefs:qol", JSON.stringify({
        v: 2,
        display: { v: 1, zoomIndex: 7, interfaceZoomIndex: 3, mapDetail: 0 },
      }));
      location.reload();
    })()`,
  });
  socket.close();
  process.exit(0);
}
if (width > 0 && height > 0) {
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await command("Runtime.evaluate", { expression: "window.dispatchEvent(new Event('resize'))" });
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}
if (key) {
  await command("Runtime.evaluate", {
    expression: `(() => { const game = document.querySelector("#game"); game?.focus(); game?.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code ?? "")}, ctrlKey: ${String(ctrlKey)}, shiftKey: ${String(shiftKey)}, bubbles: true })); })()`,
    awaitPromise: true,
  });
  await new Promise((resolve) => setTimeout(resolve, keyWaitMs));
}
if (clickSelector) {
  await command("Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(clickSelector)})?.click()`,
  });
  await new Promise((resolve) => setTimeout(resolve, keyWaitMs));
}

const measured = await command("Runtime.evaluate", {
  expression: `(() => {
    const sidebar = document.querySelector("[data-qol-responsive-sidebar]");
    const body = sidebar?.firstElementChild ?? null;
    const canvas = document.querySelector("#game");
    const rect = (element) => element ? Object.fromEntries(
      ["x", "y", "width", "height"].map((key) => [key, Number(element.getBoundingClientRect()[key].toFixed(2))])
    ) : null;
    return {
      location: location.href,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      localStorage: Object.fromEntries(
        (${String(allStorage)} ? Object.keys(localStorage).sort() : ["neo:enabledMods", "neo:modConsents", "neo:modPrefs:qol"])
          .filter((storageKey) => localStorage.getItem(storageKey) !== null)
          .map((storageKey) => [storageKey, localStorage.getItem(storageKey)]),
      ),
      document: {
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollWidth: document.body.scrollWidth,
        bodyScrollHeight: document.body.scrollHeight,
      },
      canvas: rect(canvas),
      attributes: {
        html: Object.fromEntries([...document.documentElement.attributes].map((item) => [item.name, item.value])),
        body: Object.fromEntries([...document.body.attributes].map((item) => [item.name, item.value])),
        canvas: canvas ? Object.fromEntries([...canvas.attributes].map((item) => [item.name, item.value])) : {},
      },
      sidebar: sidebar ? {
        rect: rect(sidebar),
        clientWidth: sidebar.clientWidth,
        clientHeight: sidebar.clientHeight,
        scrollWidth: sidebar.scrollWidth,
        scrollHeight: sidebar.scrollHeight,
        overflow: getComputedStyle(sidebar).overflow,
        pageText: sidebar.querySelector("[data-qol-sidebar-page]")?.textContent ?? null,
        body: body ? {
          rect: rect(body),
          display: getComputedStyle(body).display,
          scrollWidth: body.scrollWidth,
          scrollHeight: body.scrollHeight,
          children: body.children.length,
          samples: [...body.children].slice(0, 3).map((child) => ({
            text: child.textContent,
            rect: rect(child),
            runs: [...child.children].map((run) => ({ text: run.textContent, color: getComputedStyle(run).color })),
          })),
        } : null,
      } : null,
    };
  })()`,
  returnByValue: true,
});
console.log(JSON.stringify({ ...measured.result.value, events }, null, 2));

if (screenshot) {
  const capture = await command("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(screenshot, Buffer.from(capture.data, "base64"));
}

socket.close();
