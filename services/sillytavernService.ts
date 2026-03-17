// SillyTavern 服务 - 工具函数（作为后备方法）
// 注意：主要的数据获取功能已迁移到 sillytavernApiService.ts
// 这里只保留必要的工具函数，用于构建系统提示词等

export interface SillyTavernPreset {
  name?: string;
  prompt?: string;
  system_prompt?: string;
  [key: string]: any;
}

export interface SillyTavernLorebook {
  name?: string;
  entries?: Array<{
    id?: number;
    keys?: string[];
    secondary_keys?: string[];
    comment?: string;
    content?: string;
    constant?: boolean;
    selective?: boolean;
    [key: string]: any;
  }>;
  [key: string]: any;
}

export interface SillyTavernCharacterData {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  creator_notes?: string;
  character_book?: SillyTavernLorebook;
  extensions?: {
    depth_prompt?: {
      prompt?: string;
      depth?: number;
      role?: number;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * 检测是否在SillyTavern环境中
 * 统一检测逻辑，避免重复代码
 */
export function isSillyTavern(): boolean {
  if (typeof window === 'undefined') return false;

  const href = window.location.href.toLowerCase();
  const referrer = document.referrer.toLowerCase();
  const isExternalDomain = href.includes('workers.dev') || href.includes('cloudflare');

  // 方法1: 检查window对象上的属性（最可靠）
  if (
    (window as any).SillyTavern !== undefined ||
    (window as any).st !== undefined ||
    (window as any).APP_READY !== undefined
  ) {
    return true;
  }

  // 方法2: 检查URL和referrer（排除外部域名）
  if (
    (href.includes('sillytavern') || referrer.includes('sillytavern') ||
     href.includes('localhost') || referrer.includes('localhost') ||
     href.includes('127.0.0.1') || referrer.includes('127.0.0.1')) &&
    !isExternalDomain
  ) {
    return true;
  }

  // 方法3: 检查是否在iframe中（排除外部域名）
  try {
    const inIframe = window.parent !== window;
    if (inIframe) {
      // 如果在外部域名上，不认为是SillyTavern
      if (isExternalDomain) {
        return false;
      }
      // 检查URL参数或hash中是否有SillyTavern相关的标识
      const urlParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash;
      if (
        urlParams.has('st') || urlParams.has('sillytavern') ||
        urlParams.has('character') || urlParams.has('preset') || urlParams.has('lorebook') ||
        hash.includes('sillytavern') || hash.includes('st')
      ) {
        return true;
      }
      // 保守策略：在iframe中且不是外部域名，可能是SillyTavern
      return true;
    }
  } catch (e) {
    // 跨域访问window.parent会抛出错误，说明在iframe中
    // 如果在外部域名上，不认为是SillyTavern
    return !isExternalDomain;
  }

  return false;
}

/**
 * 通过postMessage向父窗口请求SillyTavern数据（后备方法）
 * 注意：优先使用 sillytavernApiService.ts 中的方法
 */
export async function requestSillyTavernData(): Promise<{
  character?: SillyTavernCharacterData;
  preset?: SillyTavernPreset;
  lorebook?: SillyTavernLorebook;
} | null> {
  if (!isSillyTavern() || window.parent === window) {
    console.warn('[SillyTavern Service] Cannot request SillyTavern bootstrap data outside a communicable iframe context.');
    return null;
  }

  return new Promise((resolve) => {
    const messageId = `st_data_${Date.now()}_${Math.random()}`;
    let timeoutId: NodeJS.Timeout;
    let resolved = false;

    const messageHandler = (event: MessageEvent) => {
      if (resolved) return;
      
      if (event.data) {
        // 格式1: 直接的数据对象
        if (event.data.type === 'SILLYTAVERN_DATA' || event.data.type === 'ST_DATA') {
          resolved = true;
          clearTimeout(timeoutId);
          window.removeEventListener('message', messageHandler);
          if (!event.data.character && !event.data.preset && !event.data.lorebook) {
            console.warn('[SillyTavern Service] Received empty SillyTavern bootstrap data.');
          }
          resolve({
            character: event.data.character,
            preset: event.data.preset,
            lorebook: event.data.lorebook
          });
          return;
        }
        
        // 格式2: 带ID的响应
        if (event.data.id === messageId) {
          resolved = true;
          clearTimeout(timeoutId);
          window.removeEventListener('message', messageHandler);
          if (event.data.error) {
            console.warn('[SillyTavern Service] SillyTavern bootstrap request failed:', event.data.error);
          } else if (!event.data.data) {
            console.warn('[SillyTavern Service] SillyTavern bootstrap request returned an empty payload.');
          }
          resolve(event.data.data || null);
          return;
        }
      }
    };

    window.addEventListener('message', messageHandler);

    try {
      window.parent.postMessage({
        type: 'SILLYTAVERN_GET_DATA',
        id: messageId,
        request: {
          character: true,
          preset: true,
          lorebook: true
        }
      }, '*');
    } catch (postError) {
      window.removeEventListener('message', messageHandler);
      console.warn('[SillyTavern Service] Failed to send SillyTavern bootstrap request:', postError);
      resolve(null);
      return;
    }

    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', messageHandler);
        console.warn('[SillyTavern Service] Timed out while waiting for SillyTavern bootstrap data (3000ms).');
        resolve(null);
      }
    }, 3000);
  });
}

