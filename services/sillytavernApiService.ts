// SillyTavern API 服务 - 优先使用 TavernHelper，降级到 st-api-wrapper
// 直接访问 SillyTavern 的预设和世界书数据，支持跨域（Cloudflare部署）

const CHAT_API_TYPE = 'openai'; // 默认使用 openai 类型

/**
 * 检测 TavernHelper 是否可用（包括父窗口）
 */
function isTavernHelperAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  
  // 检查当前窗口
  if (typeof window.TavernHelper !== 'undefined') {
    return true;
  }
  
  // 检查父窗口（如果在 iframe 中）
  try {
    if (window.parent !== window && typeof window.parent.TavernHelper !== 'undefined') {
      return true;
    }
  } catch (e) {
    // 跨域访问失败，忽略
  }
  
  return false;
}

/**
 * 获取 TavernHelper 实例（优先当前窗口，然后检查top，再逐层向上查找parent）
 * 参考：XianTu项目的实现方式
 */
function getTavernHelper(): typeof window.TavernHelper | null {
  if (typeof window === 'undefined') return null;
  
  // 1. 优先使用当前窗口的 TavernHelper
  if (typeof window.TavernHelper !== 'undefined') {
    return window.TavernHelper;
  }
  
  // 2. 尝试直接访问 top（最顶层窗口）- 这是关键！
  try {
    if (window.top && window.top !== window && typeof (window.top as any).TavernHelper !== 'undefined') {
      return (window.top as any).TavernHelper;
    }
  } catch (e) {
    // 跨域访问失败，继续尝试其他方法
  }
  
  // 3. 逐层向上查找 parent，最多 5 层
  let currentWindow: Window = window;
  for (let i = 0; i < 5; i++) {
    try {
      if (currentWindow.parent && currentWindow.parent !== currentWindow) {
        if (typeof (currentWindow.parent as any).TavernHelper !== 'undefined') {
          return (currentWindow.parent as any).TavernHelper;
        }
        currentWindow = currentWindow.parent;
      } else {
        break;
      }
    } catch (e) {
      // 跨域访问失败，停止向上查找
      break;
    }
  }
  
  return null;
}

/**
 * 获取 SillyTavern 上下文
 */
function getSTContext(): any {
  if (typeof window === 'undefined') return null;
  
  // 方法1: 直接访问
  if ((window as any).SillyTavern?.getContext) {
    return (window as any).SillyTavern.getContext();
  }
  
  // 方法2: 通过父窗口（跨域时）
  if (window.parent !== window) {
    try {
      const parent = window.parent as any;
      if (parent.SillyTavern?.getContext) {
        return parent.SillyTavern.getContext();
      }
    } catch (e) {
      // 跨域访问失败
    }
  }
  
  return null;
}

function getWorldbookApi(): any {
  if (typeof window === 'undefined') return null;
  const api = (window as any).ST_API;
  if (!api) return null;
  return api.worldBook ?? api.worldbook ?? null;
}

/**
 * 通过 postMessage 请求数据（跨域时使用）
 * 支持多种消息格式，以兼容不同的 SillyTavern 版本
 */
async function requestViaPostMessage<T>(
  action: string,
  params: any = {},
  timeout: number = 5000
): Promise<T | null> {
  if (window.parent === window) {
    console.warn(`[SillyTavern API] Cannot request ${action} via postMessage because the app is not inside an iframe.`, params);
    return null;
  }

  return new Promise((resolve) => {
    const messageId = `st_api_${action}_${Date.now()}_${Math.random()}`;
    let timeoutId: NodeJS.Timeout;
    let resolved = false;

    const messageHandler = (event: MessageEvent) => {
      if (resolved) return;
      
      // 检查多种可能的响应格式
      if (event.data) {
        // 格式1: 带ID的响应（新格式）
        if (event.data.id === messageId) {
          resolved = true;
          clearTimeout(timeoutId);
          window.removeEventListener('message', messageHandler);
          if (event.data.error) {
            console.warn(`[SillyTavern API] postMessage request failed: ${action}`, event.data.error, params);
          }
          const result = event.data.data !== undefined ? event.data.data : event.data;
          resolve(result as T);
          return;
        }
        
        // 格式2: 直接的数据对象（兼容旧格式）
        if (event.data.type === 'SILLYTAVERN_DATA' || event.data.type === 'ST_DATA') {
          resolved = true;
          clearTimeout(timeoutId);
          window.removeEventListener('message', messageHandler);
          resolve(event.data as T);
          return;
        }
      }
    };

    window.addEventListener('message', messageHandler);

    try {
      // 发送新格式的消息（优先）
      window.parent.postMessage({
        type: 'SILLYTAVERN_API_CALL',
        id: messageId,
        action,
        params
      }, '*');
      
      // 也发送旧格式（兼容，延迟一点发送）
      setTimeout(() => {
        if (!resolved) {
          window.parent.postMessage({
            type: 'SILLYTAVERN_GET_DATA',
            id: messageId,
            request: {
              [action]: params
            }
          }, '*');
        }
      }, 100);
    } catch (error) {
      window.removeEventListener('message', messageHandler);
      console.warn(`[SillyTavern API] postMessage send failed: ${action}`, error, params);
      resolve(null);
      return;
    }

    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', messageHandler);
        console.warn(`[SillyTavern API] postMessage 请求超时: ${action}`, params);
        resolve(null);
      }
    }, timeout);
  });
}

