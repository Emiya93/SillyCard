(function () {
  'use strict';

  if (window.__wenwanGameMessageHandlerRegistered) {
    return;
  }
  window.__wenwanGameMessageHandlerRegistered = true;

  function getContext() {
    return window.SillyTavern?.getContext?.() || null;
  }

  function getWorldbookApi() {
    if (!window.ST_API) {
      return null;
    }

    return window.ST_API.worldBook || window.ST_API.worldbook || null;
  }

  function getCurrentCharacter(ctx) {
    if (!ctx?.characters) {
      return null;
    }

    const raw = ctx.characterId;
    if (raw === undefined || raw === null) {
      return null;
    }

    const numeric = Number(raw);
    return ctx.characters[raw] ?? (!Number.isNaN(numeric) ? ctx.characters[numeric] : null) ?? null;
  }

  async function getPresetPayload(ctx, params = {}) {
    if (window.ST_API?.preset?.get) {
      try {
        return await window.ST_API.preset.get(params.name ? { name: params.name } : undefined);
      } catch (error) {
        console.warn('[Wenwan Game] ST_API preset.get failed, falling back:', error);
      }
    }

    const presetManager = ctx?.getPresetManager?.('openai');
    if (!presetManager) {
      console.warn('[Wenwan Game] Failed to get preset: preset manager unavailable.');
      return null;
    }

    const presetName = params.name === 'in_use' || !params.name
      ? presetManager.getSelectedPresetName?.()
      : params.name;

    if (presetName && presetManager.getPresetSettings) {
      return { preset: presetManager.getPresetSettings(presetName) };
    }

    if (!ctx?.chatCompletionSettings) {
      console.warn('[Wenwan Game] Failed to get preset: no preset settings available.');
    }

    return { preset: ctx?.chatCompletionSettings || null };
  }

  async function getWorldbookNamesPayload(ctx, includeGlobalOnly) {
    const worldbookApi = getWorldbookApi();
    if (worldbookApi?.list) {
      try {
        const result = await worldbookApi.list();
        const worldBooks = Array.isArray(result?.worldBooks)
          ? result.worldBooks
          : Array.isArray(result)
            ? result
            : [];
        const filtered = includeGlobalOnly
          ? worldBooks.filter((book) => book.scope === 'global')
          : worldBooks;
        return { world_names: filtered.map((book) => book.name) };
      } catch (error) {
        console.warn('[Wenwan Game] ST_API worldbook.list failed, falling back:', error);
      }
    }

    if (ctx?.updateWorldInfoList) {
      try {
        await ctx.updateWorldInfoList();
      } catch {}
    }

    if (Array.isArray(window.world_names)) {
      return { world_names: window.world_names };
    }

    if (Array.isArray(ctx?.world_names)) {
      return { world_names: ctx.world_names };
    }

    console.warn('[Wenwan Game] Failed to get worldbook names from SillyTavern.');
    return { world_names: [] };
  }

  async function getWorldbookPayload(ctx, params = {}) {
    const worldbookName = params.name || params.worldbookName;
    if (!worldbookName) {
      console.warn('[Wenwan Game] Failed to get worldbook: no worldbook name was provided.');
      return null;
    }

    const worldbookApi = getWorldbookApi();
    if (worldbookApi?.get) {
      try {
        const result = await worldbookApi.get({ name: worldbookName });
        return result?.worldBook || result?.worldbook || result;
      } catch (error) {
        console.warn('[Wenwan Game] ST_API worldbook.get failed, falling back:', error);
      }
    }

    if (ctx?.loadWorldInfo) {
      try {
        return await ctx.loadWorldInfo(worldbookName);
      } catch {}
    }

    console.warn(`[Wenwan Game] Failed to get worldbook from SillyTavern: ${worldbookName}`);
    return null;
  }

  async function getBootstrapPayload(ctx, request = {}) {
    const needCharacter = Boolean(request.character || request.lorebook);
    const character = needCharacter ? getCurrentCharacter(ctx) : null;
    const presetPayload = request.preset ? await getPresetPayload(ctx, {}) : null;

    let lorebook = null;
    if (request.lorebook) {
      const preferredNames = [
        character?.data?.extensions?.world,
        character?.extensions?.world,
        ctx?.chatMetadata?.world_info,
        ctx?.chatMetadata?.['world_info'],
      ].filter((name) => typeof name === 'string' && name.length > 0);

      for (const worldbookName of preferredNames) {
        lorebook = await getWorldbookPayload(ctx, { name: worldbookName });
        if (lorebook) {
          break;
        }
      }

      if (!lorebook) {
        lorebook = character?.data?.character_book || character?.character_book || null;
      }
    }

    if (request.character && !character) {
      console.warn('[Wenwan Game] Failed to get character from SillyTavern bootstrap request.');
    }
    if (request.preset && !(presetPayload?.preset ?? presetPayload ?? ctx?.chatCompletionSettings)) {
      console.warn('[Wenwan Game] Failed to get preset from SillyTavern bootstrap request.');
    }
    if (request.lorebook && !lorebook) {
      console.warn('[Wenwan Game] Failed to get lorebook from SillyTavern bootstrap request.');
    }

    return {
      character: request.character ? (character || null) : undefined,
      preset: request.preset ? (presetPayload?.preset ?? presetPayload ?? ctx?.chatCompletionSettings ?? null) : undefined,
      lorebook: request.lorebook ? (lorebook || null) : undefined,
    };
  }

  function canHandleSource(event) {
    const allowedSource = window.__wenwanAllowedMessageSource;
    if (allowedSource && event.source !== allowedSource) {
      return false;
    }

    const allowedOrigins = window.__wenwanAllowedOrigins;
    if (Array.isArray(allowedOrigins) && allowedOrigins.length > 0) {
      const incomingOrigin = event.origin || 'null';
      if (!allowedOrigins.includes(incomingOrigin)) {
        return false;
      }
    }

    return true;
  }

  function postReply(event, data, payload) {
    const targetOrigin = event.origin && event.origin !== 'null' ? event.origin : '*';

    if (data.id) {
      event.source.postMessage({ id: data.id, data: payload }, targetOrigin);
      return;
    }

    event.source.postMessage({ type: 'SILLYTAVERN_DATA', ...payload }, targetOrigin);
  }

  function postError(event, data, message) {
    const targetOrigin = event.origin && event.origin !== 'null' ? event.origin : '*';
    console.warn('[Wenwan Game] Bridge request failed.', data.type, data.action || data.endpoint || data.request, message);

    if (data.id) {
      event.source.postMessage({ id: data.id, error: message }, targetOrigin);
      return;
    }

    event.source.postMessage({ type: 'SILLYTAVERN_ERROR', error: message }, targetOrigin);
  }

  window.addEventListener('message', async function (event) {
    const data = event.data;
    if (!data || typeof data !== 'object' || !canHandleSource(event)) {
      return;
    }

    if (data.type !== 'ST_API_CALL' && data.type !== 'SILLYTAVERN_API_CALL' && data.type !== 'SILLYTAVERN_GET_DATA') {
      return;
    }

    if (data.type === 'ST_API_CALL') {
      try {
        if (!window.ST_API) {
          postError(event, data, 'ST_API not available');
          return;
        }

        const [namespaceName, method] = String(data.endpoint || '').split('.');
        const namespace = window.ST_API[namespaceName]
          || (namespaceName === 'worldbook' ? window.ST_API.worldBook : null)
          || (namespaceName === 'worldBook' ? window.ST_API.worldbook : null);

        if (!namespace || typeof namespace[method] !== 'function') {
          postError(event, data, 'ST_API endpoint not available');
          return;
        }

        const result = await namespace[method](data.params || {});
        postReply(event, data, result);
      } catch (error) {
        postError(event, data, error?.message || 'Unknown error');
      }
      return;
    }

    const ctx = getContext();
    if (!ctx) {
      postError(event, data, 'SillyTavern context not available');
      return;
    }

    try {
      if (data.action === 'getPreset' || data.request?.getPreset !== undefined) {
        const params = data.params || (typeof data.request?.getPreset === 'object' ? data.request.getPreset : {});
        postReply(event, data, await getPresetPayload(ctx, params));
        return;
      }

      if (data.action === 'getGlobalWorldbookNames' || data.request?.getGlobalWorldbookNames !== undefined) {
        postReply(event, data, await getWorldbookNamesPayload(ctx, true));
        return;
      }

      if (data.action === 'getWorldbookNames' || data.request?.getWorldbookNames !== undefined || data.request?.worldbookNames) {
        postReply(event, data, await getWorldbookNamesPayload(ctx, false));
        return;
      }

      if (data.action === 'getWorldbook' || data.request?.getWorldbook || data.request?.worldbook) {
        const params = data.params
          || (typeof data.request?.getWorldbook === 'object' ? data.request.getWorldbook : {})
          || {};
        const worldbook = await getWorldbookPayload(ctx, {
          ...params,
          worldbookName: data.request?.worldbookName,
        });

        if (worldbook?.entries) {
          postReply(event, data, {
            entries: Array.isArray(worldbook.entries)
              ? worldbook.entries
              : Object.values(worldbook.entries),
          });
          return;
        }

        postReply(event, data, worldbook || null);
        return;
      }

      if (data.type === 'SILLYTAVERN_GET_DATA' && (data.request?.character || data.request?.preset || data.request?.lorebook)) {
        postReply(event, data, await getBootstrapPayload(ctx, data.request));
        return;
      }

      console.warn('[Wenwan Game] Received unsupported data request from iframe.', data.request || data.action);
    } catch (error) {
      postError(event, data, error?.message || 'Unknown error');
    }
  });
})();