/**
 * 尝试从window对象直接获取SillyTavern数据（后备方法）
 * 注意：优先使用 sillytavernApiService.ts 中的方法
 */
export function getSillyTavernDataFromWindow(): {
  character?: SillyTavernCharacterData;
  preset?: SillyTavernPreset;
  lorebook?: SillyTavernLorebook;
} | null {
  if (typeof window === 'undefined') return null;

  try {
    const st = (window as any).SillyTavern || (window as any).st;
    if (st) {
      return {
        character: st.character || st.char || undefined,
        preset: st.preset || undefined,
        lorebook: st.lorebook || st.character_book || undefined
      };
    }
  } catch (error) {
    // 静默失败，作为后备方法
  }

  return null;
}

/**
 * 从URL参数中获取SillyTavern数据（如果通过URL传递，后备方法）
 * 注意：优先使用 sillytavernApiService.ts 中的方法
 */
export function getSillyTavernDataFromURL(): {
  character?: SillyTavernCharacterData;
  preset?: SillyTavernPreset;
  lorebook?: SillyTavernLorebook;
} | null {
  if (typeof window === 'undefined') return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const charData = params.get('character');
    const presetData = params.get('preset');
    const lorebookData = params.get('lorebook');

    const result: any = {};

    if (charData) {
      try {
        result.character = JSON.parse(decodeURIComponent(charData));
      } catch (e) {
        // 静默失败
      }
    }

    if (presetData) {
      try {
        result.preset = JSON.parse(decodeURIComponent(presetData));
      } catch (e) {
        // 静默失败
      }
    }

    if (lorebookData) {
      try {
        result.lorebook = JSON.parse(decodeURIComponent(lorebookData));
      } catch (e) {
        // 静默失败
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    return null;
  }
}

/**
 * 将世界书条目转换为文本格式（用于整合到系统提示词）
 */
export function formatLorebookEntries(lorebook: SillyTavernLorebook): string {
  if (!lorebook.entries || lorebook.entries.length === 0) {
    return '';
  }

  let formatted = '\n\n=== 世界书 (Lorebook) ===\n';
  
  // 按insertion_order排序（如果存在）
  const sortedEntries = [...lorebook.entries].sort((a, b) => {
    const aOrder = a.extensions?.display_index ?? a.extensions?.insertion_order ?? 999;
    const bOrder = b.extensions?.display_index ?? b.extensions?.insertion_order ?? 999;
    return aOrder - bOrder;
  });

  sortedEntries.forEach((entry, index) => {
    if (entry.content) {
      formatted += `\n[条目 ${index + 1}`;
      if (entry.comment) {
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
 * 构建完整的系统提示词（整合预设和世界书）
 */
export function buildSystemPrompt(
  baseSystemPrompt: string,
  characterData?: SillyTavernCharacterData,
  preset?: SillyTavernPreset,
  lorebook?: SillyTavernLorebook
): string {
  let systemPrompt = baseSystemPrompt;

  // 1. 添加角色描述
  if (characterData?.description) {
    systemPrompt += `\n\n=== 角色描述 ===\n${characterData.description}`;
  }

  if (characterData?.personality) {
    systemPrompt += `\n\n=== 性格 ===\n${characterData.personality}`;
  }

  if (characterData?.scenario) {
    systemPrompt += `\n\n=== 场景 ===\n${characterData.scenario}`;
  }

  // 2. 添加预设（如果存在）
  if (preset?.prompt || preset?.system_prompt) {
    systemPrompt += `\n\n=== 预设 (Preset) ===\n${preset.prompt || preset.system_prompt || ''}`;
  }

  // 3. 添加系统提示词（从角色卡或预设）
  if (characterData?.system_prompt) {
    systemPrompt += `\n\n=== 系统提示词 (System Prompt) ===\n${characterData.system_prompt}`;
  }

  // 4. 添加世界书
  if (lorebook) {
    const lorebookText = formatLorebookEntries(lorebook);
    if (lorebookText) {
      systemPrompt += lorebookText;
    }
  }

  // 5. 添加creator_notes（如果有）
  if (characterData?.creator_notes) {
    systemPrompt += `\n\n=== 创建者备注 ===\n${characterData.creator_notes}`;
  }

  return systemPrompt;
}