/**
 * 检测是否在外部域名（Cloudflare等）
 */
function isExternalDomain(): boolean {
  if (typeof window === 'undefined') return false;
  const href = window.location.href.toLowerCase();
  return href.includes('workers.dev') || 
         href.includes('cloudflare') || 
         href.includes('pages.dev') ||
         (window.parent !== window && !href.includes('localhost') && !href.includes('127.0.0.1'));
}

/**
 * 通过后端 API 获取数据（仅在同域时使用）
 * 注意：跨域时应该使用 postMessage，而不是直接 fetch
 */
async function requestViaBackendAPI<T>(
  endpoint: string,
  body: any = {},
  timeout: number = 5000
): Promise<T | null> {
  // 如果是外部域名，不应该直接 fetch（会发送到错误的域名）
  if (isExternalDomain()) {
    return null;
  }

  try {
    const ctx = getSTContext();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(ctx?.getRequestHeaders?.() || {})
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (resp.ok) {
      return await resp.json();
    }
  } catch (error) {
    console.warn(`[SillyTavern API] 后端API请求失败 (${endpoint}):`, error);
  }
  return null;
}

/**
 * 获取所有世界书名称（优先使用 TavernHelper）
 */
export async function getWorldbookNames(): Promise<string[]> {
  // 方法1: 优先使用 TavernHelper（如果可用）
  const tavernHelper = getTavernHelper();
  if (tavernHelper?.getWorldbookNames) {
    try {
      console.log('[SillyTavern API] 使用 TavernHelper.getWorldbookNames()');
      return tavernHelper.getWorldbookNames();
    } catch (error) {
      console.warn('[SillyTavern API] TavernHelper.getWorldbookNames 失败，降级到备用方法:', error);
    }
  }
  
  // 方法2: 通过 st-api-wrapper（降级方案）
  const ctx = getSTContext();
  const isExternal = isExternalDomain();
  
  if (ctx && !isExternal) {
    // 优先调用刷新函数
    if (ctx.updateWorldInfoList) {
      try {
        await ctx.updateWorldInfoList();
      } catch (e) {
        // 忽略错误
      }
    }
    
    // 尝试从上下文获取
    if (Array.isArray(ctx.world_names)) {
      return ctx.world_names;
    }
    
    // 通过后端 API（同域时）
    try {
      const data = await requestViaBackendAPI<{ world_names?: string[] }>('/api/settings/get', {});
      if (data && Array.isArray(data.world_names)) {
        return data.world_names;
      }
    } catch (error) {
      // 继续尝试其他方法
    }
  }
  
  // 方法2: 通过全局变量（兼容旧版本，同域时）
  if (!isExternal && typeof window !== 'undefined' && Array.isArray((window as any).world_names)) {
    return (window as any).world_names;
  }
  
  // 方法3: 通过 ST_API（如果可用，优先使用）
  const worldbookApi = getWorldbookApi();
  if (worldbookApi && typeof worldbookApi.list === 'function') {
    try {
      console.log('[SillyTavern API] 使用 ST_API.worldBook/worldbook.list()');
      const result = await worldbookApi.list();
      // 根据文档，返回格式是 { worldBooks: [...] }
      if (result && Array.isArray(result.worldBooks)) {
        // 提取名称列表（只返回全局世界书）
        const globalBooks = result.worldBooks
          .filter((book: any) => book.scope === 'global')
          .map((book: any) => book.name);
        return globalBooks;
      }
      // 兼容旧版本：如果直接返回数组
      if (Array.isArray(result)) return result;
    } catch (error) {
      console.warn('[SillyTavern API] ST_API.worldBook/worldbook.list 失败:', error);
    }
  }
  
  // 方法4: 通过 postMessage（跨域时，最后尝试）
  // 注意：这个方法可能会超时，但不影响主流程
  if (isExternal || window.parent !== window) {
    try {
      const result = await requestViaPostMessage<{ world_names?: string[] }>('getWorldbookNames', {});
      if (result) {
        if (Array.isArray(result)) return result;
        if (Array.isArray(result.world_names)) return result.world_names;
      }
    } catch (error) {
      // 静默失败，不打印警告（因为这是最后的后备方案）
    }
  }
  
  console.warn('[SillyTavern API] Failed to get worldbook names from SillyTavern.');
  return [];
}

