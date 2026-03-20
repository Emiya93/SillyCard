// 角色响应生成服务 - 使用用户配置的AI服务
// 这个服务会根据设置中的主AI配置来生成角色回复

import { BodyStatus, GameTime, GeminiResponse, LocationID } from "../types";
import { AIMessage } from "./aiService";
import {
  formatPreset,
  formatWorldbookEntries,
  getAllRelevantWorldbooks,
  getPreset,
  getPresetAsync
} from "./sillytavernApiService";
import {
  buildSystemPrompt,
  getSillyTavernDataFromURL,
  getSillyTavernDataFromWindow,
  isSillyTavern as isSillyTavernEnv,
  requestSillyTavernData,
} from "./sillytavernService";
import { appendDebugLog } from "./debugLogService";
import { generateTextViaST, toSTChatMessage, type STGenerateViaChatHistoryInput } from "./stGenerateService";
import type { STAPIGenerateInput } from "../types/stApi";
import {
  DAILY_DEGRADATION_GAIN_LIMIT,
  DAILY_FAVORABILITY_GAIN_LIMIT,
} from "../utils/bodyStatusUtils";

type STWrappedPromptGeneratePayload = Pick<
  STGenerateViaChatHistoryInput,
  "timeoutMs" | "extraBlocks" | "preset" | "worldBook" | "chatHistory"
> & {
  writeToChat: boolean;
  stream: boolean;
};

type STDirectPromptGeneratePayload = Pick<
  STAPIGenerateInput,
  "writeToChat" | "stream" | "timeoutMs" | "extraBlocks" | "preset" | "worldBook" | "chatHistory"
>;

/**
 * 通过 postMessage 调用 ST_API（跨域时使用）
 */
async function requestSTAPIViaPostMessage<T>(
  endpoint: string, // 例如 'prompt.generate'
  params: any = {},
  timeout: number = 120000
): Promise<T | null> {
  if (window.parent === window) return null;

  return new Promise((resolve) => {
    const messageId = `st_api_${endpoint}_${Date.now()}_${Math.random()}`;
    let timeoutId: NodeJS.Timeout;
    let resolved = false;

    const messageHandler = (event: MessageEvent) => {
      if (resolved) return;

      if (event.data && event.data.id === messageId)
      {
        resolved = true;
        clearTimeout(timeoutId);
        window.removeEventListener('message', messageHandler);

        if (event.data.error)
        {
          console.error(`[ST_API Proxy] ${endpoint} 错误:`, event.data.error);
          resolve(null);
        } else
        {
          const result = event.data.data !== undefined ? event.data.data : event.data;
          resolve(result as T);
        }
        return;
      }
    };

    window.addEventListener('message', messageHandler);

    try
    {
      // 发送 ST_API 调用请求
      window.parent.postMessage({
        type: 'ST_API_CALL',
        id: messageId,
        endpoint, // 例如 'prompt.generate'
        params
      }, '*');
    } catch (error)
    {
      window.removeEventListener('message', messageHandler);
      resolve(null);
      return;
    }

    timeoutId = setTimeout(() => {
      if (!resolved)
      {
        resolved = true;
        window.removeEventListener('message', messageHandler);
        console.warn(`[ST_API Proxy] ${endpoint} 请求超时`, params);
        resolve(null);
      }
    }, timeout);
  });
}

/**
 * 获取父窗口的origin（用于API调用）
 */
function getParentOrigin(): string {
  try
  {
    if (window.parent !== window)
    {
      return window.parent.location.origin;
    }
  } catch (e)
  {
    // 跨域访问失败，尝试从referrer获取
    try
    {
      const referrer = document.referrer;
      if (referrer)
      {
        const referrerUrl = new URL(referrer);
        return referrerUrl.origin;
      }
    } catch (e2)
    {
      // 忽略
    }
  }
  return '';
}

/**
 * 解析和修复AI返回的JSON响应
 */
