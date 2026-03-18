import type React from "react";
import { useRef, useState } from "react";
import { useSettings } from "../contexts/SettingsContext";
import { selectAIConfig } from "../services/aiConfigUtils";
import { calculateYellowHairBehaviorStage, decideTodayYellowHair, generateYellowHair, shouldTriggerYellowHair, shouldYellowHairAppearToday } from "../services/arcLightService";
import { generateCharacterResponse } from "../services/characterService";
import { appendDebugLog } from "../services/debugLogService";
import { generateTweetForPhoneApp } from "../services/phoneContentService";
import {
  BackpackItem,
  BodyStatus,
  CalendarEvent,
  GameTime,
  LocationID,
  Message,
  Tweet,
} from "../types";
import { isMobileDevice } from "../utils/deviceUtils";

/**
 * 获取可访问的 ST_API 实例
 */
function getAccessibleSTAPI(): any | null {
  try {
    if (typeof window !== 'undefined' && (window as any).ST_API) {
      return (window as any).ST_API;
    }
  } catch {}
  
  try {
    if (window.parent && window.parent !== window && (window.parent as any).ST_API) {
      return (window.parent as any).ST_API;
    }
  } catch {}
  
  try {
    if (window.top && window.top !== window && (window.top as any).ST_API) {
      return (window.top as any).ST_API;
    }
  } catch {}
  
  return null;
}

/**
 * 通过 postMessage 调用 ST_API（跨域时使用）
 */
async function requestSTAPIViaPostMessage<T>(
  endpoint: string,
  params: any = {},
  timeout: number = 5000
): Promise<T | null> {
  if (typeof window === 'undefined' || window.parent === window) return null;

  return new Promise((resolve) => {
    const messageId = `st_api_${endpoint}_${Date.now()}_${Math.random()}`;
    let timeoutId: NodeJS.Timeout;
    let resolved = false;

    const messageHandler = (event: MessageEvent) => {
      if (resolved) return;
      
      if (event.data && event.data.id === messageId) {
        resolved = true;
        clearTimeout(timeoutId);
        window.removeEventListener('message', messageHandler);
        
        if (event.data.error) {
          console.warn(`[ST_API Proxy] ${endpoint} 错误:`, event.data.error);
          resolve(null);
        } else {
          const result = event.data.data !== undefined ? event.data.data : event.data;
          resolve(result as T);
        }
        return;
      }
    };

    window.addEventListener('message', messageHandler);

    try {
      window.parent.postMessage({
        type: 'ST_API_CALL',
        id: messageId,
        endpoint,
        params
      }, '*');
    } catch (error) {
      window.removeEventListener('message', messageHandler);
      resolve(null);
      return;
    }

    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', messageHandler);
        resolve(null);
      }
    }, timeout);
  });
}