/**
 * 获取世界书内容（优先使用 TavernHelper）
 */
export async function getWorldbook(worldbookName: string): Promise<any[] | null> {
  // 方法1: 优先使用 TavernHelper（如果可用）
  const tavernHelper = getTavernHelper();
  if (tavernHelper?.getWorldbook) {
    try {
      console.log(`[SillyTavern API] 使用 TavernHelper.getWorldbook(${worldbookName})`);
      const entries = await tavernHelper.getWorldbook(worldbookName);
      return Array.isArray(entries) ? entries : null;
    } catch (error) {
      console.warn('[SillyTavern API] TavernHelper.getWorldbook 失败，降级到备用方法:', error);
    }
  }
  
  // 方法2: 通过 st-api-wrapper（降级方案）
  const ctx = getSTContext();
  const isExternal = isExternalDomain();
  
  if (ctx?.loadWorldInfo && !isExternal) {
    try {
      const data = await ctx.loadWorldInfo(worldbookName);
      if (data && data.entries) {
        return Array.isArray(data.entries) ? data.entries : Object.values(data.entries);
      }
    } catch (e) {
      // 继续尝试其他方法
    }
  }
  
  // 方法2: 通过后端 API（同域时）
  if (!isExternal) {
    try {
      const data = await requestViaBackendAPI<{ entries?: any }>('/api/worldinfo/get', { name: worldbookName });
      if (data && data.entries) {
        return Array.isArray(data.entries) ? data.entries : Object.values(data.entries);
      }
    } catch (error) {
      // 继续尝试其他方法
    }
  }
  
  // 方法3: 通过 ST_API（如果可用，优先使用）
  const worldbookApi = getWorldbookApi();
  if (worldbookApi && typeof worldbookApi.get === 'function') {
    try {
      console.log(`[SillyTavern API] 使用 ST_API.worldBook/worldbook.get(${worldbookName})`);
      const book = await worldbookApi.get({ name: worldbookName });
      const worldbook = book?.worldBook ?? book?.worldbook;
      if (worldbook?.entries) {
        return Array.isArray(worldbook.entries) 
          ? worldbook.entries 
          : Object.values(worldbook.entries);
      }
    } catch (error) {
      console.warn('[SillyTavern API] ST_API.worldBook/worldbook.get 失败:', error);
    }
  }
  
  // 方法4: 通过 postMessage（跨域时，最后尝试）
  // 注意：这个方法可能会超时，但不影响主流程
  if (isExternal || window.parent !== window) {
    try {
      const result = await requestViaPostMessage<any>('getWorldbook', { name: worldbookName });
      if (result) {
        if (Array.isArray(result)) return result;
        if (result.entries) {
          return Array.isArray(result.entries) ? result.entries : Object.values(result.entries);
        }
      }
    } catch (error) {
      // 静默失败，不打印警告（因为这是最后的后备方案）
    }
  }
  
  console.warn(`[SillyTavern API] Failed to get worldbook from SillyTavern: ${worldbookName}`);
  return null;
}

/**
 * 获取当前角色信息（基于 st-api-wrapper 实现）
 */
function getCurrentCharacter(ctx: any): { chid?: string; char?: any } {
  if (!ctx) return {};
  
  const raw = ctx.characterId;
  if (raw === undefined || raw === null) return {};

  const chid = String(raw);
  const chidNum = Number(chid);

  const char =
    (ctx.characters && (ctx.characters[chid] ?? (Number.isNaN(chidNum) ? undefined : ctx.characters[chidNum])))
    || undefined;

  return { chid, char };
}