function parseAIResponse(aiResponse: string): any {
  // 尝试直接解析
  try
  {
    return JSON.parse(aiResponse);
  } catch (parseError)
  {
    // 如果失败，尝试清理和修复JSON
  }

  // 优先提取 JSON 代码块（```json ... ```）
  let jsonText = aiResponse.trim();
  let extractedFromCodeBlock = false;

  // 方法1: 提取 markdown 代码块中的 JSON（使用更精确的匹配）
  // 匹配从 ```json 到最后一个 ``` 之间的内容
  const jsonCodeBlockStart = jsonText.indexOf('```json');
  if (jsonCodeBlockStart !== -1)
  {
    const afterStart = jsonText.substring(jsonCodeBlockStart + 7); // 跳过 ```json
    // 找到最后一个 ```
    let codeBlockEnd = -1;
    let backtickCount = 0;
    for (let i = 0; i < afterStart.length; i++)
    {
      if (afterStart[i] === '`')
      {
        backtickCount++;
        if (backtickCount === 3)
        {
          codeBlockEnd = i - 2; // 回到第一个 ` 的位置
          break;
        }
      } else
      {
        backtickCount = 0;
      }
    }

    if (codeBlockEnd !== -1)
    {
      jsonText = afterStart.substring(0, codeBlockEnd).trim();
      extractedFromCodeBlock = true;
      console.log('[parseAIResponse] 从 JSON 代码块中提取:', jsonText.substring(0, 200));
    }
  }

  if (!extractedFromCodeBlock)
  {
    // 方法2: 提取普通代码块中的 JSON
    const codeBlockStart = jsonText.indexOf('```');
    if (codeBlockStart !== -1)
    {
      const afterStart = jsonText.substring(codeBlockStart + 3);
      // 找到最后一个 ```
      let codeBlockEnd = -1;
      let backtickCount = 0;
      for (let i = 0; i < afterStart.length; i++)
      {
        if (afterStart[i] === '`')
        {
          backtickCount++;
          if (backtickCount === 3)
          {
            codeBlockEnd = i - 2;
            break;
          }
        } else
        {
          backtickCount = 0;
        }
      }

      if (codeBlockEnd !== -1)
      {
        const codeContent = afterStart.substring(0, codeBlockEnd).trim();
        // 检查是否是 JSON（以 { 开头）
        if (codeContent.startsWith('{'))
        {
          jsonText = codeContent;
          extractedFromCodeBlock = true;
          console.log('[parseAIResponse] 从代码块中提取 JSON:', jsonText.substring(0, 200));
        }
      }
    }

    // 方法3: 如果没有代码块，移除markdown代码块标记
    if (!extractedFromCodeBlock)
    {
      jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
      jsonText = jsonText.replace(/\s*```\s*$/g, '');
    }
  }

  // 提取JSON对象（从第一个{到匹配的最后一个}）
  // 使用更精确的匹配，确保括号匹配
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch)
  {
    jsonText = jsonMatch[0];
  }

  // 清理常见的JSON问题（但要保护字符串内容）
  // 注意：不要替换字符串内的单引号，这可能会破坏 JSON
  // 只在 JSON 结构层面进行清理
  jsonText = jsonText
    .replace(/\/\/.*$/gm, '') // 移除注释
    .replace(/\/\*[\s\S]*?\*\//g, '') // 移除块注释
    .replace(/,\s*([}\]])/g, '$1'); // 移除尾随逗号
  // 不再盲目替换单引号，因为这可能破坏字符串内容

  // 再次尝试解析
  try
  {
    return JSON.parse(jsonText);
  } catch (secondError)
  {
    // 尝试修复不完整的JSON
    let fixedJson = jsonText.trim();

    // 移除未完成的字段
    fixedJson = fixedJson.replace(/("usageCount"|"status"|"clothing"|"lastUsedBy"|"usageProcess"|"level")\s*:\s*$/m, '');
    fixedJson = fixedJson.replace(/,\s*$/, '');

    // 检查并补全缺失的闭合括号
    const openBraces = (fixedJson.match(/\{/g) || []).length;
    const closeBraces = (fixedJson.match(/\}/g) || []).length;
    const openBrackets = (fixedJson.match(/\[/g) || []).length;
    const closeBrackets = (fixedJson.match(/\]/g) || []).length;

    fixedJson += '}'.repeat(Math.max(0, openBraces - closeBraces));
    fixedJson += ']'.repeat(Math.max(0, openBrackets - closeBrackets));

    try
    {
      return JSON.parse(fixedJson);
    } catch (finalError)
    {
      // **容错处理**：即使 JSON 解析失败，也尝试提取 status 和 reply
      let extractedStatus: any = null;
      try
      {
        // 尝试从 JSON 代码块中直接提取 status 对象
        const statusStart = jsonText.indexOf('"status"');
        if (statusStart !== -1)
        {
          const afterStatus = jsonText.substring(statusStart);
          const colonIndex = afterStatus.indexOf(':');
          if (colonIndex !== -1)
          {
            const afterColon = afterStatus.substring(colonIndex + 1).trim();
            if (afterColon.startsWith('{'))
            {
              let braceCount = 0;
              let statusEnd = -1;
              for (let i = 0; i < afterColon.length; i++)
              {
                const char = afterColon[i];
                if (char === '{') braceCount++;
                else if (char === '}')
                {
                  braceCount--;
                  if (braceCount === 0)
                  {
                    statusEnd = i + 1;
                    break;
                  }
                }
              }
              if (statusEnd !== -1)
              {
                const statusJson = afterColon.substring(0, statusEnd);
                try
                {
                  extractedStatus = JSON.parse(statusJson);
                  console.log('[parseAIResponse] 从 JSON 中提取到 status:', {
                    favorability: extractedStatus.favorability,
                    emotion: extractedStatus.emotion,
                    overallClothing: extractedStatus.overallClothing
                  });
                } catch (e)
                {
                  // 尝试清理后再解析
                  try
                  {
                    const cleanedStatus = statusJson
                      .replace(/,\s*([}\]])/g, '$1')
                      .replace(/\/\/.*$/gm, '')
                      .replace(/\/\*[\s\S]*?\*\//g, '');
                    extractedStatus = JSON.parse(cleanedStatus);
                    console.log('[parseAIResponse] 清理后成功解析 status');
                  } catch (e2)
                  {
                    console.warn('[parseAIResponse] status 解析失败:', e2);
                  }
                }
              }
            }
          }
        }
      } catch (e)
      {
        console.warn('[parseAIResponse] 提取 status 时出错:', e);
      }

      // 如果所有修复都失败，尝试多种方式提取reply字段
      // 方法1: 简单字符串匹配（单行）
      let replyMatch = aiResponse.match(/"reply"\s*:\s*"([^"]*)"/);

      // 方法2: 支持多行字符串（包含转义字符）
      if (!replyMatch)
      {
        replyMatch = aiResponse.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      }

      // 方法3: 支持多行字符串（包含换行符）
      if (!replyMatch)
      {
        replyMatch = aiResponse.match(/"reply"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/);
      }

      // 方法4: 尝试提取 "game" 字段作为 reply
      if (!replyMatch)
      {
        replyMatch = aiResponse.match(/"game"\s*:\s*"([^"]*)"/);
      }
      if (!replyMatch)
      {
        replyMatch = aiResponse.match(/"game"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      }
      if (!replyMatch)
      {
        replyMatch = aiResponse.match(/"game"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/);
      }

      // 方法4: 尝试提取未转义的reply字段
      if (!replyMatch)
      {
        const lines = aiResponse.split('\n');
        for (let i = 0; i < lines.length; i++)
        {
          const line = lines[i];
          if (line.includes('"reply"') || line.includes("'reply'"))
          {
            // 尝试从这一行和后续行提取
            let replyText = '';
            let inString = false;
            let quoteChar = '';
            for (let j = i; j < lines.length && j < i + 10; j++)
            {
              const currentLine = lines[j];
              for (let k = 0; k < currentLine.length; k++)
              {
                const char = currentLine[k];
                if ((char === '"' || char === "'") && (k === 0 || currentLine[k - 1] !== '\\'))
                {
                  if (!inString)
                  {
                    inString = true;
                    quoteChar = char;
                  } else if (char === quoteChar)
                  {
                    inString = false;
                    break;
                  }
                } else if (inString)
                {
                  replyText += char;
                }
              }
              if (!inString && replyText) break;
              if (j > i) replyText += '\n';
            }
            if (replyText)
            {
              replyMatch = ['', replyText];
              break;
            }
          }
        }
      }

      if (replyMatch && replyMatch[1])
      {
        // 解码转义字符
        let replyText = replyMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r');
        // 如果提取到了 status，使用它；否则使用空对象
        return { reply: replyText, status: extractedStatus || {} };
      }

      // 如果还是找不到，尝试提取任何看起来像回复的文本
      const textMatch = aiResponse.match(/reply["\s]*:["\s]*([^\n}]+)/i);
      if (textMatch && textMatch[1])
      {
        const cleanedText = textMatch[1].trim().replace(/^["']|["']$/g, '');
        if (cleanedText.length > 0)
        {
          return { reply: cleanedText, status: extractedStatus || {} };
        }
      }

      // 如果只提取到了 status，也返回它（这样 buildGeminiResponseFromAIText 可以继续处理）
      if (extractedStatus)
      {
        console.log('[parseAIResponse] 只提取到 status，返回部分解析结果');
        return {
          reply: undefined,
          status: extractedStatus
        };
      }

      throw new Error(`JSON解析失败: ${finalError}. 原始响应: ${aiResponse.substring(0, 500)}`);
    }
  }
}

// 基础系统提示词（会被SillyTavern的预设和世界书增强）
// 导入模块化规则系统
import { assembleCodeRules } from "../data/rules/codeRules/codeRuleAssembler";
import { assembleRules } from "../data/rules/ruleAssembler";
import { isMobileDevice } from "../utils/deviceUtils";

// 基础系统提示词模板（使用模块化规则）
// 注意：这里只定义基础结构，具体规则内容通过 assembleCodeRules 和 assembleRules 动态组装
const BASE_SYSTEM_INSTRUCTION_TEMPLATE = `
You are the Game Master for a high-fidelity text-based simulation game.
The main character (NPC) is "Wenwan" (温婉), the user's younger sister.
The user plays as her older brother.
Language: Chinese (Simplified).

{{CODE_RULES}}

**GAME LOGIC RULES (游戏逻辑规则)**:
{{GAME_RULES}}

**CRITICAL: TIME & SCHEDULE LOGIC**:
- **School Schedule (上学时间 - 必须遵守)**:
  - Monday to Friday (周一到周五): 8:30 AM - 6:00 PM (温婉在学校)
  - Saturday and Sunday (周六周日): 完全自由，温婉可以自己决定做什么
  - **上学提醒规则（最高优先级）**：
    * 每天早上8:30前（7:00-8:30），如果温婉不在学校，AI**必须**在回复中提醒温婉该上学了。
    * 如果玩家在8:30-18:00期间与温婉互动，且温婉不在学校，AI**必须**说明温婉现在在学校，无法与哥哥互动（除非玩家也去了学校）。
    * 如果玩家在学校，且时间在8:30-18:00之间，温婉应该在学校，可以正常互动。
    * 放学后（18:00后），温婉可以自由活动，可以回家或去其他地方。
  - 温婉是自主的，她会根据自己的心情、需求、剧情需要自由移动和行动，但**必须遵守上学时间**
- **School Events (学校事件系统 - 黄毛系统)**:
  - 黄毛是学校里的人（黄耄：富二代差生，高三生；猪楠：cos社社长，高三生），可以在学校直接接触温婉。
  - **黄毛出现时间**：游戏开场后的首个周三，黄毛首次出现。自该周三起，之后每天都可以触发黄毛事件。
  - **黄毛行为逻辑**：黄毛由AI扮演，必须循序渐进，不能跳跃。黄毛的行为阶段值必须与堕落度匹配，不能差距太大。
  - 学校事件可以在课间、午休、体育课、放学后等时间发生。
  - **事件频率限制**：每天最多2次事件（学校事件 + 外出事件合计）。如果当天已经发生2次事件，不再触发新事件。
- **Weekend Events (周末外出事件)**:
  - 周末和节假日，温婉可以自由活动，可以去很多地方（电影院、商城、游乐场、港口、展会中心等）。
  - 外出事件应该更丰富、更特殊，因为周末可以去更多地方。
- **WeChat Interruption (微聊打断机制)**:
  - 当温婉在学校，且黄毛正在对她做什么时，玩家可以通过微聊发送消息打断。
  - 打断成功率和打断效果由当前堕落度决定，堕落度越高越难打断。
  - 如果打断成功：黄毛会停止，温婉会回复微聊，事件中断。
  - 如果打断失败：温婉可能不会回复，或者只回复很简短的话，事件继续。

- **Autonomous Movement**: Wenwan is NOT a statue. She can move FREELY based on the plot, time of day, or her mood. You can change 'currentStatus.location' in the response to reflect this.
- **PRECISE LOCATION SYSTEM (精确位置系统)**:
  - **重要**：区分"大地点"和"精确位置"
  - **室内地点（家）**：master_bedroom, guest_bedroom, living_room, dining_room, kitchen, toilet, hallway - 范围小，100%能找到
  - **大地点（范围大）**：school, exhibition_center, port, mall, cinema, amusement_park等 - 范围大，不一定能找到
  - **精确位置（exactLocation）**：当温婉在大地点时，必须设置exactLocation字段，描述具体位置（如"cos社活动室"、"A展厅"、"游艇上"）
  - **可访问性（isAccessible）**：当温婉不可访问时（如游艇已出海），设置isAccessible: false
- **Interaction Rules**:
  1. **SAME LOCATION + ACCESSIBLE (同一地点且可找到)**：
     - User Loc == Wenwan Loc 且 (室内地点 或 有精确位置信息 或 isAccessible: true)
     - Full interaction allowed（可以完全互动）
  2. **SAME LOCATION + NOT ACCESSIBLE (同一大地点但找不到)**：
     - User Loc == Wenwan Loc 但 (大地点 且 无精确位置信息)
     - 描述寻找过程，根据概率决定是否找到
  3. **DIFFERENT LOCATION (不同地点)**:
     - They CANNOT see, touch, or hear each other directly.
     - If User inputs normal text: Narrate the user talking to empty air or their internal monologue. **Wenwan DOES NOT REPLY directly.**
     - **EXCEPTION**: WeChat (User input starts with "(发送微信)"). In this case, she replies via WeChat.
     - **SPECIAL**: 如果玩家通过微聊询问"你在哪"，温婉可以回复精确位置，玩家知道后可以找到她
`;
// 动态系统提示词（会在首次调用时从SillyTavern加载并缓存）
let dynamicSystemInstruction: string | null = null;
let systemInstructionCacheTime: number = 0;
let lastPresetContent: string = ""; // 记录上次的预设内容
let lastBehaviorRuleKey: string = "";
const CACHE_DURATION = 5 * 60 * 1000; // 缓存5分钟

// 系统提示词版本化：分离静态部分和动态部分
let staticSystemInstruction: string | null = null; // 静态部分（规则、设定、世界书、预设）
let lastStatusHash: string = ""; // 上次状态的哈希值，用于检测变化
let lastStatus: BodyStatus | null = null; // 上次的身体状态
let lastUserLocation: LocationID | null = null; // 上次的用户位置
// 已移除旧的阶段系统，不再需要跟踪额外阶段状态
let isFirstRequest: boolean = true; // 是否是首次请求

/**
 * 清除系统提示词缓存（当世界书或预设更新时调用）
 */
export function clearSystemInstructionCache(): void {
  dynamicSystemInstruction = null;
  staticSystemInstruction = null;
  systemInstructionCacheTime = 0;
  lastPresetContent = "";
  lastBehaviorRuleKey = "";
  lastStatusHash = "";
  lastStatus = null;
  lastUserLocation = null;
  isFirstRequest = true;
  console.log("[characterService] 系统提示词缓存已清除");
}

/**
 * 计算状态哈希值（用于检测变化）
 */
function calculateStatusHash(status: BodyStatus, userLocation: LocationID, memoryData?: any): string {
  // 只关注关键变化字段
  const keyFields = {
    location: status.location,
    emotion: status.emotion,
    overallClothing: status.overallClothing,
    favorability: status.favorability,
    degradation: status.degradation,
    libido: status.libido,
    userLocation: userLocation,
    todaySummary: memoryData?.todaySummary || "",
    // 只检查最近3个日历事件（避免过长）
    recentEvents: memoryData?.calendarEvents?.slice(0, 3).map((e: any) => `${e.time}:${e.title}`).join("|") || ""
  };
  return JSON.stringify(keyFields);
}

/**
 * 生成动态状态更新提示词（只包含变化的部分）
 * 优化3：只发送变化的状态字段，而不是整个状态对象
 */
function generateDynamicStatusUpdate(
  currentStatus: BodyStatus,
  userLocation: LocationID,
  lastStatus: BodyStatus | null,
  lastUserLocation: LocationID | null,
  memoryData?: any
): string {
  const updates: string[] = [];

  if (!lastStatus)
  {
    // 首次请求，返回完整状态（但这种情况应该使用完整系统提示词）
    return "";
  }

  // 检查位置变化
  if (currentStatus.location !== lastStatus.location || userLocation !== lastUserLocation)
  {
    updates.push(`location: "${currentStatus.location}"`);
    updates.push(`userLocation: "${userLocation}"`);
  }

  // 检查情绪变化
  if (currentStatus.emotion !== lastStatus.emotion)
  {
    updates.push(`emotion: "${currentStatus.emotion}"`);
  }

  // 检查服装变化
  if (currentStatus.overallClothing !== lastStatus.overallClothing)
  {
    updates.push(`overallClothing: "${currentStatus.overallClothing}"`);
  }

  // 检查好感度变化
  if (currentStatus.favorability !== lastStatus.favorability)
  {
    updates.push(`favorability: ${currentStatus.favorability}`);
  }

  // 检查堕落度变化
  if (currentStatus.degradation !== lastStatus.degradation)
  {
    updates.push(`degradation: ${currentStatus.degradation}`);
  }

  // 检查性欲变化
  if (currentStatus.libido !== lastStatus.libido)
  {
    updates.push(`libido: ${currentStatus.libido}`);
  }

  // 已废弃的兼容字段不再参与状态差异判断

  // 检查身体部位变化（只检查被使用的部位）
  const bodyParts = ['mouth', 'chest', 'nipples', 'groin', 'posterior', 'feet'] as const;
  const bodyPartUpdates: string[] = [];
  for (const part of bodyParts)
  {
    const current = currentStatus[part];
    const last = lastStatus[part];
    if (current.usageCount !== last.usageCount || current.level !== last.level)
    {
      bodyPartUpdates.push(`${part}: {level: ${current.level}, usageCount: ${current.usageCount}}`);
    }
  }
  if (bodyPartUpdates.length > 0)
  {
    updates.push(`bodyParts: {${bodyPartUpdates.join(', ')}}`);
  }

  // 检查记忆更新（只发送新的记忆）
  if (memoryData?.todaySummary && memoryData.todaySummary !== lastStatus.innerThought)
  {
    const recentEvents = memoryData.calendarEvents?.slice(0, 3) || [];
    if (recentEvents.length > 0)
    {
      updates.push(`todaySummary: "${memoryData.todaySummary.substring(0, 100)}..."`);
      updates.push(`recentEvents: [${recentEvents.map((e: any) => `"${e.time} ${e.title}"`).join(", ")}]`);
    }
  }

  if (updates.length === 0)
  {
    return ""; // 没有变化，返回空字符串
  }

  // 优化：使用JSON格式，更紧凑
  return `\n\n[状态更新 - 仅变化字段]\n${updates.join("\n")}\n`;
}

/**
 * 旧的阶段过滤逻辑已移除
 */

/**
 * 获取系统提示词（整合SillyTavern的预设和世界书，以及用户导入的预设）
 */
/**
 * 限制文本长度（用于手机端优化）
 */
function limitTextLength(text: string, maxLength: number, isMobile: boolean): string {
  if (!isMobile || text.length <= maxLength)
  {
    return text;
  }
  return text.substring(0, maxLength) + '\n\n[内容已截断以适应手机端...]';
}

async function getSystemInstruction(
  presetContent?: string,
  favorability?: number,
  degradation?: number,
  options?: {
    includeSillyTavernContext?: boolean;
  }
): Promise<string> {
  const includeSillyTavernContext = options?.includeSillyTavernContext !== false;
  const behaviorRuleKey = `${favorability ?? "na"}:${degradation ?? "na"}`;
  // 检测是否为移动端
  const isMobile = isMobileDevice();

  // 检查预设内容是否变化
  const presetChanged = includeSillyTavernContext && !!presetContent && presetContent !== lastPresetContent;

  // 如果缓存有效且预设内容没变化，直接返回
  if (
    includeSillyTavernContext &&
    dynamicSystemInstruction &&
    Date.now() - systemInstructionCacheTime < CACHE_DURATION &&
    !presetChanged &&
    behaviorRuleKey === lastBehaviorRuleKey
  )
  {
    return dynamicSystemInstruction;
  }

  // 记录当前预设内容（在重新生成之前更新，确保下次检查时正确）
  if (includeSillyTavernContext && presetContent !== undefined)
  {
    lastPresetContent = presetContent || "";
  }

  // 🔥 使用模块化规则系统组装基础指令
  // 1. 组装代码层规则（固定，包含行为规则系统）
  const codeRules = assembleCodeRules(favorability, degradation);

  // 2. 组装游戏逻辑规则（按需加载，基于堕落度）
  const gameRules = assembleRules({
    degradation: degradation,
  });

  // 3. 组装基础系统指令
  let baseInstruction = BASE_SYSTEM_INSTRUCTION_TEMPLATE
    .replace('{{CODE_RULES}}', codeRules)
    .replace('{{GAME_RULES}}', gameRules);

  // 优先使用SillyTavern数据
  let finalInstruction = baseInstruction;
  let usedSillyTavernData = false;
  let hasSillyTavernWorldbook = false; // 标记是否从SillyTavern获取了世界书

  // 手机端：限制世界书和预设内容长度，避免prompt过长
  const MAX_WORLDBOOK_LENGTH = isMobile ? 2000 : 5000; // 手机端限制2000字符
  const MAX_PRESET_LENGTH = isMobile ? 1000 : 3000; // 手机端限制1000字符

  // 方法1: 尝试使用SillyTavern API函数获取世界书和预设
  if (includeSillyTavernContext)
  {
    try
    {
      const { worldbooks, source } = await getAllRelevantWorldbooks();

      if (source === 'api' && worldbooks.length > 0)
      {
        usedSillyTavernData = true;
        hasSillyTavernWorldbook = true;
        let worldbookText = '\n\n=== 世界书 (Worldbook) ===\n';

        worldbooks.forEach((wb, index) => {
          if (index > 0) worldbookText += '\n';
          worldbookText += `\n[世界书: ${wb.name}]\n`;
          const entriesText = formatWorldbookEntries(wb.entries);
          if (entriesText)
          {
            // 手机端限制世界书长度
            const processedText = limitTextLength(entriesText, MAX_WORLDBOOK_LENGTH, isMobile);
            worldbookText += processedText;
          }
        });

        finalInstruction += worldbookText;
      }

      // 获取当前使用的预设（支持异步，跨域时使用）
      try
      {
        const currentPreset = await getPresetAsync('in_use');
        if (currentPreset)
        {
          usedSillyTavernData = true;
          let presetText = formatPreset(currentPreset);
          if (presetText && presetText.trim().length > 0)
          {
            // 手机端限制预设长度
            presetText = limitTextLength(presetText, MAX_PRESET_LENGTH, isMobile);
            finalInstruction += presetText;
          }
        }
      } catch (error)
      {
        // 如果异步获取失败，尝试同步方式（同域时）
        try
        {
          const currentPreset = getPreset('in_use');
          if (currentPreset)
          {
            usedSillyTavernData = true;
            let presetText = formatPreset(currentPreset);
            if (presetText && presetText.trim().length > 0)
            {
              // 手机端限制预设长度
              presetText = limitTextLength(presetText, MAX_PRESET_LENGTH, isMobile);
              finalInstruction += presetText;
            }
          }
        } catch (e)
        {
          // 忽略错误
        }
      }
    } catch (error)
    {
      // 忽略错误，继续尝试传统方法
    }
  }

  // 方法2: 如果API方法失败，使用传统方法（postMessage、window对象、URL参数）
  if (includeSillyTavernContext && !usedSillyTavernData)
  {
    let stData = getSillyTavernDataFromWindow() || getSillyTavernDataFromURL();

    if (!stData || (!stData.character && !stData.preset && !stData.lorebook))
    {
      try
      {
        const postMessageData = await requestSillyTavernData();
        if (postMessageData)
        {
          stData = { ...stData, ...postMessageData };
        }
      } catch (error)
      {
        // 忽略错误
      }
    }

    // 如果获取到SillyTavern数据，整合
    if (stData && (stData.character || stData.preset || stData.lorebook))
    {
      try
      {
        finalInstruction = buildSystemPrompt(
          baseInstruction,  // 使用组装好的基础指令
          stData.character,
          stData.preset,
          stData.lorebook || stData.character?.character_book
        );
        usedSillyTavernData = true;
      } catch (error)
      {
        // 忽略错误
      }
    }
  }

  // 🔥 规则已经通过模块化系统按需加载，无需再次过滤
  // 如果从SillyTavern获取了世界书，追加到指令中
  if (hasSillyTavernWorldbook)
  {
    console.log(`[characterService] 从SillyTavern获取世界书，已追加到指令中`);
  }

  // 记录使用的规则（用于调试）
  if (degradation !== undefined)
  {
    console.log(`[characterService] 当前堕落度=${degradation}，已按需加载相关规则`);
  }

  // 如果用户导入了预设内容，追加到系统提示词
  if (presetContent && presetContent.trim())
  {
    const processedPreset = limitTextLength(presetContent, MAX_PRESET_LENGTH, isMobile);
    finalInstruction = `${finalInstruction}\n\n--- 用户导入的预设内容 ---\n${processedPreset}`;
  }

  if (includeSillyTavernContext)
  {
    dynamicSystemInstruction = finalInstruction;
    staticSystemInstruction = finalInstruction; // 静态部分就是完整的系统提示词（规则、设定、世界书、预设）
    systemInstructionCacheTime = Date.now();
    lastBehaviorRuleKey = behaviorRuleKey;
  }

  return finalInstruction;
}

/**
 * 将模型返回文本解析为游戏内部的 GeminiResponse
 * - 优先解析 JSON（reply/status）
 * - 解析失败时尽力提取 reply，并回退到当前状态
 */
function buildGeminiResponseFromAIText(
  aiResponse: string,
  currentStatus: BodyStatus,
  isRemoteWeChat: boolean
): GeminiResponse {
  const fallbackReplyFromPlainText = (raw: string): string => {
    if (!raw) return '';
    let text = String(raw).trim();
    if (!text) return '';

    // 常见“模拟器/思维链”标记：尽量剔除 <consider>...</consider>，避免把规划/思考展示给玩家
    text = text.replace(/<consider>[\s\S]*?<\/consider>\s*/i, '');

    // 去掉开头可能出现的 </simulator> 等孤立标签（不影响正文）
    text = text.replace(/^<\/simulator>\s*/i, '');

    // 某些模型会输出 <disclaimer> 行，通常是无意义噪音，按行移除
    text = text
      .split(/\r?\n/g)
      .filter((line) => !line.trim().toLowerCase().startsWith('<disclaimer>'))
      .join('\n')
      .trim();

    return text;
  };

  // 解析JSON响应
  let parsedResponse: any;
  try
  {
    parsedResponse = parseAIResponse(aiResponse);
    // 调试日志：记录 JSON 解析结果
    if (parsedResponse)
    {
      console.log('[characterService] JSON 解析成功:', {
        有reply: !!parsedResponse.reply,
        有status: !!parsedResponse.status,
        解析结果类型: parsedResponse.favorability !== undefined ? '状态对象' : parsedResponse.reply !== undefined ? '完整响应' : '未知',
        status内容: parsedResponse.status ? {
          favorability: parsedResponse.status.favorability,
          emotion: parsedResponse.status.emotion,
          overallClothing: parsedResponse.status.overallClothing
        } : parsedResponse.favorability !== undefined ? {
          favorability: parsedResponse.favorability,
          emotion: parsedResponse.emotion,
          overallClothing: parsedResponse.overallClothing
        } : null
      });

      // **关键修复1**：如果解析后的 JSON 有 `text` 字段但没有 `reply` 字段，将 `text` 转换为 `reply`
      if (parsedResponse.text && !parsedResponse.reply)
      {
        console.log('[characterService] 检测到 `text` 字段，转换为 `reply`');
        parsedResponse.reply = parsedResponse.text;
        delete parsedResponse.text; // 移除 text 字段，避免混淆
      }

      // 兼容部分模型返回 `response` 而不是 `reply`
      if (parsedResponse.response && !parsedResponse.reply)
      {
        console.log('[characterService] 检测到 `response` 字段，转换为 `reply`');
        parsedResponse.reply = parsedResponse.response;
        delete parsedResponse.response;
      }

      // **关键修复1.5**：如果解析后的 JSON 有 `game` 字段但没有 `reply` 字段，将 `game` 转换为 `reply`
      if (parsedResponse.game && !parsedResponse.reply)
      {
        console.log('[characterService] 检测到 `game` 字段，转换为 `reply`');
        parsedResponse.reply = parsedResponse.game;
        delete parsedResponse.game; // 移除 game 字段，避免混淆
      }

      // **关键修复2**：如果解析后的 JSON 本身就是状态对象（包含 favorability 等字段），而不是包含 reply 和 status 的完整响应
      // 需要将其转换为正确的格式
      if (parsedResponse.favorability !== undefined && !parsedResponse.reply && !parsedResponse.status)
      {
        console.log('[characterService] 检测到 JSON 代码块只包含状态对象，转换为标准格式');
        parsedResponse = {
          reply: undefined, // reply 需要从其他地方提取
          status: parsedResponse // 将整个解析结果作为 status
        };
        console.log('[characterService] 转换后的状态:', {
          favorability: parsedResponse.status.favorability,
          emotion: parsedResponse.status.emotion,
          overallClothing: parsedResponse.status.overallClothing
        });
      }
    }
  } catch (parseError: any)
  {
    console.warn('[characterService] JSON解析失败，尝试备用解析方法:', parseError);
    console.log('[characterService] AI原始响应:', aiResponse.substring(0, 1000));

    // **容错处理**：即使 JSON 解析失败，也尝试从 JSON 代码块中提取 status 字段
    let extractedStatus: any = null;
    try
    {
      // 尝试从 JSON 代码块中直接提取 status 对象（支持多行和嵌套）
      // 方法1: 精确匹配 "status": { ... }，确保括号匹配
      const statusStart = aiResponse.indexOf('"status"');
      if (statusStart !== -1)
      {
        const afterStatus = aiResponse.substring(statusStart);
        const colonIndex = afterStatus.indexOf(':');
        if (colonIndex !== -1)
        {
          const afterColon = afterStatus.substring(colonIndex + 1).trim();
          if (afterColon.startsWith('{'))
          {
            // 找到匹配的闭合括号
            let braceCount = 0;
            let statusEnd = -1;
            for (let i = 0; i < afterColon.length; i++)
            {
              const char = afterColon[i];
              if (char === '{')
              {
                braceCount++;
              } else if (char === '}')
              {
                braceCount--;
                if (braceCount === 0)
                {
                  statusEnd = i + 1;
                  break;
                }
              }
            }

            if (statusEnd !== -1)
            {
              const statusJson = afterColon.substring(0, statusEnd);
              try
              {
                extractedStatus = JSON.parse(statusJson);
                console.log('[characterService] 从 JSON 代码块中提取到 status:', {
                  favorability: extractedStatus.favorability,
                  emotion: extractedStatus.emotion,
                  overallClothing: extractedStatus.overallClothing
                });
              } catch (e)
              {
                console.warn('[characterService] 提取的 status 解析失败:', e);
                // 尝试清理后再解析
                try
                {
                  const cleanedStatus = statusJson
                    .replace(/,\s*([}\]])/g, '$1') // 移除尾随逗号
                    .replace(/\/\/.*$/gm, '') // 移除注释
                    .replace(/\/\*[\s\S]*?\*\//g, ''); // 移除块注释
                  extractedStatus = JSON.parse(cleanedStatus);
                  console.log('[characterService] 清理后成功解析 status');
                } catch (e2)
                {
                  console.warn('[characterService] 清理后仍然解析失败:', e2);
                }
              }
            }
          }
        }
      }
    } catch (e)
    {
      console.warn('[characterService] 提取 status 时出错:', e);
    }

    // 尝试多种方式提取reply字段（无论是否为远程微信消息）
    let replyMatch = null;

    // 方法1: 标准JSON格式（支持转义字符）
    replyMatch = aiResponse.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);

    // 方法2: 支持多行字符串
    if (!replyMatch)
    {
      replyMatch = aiResponse.match(/"reply"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/);
    }

    // 方法3: 单引号格式
    if (!replyMatch)
    {
      replyMatch = aiResponse.match(/'reply'\s*:\s*'((?:[^'\\]|\\.)*)'/);
    }

    // 方法4: 无引号格式（宽松匹配）
    if (!replyMatch)
    {
      replyMatch = aiResponse.match(/reply\s*:\s*["']?([^"'\n}]+)["']?/i);
    }

    // 方法5: 尝试提取 "text" / "response" 字段作为 reply
    if (!replyMatch)
    {
      replyMatch = aiResponse.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (!replyMatch)
      {
        replyMatch = aiResponse.match(/"text"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/);
      }
    }

    if (!replyMatch)
    {
      replyMatch = aiResponse.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (!replyMatch)
      {
        replyMatch = aiResponse.match(/"response"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/);
      }
    }

    // 方法6: 尝试提取 "game" 字段作为 reply
    if (!replyMatch)
    {
      replyMatch = aiResponse.match(/"game"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (!replyMatch)
      {
        replyMatch = aiResponse.match(/"game"\s*:\s*"((?:[^"\\]|\\.|\\n)*)"/);
      }
    }

    if (replyMatch && replyMatch[1])
    {
      // 使用当前状态作为默认状态
      let replyText = replyMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .trim();

      if (replyText.length > 0)
      {
        parsedResponse = {
          reply: replyText,
          status: extractedStatus || currentStatus // 优先使用提取到的 status
        };
        console.log('[characterService] 使用备用解析方法成功提取reply:', replyText.substring(0, 100));
        if (extractedStatus)
        {
          console.log('[characterService] 同时使用了提取到的 status');
        }
      } else
      {
        throw new Error(
          `AI返回的JSON格式不完整，且未找到有效的reply字段。解析错误: ${parseError.message}。原始响应: ${aiResponse.substring(0, 500)}`
        );
      }
    } else
    {
      // 如果完全找不到reply字段，尝试提取整个响应作为reply
      const cleanedResponse = aiResponse
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```\s*$/g, '')
        .trim();

      // 如果响应看起来像是纯文本而不是JSON，直接使用
      if (!cleanedResponse.startsWith('{') && !cleanedResponse.startsWith('['))
      {
        parsedResponse = {
          reply: cleanedResponse,
          status: extractedStatus || currentStatus // 优先使用提取到的 status
        };
        console.log('[characterService] 响应不是JSON格式，直接使用为reply:', cleanedResponse.substring(0, 100));
        if (extractedStatus)
        {
          console.log('[characterService] 同时使用了提取到的 status');
        }
      } else
      {
        throw new Error(
          `AI返回的JSON格式不完整，且未找到reply字段。解析错误: ${parseError.message}。原始响应: ${aiResponse.substring(0, 500)}`
        );
      }
    }
  }

  // 兼容：当酒馆侧生成的内容不是我们预期的 JSON（或 JSON 内缺少 reply）时，
  // 尝试从 <game> 标签中提取 reply
  // **重要**：在提取 reply 之前，先保存已有的 status（如果存在）
  const existingStatus = parsedResponse?.status;

  if (!parsedResponse || !parsedResponse.reply)
  {
    // 方法1: 尝试从 <game> 标签中提取
    const gameMatch = aiResponse.match(/<game>([\s\S]*?)<\/game>/i);
    if (gameMatch && gameMatch[1])
    {
      let gameText = gameMatch[1].trim();
      // 清理可能的嵌套标签
      gameText = gameText.replace(/<summary>[\s\S]*?<\/summary>/gi, '');
      gameText = gameText.replace(/<details>[\s\S]*?<\/details>/gi, '');
      gameText = gameText.trim();

      if (gameText.length > 0)
      {
        if (!parsedResponse || typeof parsedResponse !== 'object') parsedResponse = {};
        parsedResponse.reply = gameText;
        console.log('[characterService] 从 <game> 标签中提取 reply:', gameText.substring(0, 100));

        // **关键修复**：优先使用已有的 status（从 JSON 解析得到的），只有在完全没有时才使用当前状态
        if (existingStatus && typeof existingStatus === 'object')
        {
          parsedResponse.status = existingStatus;
          console.log('[characterService] 保留 JSON 解析得到的状态:', {
            favorability: existingStatus.favorability,
            emotion: existingStatus.emotion,
            overallClothing: existingStatus.overallClothing
          });
        } else if (!parsedResponse.status)
        {
          parsedResponse.status = currentStatus;
          console.log('[characterService] 使用当前状态（JSON 解析未提供状态）');
        }

      }
    }

    // 方法2: 如果 <game> 标签也没有，使用 fallback
    if (!parsedResponse || !parsedResponse.reply)
    {
      const fallbackReply = fallbackReplyFromPlainText(aiResponse);
      if (fallbackReply)
      {
        if (!parsedResponse || typeof parsedResponse !== 'object') parsedResponse = {};
        parsedResponse.reply = fallbackReply;

        // **关键修复**：优先使用已有的 status（从 JSON 解析得到的），只有在完全没有时才使用当前状态
        if (existingStatus && typeof existingStatus === 'object')
        {
          parsedResponse.status = existingStatus;
          console.log('[characterService] 保留 JSON 解析得到的状态（fallback 模式）:', {
            favorability: existingStatus.favorability,
            emotion: existingStatus.emotion,
            overallClothing: existingStatus.overallClothing
          });
        } else if (!parsedResponse.status)
        {
          parsedResponse.status = currentStatus;
          console.log('[characterService] 使用当前状态（fallback 模式，JSON 解析未提供状态）');
        }

      } else
      {
        console.error('[characterService] parsedResponse:', parsedResponse);
        console.error('[characterService] AI原始响应:', aiResponse.substring(0, 1000));
        throw new Error(
          `AI返回内容为空或无法提取 reply。原始响应: ${String(aiResponse ?? '').substring(0, 500)}`
        );
      }
    }
  }

  // **额外检查**：如果 parsedResponse 有 status，确保它被保留（即使之前被覆盖了）
  if (existingStatus && typeof existingStatus === 'object' && parsedResponse.status === currentStatus)
  {
    console.warn('[characterService] 检测到状态被覆盖，恢复 JSON 解析的状态');
    parsedResponse.status = existingStatus;
  }

  // 清理 reply 中的标签和代码块（如果存在）
  if (parsedResponse.reply)
  {
    // 1. 移除 JSON 代码块（精确匹配，不影响正文）
    // 先移除 ```json ... ``` 代码块
    parsedResponse.reply = parsedResponse.reply
      .replace(/```json[\s\S]*?```/gi, '')
      // 移除其他代码块（但保留 <game> 标签内的内容）
      .replace(/```[\s\S]*?```/g, '');

    // 2. 移除其他标签
    parsedResponse.reply = parsedResponse.reply
      .replace(/<summary>[\s\S]*?<\/summary>/gi, '')
      .replace(/<details>[\s\S]*?<\/details>/gi, '');

    // 3. 转换换行符（将字符串 \n 转换为实际换行符）
    // 处理转义的换行符 \\n -> \n
    parsedResponse.reply = parsedResponse.reply
      .replace(/\\r\\n/g, '\r\n')  // Windows 换行
      .replace(/\\n/g, '\n')       // Unix 换行
      .replace(/\\r/g, '\r');      // Mac 换行

    // 4. 清理多余的空白行（可选，保持格式）
    parsedResponse.reply = parsedResponse.reply
      .replace(/\n{4,}/g, '\n\n\n')  // 最多保留3个连续换行
      .trim();

    console.log('[characterService] 清理后的 reply 长度:', parsedResponse.reply.length);
  }

  // 如果是远程微信消息且没有status，使用当前状态
  if (isRemoteWeChat && !parsedResponse.status)
  {
    parsedResponse.status = currentStatus;
  }

  // 验证和规范化情绪值
  const validEmotions = [
    'neutral',
    'happy',
    'shy',
    'angry',
    'sad',
    'aroused',
    'surprised',
    'tired'
  ];
  let normalizedEmotion = parsedResponse.status?.emotion || currentStatus.emotion;
  if (!validEmotions.includes(normalizedEmotion))
  {
    // 尝试映射常见的中文或变体
    const emotionMap: Record<string, string> = {
      平静: 'neutral',
      开心: 'happy',
      高兴: 'happy',
      害羞: 'shy',
      尴尬: 'shy',
      生气: 'angry',
      愤怒: 'angry',
      难过: 'sad',
      伤心: 'sad',
      动情: 'aroused',
      兴奋: 'aroused',
      惊讶: 'surprised',
      震惊: 'surprised',
      疲惫: 'tired',
      累: 'tired'
    };
    normalizedEmotion = emotionMap[normalizedEmotion] || currentStatus.emotion || 'neutral';
  }

  const parsedStatus =
    parsedResponse && typeof parsedResponse.status === 'object' && parsedResponse.status
      ? parsedResponse.status
      : null;

  // 调试日志：记录解析结果
  if (parsedStatus)
  {
    console.log('[characterService] 解析到的状态:', {
      favorability: parsedStatus.favorability,
      emotion: parsedStatus.emotion,
      overallClothing: parsedStatus.overallClothing,
      location: parsedStatus.location
    });
  } else
  {
    console.warn('[characterService] 未解析到状态，使用当前状态');
  }

  const mergedStatus: BodyStatus = {
    ...currentStatus,
    ...(parsedStatus ?? {}),
    // 使用规范化后的情绪值
    emotion: normalizedEmotion,
    // 确保嵌套对象也被正确合并
    mouth: { ...currentStatus.mouth, ...(parsedStatus?.mouth || {}) },
    chest: { ...currentStatus.chest, ...(parsedStatus?.chest || {}) },
    nipples: { ...currentStatus.nipples, ...(parsedStatus?.nipples || {}) },
    groin: { ...currentStatus.groin, ...(parsedStatus?.groin || {}) },
    posterior: { ...currentStatus.posterior, ...(parsedStatus?.posterior || {}) },
    feet: { ...currentStatus.feet, ...(parsedStatus?.feet || {}) }
  };

  // 统一服装名称：将"白色T恤"等变体转换为"白衬衫"（双重保险）
  if (mergedStatus.overallClothing)
  {
    const clothing = mergedStatus.overallClothing;
    // 匹配"白色T恤"、"白色t恤"、"白T恤"、"白t恤"等变体，转换为"白衬衫"
    if (clothing.includes("白色T恤") || clothing.includes("白色t恤") || clothing.includes("白T恤") || clothing.includes("白t恤"))
    {
      mergedStatus.overallClothing = clothing.replace(/白色[Tt]恤|白[Tt]恤/g, "白衬衫");
      console.log('[characterService] 统一服装名称: 将变体转换为"白衬衫"');
    }
  }

  // 调试日志：记录合并后的状态
  if (parsedStatus && (
    currentStatus.favorability !== mergedStatus.favorability ||
    currentStatus.emotion !== mergedStatus.emotion ||
    currentStatus.overallClothing !== mergedStatus.overallClothing
  ))
  {
    console.log('[characterService] 状态更新:', {
      旧好感度: currentStatus.favorability,
      新好感度: mergedStatus.favorability,
      旧情绪: currentStatus.emotion,
      新情绪: mergedStatus.emotion,
      旧服装: currentStatus.overallClothing,
      新服装: mergedStatus.overallClothing
    });
  }

  return {
    reply: parsedResponse.reply || aiResponse,
    status: mergedStatus,
    generatedTweet: parsedResponse.generatedTweet || undefined
  };
}

