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

    function getWorldBookApi(api) {
        if (!api) return null;
        return api.worldBook || api.worldbook || null;
    }

    function warnMissing(label, detail) {
        if (detail !== undefined) {
            console.warn("[SillyTavern Host] Failed to get " + label + " from SillyTavern.", detail);
            return;
        }

        console.warn("[SillyTavern Host] Failed to get " + label + " from SillyTavern.");
    }

    function getCurrentCharacter(ctx) {
        if (!ctx?.characters) return null;
        const raw = ctx.characterId;
        if (raw === undefined || raw === null) return null;

        const numeric = Number(raw);
        return ctx.characters[raw] ?? (!Number.isNaN(numeric) ? ctx.characters[numeric] : null) ?? null;
    }

    async function getPresetPayload(data) {
        const api = getSTAPI();
        if (api?.preset?.get) {
            return await api.preset.get(data.params?.name ? { name: data.params.name } : undefined);
        }

        const ctx = getContext();
        const presetManager = ctx?.getPresetManager?.("openai");
        if (!presetManager) {
            warnMissing("preset", "preset manager unavailable");
            return null;
        }

        const presetName = data.params?.name === "in_use" || !data.params?.name
            ? presetManager.getSelectedPresetName?.()
            : data.params.name;

        if (presetName && presetManager.getPresetSettings) {
            return presetManager.getPresetSettings(presetName);
        }

        warnMissing("preset", "selected preset settings unavailable");
        return null;
    }

    async function getWorldbookNamesPayload(includeGlobalOnly) {
        const api = getSTAPI();
        const worldBookApi = getWorldBookApi(api);
        if (worldBookApi?.list) {
            const response = await worldBookApi.list();
            const worldBooks = Array.isArray(response?.worldBooks)
                ? response.worldBooks
                : Array.isArray(response)
                    ? response
                    : [];
            const filtered = includeGlobalOnly
                ? worldBooks.filter((book) => book.scope === "global")
                : worldBooks;
            return { world_names: filtered.map((book) => book.name) };
        }

        warnMissing(includeGlobalOnly ? "global worldbook names" : "worldbook names", "worldbook list API unavailable");
        return { world_names: [] };
    }

    async function getWorldbookPayload(data) {
        if (!data.params?.name) {
            warnMissing("worldbook", "worldbook name not provided");
            return null;
        }

        const api = getSTAPI();
        const worldBookApi = getWorldBookApi(api);
        if (worldBookApi?.get) {
            const response = await worldBookApi.get({ name: data.params?.name });
            return response?.worldBook || response?.worldbook || response;
        }

        warnMissing("worldbook", "worldbook get API unavailable");
        return null;
    }

    async function getLorebookPayload(ctx, character) {
        const worldBookNames = [
            character?.data?.extensions?.world,
            character?.extensions?.world,
            ctx?.chatMetadata?.world_info,
            ctx?.chatMetadata?.["world_info"],
        ].filter((name) => typeof name === "string" && name.length > 0);

        if (worldBookNames.length === 0) {
            const embeddedLorebook = character?.data?.character_book || character?.character_book || null;
            if (!embeddedLorebook) {
                warnMissing("lorebook", "no bound worldbook name or embedded character_book");
            }
            return embeddedLorebook;
        }

        const api = getSTAPI();
        const worldBookApi = getWorldBookApi(api);

        for (const worldBookName of worldBookNames) {
            if (worldBookApi?.get) {
                try {
                    const response = await worldBookApi.get({ name: worldBookName });
                    const worldBook = response?.worldBook || response?.worldbook || response;
                    if (worldBook) {
                        return worldBook;
                    }
                } catch (error) {
                    warnMissing('lorebook "' + worldBookName + '"', error?.message || error);
                }
            }

            if (ctx?.loadWorldInfo) {
                try {
                    const worldInfo = await ctx.loadWorldInfo(worldBookName);
                    if (worldInfo) {
                        return worldInfo;
                    }
                } catch (error) {
                    warnMissing('lorebook "' + worldBookName + '"', error?.message || error);
                }
            }
        }

        const embeddedLorebook = character?.data?.character_book || character?.character_book || null;
        if (!embeddedLorebook) {
            warnMissing("lorebook", "all worldbook lookups returned empty");
        }
        return embeddedLorebook;
    }

    async function getBootstrapPayload(request = {}) {
        const ctx = getContext();
        const character = (request.character || request.lorebook) ? getCurrentCharacter(ctx) : null;
        const presetPayload = request.preset ? await getPresetPayload({ params: {} }) : null;
        const lorebook = request.lorebook ? await getLorebookPayload(ctx, character) : null;

        if (request.character && !character) {
            warnMissing("character", "current character unavailable in SillyTavern context");
        }

        if (request.preset && !(presetPayload?.preset ?? presetPayload ?? ctx?.chatCompletionSettings)) {
            warnMissing("preset", "bootstrap request returned empty data");
        }

        if (request.lorebook && !lorebook) {
            warnMissing("lorebook", "bootstrap request returned empty data");
        }

        return {
            character: request.character ? (character || null) : undefined,
            preset: request.preset ? (presetPayload?.preset ?? presetPayload ?? ctx?.chatCompletionSettings ?? null) : undefined,
            lorebook: request.lorebook ? (lorebook || null) : undefined,
        };
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
        "worldbook.list",
        "worldbook.get",
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
        const targetOrigin = event.origin === "null" ? "*" : event.origin;
        const reply = (payload) => event.source.postMessage(payload, targetOrigin);
        const replyData = (payload) => {
            if (data.id) {
                reply({ id: data.id, data: payload });
                return;
            }

            reply({ type: "SILLYTAVERN_DATA", ...payload });
        };
        const replyError = (error) => {
            console.warn("[SillyTavern Host] Bridge request failed.", data.type, data.action || data.endpoint || data.request, error);
            if (data.id) {
                reply({ id: data.id, error });
                return;
            }

            reply({ type: "SILLYTAVERN_ERROR", error });
        };

        if (data.type === "ST_API_CALL") {
            if (!ALLOWED_ST.has(data.endpoint)) return replyError("Denied");
            if (!api) return replyError("No API");
            try {
                const [ns, method] = data.endpoint.split(".");
                const namespace = api[ns]
                    || (ns === "worldbook" ? api.worldBook : null)
                    || (ns === "worldBook" ? api.worldbook : null);
                if (!namespace?.[method]) {
                    return replyError("No API");
                }
                const res = await namespace[method](data.params);
                replyData(res);
            } catch (e) {
                replyError(e.message);
            }
            return;
        }

        if (data.type === "SILLYTAVERN_API_CALL") {
            if (!ALLOWED_ACT.has(data.action)) return replyError("Denied");
            try {
                let res = null;
                if (data.action === "getPreset") res = await getPresetPayload(data);
                if (data.action === "getGlobalWorldbookNames") res = await getWorldbookNamesPayload(true);
                if (data.action === "getWorldbookNames") res = await getWorldbookNamesPayload(false);
                if (data.action === "getWorldbook") res = await getWorldbookPayload(data);
                replyData(res);
            } catch (e) {
                replyError(e.message);
            }
            return;
        }

        if (data.type === "SILLYTAVERN_GET_DATA") {
            try {
                if (data.request?.character || data.request?.preset || data.request?.lorebook) {
                    const res = await getBootstrapPayload(data.request);
                    replyData(res);
                    return;
                }

                if (data.request?.getPreset !== undefined) {
                    const params = typeof data.request.getPreset === "object" ? data.request.getPreset : {};
                    const res = await getPresetPayload({ params });
                    replyData(res);
                    return;
                }

                if (data.request?.getGlobalWorldbookNames !== undefined) {
                    const res = await getWorldbookNamesPayload(true);
                    replyData(res);
                    return;
                }

                if (data.request?.getWorldbookNames !== undefined) {
                    const res = await getWorldbookNamesPayload(false);
                    replyData(res);
                    return;
                }

                if (data.request?.getWorldbook) {
                    const params = typeof data.request.getWorldbook === "object" ? data.request.getWorldbook : {};
                    const res = await getWorldbookPayload({ params });
                    replyData(res);
                    return;
                }

                console.warn("[SillyTavern Host] Received unsupported SILLYTAVERN_GET_DATA request.", data.request);
            } catch (e) {
                replyError(e.message);
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