/**
 * 获取角色绑定的世界书名称（优先使用 TavernHelper）
 */
export async function getCharWorldbookNames(characterName: 'current' | string = 'current'): Promise<{
  primary: string | null;
  additional: string[];
} | null> {
  // 方法1: 优先使用 TavernHelper（如果可用）
  const tavernHelper = getTavernHelper();
  if (tavernHelper?.getCharWorldbookNames) {
    try {
      const result = tavernHelper.getCharWorldbookNames(characterName);
      return result || null;
    } catch (error) {
      console.warn('[SillyTavern API] TavernHelper.getCharWorldbookNames 失败，降级到备用方法:', error);
    }
  }
  
  // 方法2: 通过 st-api-wrapper（降级方案）
  const ctx = getSTContext();
  if (!ctx) return null;
  
  const { char } = getCurrentCharacter(ctx);
  if (!char) return null;
  
  const boundWorldName = char.data?.extensions?.world;
  
  return {
    primary: typeof boundWorldName === 'string' ? boundWorldName : null,
    additional: [] // SillyTavern 目前只支持单个绑定
  };
}

/**
 * 获取聊天绑定的世界书名称（基于 st-api-wrapper 实现）
 */
export async function getChatWorldbookName(chatName: 'current' = 'current'): Promise<string | null> {
  const ctx = getSTContext();
  if (!ctx) return null;
  
  const chatMetadata = ctx.chatMetadata as any;
  const boundWorldName = chatMetadata?.world_info ?? chatMetadata?.['world_info'];
  
  return typeof boundWorldName === 'string' ? boundWorldName : null;
}

/**
 * 获取或创建聊天世界书（基于 st-api-wrapper 实现）
 */
export async function getOrCreateChatWorldbook(
  chatName: 'current' = 'current',
  worldbookName?: string
): Promise<string | null> {
  const ctx = getSTContext();
  if (!ctx) return null;
  
  const chatMetadata = ctx.chatMetadata as any;
  let boundWorldName = chatMetadata?.world_info ?? chatMetadata?.['world_info'];
  
  // 如果指定了名称，创建并绑定
  if (worldbookName && !boundWorldName) {
    // 创建世界书（如果不存在）
    try {
      await requestViaBackendAPI('/api/worldinfo/edit', {
        name: worldbookName,
        data: { entries: {} }
      });
    } catch (e) {
      // 忽略错误（可能已存在）
    }
    
    // 绑定到聊天
    if (chatMetadata) {
      chatMetadata['world_info'] = worldbookName;
      if (ctx.saveMetadataDebounced) {
        ctx.saveMetadataDebounced();
      }
    }
    
    return worldbookName;
  }
  
  return typeof boundWorldName === 'string' ? boundWorldName : null;
}

/**
 * 获取预设的原始 settings（基于 st-api-wrapper 实现，降级方案）
 */
function getRawPresetSettings(name: string): any | null {
  const ctx = getSTContext();
  if (!ctx) return null;
  
  const presetManager = ctx.getPresetManager?.(CHAT_API_TYPE);
  if (!presetManager) return null;

  const activePresetName = presetManager.getSelectedPresetName?.();
  
  // 如果是当前激活的预设，使用 chatCompletionSettings
  if (name === activePresetName || name === 'in_use') {
    return ctx.chatCompletionSettings || null;
  }

  // 否则从预设列表中获取
  const presetList = presetManager.getPresetList?.();
  if (!presetList) return null;
  
  const { presets, preset_names } = presetList;
  
  if (Array.isArray(preset_names)) {
    const idx = preset_names.indexOf(name);
    return idx !== -1 && presets?.[idx] ? presets[idx] : null;
  } else if (preset_names && typeof preset_names === 'object') {
    const idx = preset_names[name];
    return idx !== undefined && presets?.[idx] ? presets[idx] : null;
  }
  
  return null;
}

/**
 * 获取当前使用的预设（优先使用 TavernHelper）
 * 注意：跨域时需要通过异步方式获取
 */
