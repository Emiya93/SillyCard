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
  // 未知角色统一当作 user，避免直接抛错导致流程中断
  return 'user';
}

export function toSTChatMessage(role: string, content: string): STChatMessage {
  return {
    role: normalizeRole(role),
    parts: [{ text: content }]
  };
}

/**
 * 尝试获取可直接访问的 ST_API（同域/可访问 top/parent 时有效）
 */
function getAccessibleSTAPI(): any | null {
  if (typeof window === 'undefined') return null;

  const tryGet = (win: any): any | null => {
    try {
      const api = win?.ST_API;
      if (api?.prompt && typeof api.prompt.generate === 'function') return api;
    } catch {
      // 跨域访问失败
    }
    return null;
  };

  // 当前窗口
  const local = tryGet(window as any);
  if (local) return local;

  // top
  try {
    if (window.top && window.top !== window) {
      const topApi = tryGet(window.top as any);
      if (topApi) return topApi;
    }
  } catch {
    // ignore
  }

  // parent 链
  let current: Window = window;
  for (let i = 0; i < 5; i++) {
    try {
      if (current.parent && current.parent !== current) {
        const p = tryGet(current.parent as any);
        if (p) return p;
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

/**
 * 通过 postMessage 调用酒馆端的 ST_API（跨域 iframe 场景）
 * 需要酒馆端注入 `sillytavern-message-handler.js` 来响应 `ST_API_CALL`
 */
async function requestSTAPIViaPostMessage<T>(
  endpoint: string, // e.g. 'prompt.generate'
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

    // 广播给 parent/top（谁有 handler 谁响应）
    for (const t of targets) {
      try {
        t.postMessage(
          {
            type: 'ST_API_CALL',
            id: messageId,
            endpoint,
            params
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
    // 用一个无副作用、几乎总是可用的 endpoint 探活
    const res = await requestSTAPIViaPostMessage<any>('ui.listSettingsPanels', {}, timeoutMs);
    return !!res;
  } catch {
    return false;
  }
}

/**
 * 使用 st-api-wrapper 的 `ST_API.prompt.generate` 后台生成文本。
 * - 默认 writeToChat=false（只返回文本）
 * - 支持通过 extraBlocks 注入系统提示词
 */
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
    chatHistory: input.chatHistory
  };

  // 1) 同域可直连
  const stApi = getAccessibleSTAPI();
  if (stApi?.prompt?.generate) {
    const res = await stApi.prompt.generate(payload);
    const text = res?.text;
    if (typeof text === 'string') return text;
    throw new Error('ST_API.prompt.generate 返回空结果');
  }

  // 2) 直连不可用时，先探活 postMessage 代理，避免无响应时卡住整整 timeoutMs
  const proxyOk = await hasSTProxy(1200);
  if (!proxyOk) {
    throw new Error(
      '无法直接访问 ST_API，且未检测到 postMessage 代理（请在酒馆端注入 sillytavern-message-handler.js）'
    );
  }

  // 2) 跨域：postMessage 代理
  const proxyRes = await requestSTAPIViaPostMessage<any>('prompt.generate', payload, timeoutMs);
  const proxyText = proxyRes?.text;
  if (typeof proxyText === 'string') return proxyText;

  throw new Error('无法调用 ST_API.prompt.generate：ST_API 不可用或跨域代理未安装');
}