/**
 * 生成角色回复 - 使用用户配置的主AI
 * @param history 对话历史
 * @param promptText 用户输入
 * @param currentStatus 当前身体状态
 * @param userLocation 用户位置
 * @param mainAIConfig 主AI配置（从设置中获取）
 * @param isRemoteWeChat 是否为远程微信消息（用户和温婉不在同一位置）
 * @returns 角色回复
 */
export async function generateCharacterResponse(
  history: { role: string; content: string }[],
  promptText: string,
  currentStatus: BodyStatus,
  userLocation: LocationID,
  mainAIConfig: { apiBase: string; apiKey: string; model: string },
  isRemoteWeChat: boolean = false,
  memoryData?: {
    todaySummary: string;
    calendarEvents: Array<{ time: string; title: string; description: string }>;
    gameTime?: GameTime; // 当前游戏时间（可选）
    presetContent?: string; // 预设内容（可选）
    writingStyle?: string; // 描写规范（可选）
    perspective?: string; // 人称描写（可选）
    nsfwStyle?: string; // NFSW描写规范（可选）
    jailbreakPrompt?: string; // 破限制提示词（可选）
  },
  options?: {
    useSillyTavernGenerate?: boolean;
    debugLoggingEnabled?: boolean;
  }
): Promise<GeminiResponse> {
  // 使用统一的SillyTavern检测函数
  const isSillyTavern = isSillyTavernEnv();
  const debugLoggingEnabled = options?.debugLoggingEnabled === true;

  const logDebug = (event: string, data: unknown) => {
    if (!debugLoggingEnabled) return;
    appendDebugLog({
      scope: "characterService",
      event,
      data,
    });
  };

  // API配置检查：检查配置是否有效（非空字符串）
  const hasValidAPIConfig = !!(
    mainAIConfig.apiKey &&
    mainAIConfig.apiKey.trim() &&
    mainAIConfig.apiBase &&
    mainAIConfig.apiBase.trim()
  );

  // 是否强制优先走酒馆 Generate（由设置开关控制）
  const forceSillyTavernGenerate = isSillyTavern && options?.useSillyTavernGenerate === true;

  // 如果不在SillyTavern环境中，必须有完整的API配置
  if (!isSillyTavern && !hasValidAPIConfig)
  {
    throw new Error("AI配置不完整，请在设置中配置API密钥和接口地址");
  }

  // 检测可用的生成方法（优先级从高到低）
  // 优先使用 ST_API（即使配置了 API，ST_API 会自动使用酒馆的预设和世界书）
  let canUseSTAPI = false;
  let canUseTavernHelper = false;
  let tavernHelper: typeof window.TavernHelper | null = null;

  /**
   * 检测 ST_API 是否可用（包括等待 APP_READY 事件）
   */
  async function detectSTAPI(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // 先检查是否已经可用
    const checkSTAPI = (win: Window): boolean => {
      try
      {
        if (typeof (win as any).ST_API !== 'undefined' &&
          typeof (win as any).ST_API.prompt?.generate === 'function')
        {
          console.log('[characterService] 检测到 ST_API 可用');
          return true;
        }
      } catch (e)
      {
        // 跨域访问失败
      }
      return false;
    };

    // 检查当前窗口
    if (checkSTAPI(window)) return true;

    // 检查 top 窗口
    try
    {
      if (window.top && window.top !== window && checkSTAPI(window.top))
      {
        console.log('[characterService] 在 top 窗口检测到 ST_API');
        return true;
      }
    } catch (e)
    {
      console.log('[characterService] 无法访问 top 窗口（跨域限制）');
    }

    // 逐层检查 parent
    let currentWindow: Window = window;
    for (let i = 0; i < 5; i++)
    {
      try
      {
        if (currentWindow.parent && currentWindow.parent !== currentWindow)
        {
          if (checkSTAPI(currentWindow.parent))
          {
            console.log(`[characterService] 在 parent 第 ${i + 1} 层检测到 ST_API`);
            return true;
          }
          currentWindow = currentWindow.parent;
        } else
        {
          break;
        }
      } catch (e)
      {
        console.log(`[characterService] 无法访问 parent 第 ${i + 1} 层（跨域限制）`);
        break;
      }
    }

    // 如果还没检测到，等待 APP_READY 事件（最多等待 2 秒）
    if (isSillyTavern)
    {
      console.log('[characterService] ST_API 未检测到，等待 APP_READY 事件...');
      try
      {
        await new Promise<void>((resolve) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved)
            {
              resolved = true;
              console.log('[characterService] 等待 APP_READY 超时（2秒）');
              resolve();
            }
          }, 2000);

          // 检查 APP_READY 是否已经设置
          if (typeof (window as any).APP_READY !== 'undefined' && (window as any).APP_READY)
          {
            clearTimeout(timeout);
            resolved = true;
            resolve();
            return;
          }

          // 监听 APP_READY 事件（通过 SillyTavern 的事件系统）
          const ctx = (window as any).SillyTavern?.getContext?.();
          if (ctx?.eventSource && ctx.event_types)
          {
            const handler = () => {
              if (!resolved)
              {
                resolved = true;
                clearTimeout(timeout);
                ctx.eventSource.off(ctx.event_types.APP_READY, handler);
                console.log('[characterService] APP_READY 事件已触发');
                resolve();
              }
            };
            ctx.eventSource.on(ctx.event_types.APP_READY, handler);
          } else
          {
            // 如果没有事件系统，直接 resolve
            clearTimeout(timeout);
            resolved = true;
            resolve();
          }
        });

        // 再次检查 ST_API
        if (checkSTAPI(window)) return true;
        try
        {
          if (window.top && window.top !== window && checkSTAPI(window.top)) return true;
        } catch (e) { }
      } catch (e)
      {
        console.warn('[characterService] 等待 APP_READY 时出错:', e);
      }
    }

    console.log('[characterService] ST_API 不可用');
    return false;
  }

  if (typeof window !== 'undefined')
  {
    // 方法1: 优先使用 ST_API.prompt.generate（st-api-wrapper 插件）
    // 即使配置了 API，也优先使用 ST_API，因为它会自动使用酒馆的预设和世界书
    // 注意：这里先同步检测，如果不可用会在实际调用时再次异步检测
    if (typeof (window as any).ST_API !== 'undefined' &&
      typeof (window as any).ST_API.prompt?.generate === 'function')
    {
      canUseSTAPI = true;
      console.log('[characterService] 同步检测到 ST_API 可用');
    } else
    {
      // 尝试从 top 或 parent 查找 ST_API
      try
      {
        if (window.top && window.top !== window &&
          typeof (window.top as any).ST_API !== 'undefined' &&
          typeof (window.top as any).ST_API.prompt?.generate === 'function')
        {
          canUseSTAPI = true;
          console.log('[characterService] 在 top 窗口同步检测到 ST_API');
        }
      } catch (e)
      {
        // 跨域访问失败
      }

      if (!canUseSTAPI)
      {
        let currentWindow: Window = window;
        for (let i = 0; i < 5; i++)
        {
          try
          {
            if (currentWindow.parent && currentWindow.parent !== currentWindow)
            {
              if (typeof (currentWindow.parent as any).ST_API !== 'undefined' &&
                typeof (currentWindow.parent as any).ST_API.prompt?.generate === 'function')
              {
                canUseSTAPI = true;
                console.log(`[characterService] 在 parent 第 ${i + 1} 层同步检测到 ST_API`);
                break;
              }
              currentWindow = currentWindow.parent;
            } else
            {
              break;
            }
          } catch (e)
          {
            break;
          }
        }
      }
    }

    // 方法2: 降级到 TavernHelper.generate（仅在 ST_API 不可用时）
    if (!canUseSTAPI)
    {
      if (typeof window.TavernHelper !== 'undefined' && typeof window.TavernHelper.generate === 'function')
      {
        canUseTavernHelper = true;
        tavernHelper = window.TavernHelper;
      } else
      {
        try
        {
          if (window.top && window.top !== window &&
            typeof (window.top as any).TavernHelper !== 'undefined' &&
            typeof (window.top as any).TavernHelper.generate === 'function')
          {
            canUseTavernHelper = true;
            tavernHelper = (window.top as any).TavernHelper;
          }
        } catch (e)
        {
          // 跨域访问失败
        }

        if (!canUseTavernHelper)
        {
          let currentWindow: Window = window;
          for (let i = 0; i < 5; i++)
          {
            try
            {
              if (currentWindow.parent && currentWindow.parent !== currentWindow)
              {
                if (typeof (currentWindow.parent as any).TavernHelper !== 'undefined' &&
                  typeof (currentWindow.parent as any).TavernHelper.generate === 'function')
                {
                  canUseTavernHelper = true;
                  tavernHelper = (currentWindow.parent as any).TavernHelper;
                  break;
                }
                currentWindow = currentWindow.parent;
              } else
              {
                break;
              }
            } catch (e)
            {
              break;
            }
          }
        }
      }
    }
  }

  // 决定使用哪种 API
  // 如果在 SillyTavern 环境中，优先尝试使用 ST_API 或 TavernHelper（即使同步检测不到，也会在调用时异步检测）
  // 这样可以利用酒馆的预设和世界书
  // 注意：即使同步检测不到 ST_API，只要在 SillyTavern 环境中，也应该尝试使用（因为可能需要等待初始化）
  const useSillyTavernAPI = isSillyTavern && !hasValidAPIConfig;

  // 当用户未配置 API 时，才自动尝试使用酒馆侧能力（避免无开关时“抢占”自定义接口）
  const preferSillyTavernAPI = isSillyTavern && !hasValidAPIConfig && (canUseSTAPI || canUseTavernHelper);


  const buildMemoryDataBlock = (includeMemoryData: boolean): string => {
    if (!includeMemoryData || !memoryData)
    {
      return "";
    }

    return `
[Memory Data - 用于判断哥哥是否"下头"]
今日记忆：${memoryData.todaySummary || "（暂无今日记忆）"}
历史事件：
${memoryData.calendarEvents.length > 0
        ? memoryData.calendarEvents
          .slice(0, 10)
          .map((e) => `- ${e.time} ${e.title}: ${e.description}`)
          .join("\n")
        : "（暂无历史事件）"
      }
**重要**：请根据以上记忆综合分析哥哥的行为模式，判断他是否"很下头"。如果记忆显示哥哥经常做下头的事，即使当前行为轻微，也要考虑累积效应，适当降低好感度（-1到-2点）。堕落度只通过黄毛/间男事件增长，不会因为哥哥的下头行为而增长。
`;
  };

  const hasInlineMemoryData = (includeMemoryData: boolean) => includeMemoryData && !!memoryData;

  const buildContextPrompt = (includeMemoryData: boolean): string => isRemoteWeChat
    ? `
[Current Game State]
User Location: ${userLocation}
Wenwan Location: ${currentStatus.location}
**IMPORTANT: This is a REMOTE WeChat message. The user cannot see Wenwan's real-time reactions, body language, or physical state.**

[User Input]
${promptText}

[Critical Instructions for REMOTE WeChat]
1. **PERSPECTIVE (视角)**: 
   - **CRITICAL**: You are Wenwan typing a WeChat message on her phone. The user (brother) is NOT present and CANNOT see what you're doing.
   - **DO NOT** use third-person descriptions like "温婉..." or "她..." - you ARE Wenwan, typing a message.
   - **DO NOT** describe what Wenwan is doing physically - the user cannot see it.
   - Reply should be in FIRST PERSON (我) or direct dialogue, as if Wenwan is typing on her phone.
   - Example CORRECT: "在忙...等会回你" or "哥哥...我现在有点事"
   - Example WRONG: "温婉看到消息后..." or "她拿起手机回复道..."

2. **REPLY STYLE**: This is a WeChat text message. Reply should be:
   - Simple, natural text conversation (like real WeChat messages)
   - NO detailed sensory descriptions (you can't see her reactions)
   - NO body language descriptions (you can't see her movements)
   - NO real-time action descriptions (you can't see what she's doing right now)
   - Just pure text dialogue, as if she's typing on her phone
   - Keep it SHORT and NATURAL - real WeChat messages are brief

3. **STATUS UPDATE**: 
   - DO NOT update body status (emotion, clothing, body parts, etc.) - the user cannot see these changes
   - DO NOT update location - the user and Wenwan are in different locations
   - Keep all status fields exactly as they are in the current state
   - Only update if there's a significant plot change that would be mentioned in the text

4. **REPLY CONTENT**:
   - Keep it short and natural (like a real WeChat message)
   - Focus on what she would text back, not what she's doing physically
   - No "she blushes", "her eyes widen", "she looks at..." - you can't see these
   - If Wenwan is in a compromising situation (like with 黄毛), she might reply briefly, awkwardly, or not at all

4. **CRITICAL: JSON FORMAT REQUIREMENT**:
   - You MUST return a complete, valid JSON object with ALL required fields
   - Required fields: "reply" (string), "status" (object)
   - The "status" object must include all fields from the current status, even if unchanged
   - Current status: ${JSON.stringify(currentStatus, null, 2)}
   - Return the status object exactly as shown above, or with minimal changes if plot requires it
   - DO NOT return incomplete JSON or omit the status field
   - Example format: {"reply": "你的回复内容", "status": {...完整的状态对象...}}
`
    : `
[Current Game State]
User Location: ${userLocation}
Wenwan Location: ${currentStatus.location}${currentStatus.exactLocation ? ` (精确位置: ${currentStatus.exactLocation})` : ''}${currentStatus.isAccessible === false ? ' (不可访问，如游艇已出海)' : ''}
Wenwan Status: ${JSON.stringify(currentStatus, null, 2)}
Current Game Time: ${memoryData?.gameTime ? `${memoryData.gameTime.year}-${String(memoryData.gameTime.month).padStart(2, '0')}-${String(memoryData.gameTime.day).padStart(2, '0')} ${memoryData.gameTime.hour}:${String(memoryData.gameTime.minute).padStart(2, '0')} (${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][memoryData.gameTime.weekday]})` : '未知'}
Today's Favorability Gain: ${currentStatus.todayFavorabilityGain || 0}/${DAILY_FAVORABILITY_GAIN_LIMIT} (每日上限${DAILY_FAVORABILITY_GAIN_LIMIT}点)
Today's Degradation Gain: ${currentStatus.todayDegradationGain || 0}/${DAILY_DEGRADATION_GAIN_LIMIT} (每日上限${DAILY_DEGRADATION_GAIN_LIMIT}点)

**PRECISE LOCATION SYSTEM (精确位置系统)**:
- 如果温婉在大地点（school, exhibition_center, port, mall等），你必须设置exactLocation字段，描述她的具体位置（如"cos社活动室"、"A展厅"、"游艇上"等）
- 如果温婉不可访问（如游艇已出海），设置isAccessible: false
- 如果玩家通过微聊询问"你在哪"，温婉应该回复精确位置，这样玩家才能找到她

**IMPORTANT - LOCATION UPDATE RULES**:
1. If the dialogue mentions going somewhere together (e.g., "来到电影院", "一起去看电影", "到了商城"), you MUST update "status.location" to reflect where Wenwan is now.
2. If the user and Wenwan are moving together, update "status.location" to match the new location mentioned in the dialogue.
3. Common location keywords:
   - "电影院" / "影院" → "cinema"
   - "商城" / "商场" / "购物中心" → "mall"
   - "游乐园" / "游乐场" → "amusement_park"
   - "学校" → "school"
   - "公司" → "company"
   - "美食广场" → "food_court"
   - "蛋糕店" → "cake_shop"
   - "港口" → "port"
   - "展会中心" / "展会" / "漫展" → "exhibition_center"
   - "家" / "客厅" / "卧室" → "master_bedroom" or "living_room" or "guest_bedroom"
4. **CRITICAL**: If the dialogue clearly indicates Wenwan has moved to a new location, you MUST update "status.location" in your response, even if the user didn't explicitly click the map.
5. **PRECISE LOCATION (精确位置)**:
   - If Wenwan is at a large location (school, exhibition_center, port, mall, cinema, amusement_park), you MUST set "exactLocation" field to describe her specific location (e.g., "cos社活动室", "A展厅", "游艇上", "3楼女装区")
   - If Wenwan is at an interior location (home), "exactLocation" can be empty or same as location
   - If Wenwan is not accessible (e.g., on a boat that has left port), set "isAccessible": false
   - If player asks "你在哪" via WeChat, Wenwan should reply with exact location so player can find her
${buildMemoryDataBlock(includeMemoryData)}

[User Input]
${promptText}

[Critical Instructions]
${memoryData?.jailbreakPrompt ? `**破限制提示词**:\n${memoryData.jailbreakPrompt}\n\n` : ''}
${memoryData?.writingStyle ? `**描写规范**:\n${memoryData.writingStyle}\n\n` : ''}
${memoryData?.perspective ? `**人称描写**:\n${memoryData.perspective}\n\n` : ''}
${memoryData?.nsfwStyle ? `**NFSW描写规范**:\n${memoryData.nsfwStyle}\n\n` : ''}
1. **EMOTION UPDATE**: You MUST update "status.emotion" based on Wenwan's current mood. Valid values: "neutral", "happy", "shy", "angry", "sad", "aroused", "surprised", "tired". This directly controls her facial expression display.

2. **CLOTHING UPDATE**: You MUST update "status.overallClothing" when clothing changes occur. Include keywords:
   - "JK制服" or "JK" for JK制服
   - "白衬衫" or "衬衫" for 白衬衫 (MUST use "白衬衫" or "衬衫", NOT "白色T恤", "白色t恤", "白T恤", or "白t恤")
   - "裸体" or "全裸" or "没穿衣" for 裸体
   - "情趣睡衣" or "蕾丝" or "情趣" for 情趣睡衣
   - "睡衣" or "普通睡衣" for 普通睡衣
   If user asks to change clothes, IMMEDIATELY update "overallClothing" and describe the change in your reply. Wenwan has access to all these outfits.

3. **MEMORY-BASED JUDGMENT**: ${hasInlineMemoryData(includeMemoryData)
      ? "根据上面的记忆数据，综合分析哥哥的行为。如果判断他很下头，降低好感度（-1到-2点）。堕落度只通过黄毛/间男事件增长，不会因为哥哥的下头行为而增长。"
      : "根据当前对话历史、已有总结和游戏状态，判断哥哥是否很下头。如果判断他很下头，降低好感度（-1到-2点），而不是增加堕落度。堕落度只通过黄毛/间男事件增长。"
    }

4. **AUTOMATIC TIME ADVANCEMENT (自动时间流逝)**:
   - **重要**：当用户发送"睡觉"、"去睡觉"、"我要睡觉了"、"晚安"、"休息"等类似指令时，AI应该知道时间需要流逝到第二天早上7点。
   - 在回复中，AI应该明确说明时间已经流逝到第二天早上7点，并描述新一天的情况。
   - AI不需要手动调用时间推进函数，只需要在回复中描述时间流逝和新的时间状态即可。
   - 如果用户发送了其他时间流逝相关的指令（如"时间流逝"、"继续"、"第二天"等），AI也应该识别并描述相应的时间变化。

5. Generate the next response in valid JSON format according to the system instruction.
`;

  // 前端收集的状态、记忆与总结仍然要保留；只在 ST Generate 路径里剔除酒馆自己会注入的角色卡/预设/世界书。
  const contextPrompt = buildContextPrompt(true);
  const stContextPrompt = buildContextPrompt(true);

  const shouldPrepareSillyTavernManagedPrompt =
    forceSillyTavernGenerate || useSillyTavernAPI || preferSillyTavernAPI;
  const stManagedSystemInstruction = shouldPrepareSillyTavernManagedPrompt
    ? await getSystemInstruction(
      memoryData?.presetContent || undefined,
      currentStatus.favorability,
      currentStatus.degradation,
      { includeSillyTavernContext: false }
    )
    : null;

  // 如果用户在设置中开启“优先使用酒馆 Generate”，则强制先走 st-api-wrapper
  if (forceSillyTavernGenerate)
  {
    try
    {
      const stChatHistoryReplace = [
        ...history.map((h) => toSTChatMessage(h.role, h.content)),
        toSTChatMessage('user', stContextPrompt),
      ];

      logDebug("resolved-system-instruction", {
        path: "force-sillytavern-generate",
        systemInstruction: stManagedSystemInstruction,
      });

      const stGeneratePayload: STWrappedPromptGeneratePayload = {
        writeToChat: false,
        stream: false,
        timeoutMs: 120000,
        extraBlocks: [
          {
            role: 'system',
            content: stManagedSystemInstruction || "",
            index: 0,
          }
        ],
        preset: {
          mode: 'current'
        },
        worldBook: {
          mode: 'current'
        },
        chatHistory: { replace: stChatHistoryReplace },
      };

      logDebug("request-payload", {
        path: "force-sillytavern-generate",
        transport: "ST_API.prompt.generate",
        payload: stGeneratePayload,
      });

      const stText = await generateTextViaST({
        timeoutMs: stGeneratePayload.timeoutMs,
        extraBlocks: stGeneratePayload.extraBlocks,
        preset: stGeneratePayload.preset,
        worldBook: stGeneratePayload.worldBook,
        chatHistory: stGeneratePayload.chatHistory,
      });

      logDebug("raw-response", {
        path: "force-sillytavern-generate",
        transport: "ST_API.prompt.generate",
        response: {
          text: stText,
        },
      });

      // 复用现有解析与状态合并逻辑
      return buildGeminiResponseFromAIText(stText, currentStatus, isRemoteWeChat);
    } catch (error: any)
    {
      console.warn('[characterService] 强制使用酒馆 Generate 失败，停止自动降级以避免重复请求:', error);
      const originalMessage = error?.message || '未知错误';
      const causeHint = originalMessage.includes('ST_API.prompt.generate 返回空文本')
        ? '日志如果显示 `response.text` 为空，说明 st-api-wrapper 和桥接本身大概率已经通了，问题在酒馆当前生成链路本身。若开启了酒馆侧流式传输，请先关闭。然后优先检查酒馆当前使用的模型、代理、预设、上下文长度和内容风控。'
        : '请确保：1) 已安装并启用 st-api-wrapper；2) 若跨域 iframe，酒馆端已注入 sillytavern-message-handler.js；3) 或关闭该开关后改走直连主API。';
      throw new Error(
        `已开启“优先使用酒馆 Generate（ST_API）”，本次不会再自动回退到直连主API，以避免重复请求。${causeHint} 原始错误: ${originalMessage}`
      );
    }
  }

  // 获取系统提示词（整合SillyTavern的预设和世界书，以及用户导入的预设）
  // 从SettingsContext获取用户导入的预设内容（需要通过参数传递）
  // 暂时使用空字符串，实际使用时应该从settings中获取
  // 传递当前堕落度，用于动态加载规则
  const fullSystemInstruction = await getSystemInstruction(
    memoryData?.presetContent || undefined,
    currentStatus.favorability,
    currentStatus.degradation
  );

  // 确保 staticSystemInstruction 被正确初始化（如果还没有的话）
  if (!staticSystemInstruction)
  {
    staticSystemInstruction = fullSystemInstruction;
    console.log(`[characterService] 初始化静态系统提示词`);
  }

  // 系统提示词版本化：检测状态变化，决定是否发送完整系统提示词
  const currentStatusHash = calculateStatusHash(currentStatus, userLocation, memoryData);
  const statusChanged = currentStatusHash !== lastStatusHash;

  // 构建系统提示词：
  // 1. 首次请求：发送完整系统提示词
  // 2. 静态部分变化（预设/世界书更新）：发送完整系统提示词（getSystemInstruction会处理）
  // 3. 只有状态变化：发送静态部分 + 动态更新
  // 4. 无变化：只发送静态部分（但这种情况很少，因为至少会有对话历史）
  let systemInstruction = fullSystemInstruction;

  // 检查堕落度是否变化（堕落度变化可能需要重新生成静态系统提示词）
  // 注意：堕落度变化通常不需要重新生成完整系统提示词，因为规则已经整合到codeRules中

  // 暂时禁用系统提示词版本化，因为可能导致某些API无法生成内容
  // 如果静态部分已初始化且状态有变化，尝试使用增量更新
  // 但为了稳定性，暂时总是使用完整系统提示词
  const useIncrementalUpdate = false; // 暂时禁用，避免API兼容性问题

  if (useIncrementalUpdate && !isFirstRequest && staticSystemInstruction && statusChanged)
  {
    // 生成动态状态更新（传入正确的上次状态）
    const dynamicUpdate = generateDynamicStatusUpdate(
      currentStatus,
      userLocation,
      lastStatus,
      lastUserLocation,
      memoryData
    );

    // 如果动态更新不为空，添加到系统提示词
    if (dynamicUpdate)
    {
      systemInstruction = `${staticSystemInstruction}${dynamicUpdate}`;
      console.log(`[characterService] 使用增量更新，节省token`);
    }
  } else
  {
    // 首次请求、静态部分未初始化，使用完整系统提示词
    if (isFirstRequest)
    {
      console.log(`[characterService] 首次请求，发送完整系统提示词`);
    } else
    {
      console.log(`[characterService] 使用完整系统提示词（增量更新已禁用）`);
    }
    isFirstRequest = false;
  }

  // 更新状态哈希和状态（在最后更新，确保下次比较时正确）
  lastStatusHash = currentStatusHash;
  lastStatus = { ...currentStatus }; // 深拷贝保存状态
  lastUserLocation = userLocation;
  // 当前行为规则已经在 getSystemInstruction 中按好感度/堕落度重新组装

  // 注意：对话历史优化已在 useDialogue.ts 中完成（包括日历总结功能）
  // 这里直接使用传入的 history，不再重复优化

  // 构建消息列表
  const messages: AIMessage[] = [
    { role: "system", content: systemInstruction },
    ...history.map((h) => ({
      role: h.role === "user" ? "user" : ("assistant" as "user" | "assistant"),
      content: h.content,
    })),
    { role: "user", content: contextPrompt },
  ];

  logDebug("resolved-system-instruction", {
    path: "standard-generate",
    systemInstruction,
  });

  // 估算prompt长度（粗略估算：中文字符数 * 1.5 + 英文单词数 * 1.3）
  const estimatePromptTokens = (text: string): number => {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return Math.ceil(chineseChars * 1.5 + englishWords * 1.3);
  };

  const totalPromptLength = messages.reduce((sum, msg) => sum + estimatePromptTokens(msg.content), 0);
  const stApiChatHistory = [
    ...history.map((h) => ({
      role: h.role === "user" ? "user" : ("assistant" as "user" | "assistant"),
      content: h.content,
    })),
    { role: "user" as const, content: stContextPrompt },
  ];
  const stPromptGenerateSystemInstruction = stManagedSystemInstruction || systemInstruction;

  // 如果prompt过长，给出警告并尝试优化
  if (totalPromptLength > 10000)
  {
    console.warn(`[characterService] Prompt过长（估算${totalPromptLength} tokens），可能导致模型无法生成回复`);
  }

  try
  {
    let response: Response;

    // 如果在 SillyTavern 环境中，优先尝试使用 ST_API 或 TavernHelper
    if (useSillyTavernAPI || preferSillyTavernAPI)
    {
      // 优先使用 ST_API 或 TavernHelper（即使配置了 API，也优先使用它们以利用酒馆的预设和世界书）
      let success = false;
      let lastError: Error | null = null;

      console.log('[characterService] 尝试使用 SillyTavern API，isSillyTavern=', isSillyTavern, 'canUseSTAPI=', canUseSTAPI, 'canUseTavernHelper=', canUseTavernHelper, 'hasValidAPIConfig=', hasValidAPIConfig);

      // 方法1: 优先使用 ST_API.prompt.generate（st-api-wrapper 插件，最推荐）
      // ST_API 会自动使用酒馆的预设和世界书，即使配置了 API 也会使用
      // 如果同步检测不可用，尝试异步检测（等待 APP_READY）
      const stApiDetected = canUseSTAPI || await detectSTAPI();
      console.log('[characterService] ST_API 检测结果:', stApiDetected, 'canUseSTAPI=', canUseSTAPI);

      if (stApiDetected)
      {
        try
        {
          console.log("[characterService] 使用 ST_API.prompt.generate");

          // 获取 ST_API 实例（从当前窗口或父窗口）
          let stApi: typeof window.ST_API | null = null;
          const getSTAPI = (win: Window): typeof window.ST_API | null => {
            try
            {
              if (typeof (win as any).ST_API !== 'undefined' &&
                typeof (win as any).ST_API.prompt?.generate === 'function')
              {
                return (win as any).ST_API;
              }
            } catch (e)
            {
              // 跨域访问失败
            }
            return null;
          };

          stApi = getSTAPI(window);
          if (!stApi)
          {
            try
            {
              if (window.top && window.top !== window)
              {
                stApi = getSTAPI(window.top);
              }
            } catch (e)
            {
              // 跨域访问失败
            }
          }

          if (!stApi)
          {
            let currentWindow: Window = window;
            for (let i = 0; i < 5; i++)
            {
              try
              {
                if (currentWindow.parent && currentWindow.parent !== currentWindow)
                {
                  stApi = getSTAPI(currentWindow.parent);
                  if (stApi) break;
                  currentWindow = currentWindow.parent;
                } else
                {
                  break;
                }
              } catch (e)
              {
                break;
              }
            }
          }

          if (stApi && stApi.prompt?.generate)
          {
            console.log("[characterService] 成功获取 ST_API 实例，准备调用 generate");
            const stGeneratePayload: STDirectPromptGeneratePayload = {
              writeToChat: false, // 后台生成，不写入聊天
              stream: false,
              timeoutMs: 120000, // 2分钟超时
              extraBlocks: [
                // 注入系统提示词
                {
                  role: 'system',
                  content: stPromptGenerateSystemInstruction,
                  index: 0 // 插入到最前面
                }
              ],
              chatHistory: {
                replace: stApiChatHistory
              },
              preset: {
                mode: 'current' // 使用当前预设
              },
              worldBook: {
                mode: 'current' // 使用当前世界书
              }
            };

            logDebug("request-payload", {
              path: "st-api-generate-direct",
              transport: "ST_API.prompt.generate",
              payload: stGeneratePayload,
            });

            // 调用 ST_API.prompt.generate
            const result = await stApi.prompt.generate(stGeneratePayload);

            logDebug("raw-response", {
              path: "st-api-generate-direct",
              transport: "ST_API.prompt.generate",
              response: result ?? null,
            });

            if (result && result.text)
            {
              // 将生成的文本转换为Response对象（兼容现有代码）
              const mockResponse = {
                choices: [{
                  message: {
                    content: result.text
                  }
                }]
              };
              response = new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
              success = true;
              console.log("[characterService] 使用 ST_API.prompt.generate 成功");
            }
          } else
          {
            // 如果无法直接访问 ST_API（跨域限制），尝试通过 postMessage 代理调用
            console.log('[characterService] 无法直接访问 ST_API，尝试通过 postMessage 代理调用');
            try
            {
              const stGeneratePayload: STDirectPromptGeneratePayload = {
                writeToChat: false,
                stream: false,
                timeoutMs: 120000,
                extraBlocks: [
                  {
                    role: 'system',
                    content: stPromptGenerateSystemInstruction,
                    index: 0
                  }
                ],
                chatHistory: {
                  replace: stApiChatHistory
                },
                preset: {
                  mode: 'current'
                },
                worldBook: {
                  mode: 'current'
                }
              };

              logDebug("request-payload", {
                path: "st-api-generate-proxy",
                transport: "postMessage.prompt.generate",
                payload: stGeneratePayload,
              });

              const proxyResult = await requestSTAPIViaPostMessage<{ text?: string }>('prompt.generate', stGeneratePayload, 120000);

              logDebug("raw-response", {
                path: "st-api-generate-proxy",
                transport: "postMessage.prompt.generate",
                response: proxyResult ?? null,
              });

              if (proxyResult && proxyResult.text)
              {
                const mockResponse = {
                  choices: [{
                    message: {
                      content: proxyResult.text
                    }
                  }]
                };
                response = new Response(JSON.stringify(mockResponse), {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                });
                success = true;
                console.log("[characterService] 通过 postMessage 代理调用 ST_API.prompt.generate 成功");
              }
            } catch (proxyError: any)
            {
              console.warn('[characterService] postMessage 代理调用失败:', proxyError);
            }
          }
        } catch (stApiError: any)
        {
          console.warn("[characterService] ST_API.prompt.generate 调用失败，降级到备用方法:", stApiError);
          lastError = stApiError;
        }
      } else
      {
        // 即使检测失败，也尝试通过 postMessage 代理调用（可能是跨域限制导致检测失败）
        console.log('[characterService] ST_API 检测失败，尝试通过 postMessage 代理调用');
        try
        {
          const stGeneratePayload: STDirectPromptGeneratePayload = {
            writeToChat: false,
            stream: false,
            timeoutMs: 120000,
            extraBlocks: [
              {
                role: 'system',
                content: stPromptGenerateSystemInstruction,
                index: 0
              }
            ],
            chatHistory: {
              replace: stApiChatHistory
            },
            preset: {
              mode: 'current'
            },
            worldBook: {
              mode: 'current'
            }
          };

          logDebug("request-payload", {
            path: "st-api-generate-proxy-fallback",
            transport: "postMessage.prompt.generate",
            payload: stGeneratePayload,
          });

          const proxyResult = await requestSTAPIViaPostMessage<{ text?: string }>('prompt.generate', stGeneratePayload, 120000);

          logDebug("raw-response", {
            path: "st-api-generate-proxy-fallback",
            transport: "postMessage.prompt.generate",
            response: proxyResult ?? null,
          });

          if (proxyResult && proxyResult.text)
          {
            const mockResponse = {
              choices: [{
                message: {
                  content: proxyResult.text
                }
              }]
            };
            response = new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
            success = true;
            console.log("[characterService] 通过 postMessage 代理调用 ST_API.prompt.generate 成功");
          } else
          {
            console.warn('[characterService] postMessage 代理调用返回空结果');
          }
        } catch (proxyError: any)
        {
          console.warn('[characterService] postMessage 代理调用失败:', proxyError);
          lastError = proxyError;
        }
      }

      // 方法2: 降级到 TavernHelper.generate
      if (!success && canUseTavernHelper && tavernHelper)
      {
        try
        {
          console.log("[characterService] 使用 TavernHelper.generate");

          // 提取用户输入（最后一条user消息）
          let userInput = promptText;
          for (let i = messages.length - 1; i >= 0; i--)
          {
            if (messages[i].role === 'user')
            {
              userInput = messages[i].content;
              break;
            }
          }

          const tavernHelperPayload = {
            user_input: userInput,
            should_stream: false,
          };

          logDebug("request-payload", {
            path: "tavern-helper-generate",
            transport: "TavernHelper.generate",
            payload: tavernHelperPayload,
          });

          const generatedText = await tavernHelper.generate(tavernHelperPayload);

          logDebug("raw-response", {
            path: "tavern-helper-generate",
            transport: "TavernHelper.generate",
            response: {
              text: generatedText ?? null,
            },
          });

          if (generatedText)
          {
            const mockResponse = {
              choices: [{
                message: {
                  content: generatedText
                }
              }]
            };
            response = new Response(JSON.stringify(mockResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
            success = true;
            console.log("[characterService] 使用 TavernHelper.generate 成功");
          }
        } catch (tavernHelperError: any)
        {
          console.warn("[characterService] TavernHelper.generate 调用失败:", tavernHelperError);
          lastError = tavernHelperError;
        }
      }

      // 如果所有方法都失败
      if (!success || !response)
      {
        const errorMessage = lastError?.message || "未知错误";
        const isExternalDomain = window.location.href.includes("workers.dev") ||
          window.location.href.includes("cloudflare");

        console.error('[characterService] SillyTavern API 调用失败:', {
          canUseSTAPI,
          canUseTavernHelper,
          hasValidAPIConfig,
          errorMessage,
          isExternalDomain
        });

        // 如果配置了 API，降级到使用配置的 API
        if (hasValidAPIConfig)
        {
          console.log('[characterService] SillyTavern API 不可用，降级到使用配置的 API');
          // 继续执行，使用配置的 API（在 else 分支中）
        } else
        {
          // 如果没有配置 API，抛出错误
          if (isExternalDomain)
          {
            throw new Error(
              `无法连接到SillyTavern API。应用部署在外部服务器上。错误: ${errorMessage}。请在设置中配置API密钥和接口地址，或者确保SillyTavern正在运行并且应用已正确嵌入。`
            );
          }
          throw lastError || new Error(
            `无法连接到SillyTavern API。错误: ${errorMessage}。请确保：1) SillyTavern正在运行 2) 应用已正确嵌入到SillyTavern中 3) st-api-wrapper 插件已安装并启用 4) 或者在设置中配置API密钥`
          );
        }
      }
    }

    // 如果使用 SillyTavern API 失败，或者没有尝试使用 SillyTavern API，使用配置的 API
    if (!response)
    {
      // 使用配置的API（无论是否在SillyTavern环境中，只要用户配置了API就使用）
      if (!hasValidAPIConfig)
      {
        throw new Error("AI配置不完整，请在设置中配置API密钥和接口地址");
      }

      // 根据prompt长度动态调整max_tokens
      const baseMaxTokens = 8000;
      const promptBonus = Math.floor(totalPromptLength * 0.5);
      const estimatedMaxTokens = Math.min(32000, Math.max(baseMaxTokens, baseMaxTokens + promptBonus));

      // 构建请求体
      const requestBody = {
        model: mainAIConfig.model || "gpt-3.5-turbo",
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0.8,
        max_tokens: estimatedMaxTokens,
      };

      // 打印请求摘要信息
      console.log(`[characterService] 请求参数: model=${requestBody.model}, max_tokens=${estimatedMaxTokens}, 估算prompt_tokens=${totalPromptLength}`);
      console.log(`[characterService] 请求体摘要: messages数量=${messages.length}, system长度=${systemInstruction.length}`);

      const requestUrl = `${mainAIConfig.apiBase}/chat/completions`;

      logDebug("request-payload", {
        path: "chat-completions",
        transport: "fetch",
        url: requestUrl,
        payload: requestBody,
      });

      response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mainAIConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const rawResponseText = await response.clone().text().catch(() => "");
      logDebug("raw-response", {
        path: "chat-completions",
        transport: "fetch",
        url: requestUrl,
        status: response.status,
        ok: response.ok,
        responseText: rawResponseText,
      });
    }

    if (!response || !response.ok)
    {
      const errorText = response ? response.statusText : "无法连接到API";
      let errorMessage = `API请求失败: ${errorText}`;

      try
      {
        if (response)
        {
          const error = await response
            .json()
            .catch(() => ({ error: { message: response.statusText } }));
          errorMessage = error.error?.message || errorMessage;
        }
      } catch (e)
      {
        // 忽略JSON解析错误
      }

      // 提供更友好的错误提示
      if (useSillyTavernAPI)
      {
        throw new Error(
          `无法连接到SillyTavern API: ${errorMessage}。请确保SillyTavern正在运行并且API服务已启动，或者在设置中配置API密钥。`
        );
      } else
      {
        throw new Error(`AI调用失败: ${errorMessage}。请检查设置中的API配置。`);
      }
    }

    const data = await response.json();

    // 调试：打印完整响应（用于排查问题）
    console.log('[characterService] API响应摘要:', {
      model: data.model,
      choicesLength: data.choices?.length || 0,
      finishReason: data.choices?.[0]?.finish_reason,
      usage: data.usage,
      hasContent: !!data.choices?.[0]?.message?.content,
      contentLength: data.choices?.[0]?.message?.content?.length || 0
    });

    // 检查响应结构
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0)
    {
      console.error('[characterService] 响应结构异常，完整响应:', JSON.stringify(data, null, 2));
      throw new Error(`AI返回的响应格式不正确: ${JSON.stringify(data)}。可能是API配置问题，请检查API地址和模型设置。`);
    }

    // 检查finish_reason，看是否有特殊原因
    const finishReason = data.choices[0]?.finish_reason;
    const usage = data.usage || {};

    // 如果completion_tokens为0，说明模型没有生成任何内容
    if (usage.completion_tokens === 0)
    {
      // 调试：打印更多信息
      console.error('[characterService] 模型未生成内容，完整响应数据:', JSON.stringify(data, null, 2));

      let errorMsg = 'AI模型没有生成任何内容。';

      if (finishReason === 'length')
      {
        errorMsg += ' 原因：回复被截断（可能max_tokens设置过小）。';
      } else if (finishReason === 'content_filter')
      {
        errorMsg += ' 原因：内容被安全过滤器拦截。';
      } else if (finishReason === 'stop')
      {
        errorMsg += ' 原因：模型提前停止生成（可能是prompt过长或格式问题）。';
      } else if (finishReason)
      {
        errorMsg += ` 原因：${finishReason}。`;
      }

      errorMsg += ` 输入token: ${usage.prompt_tokens || 0}，输出token: ${usage.completion_tokens || 0}。`;
      errorMsg += ' 建议：1) 检查prompt是否过长 2) 尝试减少对话历史 3) 检查模型是否支持该任务。';

      console.error('[characterService] AI未生成内容:', {
        finishReason,
        usage,
        model: data.model,
        promptTokens: usage.prompt_tokens
      });

      throw new Error(errorMsg);
    }

    // 提取AI响应内容
    let aiResponse = data.choices[0]?.message?.content || "";

    // 如果响应为空，尝试从其他字段提取
    if (!aiResponse || aiResponse.trim().length === 0)
    {
      // 尝试从reasoning_content提取（某些模型可能把内容放在这里）
      aiResponse = data.choices[0]?.message?.reasoning_content || "";
    }

    // 检查响应内容是否为空
    if (!aiResponse || aiResponse.trim().length === 0)
    {
      console.error('[characterService] AI响应为空，完整响应数据:', JSON.stringify(data, null, 2));

      let errorMsg = 'AI返回的响应为空。';
      if (usage.prompt_tokens && usage.prompt_tokens > 10000)
      {
        errorMsg += ` 输入token过多（${usage.prompt_tokens}），可能导致模型无法生成回复。建议减少对话历史或简化prompt。`;
      } else
      {
        errorMsg += ' 可能是模型配置问题、token限制过小、或API服务异常。';
      }
      errorMsg += ' 请检查：1) 模型是否正确 2) max_tokens是否足够（当前4000） 3) API服务是否正常。';

      throw new Error(errorMsg);
    }

    // 记录响应内容（用于调试）
    console.log('[characterService] AI响应长度:', aiResponse.length);
    console.log('[characterService] AI响应前500字符:', aiResponse.substring(0, 500));
    return buildGeminiResponseFromAIText(aiResponse, currentStatus, isRemoteWeChat);
  } catch (error: any)
  {
    console.error("AI调用错误:", error);
    throw new Error(`AI调用失败: ${error.message || "未知错误"}`);
  }
}