export function getPreset(presetName: 'in_use' | string = 'in_use'): any | null {
  // 方法1: 优先使用 TavernHelper（如果可用）
  const tavernHelper = getTavernHelper();
  if (tavernHelper?.getPreset) {
    try {
      console.log(`[SillyTavern API] 使用 TavernHelper.getPreset(${presetName})`);
      return tavernHelper.getPreset(presetName);
    } catch (error) {
      console.warn('[SillyTavern API] TavernHelper.getPreset 失败，降级到备用方法:', error);
    }
  }
  
  // 方法2: 通过 st-api-wrapper（降级方案）
  const ctx = getSTContext();
  const isExternal = isExternalDomain();
  
  if (ctx && !isExternal) {
    const result = getRawPresetSettings(presetName);
    if (result) return result;
  }
  
  // 跨域时无法同步获取，返回 null
  // 注意：如果需要跨域获取预设，应该使用 getPresetAsync
  return null;
}

/**
 * 异步获取预设（优先使用 TavernHelper，支持跨域）
 */
export async function getPresetAsync(presetName: 'in_use' | string = 'in_use'): Promise<any | null> {
  // 方法1: 优先使用 TavernHelper（如果可用）
  const tavernHelper = getTavernHelper();
  if (tavernHelper?.getPreset) {
    try {
      console.log(`[SillyTavern API] 使用 TavernHelper.getPreset(${presetName})`);
      return tavernHelper.getPreset(presetName);
    } catch (error) {
      console.warn('[SillyTavern API] TavernHelper.getPreset 失败，降级到备用方法:', error);
    }
  }
  
  // 方法2: 通过 st-api-wrapper（降级方案）
  const ctx = getSTContext();
  const isExternal = isExternalDomain();
  
  if (ctx && !isExternal) {
    const result = getRawPresetSettings(presetName);
    if (result) return result;
  }
  
  // 方法3: 通过 ST_API（如果可用，优先使用）
  if (typeof (window as any).ST_API !== 'undefined' && 
      typeof (window as any).ST_API.preset?.get === 'function') {
    try {
      console.log(`[SillyTavern API] 使用 ST_API.preset.get(${presetName})`);
      // 根据文档，不传参数时返回当前活跃预设，传 { name } 时返回指定预设
      // 如果 presetName 是 'in_use'，应该不传参数
      const presetResult = presetName === 'in_use' 
        ? await (window as any).ST_API.preset.get()
        : await (window as any).ST_API.preset.get({ name: presetName });
      if (presetResult && presetResult.preset) {
        return presetResult.preset;
      }
    } catch (error) {
      console.warn('[SillyTavern API] ST_API.preset.get 失败:', error);
    }
  }
  
  // 方法4: 通过 postMessage（跨域时，最后尝试）
  // 注意：这个方法可能会超时，但不影响主流程
  if (isExternal || window.parent !== window) {
    try {
      const result = await requestViaPostMessage<any>('getPreset', { name: presetName });
      if (result) {
        return result.preset || result;
      }
    } catch (error) {
      // 静默失败，不打印警告（因为这是最后的后备方案）
    }
  }
  
  return null;
}

/**
 * 获取所有预设名称（优先使用 TavernHelper）
 */
export function getPresetNames(): string[] {
  // 方法1: 优先使用 TavernHelper（如果可用）
  const tavernHelper = getTavernHelper();
  if (tavernHelper?.getPresetNames) {
    try {
      return tavernHelper.getPresetNames();
    } catch (error) {
      console.warn('[SillyTavern API] TavernHelper.getPresetNames 失败，降级到备用方法:', error);
    }
  }
  
  // 方法2: 通过 st-api-wrapper（降级方案）
  const ctx = getSTContext();
  if (!ctx) return [];
  
  const presetManager = ctx.getPresetManager?.(CHAT_API_TYPE);
  if (!presetManager) return [];
  
  const presetList = presetManager.getPresetList?.();
  if (!presetList) return [];
  
  const { preset_names } = presetList;
  
  if (Array.isArray(preset_names)) {
    return preset_names;
  } else if (preset_names && typeof preset_names === 'object') {
    return Object.keys(preset_names);
  }
  
  return [];
}

/**
 * 获取当前加载的预设名称（优先使用 TavernHelper）
 */
export function getLoadedPresetName(): string | null {
  // 方法1: 优先使用 TavernHelper（如果可用）
  const tavernHelper = getTavernHelper();
  if (tavernHelper?.getLoadedPresetName) {
    try {
      return tavernHelper.getLoadedPresetName();
    } catch (error) {
      console.warn('[SillyTavern API] TavernHelper.getLoadedPresetName 失败，降级到备用方法:', error);
    }
  }
  
  // 方法2: 通过 st-api-wrapper（降级方案）
  const ctx = getSTContext();
  if (!ctx) return null;
  
  const presetManager = ctx.getPresetManager?.(CHAT_API_TYPE);
  if (!presetManager) return null;
  
  return presetManager.getSelectedPresetName?.() || null;
}

