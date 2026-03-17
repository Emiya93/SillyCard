// SillyTavern 消息监听器脚本
// 使用方法：在 SillyTavern 的正则表达式脚本中添加此代码，或创建一个新的扩展脚本
// 这个脚本会监听来自 iframe 的 postMessage 请求，并返回预设和世界书数据

(function() {
  'use strict';
  
  // 避免重复注册
  if (window.__wenwanGameMessageHandlerRegistered) {
    return;
  }
  window.__wenwanGameMessageHandlerRegistered = true;
  
  console.log('[Wenwan Game] 消息监听器已注册');
  
  window.addEventListener('message', async function(event) {
    // 安全检查：只处理来自可信源的消息
    // 注意：在生产环境中，应该检查 event.origin
    
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    const allowedSource = window.__wenwanAllowedMessageSource;
    if (allowedSource && event.source !== allowedSource) return;

    const allowedOrigins = window.__wenwanAllowedOrigins;
    if (Array.isArray(allowedOrigins) && allowedOrigins.length > 0) {
      const incomingOrigin = event.origin || 'null';
      if (!allowedOrigins.includes(incomingOrigin)) return;
    }
    
    // 调试日志：记录收到的消息
    if (data.type === 'ST_API_CALL' || data.type === 'SILLYTAVERN_API_CALL' || data.type === 'SILLYTAVERN_GET_DATA') {
      console.log('[Wenwan Game] 收到消息:', data.type, data.action || data.endpoint, data.id);
    }
    
    // 处理 ST_API 代理调用
    if (data.type === 'ST_API_CALL') {
      try {
        // 兼容 sandbox/opaque origin（event.origin 可能是 "null"）
        const targetOrigin = (event.origin && event.origin !== 'null') ? event.origin : '*';

        if (!window.ST_API) {
          event.source.postMessage({
            id: data.id,
            error: 'ST_API not available'
          }, targetOrigin);
          return;
        }
        
        // 解析 endpoint（例如 'prompt.generate' -> ['prompt', 'generate']）
        const endpointParts = data.endpoint.split('.');
        if (endpointParts.length !== 2) {
          event.source.postMessage({
            id: data.id,
            error: 'Invalid endpoint format'
          }, targetOrigin);
          return;
        }
        
        const [namespace, method] = endpointParts;
        const apiNamespace = window.ST_API[namespace];
        
        if (!apiNamespace || typeof apiNamespace[method] !== 'function') {
          event.source.postMessage({
            id: data.id,
            error: `ST_API.${namespace}.${method} is not available`
          }, targetOrigin);
          return;
        }
        
        // 调用 ST_API 方法
        try {
          console.log(`[Wenwan Game] 调用 ST_API.${namespace}.${method}`, data.params);
          const result = await apiNamespace[method](data.params || {});
          console.log(`[Wenwan Game] ST_API.${namespace}.${method} 调用成功`, result);
          event.source.postMessage({
            id: data.id,
            data: result
          }, targetOrigin);
        } catch (apiError) {
          console.error(`[Wenwan Game] ST_API.${namespace}.${method} 调用失败:`, apiError);
          event.source.postMessage({
            id: data.id,
            error: apiError.message || 'ST_API call failed'
          }, targetOrigin);
        }
      } catch (error) {
        console.error('[Wenwan Game] ST_API 代理调用失败:', error);
        event.source.postMessage({
          id: data.id,
          error: error.message || 'Unknown error'
        }, (event.origin && event.origin !== 'null') ? event.origin : '*');
      }
      return;
    }
    
    // 处理 API 调用请求
    if (data.type === 'SILLYTAVERN_API_CALL' || data.type === 'SILLYTAVERN_GET_DATA') {
      try {
        const ctx = window.SillyTavern?.getContext?.();
        if (!ctx) {
          event.source.postMessage({
            id: data.id,
            error: 'SillyTavern context not available'
          }, event.origin);
          return;
        }
        
        let responseData = null;
        
        // 处理不同的 action
        if (data.action === 'getPreset' || data.request?.preset) {
          // 获取预设
          const presetName = data.params?.name || data.request?.presetName || 'in_use';
          
          // 优先使用 ST_API（如果可用）
          if (window.ST_API && typeof window.ST_API.preset?.get === 'function') {
            try {
              const result = presetName === 'in_use' 
                ? await window.ST_API.preset.get()
                : await window.ST_API.preset.get({ name: presetName });
              if (result && result.preset) {
                responseData = { preset: result.preset };
              }
            } catch (e) {
              console.warn('[Wenwan Game] ST_API.preset.get 失败，降级到传统方法:', e);
            }
          }
          
          // 如果 ST_API 不可用，使用传统方法
          if (!responseData) {
            const presetManager = ctx.getPresetManager?.('openai');
            if (presetManager) {
              const activePresetName = presetManager.getSelectedPresetName?.();
              
              let preset = null;
              if (presetName === activePresetName || presetName === 'in_use') {
                preset = ctx.chatCompletionSettings || null;
              } else {
                const presetList = presetManager.getPresetList?.();
                if (presetList) {
                  const { presets, preset_names } = presetList;
                  if (Array.isArray(preset_names)) {
                    const idx = preset_names.indexOf(presetName);
                    preset = idx !== -1 && presets?.[idx] ? presets[idx] : null;
                  } else if (preset_names && typeof preset_names === 'object') {
                    const idx = preset_names[presetName];
                    preset = idx !== undefined && presets?.[idx] ? presets[idx] : null;
                  }
                }
              }
              
              responseData = { preset };
            }
          }
        } else if (data.action === 'getWorldbookNames' || data.action === 'getGlobalWorldbookNames' || data.request?.worldbookNames) {
          // 获取世界书名称列表
          try {
            // 优先使用 ST_API（如果可用）
            if (window.ST_API && typeof window.ST_API.worldbook?.list === 'function') {
              try {
                const result = await window.ST_API.worldbook.list();
                if (result && Array.isArray(result.worldBooks)) {
                  const globalBooks = result.worldBooks
                    .filter(book => book.scope === 'global')
                    .map(book => book.name);
                  responseData = { world_names: globalBooks };
                } else if (Array.isArray(result)) {
                  responseData = { world_names: result };
                }
              } catch (e) {
                console.warn('[Wenwan Game] ST_API.worldbook.list 失败，降级到传统方法:', e);
              }
            }
            
            // 如果 ST_API 不可用，使用传统方法
            if (!responseData) {
              if (ctx.updateWorldInfoList) {
                await ctx.updateWorldInfoList();
              }
              
              // 尝试从后端获取
              const resp = await fetch('/api/settings/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(ctx.getRequestHeaders?.() || {}) },
                body: JSON.stringify({})
              });
              
              if (resp.ok) {
                const settingsData = await resp.json();
                if (Array.isArray(settingsData?.world_names)) {
                  responseData = { world_names: settingsData.world_names };
                }
              }
            }
            
            // 使用全局变量作为后备
            if (!responseData) {
              if (Array.isArray(window.world_names)) {
                responseData = { world_names: window.world_names };
              } else if (Array.isArray(ctx?.world_names)) {
                responseData = { world_names: ctx.world_names };
              }
            }
          } catch (e) {
            console.error('[Wenwan Game] 获取世界书名称失败:', e);
          }
        } else if (data.action === 'getWorldbook' || data.request?.worldbook) {
          // 获取世界书内容
          const worldbookName = data.params?.name || data.request?.worldbookName;
          if (worldbookName) {
            // 优先使用 ST_API（如果可用）
            if (window.ST_API && typeof window.ST_API.worldbook?.get === 'function') {
              try {
                const result = await window.ST_API.worldbook.get({ name: worldbookName });
                if (result && result.worldBook && result.worldBook.entries) {
                  responseData = { 
                    entries: Array.isArray(result.worldBook.entries) 
                      ? result.worldBook.entries 
                      : Object.values(result.worldBook.entries)
                  };
                }
              } catch (e) {
                console.warn('[Wenwan Game] ST_API.worldbook.get 失败，降级到传统方法:', e);
              }
            }
            
            // 如果 ST_API 不可用，使用传统方法
            if (!responseData && ctx.loadWorldInfo) {
              try {
                const worldInfo = await ctx.loadWorldInfo(worldbookName);
                if (worldInfo) {
                  responseData = { 
                    entries: worldInfo.entries 
                      ? (Array.isArray(worldInfo.entries) ? worldInfo.entries : Object.values(worldInfo.entries))
                      : null
                  };
                }
              } catch (e) {
                // 尝试通过后端 API
                try {
                  const resp = await fetch('/api/worldinfo/get', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(ctx.getRequestHeaders?.() || {}) },
                    body: JSON.stringify({ name: worldbookName })
                  });
                  if (resp.ok) {
                    const worldInfo = await resp.json();
                    responseData = { 
                      entries: worldInfo.entries 
                        ? (Array.isArray(worldInfo.entries) ? worldInfo.entries : Object.values(worldInfo.entries))
                        : null
                    };
                  }
                } catch (e2) {
                  console.error('[Wenwan Game] 获取世界书失败:', e2);
                }
              }
            }
          }
        } else if (data.type === 'SILLYTAVERN_GET_DATA') {
          // 通用数据请求（兼容旧格式）
          const result = {
            character: ctx.characters?.[ctx.characterId] || null,
            preset: ctx.chatCompletionSettings || null,
            lorebook: null
          };
          
          // 获取角色绑定的世界书
          const char = ctx.characters?.[ctx.characterId];
          if (char?.data?.extensions?.world) {
            try {
              const worldInfo = await ctx.loadWorldInfo(char.data.extensions.world);
              result.lorebook = worldInfo;
            } catch (e) {
              // 忽略错误
            }
          }
          
          responseData = result;
        }
        
        // 发送响应
        if (data.id) {
          try {
            event.source.postMessage({
              id: data.id,
              data: responseData
            }, event.origin);
          } catch (e) {
            console.error('[Wenwan Game] 发送响应失败:', e);
            // 尝试使用 '*' 作为 origin（兼容性）
            try {
              event.source.postMessage({
                id: data.id,
                data: responseData
              }, '*');
            } catch (e2) {
              console.error('[Wenwan Game] 发送响应失败（使用 *）:', e2);
            }
          }
        } else {
          // 兼容旧格式
          try {
            event.source.postMessage({
              type: 'SILLYTAVERN_DATA',
              ...responseData
            }, event.origin || '*');
          } catch (e) {
            console.error('[Wenwan Game] 发送响应失败（旧格式）:', e);
          }
        }
      } catch (error) {
        console.error('[Wenwan Game] 处理消息失败:', error);
        if (data.id) {
          event.source.postMessage({
            id: data.id,
            error: error.message || 'Unknown error'
          }, event.origin);
        }
      }
    }
  });
  
  console.log('[Wenwan Game] 消息监听器已启动');
})();


