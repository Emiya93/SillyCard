import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export const SILLYTAVERN_HOST_FILE_NAME = "sillytavern-host.html";
export const SILLYTAVERN_APP_URL = "http://127.0.0.1:3000/";

export function buildSillyTavernHostHtml(appUrl = SILLYTAVERN_APP_URL) {
  const appOrigin = new URL(appUrl).origin;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    body, html { margin: 0; padding: 0; width: 100%; background: transparent; }

    .ratio-box {
        width: 100%;
        position: relative;
        aspect-ratio: 9 / 14;
        background: #000;
        overflow: hidden;
    }

    iframe {
        position: absolute; top: 0; left: 0;
        width: 100%; height: 100%;
        border: none;
        display: block;
    }

    .loading {
        position: absolute; inset: 0;
        background: #fff;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: monospace; font-size: 12px; color: #333;
        z-index: 99;
    }
</style>
</head>
<body>

<div class="ratio-box">
    <div class="loading" id="loading">
        <div>Loading Resources...</div>
        <div id="stinfo" style="margin-top:5px; color:#d32f2f;"></div>
    </div>

    <iframe id="appFrame" allowfullscreen allow="clipboard-read; clipboard-write"></iframe>
</div>

<script>
    const APP_URL = ${JSON.stringify(appUrl)};
    const APP_ORIGIN = ${JSON.stringify(appOrigin)};
    const loading = document.getElementById("loading");
    const stinfo = document.getElementById("stinfo");
    const frame = document.getElementById("appFrame");

    frame.src = APP_URL;

    frame.addEventListener("load", () => {
        setTimeout(() => { loading.style.display = "none"; }, 500);
    });

    function getSTAPI() {
        try { if (window.ST_API) return window.ST_API; } catch {}
        try { if (window.parent?.ST_API) return window.parent.ST_API; } catch {}
        try { if (window.top?.ST_API) return window.top.ST_API; } catch {}
        return null;
    }

    function getContext() {
        try { if (window.SillyTavern?.getContext) return window.SillyTavern.getContext(); } catch {}
        try { if (window.parent?.SillyTavern?.getContext) return window.parent.SillyTavern.getContext(); } catch {}
        try { if (window.top?.SillyTavern?.getContext) return window.top.SillyTavern.getContext(); } catch {}
        return null;
    }

    async function getPresetPayload(data) {
        const api = getSTAPI();
        if (api?.preset?.get) {
            return await api.preset.get(data.params?.name ? { name: data.params.name } : undefined);
        }

        const ctx = getContext();
        const presetManager = ctx?.getPresetManager?.("openai");
        if (!presetManager) {
            return null;
        }

        const presetName = data.params?.name === "in_use" || !data.params?.name
            ? presetManager.getSelectedPresetName?.()
            : data.params.name;

        if (presetName && presetManager.getPresetSettings) {
            return presetManager.getPresetSettings(presetName);
        }

        return null;
    }

    async function getWorldbookNamesPayload(includeGlobalOnly) {
        const api = getSTAPI();
        if (api?.worldBook?.list) {
            const response = await api.worldBook.list();
            const worldBooks = Array.isArray(response?.worldBooks) ? response.worldBooks : [];
            const filtered = includeGlobalOnly
                ? worldBooks.filter((book) => book.scope === "global")
                : worldBooks;
            return { world_names: filtered.map((book) => book.name) };
        }

        return { world_names: [] };
    }

    async function getWorldbookPayload(data) {
        const api = getSTAPI();
        if (api?.worldBook?.get) {
            return await api.worldBook.get({ name: data.params?.name });
        }

        return null;
    }

    setInterval(() => {
        stinfo.innerText = getSTAPI() ? "ST_API: OK" : "ST_API: Connecting...";
    }, 1500);

    const ALLOWED_ST = new Set([
        "prompt.generate",
        "prompt.get",
        "prompt.buildRequest",
        "ui.listSettingsPanels",
        "preset.get",
        "worldBook.list",
        "worldBook.get",
    ]);
    const ALLOWED_ACT = new Set([
        "getPreset",
        "getGlobalWorldbookNames",
        "getWorldbookNames",
        "getWorldbook",
    ]);

    window.addEventListener("message", async (event) => {
        if (event.source !== frame.contentWindow) return;
        if (event.origin !== APP_ORIGIN && event.origin !== "null") return;
        const data = event.data;
        if (!data || typeof data !== "object") return;

        const api = getSTAPI();
        const reply = (payload) => event.source.postMessage(payload, event.origin === "null" ? "*" : event.origin);

        if (data.type === "ST_API_CALL") {
            if (!ALLOWED_ST.has(data.endpoint)) return reply({ id: data.id, error: "Denied" });
            if (!api) return reply({ id: data.id, error: "No API" });
            try {
                const [ns, method] = data.endpoint.split(".");
                const res = await api[ns][method](data.params);
                reply({ id: data.id, data: res });
            } catch (e) {
                reply({ id: data.id, error: e.message });
            }
            return;
        }

        if (data.type === "SILLYTAVERN_API_CALL") {
            if (!ALLOWED_ACT.has(data.action)) return reply({ id: data.id, error: "Denied" });
            try {
                let res = null;
                if (data.action === "getPreset") res = await getPresetPayload(data);
                if (data.action === "getGlobalWorldbookNames") res = await getWorldbookNamesPayload(true);
                if (data.action === "getWorldbookNames") res = await getWorldbookNamesPayload(false);
                if (data.action === "getWorldbook") res = await getWorldbookPayload(data);
                reply({ id: data.id, data: res });
            } catch (e) {
                reply({ id: data.id, error: e.message });
            }
            return;
        }

        if (data.type === "SILLYTAVERN_GET_DATA") {
            try {
                if (data.request?.getPreset !== undefined) {
                    const params = typeof data.request.getPreset === "object" ? data.request.getPreset : {};
                    const res = await getPresetPayload({ params });
                    reply({ id: data.id, data: res });
                    return;
                }

                if (data.request?.getGlobalWorldbookNames !== undefined) {
                    const res = await getWorldbookNamesPayload(true);
                    reply({ id: data.id, data: res });
                    return;
                }

                if (data.request?.getWorldbookNames !== undefined) {
                    const res = await getWorldbookNamesPayload(false);
                    reply({ id: data.id, data: res });
                    return;
                }

                if (data.request?.getWorldbook) {
                    const params = typeof data.request.getWorldbook === "object" ? data.request.getWorldbook : {};
                    const res = await getWorldbookPayload({ params });
                    reply({ id: data.id, data: res });
                    return;
                }
            } catch (e) {
                reply({ id: data.id, error: e.message });
            }
        }
    });
</script>
</body>
</html>`.trim();
}

export function writeSillyTavernHost(outputDir = path.join(projectRoot, "dist", "sillytavern")) {
  const outputPath = path.join(outputDir, SILLYTAVERN_HOST_FILE_NAME);
  const html = `${buildSillyTavernHostHtml()}\n`;

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");

  const relativePath = path.relative(projectRoot, outputPath) || SILLYTAVERN_HOST_FILE_NAME;
  console.log(`[generate-sillytavern-host] wrote ${relativePath}`);
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const outputArg = process.argv[2];
  const outputDir = outputArg
    ? path.isAbsolute(outputArg)
      ? outputArg
      : path.resolve(projectRoot, outputArg)
    : path.join(projectRoot, "dist", "sillytavern");

  writeSillyTavernHost(outputDir);
}