/**
 * 格式化世界书条目为文本（用于系统提示词）
 * 根据类型定义，WorldbookEntry包含name、enabled、content、position等字段
 */
export function formatWorldbookEntries(entries: any[]): string {
  if (!entries || entries.length === 0) {
    return '';
  }

  let formatted = '';
  
  // 按order排序（如果存在）
  const sortedEntries = [...entries].sort((a, b) => {
    const aOrder = a.position?.order ?? a.order ?? 999;
    const bOrder = b.position?.order ?? b.order ?? 999;
    return aOrder - bOrder;
  });

  sortedEntries.forEach((entry, index) => {
    if (!entry.enabled) return; // 跳过未启用的条目
    
    if (entry.content) {
      formatted += `\n[条目 ${index + 1}`;
      if (entry.name) {
        formatted += `: ${entry.name}`;
      } else if (entry.comment) {
        formatted += `: ${entry.comment}`;
      }
      formatted += ']\n';
      formatted += entry.content;
      formatted += '\n';
    }
  });

  return formatted;
}

/**
 * 格式化预设为文本（用于系统提示词）
 * 根据类型定义，Preset包含settings和prompts数组
 */
export function formatPreset(preset: any): string {
  if (!preset) return '';
  
  let formatted = '\n\n=== 预设 (Preset) ===\n';
  
  // 添加预设设置（可选，通常不需要在系统提示词中）
  // if (preset.settings) {
  //   formatted += '\n[设置]\n';
  //   formatted += JSON.stringify(preset.settings, null, 2);
  //   formatted += '\n';
  // }
  
  // 添加启用的提示词条目
  if (preset.prompts && Array.isArray(preset.prompts)) {
    const enabledPrompts = preset.prompts.filter((p: any) => p.enabled && p.content);
    if (enabledPrompts.length > 0) {
      formatted += '\n[启用的提示词条目]\n';
      enabledPrompts.forEach((prompt: any) => {
        if (prompt.content) {
          formatted += `\n[${prompt.name || prompt.id || '未命名'}]\n`;
          formatted += prompt.content;
          formatted += '\n';
        }
      });
    }
  }
  
  return formatted;
}

/**
 * 获取所有相关的世界书（角色绑定 + 聊天绑定 + 全局）
 */
export async function getAllRelevantWorldbooks(): Promise<{
  worldbooks: Array<{ name: string; entries: any[] }>;
  source: 'api' | 'fallback';
}> {
  try {
    // 1. 获取角色绑定的世界书
    const charWorldbooks = await getCharWorldbookNames('current');
    
    // 2. 获取聊天绑定的世界书
    const chatWorldbookName = await getChatWorldbookName('current');
    
    // 3. 获取全局世界书
    const globalWorldbookNames = await getGlobalWorldbookNames();
    
    // 收集所有世界书名称（去重）
    const worldbookNames = new Set<string>();
    
    if (charWorldbooks?.primary) {
      worldbookNames.add(charWorldbooks.primary);
    }
    if (charWorldbooks?.additional && Array.isArray(charWorldbooks.additional)) {
      charWorldbooks.additional.forEach((name: string) => {
        if (name) worldbookNames.add(name);
      });
    }
    if (chatWorldbookName) {
      worldbookNames.add(chatWorldbookName);
    }
    if (globalWorldbookNames && Array.isArray(globalWorldbookNames)) {
      globalWorldbookNames.forEach((name: string) => {
        if (name) worldbookNames.add(name);
      });
    }
    
    // 如果没有任何世界书，返回空
    if (worldbookNames.size === 0) {
      return { worldbooks: [], source: 'fallback' };
    }
    
    // 获取所有世界书内容
    const worldbooks: Array<{ name: string; entries: any[] }> = [];
    
    for (const name of worldbookNames) {
      try {
        const entries = await getWorldbook(name);
        if (entries && Array.isArray(entries) && entries.length > 0) {
          worldbooks.push({ name, entries });
        }
      } catch (error) {
        // 忽略单个世界书加载失败
      }
    }
    
    if (worldbooks.length > 0) {
      return { worldbooks, source: 'api' };
    } else {
      return { worldbooks: [], source: 'fallback' };
    }
  } catch (error) {
    return { worldbooks: [], source: 'fallback' };
  }
}

