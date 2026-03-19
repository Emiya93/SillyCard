// SillyTavern st-api-wrapper Generate 封装（优先直连，降级 postMessage）
// 约束：只使用 chatHistory.replace / chatHistory.inject，不注入 preset/worldBook/extraBlocks

export type STChatRole = 'user' | 'model' | 'system';

export interface STChatMessage {
  role: STChatRole;
  parts: Array<{ text: string }>;
}

export interface STChatHistoryInjectEntry {
  message: STChatMessage;
  depth?: number;
  order?: number;
}

export interface STGenerateViaChatHistoryInput {
  timeoutMs?: number;
  forceCharacterId?: number;
  extraBlocks?: Array<{
    role: STChatRole;
    content: string;
    index?: number;
  }>;
  preset?: {
    mode: 'current';
  };
  worldBook?: {
    mode: 'current';
  };
  chatHistory: {
    replace?: STChatMessage[];
    inject?: STChatHistoryInjectEntry[];
  };
}

function normalizeRole(role: string): STChatRole {
  if (role === 'assistant') return 'model';
  if (role === 'user' || role === 'model' || role === 'system') return role;
  return 'user';
}

export function toSTChatMessage(role: string, content: string): STChatMessage {
  return {
    role: normalizeRole(role),
    parts: [{ text: content }],
  };
}

function getAccessibleSTAPI(): any | null {
  if (typeof window === 'undefined') return null;

  const tryGet = (win: any): any | null => {
    try {
      const api = win?.ST_API;
      if (api?.prompt && typeof api.prompt.generate === 'function') return api;
    } catch {
      // ignore cross-origin access failures
    }
    return null;
  };

  const local = tryGet(window as any);
  if (local) return local;

  try {
    if (window.top && window.top !== window) {
      const topApi = tryGet(window.top as any);
      if (topApi) return topApi;
    }
  } catch {
    // ignore
  }

  let current: Window = window;
  for (let i = 0; i < 5; i++) {
    try {
      if (current.parent && current.parent !== current) {
        const parentApi = tryGet(current.parent as any);
        if (parentApi) return parentApi;
        current = current.parent;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return null;
}

async function requestSTAPIViaPostMessage<T>(
  endpoint: string,
  params: any = {},
  timeout: number = 120000
): Promise<T | null> {
  if (typeof window === 'undefined') return null;

  const targets: Window[] = [];
  try {
    if (window.parent && window.parent !== window) targets.push(window.parent);
  } catch {
    // ignore
  }
  try {
    if (window.top && window.top !== window && !targets.includes(window.top)) targets.push(window.top);
  } catch {
    // ignore
  }

  if (targets.length === 0) return null;

  return new Promise((resolve) => {
    const messageId = `st_api_${endpoint}_${Date.now()}_${Math.random()}`;
    let timeoutId: number | undefined;
    let resolved = false;

    const messageHandler = (event: MessageEvent) => {
      if (resolved) return;
      if (!event.data || event.data.id !== messageId) return;

      resolved = true;
      if (typeof timeoutId === 'number') window.clearTimeout(timeoutId);
      window.removeEventListener('message', messageHandler);

      if (event.data.error) {
        resolve(null);
      } else {
        const result = event.data.data !== undefined ? event.data.data : event.data;
        resolve(result as T);
      }
    };

    window.addEventListener('message', messageHandler);

    for (const target of targets) {
      try {
        target.postMessage(
          {
            type: 'ST_API_CALL',
            id: messageId,
            endpoint,
            params,
          },
          '*'
        );
      } catch {
        // ignore
      }
    }

    timeoutId = window.setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', messageHandler);
        resolve(null);
      }
    }, timeout);
  });
}

async function hasSTProxy(timeoutMs: number = 1200): Promise<boolean> {
  try {
    const res = await requestSTAPIViaPostMessage<any>('ui.listSettingsPanels', {}, timeoutMs);
    return !!res;
  } catch {
    return false;
  }
}

function getGeneratedTextOrThrow(result: any): string {
  const text = result?.text;
  if (typeof text !== 'string') {
    throw new Error('ST_API.prompt.generate 返回结果缺少 text 字段');
  }

  if (text.trim().length === 0) {
    throw new Error(
      'ST_API.prompt.generate 返回空文本；说明酒馆侧生成链路已经执行，但当前模型、代理或预设没有产出内容。若开启了酒馆侧流式传输，请先关闭。常见原因还包括安全拦截、上下文过长，或上游接口静默失败。'
    );
  }

  return text;
}

export async function generateTextViaST(
  input: STGenerateViaChatHistoryInput
): Promise<string> {
  const timeoutMs = input.timeoutMs ?? 120000;
  const payload = {
    writeToChat: false,
    stream: false,
    timeoutMs,
    ...(typeof input.forceCharacterId === 'number' ? { forceCharacterId: input.forceCharacterId } : {}),
    ...(input.extraBlocks ? { extraBlocks: input.extraBlocks } : {}),
    ...(input.preset ? { preset: input.preset } : {}),
    ...(input.worldBook ? { worldBook: input.worldBook } : {}),
    chatHistory: input.chatHistory,
  };

  const stApi = getAccessibleSTAPI();
  if (stApi?.prompt?.generate) {
    const res = await stApi.prompt.generate(payload);
    return getGeneratedTextOrThrow(res);
  }

  const proxyOk = await hasSTProxy(1200);
  if (!proxyOk) {
    throw new Error(
      '无法直接访问 ST_API，且未检测到 postMessage 代理（请在酒馆端注入 sillytavern-message-handler.js）'
    );
  }

  const proxyRes = await requestSTAPIViaPostMessage<any>('prompt.generate', payload, timeoutMs);
  if (proxyRes) {
    return getGeneratedTextOrThrow(proxyRes);
  }

  throw new Error('无法调用 ST_API.prompt.generate：ST_API 不可用或跨域代理未安装');
}