// 对话处理 Hook - 负责处理所有对话相关的逻辑
// 包括发送消息、调用AI生成回复、更新状态、处理推特等
interface UseDialogueProps {
  messages: Message[];
  bodyStatus: BodyStatus;
  userLocation: LocationID;
  tweets: Tweet[];
  calendarEvents: CalendarEvent[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setBodyStatus: React.Dispatch<React.SetStateAction<BodyStatus>>;
  setTweets: React.Dispatch<React.SetStateAction<Tweet[]>>;
  setCalendarEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  avatarUrl: string;
  todaySummary: string; // 今日记忆总结
  advance?: (minutes: number) => void; // 时间推进函数（可选）
  gameTime?: GameTime; // 当前游戏时间（可选）
  setUserLocation?: (location: LocationID) => void; // 设置用户位置函数（可选）
  onSaveGame?: (slotId: number, customName?: string) => void; // 保存游戏函数（可选）
  backpackItems?: BackpackItem[]; // 背包物品列表（用于检测对话中的使用/赠送）
  onUseItem?: (
    itemId: string,
    name: string,
    description: string,
    handleActionCallback?: (text: string, isSystem?: boolean) => Promise<void>
  ) => Promise<void> | void; // 使用物品函数
  onGiftItem?: (
    itemId: string,
    name: string,
    description: string,
    handleActionCallback?: (text: string, isSystem?: boolean) => Promise<void>
  ) => Promise<void> | void; // 赠送物品函数
  onGiftClothing?: (
    outfitId: string,
    itemId: string,
    handleActionCallback?: (text: string, isSystem?: boolean) => Promise<void>
  ) => Promise<void> | void; // 赠送服装函数
}

export const useDialogue = ({
  messages,
  bodyStatus,
  userLocation,
  tweets,
  calendarEvents,
  setMessages,
  setBodyStatus,
  setTweets,
  setCalendarEvents,
  avatarUrl,
  todaySummary,
  advance,
  gameTime,
  setUserLocation,
  onSaveGame,
  backpackItems = [],
  onUseItem,
  onGiftItem,
  onGiftClothing,
}: UseDialogueProps) => {
  const { settings } = useSettings();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // 保存最后一次的操作，用于重新生成
  const lastActionRef = useRef<{ actionText: string; isSystemAction: boolean; userMessageId?: string } | null>(null);

  const advanceGameTimeSnapshot = (time: GameTime, minutes: number): GameTime => {
    const nextDate = new Date(
      time.year,
      time.month - 1,
      time.day,
      time.hour,
      time.minute
    );
    nextDate.setMinutes(nextDate.getMinutes() + minutes);

    return {
      ...time,
      year: nextDate.getFullYear(),
      month: nextDate.getMonth() + 1,
      day: nextDate.getDate(),
      weekday: nextDate.getDay(),
      hour: nextDate.getHours(),
      minute: nextDate.getMinutes(),
    };
  };

  const formatTweetTime = (time?: GameTime): string => {
    if (!time) return "刚刚";

    return `${time.month}月${time.day}日 ${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
  };

  // 添加记忆到日历
  const addMemory = (
    title: string,
    description: string,
    color: string = "border-blue-400"
  ) => {
    const timeStr = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setCalendarEvents((prev) => [
      {
        id: Date.now().toString(),
        time: timeStr,
        title,
        description,
        color,
      },
      ...prev,
    ]);
  };

  // 处理用户操作 - 这是核心的对话处理函数
  const handleAction = async (actionText: string, isSystemAction = false) => {
    if (isLoading) return;

    let effectiveGameTime = gameTime ? { ...gameTime } : undefined;
    const advanceGameClock = (minutes: number) => {
      if (advance) {
        advance(minutes);
      }

      if (effectiveGameTime) {
        effectiveGameTime = advanceGameTimeSnapshot(effectiveGameTime, minutes);
      }
    };

    // 保存当前操作，用于重新生成
    lastActionRef.current = { actionText, isSystemAction };

    // 检测购物操作
    if (actionText.includes("购买了商品")) {
      const item = actionText.split(":")[1]?.trim() || "物品";
      addMemory("购物", `在商城购买了 ${item}`, "border-orange-400");
    }

    // 如果不是系统操作，添加用户消息
    let userMessageId: string | undefined;
    if (!isSystemAction) {
      userMessageId = Date.now().toString();
      setMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          sender: "user",
          text: actionText,
          timestamp: new Date(),
        },
      ]);
      // 更新最后一次操作记录，包含用户消息ID
      lastActionRef.current = { actionText, isSystemAction, userMessageId };
    } else {
      // 系统操作也更新记录
      lastActionRef.current = { actionText, isSystemAction };
    }

    // 如果不是系统操作，检测用户输入中是否包含使用/赠送物品的意图
    if (!isSystemAction && backpackItems.length > 0) {
      const actionLower = actionText.toLowerCase();
      
      // 检测赠送意图关键词
      const giftKeywords = ['送', '给你', '送给你', '送你了', '送给你了', '送你', '送给你吧', '送你了'];
      const isGiftIntent = giftKeywords.some(keyword => actionLower.includes(keyword));
      
      // 检测使用意图关键词
      const useKeywords = ['用', '使用', '用那个', '用这个', '用一下', '用吧', '用上', '用起来', '用起来吧'];
      const isUseIntent = useKeywords.some(keyword => actionLower.includes(keyword));
      
      // 如果检测到赠送或使用意图，尝试匹配背包物品
      if (isGiftIntent || isUseIntent) {
        // 匹配背包物品名称（支持部分匹配和关键词匹配）
        const matchedItem = backpackItems.find(item => {
          const itemNameLower = item.name.toLowerCase();
          // 完整匹配
          if (actionLower.includes(itemNameLower)) return true;
          // 部分匹配：如果物品名称包含多个字，检查是否包含关键部分
          const itemWords = itemNameLower.split(/[的、，,。.\s]+/).filter(w => w.length > 1);
          if (itemWords.length > 0) {
            // 检查是否包含物品名称的关键词
            const hasKeyWord = itemWords.some(word => actionLower.includes(word));
            if (hasKeyWord) return true;
          }
          // 特殊匹配：运动服、情趣内衣等常见物品的简化名称
          const simplifiedNames: Record<string, string[]> = {
            '运动服': ['运动', '运动服'],
            '黑色情趣内衣': ['情趣', '内衣', '黑色情趣'],
            '公主裙': ['公主', '公主裙'],
            '汉服': ['汉服'],
            '猫咪连体衣': ['猫咪', '连体', '连体衣'],
            '甜美毛衣': ['甜美', '毛衣'],
            '魔法少女装': ['魔法', '少女'],
            '旗袍': ['旗袍'],
          };
          const simplified = simplifiedNames[item.name];
          if (simplified) {
            return simplified.some(name => actionLower.includes(name));
          }
          return false;
        });
        
        if (matchedItem) {
          // 根据意图调用相应函数（传递 handleAction）
          if (isGiftIntent) {
            if (matchedItem.type === 'clothing' && onGiftClothing && matchedItem.outfitId) {
              // 赠送服装
              await onGiftClothing(matchedItem.outfitId, matchedItem.id, handleAction);
              return; // 函数内部会调用 handleAction 生成剧情，这里直接返回
            } else if (matchedItem.type === 'item' && onGiftItem) {
              // 赠送物品
              await onGiftItem(matchedItem.id, matchedItem.name, matchedItem.description, handleAction);
              return; // 函数内部会调用 handleAction 生成剧情，这里直接返回
            }
          } else if (isUseIntent && matchedItem.type === 'item' && onUseItem) {
            // 使用物品
            await onUseItem(matchedItem.id, matchedItem.name, matchedItem.description, handleAction);
            return; // 函数内部会调用 handleAction 生成剧情，这里直接返回
          }
        }
      }
    }

    setInput("");
    setIsLoading(true);
    
    // 智能时间推进：根据对话内容和动作类型推进不同时间
    if (!isSystemAction && advance) {
      // 检测是否为移动操作
      const actionLower = actionText.toLowerCase();
      const isLocationMove = actionLower.includes('去') || 
                            actionLower.includes('前往') || 
                            actionLower.includes('来到') ||
                            actionLower.includes('移动') ||
                            actionLower.includes('到') ||
                            actionLower.includes('去');
      
      // 检测移动类型
      const isIndoorMove = ['客厅', '卧室', '次卧', '厨房', '厕所', '走廊', '家'].some(keyword => 
        actionLower.includes(keyword)
      );
      const isOutdoorMove = ['电影院', '商城', '游乐园', '学校', '公司', '美食广场', '蛋糕店', '港口', '展会'].some(keyword =>
        actionLower.includes(keyword)
      );
      
      if (isLocationMove) {
        if (isIndoorMove) {
          // 家中位置转移：2-3分钟（随机）
          const minutes = 2 + Math.floor(Math.random() * 2); // 2-3分钟
          advanceGameClock(minutes);
          console.log(`[useDialogue] 家中移动，推进${minutes}分钟`);
        } else if (isOutdoorMove) {
          // 外出：15-40分钟（随机，根据距离调整）
          const minutes = 15 + Math.floor(Math.random() * 26); // 15-40分钟
          advanceGameClock(minutes);
          console.log(`[useDialogue] 外出移动，推进${minutes}分钟`);
        } else {
          // 其他移动，默认15分钟
          advanceGameClock(15);
          console.log(`[useDialogue] 一般移动，推进15分钟`);
        }
      } else {
        // 普通对话：1分钟
        advanceGameClock(1);
        console.log(`[useDialogue] 普通对话，推进1分钟`);
      }
    }

    // 构建对话历史（优化：使用总结替代旧消息）
    // 手机端使用更少的历史记录，避免prompt过长
    const isMobile = isMobileDevice();
    const historyLimit = isMobile ? 5 : 8; // 手机端5条，电脑端8条
    
    // 筛选非系统消息
    const nonSystemMessages = messages.filter((m) => m.sender !== "system");
    
    // 如果有总结且消息较多，使用总结替代旧消息
    let history: { role: string; content: string }[];
    if (todaySummary && nonSystemMessages.length > historyLimit + 3) {
      // 保留最近的消息，用总结替代更早的消息
      const recentMessages = nonSystemMessages.slice(-historyLimit);
      const olderMessages = nonSystemMessages.slice(0, -historyLimit);
      
      // 如果有旧消息，用总结替代
      if (olderMessages.length > 0) {
        history = [
          { role: "system", content: `[之前的对话总结]\n${todaySummary}` },
          ...recentMessages.map((m) => ({
            role: m.sender === "user" ? "user" : "model",
            content: m.text,
          }))
        ];
      } else {
        // 如果没有旧消息，直接使用最近的消息
        history = recentMessages.map((m) => ({
          role: m.sender === "user" ? "user" : "model",
          content: m.text,
        }));
      }
    } else {
      // 没有总结或消息不多，直接使用最近的消息
      history = nonSystemMessages
        .slice(-historyLimit)
        .map((m) => ({
          role: m.sender === "user" ? "user" : "model",
          content: m.text,
        }));
    }

    let promptText = actionText;
    const isWeChatMessage = actionText.startsWith("(发送微信)");
    const phoneAIConfig = selectAIConfig(settings.contentAI, settings.mainAI);
    const selectedAIConfig = isWeChatMessage ? phoneAIConfig : settings.mainAI;
    
    // 精确位置系统：判断是否为远程互动（不能直接找到温婉）
    // 1. 不同大地点：肯定是远程
    // 2. 同一大地点但无精确位置信息：可能是远程（概率性找到）
    // 3. 同一大地点且有精确位置信息：不是远程（可以找到）
    // 4. 室内地点：同一地点就能找到
    const isInteriorLocation = [
      'master_bedroom', 'guest_bedroom', 'living_room', 
      'dining_room', 'kitchen', 'toilet', 'hallway'
    ].includes(userLocation);
    const isLargeLocation = !isInteriorLocation;
    
    // 判断是否为远程互动
    const isRemoteWeChat = isWeChatMessage && (
      userLocation !== bodyStatus.location || // 不同大地点
      (isLargeLocation && userLocation === bodyStatus.location && !bodyStatus.exactLocation) || // 同一大地点但无精确位置
      (bodyStatus.isAccessible === false) // 不可访问（如游艇已出海）
    );

    // 如果发送微信消息时在同一位置，添加特殊提示
    if (isWeChatMessage && userLocation === bodyStatus.location) {
      promptText = `${actionText} \n(System Hint: The user sent this WeChat message while standing right next to you in the ${userLocation}. You should react with confusion, amusement, or teasing: "Why are you texting me when I'm right here?" or "Looking at your phone instead of me?" or similar.)`;
    }

    // 如果是远程微信消息，提示AI这是通过微信发送的
    if (isRemoteWeChat) {
      promptText = `${actionText.replace(
        "(发送微信)",
        ""
      )} \n(System Hint: The user sent this message via WeChat while you are in different locations. You are currently at ${
        bodyStatus.location
      }, while the user is at ${userLocation}. 

**CRITICAL REMINDERS**:
1. Reply as Wenwan typing a WeChat message - use FIRST PERSON (我) or direct dialogue, NOT third-person descriptions.
2. DO NOT describe what Wenwan is doing physically - the user cannot see it.
3. Keep the reply SHORT and NATURAL - like a real WeChat message.
4. If Wenwan is in a compromising situation, she might reply briefly or awkwardly.
5. DO NOT update location in your response - user and Wenwan remain in different locations.)`;
    }

    // 调用AI生成回复（使用设置中的主AI配置）
    const statusWithContext = { ...bodyStatus, location: bodyStatus.location };

    // 检查是否需要触发黄毛登场（周三触发）
    if (gameTime && shouldTriggerYellowHair(bodyStatus, gameTime)) {
      const yellowHair = generateYellowHair();
      setBodyStatus(prev => {
        const newStatus = { ...prev };
        if (newStatus.yellowHair1 === null) {
          newStatus.yellowHair1 = {
            name: yellowHair.name,
            type: yellowHair.type,
            active: true,
            firstMetDate: `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}-${String(gameTime.day).padStart(2, '0')}`
          };
        } else if (newStatus.yellowHair2 === null) {
          newStatus.yellowHair2 = {
            name: yellowHair.name,
            type: yellowHair.type,
            active: true,
            firstMetDate: `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}-${String(gameTime.day).padStart(2, '0')}`
          };
        }
        return newStatus;
      });
      console.log(`[useDialogue] 周三触发黄毛登场: ${yellowHair.name} (${yellowHair.type === 'rich' ? '富二代' : 'cos社社长'})`);
    }

    // 检查今天是否有黄毛出现（周三之后，每天都可以出现）
    let todayYellowHair: { name: string; type: 'rich' | 'fat' } | null = null;
    let yellowHairBehaviorStage: number | null = null;
    if (gameTime && shouldYellowHairAppearToday(bodyStatus, gameTime)) {
      todayYellowHair = decideTodayYellowHair(bodyStatus, gameTime);
      if (todayYellowHair) {
        yellowHairBehaviorStage = calculateYellowHairBehaviorStage(bodyStatus.degradation);
        console.log(`[useDialogue] 今天黄毛出现: ${todayYellowHair.name}, 行为阶段值: ${yellowHairBehaviorStage}, 堕落度: ${bodyStatus.degradation}`);
      }
    }

    // 如果有黄毛出现，在promptText中添加相关信息
    let enhancedPromptText = promptText;
    if (gameTime && shouldTriggerYellowHair(bodyStatus, gameTime)) {
      const yellowHair = generateYellowHair();
      enhancedPromptText = `(System: 今天是周三，${yellowHair.name}（${yellowHair.type === 'rich' ? '富二代差生' : 'cos社社长'}，高三生）在学校里出现了。${yellowHair.name}会主动找温婉，一开始会对温婉很好（正常互动、关心、帮助等），这时候温婉的堕落度可能会增长。)\n\n${promptText}`;
    } else if (todayYellowHair && yellowHairBehaviorStage !== null) {
      // 根据行为阶段值决定黄毛的邀请内容
      let behaviorDescription = '';
      let acceptanceThreshold = 0;
      let acceptanceDescription = '';
      
      if (yellowHairBehaviorStage <= 20) {
        behaviorDescription = `${todayYellowHair.name}可能会邀请温婉约会、看电影、拥抱。`;
        acceptanceThreshold = 0;
        acceptanceDescription = '温婉会接受（任何堕落度都可以接受约会、看电影、拥抱）';
      } else if (yellowHairBehaviorStage <= 40) {
        behaviorDescription = `${todayYellowHair.name}可能会要求接吻、轻度调教。`;
        acceptanceThreshold = 26;
        acceptanceDescription = `温婉堕落度需要达到26+才会接受接吻、轻度调教。如果堕落度只有0-25，温婉会拒绝，${todayYellowHair.name}会调整策略，继续邀请约会、看电影。`;
      } else if (yellowHairBehaviorStage <= 60) {
        behaviorDescription = `${todayYellowHair.name}可能会要求中度调教、口交、手交。`;
        acceptanceThreshold = 51;
        acceptanceDescription = `温婉堕落度需要达到51+才会接受中度调教、口交、手交。如果堕落度只有0-50，温婉会拒绝，${todayYellowHair.name}会调整策略，回到接吻、轻度调教。`;
      } else if (yellowHairBehaviorStage <= 80) {
        behaviorDescription = `${todayYellowHair.name}可能会要求深度调教、性交。`;
        acceptanceThreshold = 71;
        acceptanceDescription = `温婉堕落度需要达到71+才会接受深度调教、性交。如果堕落度只有0-70，温婉会拒绝，${todayYellowHair.name}会调整策略，回到中度调教、口交、手交。`;
      } else {
        behaviorDescription = `${todayYellowHair.name}可能会要求完全恶堕、母狗化。`;
        acceptanceThreshold = 91;
        acceptanceDescription = `温婉堕落度需要达到91+才会接受完全恶堕、母狗化。如果堕落度只有0-90，温婉会拒绝，${todayYellowHair.name}会调整策略，回到深度调教、性交。`;
      }
      
      // 判断温婉是否会接受
      const willAccept = bodyStatus.degradation >= acceptanceThreshold;
      const acceptanceInfo = willAccept 
        ? `温婉堕落度${bodyStatus.degradation} >= ${acceptanceThreshold}，会接受${todayYellowHair.name}的要求，堕落度会增长2-4点。`
        : `温婉堕落度${bodyStatus.degradation} < ${acceptanceThreshold}，会拒绝${todayYellowHair.name}的要求。${acceptanceDescription}`;
      
      enhancedPromptText = `(System: 今天${todayYellowHair.name}（${todayYellowHair.type === 'rich' ? '富二代差生' : 'cos社社长'}，高三生）在学校，可能会邀请温婉。当前堕落度：${bodyStatus.degradation}，黄毛行为阶段值：${yellowHairBehaviorStage}。${behaviorDescription}${acceptanceInfo})\n\n${promptText}`;
    }

    try {
      // 调试：检查配置
      console.log("[useDialogue] 调用AI前的配置检查:", {
        apiTarget: isWeChatMessage ? "contentAI" : "mainAI",
        apiBase: selectedAIConfig.apiBase,
        hasApiKey: !!selectedAIConfig.apiKey,
        model: selectedAIConfig.model,
        apiKeyLength: selectedAIConfig.apiKey?.length || 0,
      });

      if (settings.debugLoggingEnabled) {
        appendDebugLog({
          scope: "useDialogue",
          event: "request-context",
          data: {
            actionText,
            isSystemAction,
            history,
            enhancedPromptText,
            userLocation,
            isRemoteWeChat,
            selectedAI: {
              apiBase: selectedAIConfig.apiBase,
              model: selectedAIConfig.model,
              hasApiKey: !!selectedAIConfig.apiKey,
            },
            bodyStatus: statusWithContext,
            memoryData: {
              todaySummary,
              calendarEvents: calendarEvents.map((e) => ({
                time: e.time,
                title: e.title,
                description: e.description,
              })),
              gameTime: effectiveGameTime ?? gameTime,
              presetContent: settings.presetContent,
              writingStyle: settings.writingStyle,
              perspective: settings.perspective,
              nsfwStyle: settings.nsfwStyle,
              jailbreakPrompt: settings.jailbreakPrompt,
            },
          },
        });
      }

      const response = await generateCharacterResponse(
        history,
        enhancedPromptText, // 使用增强后的promptText（包含黄毛信息）
        statusWithContext,
        userLocation,
        selectedAIConfig, // 微信内容优先使用副AI，其余使用主AI
        isRemoteWeChat, // 传递是否为远程微信消息
        {
          todaySummary,
          calendarEvents: calendarEvents.map((e) => ({
            time: e.time,
            title: e.title,
            description: e.description,
          })),
          gameTime: effectiveGameTime ?? gameTime, // 传递当前游戏时间，让AI知道时间并自主判断位置
          presetContent: settings.presetContent, // 传递预设内容
          writingStyle: settings.writingStyle, // 传递描写规范
          perspective: settings.perspective, // 传递人称描写
          nsfwStyle: settings.nsfwStyle, // 传递NFSW描写规范
          jailbreakPrompt: settings.jailbreakPrompt, // 传递破限制提示词
        },
        {
          useSillyTavernGenerate: settings.useSillyTavernGenerate,
          debugLoggingEnabled: settings.debugLoggingEnabled,
        }
      );

      // 添加角色回复消息
      // 如果是远程微信消息，标记回复为微信消息，只在微聊界面显示
      // 检查回复内容，如果包含第三人称描述（说明AI没有遵循微信消息格式），强制添加(微信)标记
      let replyText = response.reply;
      
      // 使用酒馆的正则脚本处理AI回答（移除思考过程等）
      try {
        const stApi = getAccessibleSTAPI();
        if (stApi?.regexScript?.process) {
          const processedResult = await stApi.regexScript.process({
            text: replyText,
            placement: 2 // 2表示处理输出（AI回答）
          });
          if (processedResult?.text) {
            replyText = processedResult.text;
            console.log('[useDialogue] 正则脚本处理完成');
          }
        } else {
          // 尝试通过 postMessage 代理调用
          const processedResult = await requestSTAPIViaPostMessage<{ text?: string }>(
            'regexScript.process',
            {
              text: replyText,
              placement: 2
            },
            5000 // 5秒超时
          );
          if (processedResult?.text) {
            replyText = processedResult.text;
            console.log('[useDialogue] 正则脚本处理完成（通过代理）');
          }
        }
      } catch (error) {
        console.warn('[useDialogue] 正则脚本处理失败，使用原始文本:', error);
        // 处理失败时继续使用原始文本
      }
      
      // 备用清理：确保 JSON 代码块和换行符被正确处理（双重保险）
      // 移除 JSON 代码块
      replyText = replyText
        .replace(/```json[\s\S]*?```/gi, '')
        .replace(/```[\s\S]*?```/g, '');
      
      // 移除其他标签
      replyText = replyText
        .replace(/<summary>[\s\S]*?<\/summary>/gi, '')
        .replace(/<details>[\s\S]*?<\/details>/gi, '');
      
      // 转换换行符（将字符串 \n 转换为实际换行符）
      replyText = replyText
        .replace(/\\r\\n/g, '\r\n')  // Windows 换行
        .replace(/\\n/g, '\n')       // Unix 换行
        .replace(/\\r/g, '\r');      // Mac 换行
      
      // 清理多余的空白行
      replyText = replyText
        .replace(/\n{4,}/g, '\n\n\n')  // 最多保留3个连续换行
        .trim();
      
      const isThirdPersonDescription = replyText.includes('温婉') || 
                                       replyText.includes('她') || 
                                       replyText.includes('看到') ||
                                       replyText.includes('拿起') ||
                                       replyText.includes('回复道') ||
                                       replyText.includes('说道');
      
      // 如果是远程微信消息，但回复看起来像是第三人称描述，强制标记为微信消息并清理格式
      if (isRemoteWeChat) {
        if (isThirdPersonDescription) {
          // 尝试提取对话内容，移除第三人称描述
          const dialogueMatch = replyText.match(/[""]([^""]+)[""]|「([^」]+)」|'([^']+)'/);
          if (dialogueMatch) {
            replyText = dialogueMatch[1] || dialogueMatch[2] || dialogueMatch[3] || replyText;
          }
          // 确保标记为微信消息
          if (!replyText.startsWith('(微信)')) {
            replyText = `(微信) ${replyText}`;
          }
        } else if (!replyText.startsWith('(微信)')) {
          replyText = `(微信) ${replyText}`;
        }
      }

      if (settings.debugLoggingEnabled) {
        appendDebugLog({
          scope: "useDialogue",
          event: "rendered-reply",
          data: {
            replyText,
            isRemoteWeChat,
            generatedStatus: response.status,
            generatedTweet: response.generatedTweet ?? null,
          },
        });
      }
      
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: "character",
          text: replyText,
          timestamp: new Date(),
          isWeChat: isRemoteWeChat, // 标记为微信消息，只在微聊界面显示
        },
      ]);

      // 更新身体状态（合并更新，确保不会丢失字段）
      // 远程微信消息时，不应该更新位置（用户和温婉不在同一位置）
      setBodyStatus((prev) => {
        // 调试日志：记录接收到的状态
        console.log("[useDialogue] 准备更新状态:", {
          当前好感度: prev.favorability,
          AI返回的好感度: response.status.favorability,
          当前情绪: prev.emotion,
          AI返回的情绪: response.status.emotion,
          当前服装: prev.overallClothing,
          AI返回的服装: response.status.overallClothing,
          完整状态: response.status
        });

        // 如果是远程微信消息，保持位置不变
        if (isRemoteWeChat && response.status.location) {
          response.status.location = prev.location;
        }

        // 计算好感度和堕落度的变化
        const favorabilityChange = response.status.favorability - prev.favorability;
        const degradationChange = response.status.degradation - prev.degradation;
        
        // 检查是否发生了NTR事件（堕落度增长）
        const isNTREvent = degradationChange > 0;

        // 检查每日增长上限（只限制增长，不限制降低）
        let finalFavorability = response.status.favorability;
        let finalDegradation = response.status.degradation;
        let updatedFavorabilityGain = prev.todayFavorabilityGain || 0;
        let updatedDegradationGain = prev.todayDegradationGain || 0;

        // 好感度增长上限检查（只限制增长，不限制降低）
        if (favorabilityChange > 0) {
          const remainingFavorabilityQuota = 5 - (prev.todayFavorabilityGain || 0);
          if (favorabilityChange > remainingFavorabilityQuota) {
            // 超过每日上限，只增长剩余额度
            finalFavorability = prev.favorability + remainingFavorabilityQuota;
            updatedFavorabilityGain = 5;
            console.log(`[useDialogue] 好感度增长超过每日上限，已限制: 尝试增长${favorabilityChange}，实际增长${remainingFavorabilityQuota}`);
          } else {
            updatedFavorabilityGain = (prev.todayFavorabilityGain || 0) + favorabilityChange;
          }
        }

        // 堕落度增长上限检查（只限制增长，不限制降低）
        if (degradationChange > 0) {
          const remainingDegradationQuota = 5 - (prev.todayDegradationGain || 0);
          if (degradationChange > remainingDegradationQuota) {
            // 超过每日上限，只增长剩余额度
            finalDegradation = prev.degradation + remainingDegradationQuota;
            updatedDegradationGain = 5;
            console.log(`[useDialogue] 堕落度增长超过每日上限，已限制: 尝试增长${degradationChange}，实际增长${remainingDegradationQuota}`);
          } else {
            updatedDegradationGain = (prev.todayDegradationGain || 0) + degradationChange;
          }
        }

        const newStatus = {
          ...prev,
          ...response.status,
          // 应用每日上限限制后的值
          favorability: finalFavorability,
          degradation: finalDegradation,
          // 更新每日增长计数器
          todayFavorabilityGain: updatedFavorabilityGain,
          todayDegradationGain: updatedDegradationGain,
          // 确保嵌套对象也被正确合并
          mouth: { ...prev.mouth, ...(response.status.mouth || {}) },
          chest: { ...prev.chest, ...(response.status.chest || {}) },
          nipples: { ...prev.nipples, ...(response.status.nipples || {}) },
          groin: { ...prev.groin, ...(response.status.groin || {}) },
          posterior: {
            ...prev.posterior,
            ...(response.status.posterior || {}),
          },
          feet: { ...prev.feet, ...(response.status.feet || {}) },
        };

        // 调试日志：记录状态更新
        const hasChanges = 
          prev.favorability !== newStatus.favorability ||
          prev.emotion !== newStatus.emotion ||
          prev.overallClothing !== newStatus.overallClothing ||
          prev.location !== newStatus.location;
        
        if (hasChanges) {
          console.log("[useDialogue] 状态已更新:", {
            旧好感度: prev.favorability,
            新好感度: newStatus.favorability,
            旧情绪: prev.emotion,
            新情绪: newStatus.emotion,
            旧服装: prev.overallClothing,
            新服装: newStatus.overallClothing,
            旧位置: prev.location,
            新位置: newStatus.location,
          });
        } else {
          console.warn("[useDialogue] 状态未发生变化，可能解析失败");
        }

        return newStatus;
      });

      // 如果AI返回的位置与用户位置相同（说明一起去某个地方），自动更新用户位置
      // 或者如果对话内容明确暗示用户和温婉一起移动，也更新用户位置
      // **重要**：远程微信消息时，不应该自动更新用户位置（用户和温婉不在同一位置）
      // **重要**：只有当明确提到"一起"、"和哥哥"、"带着"等词，且玩家和温婉原本在同一位置时，才同步位置
      if (response.status.location && setUserLocation && !isRemoteWeChat) {
        const replyText = response.reply.toLowerCase();
        
        // **严格判断**：只有当对话中明确提到玩家也一起移动时，才同步位置
        // 关键词必须明确表示"一起"、"和哥哥"、"带着哥哥"、"我送你去"等
        const togetherKeywords = [
          '一起',           // 一起
          '和哥哥',         // 和哥哥
          '和哥哥一起',     // 和哥哥一起
          '带着哥哥',       // 带着哥哥
          '我送你去',       // 我送你去
          '我送你',         // 我送你
          '陪你',           // 陪你
          '陪你一起',       // 陪你一起
          '我们',           // 我们（需要结合上下文，但这里简化处理）
          '我们一起去',     // 我们一起去
          '我们到了',       // 我们到了
          '我们来到',       // 我们来到
          '一起到了',       // 一起到了
          '一起来到',       // 一起来到
          '一起前往',       // 一起前往
        ];
        
        // 检查是否明确提到"一起"移动
        const hasExplicitTogether = togetherKeywords.some(keyword => replyText.includes(keyword));
        
        // **关键条件**：
        // 1. 对话中明确提到"一起"等关键词
        // 2. 玩家和温婉原本在同一位置（这样才可能一起移动）
        // 3. 温婉的新位置与玩家当前位置不同（说明发生了移动）
        const wasTogetherBefore = userLocation === bodyStatus.location;
        const locationChanged = response.status.location !== userLocation;
        
        if (hasExplicitTogether && wasTogetherBefore && locationChanged) {
          // 只有当明确提到"一起"，且原本在同一位置，且位置发生变化时，才同步玩家位置
          console.log(`[useDialogue] 自动更新用户位置: ${userLocation} → ${response.status.location} (明确提到"一起"且原本在同一位置)`);
          setUserLocation(response.status.location);
          
          // 如果位置变化，根据移动类型智能推进时间
          if (advance) {
            const isIndoorLocation = ['master_bedroom', 'guest_bedroom', 'living_room', 'dining_room', 'kitchen', 'toilet', 'hallway'].includes(response.status.location);
            const isOutdoorLocation = !isIndoorLocation;
            
            if (isIndoorLocation) {
              // 家中位置转移：2-3分钟
              const minutes = 2 + Math.floor(Math.random() * 2); // 2-3分钟
              advanceGameClock(minutes);
              console.log(`[useDialogue] 家中移动（一起），额外推进${minutes}分钟`);
            } else if (isOutdoorLocation) {
              // 外出：15-40分钟
              const nearLocations = ['company', 'mall', 'cinema', 'food_court', 'cake_shop', 'school'];
              const isNearLocation = nearLocations.includes(response.status.location);
              const minutes = isNearLocation 
                ? 15 + Math.floor(Math.random() * 11) // 15-25分钟（近距离）
                : 25 + Math.floor(Math.random() * 16); // 25-40分钟（远距离）
              advanceGameClock(minutes);
              console.log(`[useDialogue] 外出移动（一起），额外推进${minutes}分钟`);
            }
          }
        } else if (response.status.location === userLocation) {
          // 如果AI返回的位置和用户当前位置相同，确保用户位置正确
          // 这种情况通常表示用户和温婉在一起
          console.log(`[useDialogue] 确认用户位置: ${userLocation} (与温婉位置一致)`);
        } else {
          // 如果只是温婉独自移动（没有明确提到"一起"），不更新玩家位置
          console.log(`[useDialogue] 温婉位置变化: ${bodyStatus.location} → ${response.status.location}，但玩家位置保持不变: ${userLocation} (未明确提到"一起")`);
        }
      }

      // 处理生成的推特（如果AI生成了推特）
      let finalGeneratedTweet = response.generatedTweet;
      if (response.generatedTweet && response.generatedTweet.content) {
        try {
          const phoneTweet = await generateTweetForPhoneApp(
            {
              latestReply: replyText,
              currentStatus: response.status,
              userLocation,
              todaySummary,
              gameTime: effectiveGameTime ?? gameTime,
              draftTweet: response.generatedTweet,
            },
            phoneAIConfig
          );

          if (phoneTweet) {
            finalGeneratedTweet = phoneTweet;
            console.log('[useDialogue] 推文内容已切换为副AI生成');
          }
        } catch (tweetError) {
          console.warn('[useDialogue] 副AI生成推文失败，回退到主剧情AI草稿:', tweetError);
        }
      }

      if (finalGeneratedTweet && finalGeneratedTweet.content) {
        const newTweet: Tweet = {
          id: Date.now().toString(),
          author: "婉婉酱_Ovo",
          handle: "@wenwan_cute",
          avatar: avatarUrl,
          content: finalGeneratedTweet.content,
          hasImage: true,
          imageDescription: finalGeneratedTweet.imageDescription,
          likes: 0,
          retweets: 0,
          time: formatTweetTime(effectiveGameTime ?? gameTime),
          isPrivate: false,
          comments: 0,
        };
        setTweets((prev) => [newTweet, ...prev]);
        const contentPreview =
          finalGeneratedTweet.content.length > 10
            ? finalGeneratedTweet.content.substring(0, 10) + "..."
            : finalGeneratedTweet.content;
        addMemory(
          "新推特",
          `温婉发布了一条新动态: "${contentPreview}"`,
          "border-pink-300"
        );
      }

      // AI回复成功后自动保存（保存到槽位0）
      if (onSaveGame) {
        try {
          onSaveGame(0);
          console.log('[useDialogue] AI回复后自动保存成功');
        } catch (saveError) {
          console.error('[useDialogue] 自动保存失败:', saveError);
          // 保存失败不影响游戏流程，只记录错误
        }
      }
    } catch (error: any) {
      // 错误处理：显示错误消息并停止加载
      console.error("AI调用错误:", error);
      
      // 创建重新生成函数
      if (settings.debugLoggingEnabled) {
        appendDebugLog({
          scope: "useDialogue",
          event: "request-error",
          data: {
            actionText,
            isSystemAction,
            errorMessage: error?.message || "Unknown error",
          },
        });
      }

      const retryAction = () => {
        if (lastActionRef.current) {
          // 移除错误消息和上一次的用户消息（如果存在）
          setMessages((prev) => {
            const filtered = prev.filter((msg) => {
              // 移除错误消息
              if (msg.sender === "system" && (msg.text.includes("AI调用失败") || msg.text.includes("❌"))) {
                return false;
              }
              // 如果是重新生成，移除上一次的用户消息（避免重复）
              if (lastActionRef.current?.userMessageId && msg.id === lastActionRef.current.userMessageId) {
                return false;
              }
              return true;
            });
            return filtered;
          });
          // 重新执行最后一次操作
          handleAction(lastActionRef.current.actionText, lastActionRef.current.isSystemAction);
        }
      };

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: "system",
          text: `❌ AI调用失败: ${
            error.message || "未知错误"
          }。请检查设置中的API配置。`,
          timestamp: new Date(),
          isRetryable: true,
          retryAction: retryAction,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    input,
    isLoading,
    setInput,
    handleAction,
    addMemory,
  };
};