/**
 * 获取全局世界书名称（优先使用 TavernHelper）
 */
async function getGlobalWorldbookNames(): Promise<string[]> {
  // 方法1: 优先使用 TavernHelper（如果可用）
  const tavernHelper = getTavernHelper();
  if (tavernHelper?.getGlobalWorldbookNames) {
    try {
      return tavernHelper.getGlobalWorldbookNames();
    } catch (error) {
      console.warn('[SillyTavern API] TavernHelper.getGlobalWorldbookNames 失败，降级到备用方法:', error);
    }
  }
  
  // 方法2: 通过 ST_API（如果可用，优先使用）
  const worldbookApi = getWorldbookApi();
  if (worldbookApi && typeof worldbookApi.list === 'function') {
    try {
      console.log('[SillyTavern API] 使用 ST_API.worldBook/worldbook.list() 获取全局世界书');
      const result = await worldbookApi.list();
      // 根据文档，返回格式是 { worldBooks: [...] }
      if (result && Array.isArray(result.worldBooks)) {
        // 提取名称列表（只返回全局世界书）
        const globalBooks = result.worldBooks
          .filter((book: any) => book.scope === 'global')
          .map((book: any) => book.name);
        return globalBooks;
      }
      // 兼容旧版本：如果直接返回数组
      if (Array.isArray(result)) return result;
    } catch (error) {
      console.warn('[SillyTavern API] ST_API.worldBook/worldbook.list 失败:', error);
    }
  }
  
  // 方法3: 通过 postMessage（最后尝试）
  // 注意：这个方法可能会超时，但不影响主流程
  try {
    const result = await requestViaPostMessage<string[]>('getGlobalWorldbookNames', {});
    if (Array.isArray(result)) return result;
  } catch (error) {
    // 静默失败，不打印警告（因为这是最后的后备方案）
  }
  
  return [];
}

/**
 * 设置事件监听器，监听世界书和预设更新
 */
export function setupSillyTavernEventListeners(
  onWorldbookUpdate: (worldbookName: string, entries: any[]) => void,
  onPresetChange: (presetName: string) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  
  const cleanupFunctions: Array<() => void> = [];
  
  try {
    // 监听世界书更新事件
    if (typeof (window as any).eventOn === 'function') {
      const worldbookListener = (name: string, data: any) => {
        if (data?.entries) {
          onWorldbookUpdate(name, data.entries);
        }
      };
      
      // 尝试监听WORLDINFO_UPDATED事件
      const tavernEvents = (window as any).tavern_events;
      if (tavernEvents?.WORLDINFO_UPDATED) {
        const cleanup = (window as any).eventOn(tavernEvents.WORLDINFO_UPDATED, worldbookListener);
        if (cleanup && typeof cleanup.stop === 'function') {
          cleanupFunctions.push(() => cleanup.stop());
        }
      }
    }
    
    // 监听预设变更事件
    if (typeof (window as any).eventOn === 'function') {
      const presetListener = (data: any) => {
        if (data?.name) {
          onPresetChange(data.name);
        }
      };
      
      const tavernEvents = (window as any).tavern_events;
      if (tavernEvents?.PRESET_CHANGED) {
        const cleanup = (window as any).eventOn(tavernEvents.PRESET_CHANGED, presetListener);
        if (cleanup && typeof cleanup.stop === 'function') {
          cleanupFunctions.push(() => cleanup.stop());
        }
      }
    }
    
    // 也监听postMessage事件（作为后备）
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'WORLDINFO_UPDATED' || event.data?.type === 'worldinfo_updated') {
        if (event.data.name && event.data.entries) {
          onWorldbookUpdate(event.data.name, event.data.entries);
        }
      }
      
      if (event.data?.type === 'PRESET_CHANGED' || event.data?.type === 'preset_changed') {
        if (event.data.name) {
          onPresetChange(event.data.name);
        }
      }
    };
    
    window.addEventListener('message', messageHandler);
    cleanupFunctions.push(() => window.removeEventListener('message', messageHandler));
  } catch (error) {
    console.warn('[SillyTavern API] 设置事件监听器失败:', error);
  }
  
  // 返回清理函数
  return () => {
    cleanupFunctions.forEach(cleanup => cleanup());
  };
}

