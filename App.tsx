import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Layers3, Loader2 } from 'lucide-react';
import { CharacterTachie } from './components/CharacterTachie';
import { DialogueInterface } from './components/DialogueInterface';
import { PhoneInterface } from './components/PhoneInterface';
import { SettingsPanel } from './components/SettingsPanel';
import { StartScreen } from './components/StartScreen';
import { Wallpaper } from './components/Wallpaper';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { useDialogue } from './hooks/useDialogue';
import { useGameTime } from './hooks/useGameTime';
import { useLocation } from './hooks/useLocation';
import { loadGame, saveGame, shouldAutoSave } from './services/saveService';
import { clearSystemInstructionCache } from './services/characterService';
import { getSecondaryAIConfig } from './services/aiConfigUtils';
import { buildDialogueRounds, getSummaryCheckpoint, SUMMARY_BATCH_SIZE } from './services/dialogueSummaryUtils';
import { setupSillyTavernEventListeners } from './services/sillytavernApiService';
import { appendDebugLog } from './services/debugLogService';
import { summarizeBigSummaryEntries, summarizeDialogueRounds } from './services/summaryService';
import { AppID, BackpackItem, BodyStatus, CalendarEvent, GameTime, LocationID, Message, SummaryEntry, Tweet } from './types';
import { syncDailyGainState } from './utils/bodyStatusUtils';

// --- Main App Logic ---

type SummaryToastState = {
  visible: boolean;
  type: 'loading' | 'success' | 'error';
  stage: 'small' | 'big';
  message: string;
};

type DialogueActionSnapshot = {
  messages: Message[];
  bodyStatus: BodyStatus;
  userLocation: LocationID;
  tweets: Tweet[];
  calendarEvents: CalendarEvent[];
  todaySummaries: SummaryEntry[];
  bigSummaries: string[];
  summaryCheckpoint: number;
  bigSummaryCheckpoint: number;
  gameTime: GameTime;
};

// 内部组件，需要使用SettingsContext
const AppContent: React.FC = () => {
  const { settings } = useSettings();
  const backgroundAIConfig = getSecondaryAIConfig(
    settings.useIndependentContentAI,
    settings.contentAI,
    settings.mainAI
  );
  // 手机模式下：null=关闭，'tachie'=显示立绘，AppID.HOME或其他=显示手机
  const [activeApp, setActiveApp] = useState<AppID | null>(AppID.HOME);
  const [gameStarted, setGameStarted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMidnightChoice, setShowMidnightChoice] = useState(false); // 半夜选择弹窗
  const [showGuestRoomOptions, setShowGuestRoomOptions] = useState(false); // 次卧选项弹窗
  const AVATAR_URL = "https://files.catbox.moe/5883oe.jpeg";

  // Game State
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      sender: 'character',
      text: '（周六的午后，温婉慵懒地躺在客厅的沙发上，手里拿着手机，眼神却时不时瞟向你的方向...）\n\n"哥哥...周末好无聊啊..."\n\n（她故意把腿搭在沙发扶手上，宽松的睡裙滑落，露出白皙的大腿。注意到你的视线，她脸微微泛红，却没有把腿收回去，反而轻轻晃了晃脚尖...）\n\n"哥哥...要不要...陪我聊聊天？"',
      timestamp: new Date()
    }
  ]);

  // Tweets State (Moved here to allow dynamic addition)
  const [tweets, setTweets] = useState<Tweet[]>([
    {
      id: '1',
      author: '婉婉酱_Ovo',
      handle: '@wenwan_cute',
      avatar: AVATAR_URL,
      content: '哥哥今天也好帅...偷偷拍了一张照片 (//▽//) #日常 #哥哥',
      hasImage: true,
      imageDescription: "照片是偷拍视角，从门缝里拍到的。哥哥正坐在书桌前认真工作，侧脸轮廓分明。阳光洒在他身上，显得格外温柔。",
      likes: 520,
      retweets: 13,
      time: '10分钟前',
      isPrivate: true,
      comments: 58
    },
    {
      id: '2',
      author: '婉婉酱_Ovo',
      handle: '@wenwan_cute',
      avatar: AVATAR_URL,
      content: '新买的裙子有点短...但是哥哥说好看的话就没关系吧？',
      hasImage: true,
      imageDescription: "对着卧室的全身镜自拍。她穿着一件淡蓝色的百褶短裙，裙摆很短，露出修长白皙的双腿。她一手拿着手机挡住脸，另一只手轻轻提着裙摆，姿势有些害羞。",
      likes: 128,
      retweets: 5,
      time: '3小时前',
      isPrivate: false,
      comments: 22
    }
  ]);

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]); // New State for Memories
  const [todaySummaries, setTodaySummaries] = useState<SummaryEntry[]>([]); // 小总结列表
  const todaySummariesRef = useRef<SummaryEntry[]>([]);
  const [bigSummaries, setBigSummaries] = useState<string[]>([]); // 大总结列表
  const bigSummariesRef = useRef<string[]>([]);
  const [summaryToast, setSummaryToast] = useState<SummaryToastState>({
    visible: false,
    type: 'loading',
    stage: 'small',
    message: '正在生成小总结...',
  });
  const summaryToastTimerRef = useRef<number | null>(null);
  const todaySummary = todaySummaries.map((summary, index) => `${index + 1}. ${summary.content}`).join('\n');
  const latestTodaySummary = todaySummaries[todaySummaries.length - 1]?.content || '';

  const cloneGameTime = (time: GameTime): GameTime => ({
    ...time,
    weather: { ...time.weather },
  });

  const normalizeTodaySummaries = (summaries?: Array<SummaryEntry | string>, legacySummary: string = '') => {
    if (Array.isArray(summaries) && summaries.length > 0)
    {
      return summaries
        .map((summary) => {
          if (typeof summary === 'string')
          {
            const trimmedSummary = summary.trim();
            return trimmedSummary
              ? {
                content: trimmedSummary,
                gameTime: cloneGameTime(gameTime),
              }
              : null;
          }

          if (!summary || typeof summary !== 'object')
          {
            return null;
          }

          const content = typeof summary.content === 'string' ? summary.content.trim() : '';
          if (!content)
          {
            return null;
          }

          return {
            content,
            gameTime: summary.gameTime ? cloneGameTime(summary.gameTime) : cloneGameTime(gameTime),
          };
        })
        .filter((summary): summary is SummaryEntry => summary !== null);
    }

    return legacySummary
      ? legacySummary
        .split(/\n+/)
        .map(summary => summary.trim())
        .filter(summary => summary.length > 0)
        .map(summary => ({
          content: summary,
          gameTime: cloneGameTime(gameTime),
        }))
      : [];
  };

  const replaceTodaySummaries = (summaries?: Array<SummaryEntry | string>, legacySummary: string = '') => {
    const normalizedSummaries = normalizeTodaySummaries(summaries, legacySummary);
    todaySummariesRef.current = normalizedSummaries;
    setTodaySummaries(normalizedSummaries);
  };

  const normalizeBigSummaries = (summaries?: string[]) => {
    if (!Array.isArray(summaries) || summaries.length === 0)
    {
      return [];
    }

    return summaries
      .map(summary => summary.trim())
      .filter(summary => summary.length > 0);
  };

  const replaceBigSummaries = (summaries?: string[]) => {
    const normalizedSummaries = normalizeBigSummaries(summaries);
    bigSummariesRef.current = normalizedSummaries;
    setBigSummaries(normalizedSummaries);
  };

  const toLoggableError = (error: unknown) => {
    if (error instanceof Error)
    {
      return {
        message: error.message,
        stack: error.stack,
      };
    }

    return {
      message: String(error),
    };
  };

  const appendSummaryDebugLog = (event: string, data: Record<string, unknown>) => {
    if (!settings.debugLoggingEnabled)
    {
      return;
    }

    appendDebugLog({
      scope: 'summary',
      event,
      data,
    });
  };

  const clearSummaryToastTimer = () => {
    if (summaryToastTimerRef.current !== null)
    {
      window.clearTimeout(summaryToastTimerRef.current);
      summaryToastTimerRef.current = null;
    }
  };

  const showSummaryToast = (
    type: SummaryToastState['type'],
    stage: SummaryToastState['stage'],
    message: string,
    autoHide: boolean = false
  ) => {
    clearSummaryToastTimer();
    setSummaryToast({
      visible: true,
      type,
      stage,
      message,
    });

    if (autoHide)
    {
      summaryToastTimerRef.current = window.setTimeout(() => {
        setSummaryToast(prev => ({
          ...prev,
          visible: false,
        }));
        summaryToastTimerRef.current = null;
      }, 2000);
    }
  };

  const hideSummaryToast = () => {
    clearSummaryToastTimer();
    setSummaryToast(prev => ({
      ...prev,
      visible: false,
    }));
  };

  // 用于保存编辑点的状态快照
  const messageSnapshotsRef = useRef<Map<string, {
    messages: Message[];
    bodyStatus: BodyStatus;
    userLocation: LocationID;
    tweets: Tweet[];
    calendarEvents: CalendarEvent[];
    todaySummaries: SummaryEntry[];
    bigSummaries: string[];
    summaryCheckpoint: number;
    bigSummaryCheckpoint: number;
    gameTime: GameTime;
  }>>(new Map());

  // 编辑消息处理函数
  const actionSnapshotsRef = useRef<Map<string, DialogueActionSnapshot>>(new Map());

  const createDialogueActionSnapshot = (snapshotMessages: Message[]): DialogueActionSnapshot => ({
    messages: snapshotMessages,
    bodyStatus: { ...bodyStatus },
    userLocation,
    tweets: [...tweets],
    calendarEvents: [...calendarEvents],
    todaySummaries: [...todaySummariesRef.current],
    bigSummaries: [...bigSummariesRef.current],
    summaryCheckpoint: getSummaryCheckpoint(snapshotMessages),
    bigSummaryCheckpoint: lastBigSummaryCheckpoint.current,
    gameTime: cloneGameTime(gameTime),
  });

  const restoreDialogueActionSnapshot = (snapshot: DialogueActionSnapshot) => {
    setMessages(snapshot.messages);
    setBodyStatus(snapshot.bodyStatus);
    setUserLocation(snapshot.userLocation);
    setTweets(snapshot.tweets);
    setCalendarEvents(snapshot.calendarEvents);
    replaceTodaySummaries(snapshot.todaySummaries);
    replaceBigSummaries(snapshot.bigSummaries);
    lastSummaryMessageCount.current = snapshot.summaryCheckpoint;
    lastBigSummaryCheckpoint.current = snapshot.bigSummaryCheckpoint;
    setGameTime(snapshot.gameTime);
  };

  const handleEditMessage = (messageId: string, newText: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    const snapshot = createDialogueActionSnapshot(messages.slice(0, messageIndex + 1));
    messageSnapshotsRef.current.set(messageId, snapshot);
    setMessages(prev => prev.map((m, i) =>
      i === messageIndex ? { ...m, text: newText } : m
    ));
  };

  const calculateSkippedTime = (currentTime: GameTime, days: number): GameTime => {
    const newTime = { ...currentTime };
    newTime.day += days;
    // 处理月份和年份的进位
    while (true)
    {
      const maxDays = new Date(newTime.year, newTime.month, 0).getDate();
      if (newTime.day <= maxDays) break;
      newTime.day -= maxDays;
      newTime.month += 1;
      if (newTime.month > 12)
      {
        newTime.month = 1;
        newTime.year += 1;
      }
    }
    newTime.hour = 7;
    newTime.minute = 0;
    newTime.weekday = (newTime.weekday + days) % 7;
    return newTime;
  };

  const calculateAdvancedTime = (currentTime: GameTime, minutesToAdvance: number): GameTime => {
    const advancedDate = new Date(
      currentTime.year,
      currentTime.month - 1,
      currentTime.day,
      currentTime.hour,
      currentTime.minute
    );

    advancedDate.setMinutes(advancedDate.getMinutes() + minutesToAdvance);

    return {
      ...currentTime,
      year: advancedDate.getFullYear(),
      month: advancedDate.getMonth() + 1,
      day: advancedDate.getDate(),
      weekday: advancedDate.getDay(),
      hour: advancedDate.getHours(),
      minute: advancedDate.getMinutes(),
    };
  };

  // 正常睡觉到第二天早上
  const handleSleepCancel = async () => {
    const oldTime = { ...gameTime };
    // 跳到第二天早上7点
    const nextMorning = calculateSkippedTime(gameTime, 1);
    setGameTime(nextMorning);

    // 使用 handleAction 生成AI剧情，就像"前往电影院"一样
    await handleAction(`(System: 你正常睡觉，睡到了第二天早上。时间已经流逝了1天，现在是${nextMorning.year}年${nextMorning.month}月${nextMorning.day}日的早上7点。生成一段剧情描述，描述现在（第二天早上）的情况。温婉在哪里、在做什么、心情如何。就像描述"前往电影院"一样，生成完整的剧情场景。)`, true);
  };

  // 偷内衣处理函数（保留但不再使用）
  const handleStealUnderwear = async () => {
    // 确保温婉位置在次卧（偷内衣时）
    setBodyStatus(prev => ({
      ...prev,
      location: 'guest_bedroom' // 确保温婉在次卧
    }));

    // 根据好感度判断是否被发现
    const favorability = bodyStatus.favorability;
    let discoveryChance = 0;

    // 好感度越高，越不容易被发现
    if (favorability >= 80)
    {
      discoveryChance = 10; // 10%概率被发现
    } else if (favorability >= 60)
    {
      discoveryChance = 25; // 25%概率被发现
    } else if (favorability >= 40)
    {
      discoveryChance = 40; // 40%概率被发现
    } else
    {
      discoveryChance = 60; // 60%概率被发现
    }

    const isDiscovered = Math.random() * 100 < discoveryChance;

    if (isDiscovered)
    {
      // 被发现
      await handleAction('(System: User sneaks into Wenwan\'s room at midnight to steal underwear, but Wenwan wakes up and discovers him. Generate a dramatic scene where Wenwan confronts the user. The reaction should be based on favorability: high favorability = shocked but forgiving, low favorability = angry and disappointed. Update degradation if favorability is low.)', true);
    } else
    {
      // 成功偷到
      await handleAction('(System: User sneaks into Wenwan\'s room at midnight and successfully steals her underwear without being discovered. Generate a scene describing the action and Wenwan sleeping peacefully. Update favorability slightly down if this is a "creepy" action, or degradation up if favorability is already low.)', true);
    }

    // 偷完或被发现后，等待AI回复完成后再跳到第二天早上8点
    // 延迟时间更长，确保AI回复完成
    setTimeout(() => {
      const currentTime = gameTime;
      const nextMorning = { ...currentTime };
      nextMorning.hour = 8;
      nextMorning.minute = 0;
      const nextDay = new Date(nextMorning.year, nextMorning.month - 1, nextMorning.day + 1);
      nextMorning.year = nextDay.getFullYear();
      nextMorning.month = nextDay.getMonth() + 1;
      nextMorning.day = nextDay.getDate();
      nextMorning.weekday = nextDay.getDay();
      setGameTime(nextMorning);

      // 确保温婉位置在次卧（早上8点她应该还在房间）
      setBodyStatus(prev => ({
        ...prev,
        location: prev.location || 'guest_bedroom' // 如果位置丢失，恢复为次卧
      }));
    }, 2000);
  };

  // 重新生成消息处理函数
  const handleRegenerateMessage = (messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    if (messages[messageIndex].sender === 'character')
    {
      const messageTime = messages[messageIndex].timestamp;
      const actionMessageIndex = messageIndex - 1;
      const actionMessage = actionMessageIndex >= 0 ? messages[actionMessageIndex] : null;
      if (actionMessage && (actionMessage.sender === 'user' || actionMessage.isSystemAction))
      {
        const snapshot = actionMessage.sender === 'user'
          ? messageSnapshotsRef.current.get(actionMessage.id) || actionSnapshotsRef.current.get(actionMessage.id)
          : actionSnapshotsRef.current.get(actionMessage.id);
        if (snapshot)
        {
          restoreDialogueActionSnapshot(snapshot);
          const shouldReplayAsSystemAction = actionMessage.isSystemAction === true
            || messageSnapshotsRef.current.has(actionMessage.id);
          setTimeout(() => {
            handleAction(actionMessage.text, shouldReplayAsSystemAction);
          }, 100);
          return;
        }
        if (actionMessage.isSystemAction)
        {
          setMessages(prev => prev.slice(0, actionMessageIndex));
          setCalendarEvents(prev => prev.filter(e => {
            const eventTime = parseInt(e.id);
            return eventTime < messageTime.getTime();
          }));
          setTimeout(() => {
            handleAction(actionMessage.text, true);
          }, 100);
          return;
        }
      }
      const userMessageIndex = messageIndex - 1;
      if (userMessageIndex >= 0 && messages[userMessageIndex].sender === 'user')
      {
        const userMessage = messages[userMessageIndex];
        const snapshot = messageSnapshotsRef.current.get(userMessage.id);
        if (snapshot)
        {
          restoreDialogueActionSnapshot(snapshot);
          setTimeout(() => {
            handleAction(userMessage.text, true);
          }, 100);
        } else
        {
          setMessages(prev => prev.slice(0, messageIndex));
          setCalendarEvents(prev => prev.filter(e => {
            const eventTime = parseInt(e.id);
            return eventTime < messageTime.getTime();
          }));
          setTimeout(() => {
            handleAction(userMessage.text, true);
          }, 100);
        }
      }
    }
  };

  const [walletBalance, setWalletBalance] = useState<number>(500); // 初始余额500元
  
  const [walletTransactions, setWalletTransactions] = useState<Array<{
    id: string;
    name: string;
    price: number;
    date: string;
    type: 'expense' | 'income';
  }>>([]);

  // Backpack State - 背包物品
  const [backpackItems, setBackpackItems] = useState<BackpackItem[]>([]);

  // 已解锁的立绘服装ID（用于控制左侧立绘可选服装）
  const defaultUnlockedOutfits = ['pajamas', 'jk', 'white_shirt', 'lingerie', 'nude'];
  const [unlockedOutfits, setUnlockedOutfits] = useState<string[]>(defaultUnlockedOutfits);

  // User Location State
  const [userLocation, setUserLocation] = useState<LocationID>('master_bedroom');

  // Game Time Management
  const { gameTime, advance, skipToday, skipTwoDays, skipWeek, formatTime, formatDate, setGameTime } = useGameTime();

  // 用于跟踪上次总结时已处理的完整对话轮次数
  const lastSummaryMessageCount = useRef(0);
  const lastBigSummaryCheckpoint = useRef(0);
  const summaryGenerationTargetRef = useRef<number | null>(null);

  // 用于跟踪上次自动存档的时间
  const lastAutoSaveTimeRef = useRef<GameTime | null>(null);

  // Status
  const [bodyStatus, setBodyStatus] = useState<BodyStatus>({
    location: 'master_bedroom',
    favorability: 30, // Initial Stage: 挑逗试探阶段 (30-39)
    libido: 0, // Initial Stage: 0
    degradation: 0, // Initial Stage: 0
    emotion: 'shy',
    arousal: 0, // Initial Stage: 0
    heartRate: 70, // Resting Heart Rate
    overallClothing: "宽松的普通睡衣", // Initial Clothing Match
    currentAction: "正趴在飘窗上晒着太阳，小腿轻轻晃动",
    innerThought: "哥哥终于不忙了...好想让他抱抱我呀...",
    mouth: { level: 0, usageCount: 0, status: "未开发", clothing: "润唇膏", lastUsedBy: "无", usageProcess: "暂无记录" },
    chest: { level: 0, usageCount: 0, status: "未开发", clothing: "真空", lastUsedBy: "无", usageProcess: "暂无记录" },
    nipples: { level: 0, usageCount: 0, status: "敏感度低", clothing: "乳贴", lastUsedBy: "无", usageProcess: "暂无记录" },
    groin: { level: 0, usageCount: 0, status: "未开发", clothing: "纯棉白色内裤", lastUsedBy: "无", usageProcess: "暂无记录" },
    posterior: { level: 0, usageCount: 0, status: "未开发", clothing: "无", lastUsedBy: "无", usageProcess: "暂无记录" },
    feet: { level: 0, usageCount: 0, status: "未开发", clothing: "赤足", lastUsedBy: "无", usageProcess: "暂无记录" },
    // 新增：精确位置系统
    exactLocation: undefined, // 精确位置（大地点时需要，如"cos社活动室"、"A展厅"等）
    isAccessible: true, // 是否可被找到（默认true，如游艇已出海则false）
    // 新增：弧光系统（初始为null，处于试探期）
    arcLight: null,
    // 已删除：trialPeriod, lastArcLightCheck（试探期系统已移除）
    // 新增：黄毛系统（初始为空，后续可发展为双黄毛）
    yellowHair1: null,
    yellowHair2: null,
    // 新增：身体改造（初始未完成）
    bodyModification: {
      completed: false,
      items: []
    },
    // 新增：每日增长计数器（初始为0）
    todayFavorabilityGain: 0,
    todayDegradationGain: 0,
    lastResetDate: `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}-${String(gameTime.day).padStart(2, '0')}`
  });

  const handleStartGame = () => {
    setGameStarted(true);
    if (document.documentElement.requestFullscreen)
    {
      document.documentElement.requestFullscreen().catch((err) => {
        console.log("Error attempting to enable full-screen mode:", err.message);
      });
    }
  };

  const handleCloseApp = () => setActiveApp(AppID.HOME);

  const handleOpenSettings = () => {
    setShowSettings(true);
  };

  const handleCloseSettings = () => {
    setShowSettings(false);
  };

  const handleBackToMain = () => {
    setShowSettings(false);
    setGameStarted(false);
  };

  // 从奢侈品店购买服装：扣钱+进背包（不直接解锁立绘）
  const handleBuyClothing = async (outfitId: string, name: string, description: string, price: number) => {
    if (walletBalance < price)
    {
      alert('余额不足，无法购买该服装。');
      return;
    }
    setWalletBalance(prev => prev - price);
    const now = formatTime(gameTime);
    const itemId = Date.now().toString();
    const newItem: BackpackItem = {
      id: itemId,
      name,
      description,
      price,
      date: now,
      type: 'clothing',
      outfitId,
    };
    setBackpackItems(prev => [newItem, ...prev]);
    setWalletTransactions(prev => [{
      id: itemId,
      name: `购买：${name}`,
      price,
      date: now,
      type: 'expense',
    }, ...prev]);

    // 检查温婉是否在身边
    const isWenwanNearby = bodyStatus.location === userLocation;
    if (isWenwanNearby)
    {
      // 温婉在身边，生成剧情对话
      await handleAction(`(System: 哥哥在奢侈品店购买了【${name}】，温婉就在身边看到了。根据当前好感度，生成温婉的反应和对话。她可能会询问、评论、或者表现出好奇/害羞等情绪。如果好感度高，她可能会期待哥哥送给她；如果好感度低，她可能会觉得奇怪或保持距离。)`, true);
    } else
    {
      // 温婉不在身边，简单描述即可
      setMessages(prev => [...prev, {
        id: itemId,
        sender: 'system',
        text: `你购买了【${name}】，已放入背包。`,
        timestamp: new Date()
      }]);
    }
  };

  // 使用物品（情趣用品等）：生成剧情
  // 注意：这个函数会被 useDialogue 调用，所以不能直接使用 handleAction
  // 需要返回一个标记，让 useDialogue 内部调用 handleAction
  const handleUseItem = async (itemId: string, name: string, description: string, handleActionCallback?: (text: string, isSystem?: boolean) => Promise<void>) => {
    // 检查温婉是否在身边
    const isWenwanNearby = bodyStatus.location === userLocation;
    if (isWenwanNearby && handleActionCallback)
    {
      // 温婉在身边，生成使用物品的剧情对话
      await handleActionCallback(`(System: 哥哥使用了【${name}】（${description}），温婉就在身边。根据当前好感度和物品类型，生成温婉的反应和对话。她可能会害羞、好奇、或者表现出不同的情绪。如果好感度高，她可能会配合或接受；如果好感度低，她可能会觉得尴尬或拒绝。记得更新情绪、好感度、性欲等相关状态。)`, true);
    } else if (!isWenwanNearby)
    {
      // 温婉不在身边，提示不在
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system',
        text: `温婉不在身边，无法使用【${name}】。`,
        timestamp: new Date()
      }]);
    }
  };

  // 赠送物品给温婉：生成剧情
  const handleGiftItem = async (itemId: string, name: string, description: string, handleActionCallback?: (text: string, isSystem?: boolean) => Promise<void>) => {
    // 检查温婉是否在身边
    const isWenwanNearby = bodyStatus.location === userLocation;
    if (isWenwanNearby && handleActionCallback)
    {
      // 温婉在身边，生成赠送物品的剧情对话
      await handleActionCallback(`(System: 哥哥将【${name}】（${description}）赠送给了温婉。根据当前好感度和物品类型，生成温婉收到礼物后的反应和对话。她可能会害羞、好奇、或者表现出不同的情绪。如果好感度高，她可能会接受并配合使用；如果好感度低，她可能会觉得尴尬或拒绝。记得更新情绪和好感度。)`, true);
      // 从背包中移除物品
      setBackpackItems(prev => prev.filter(item => item.id !== itemId));
    } else if (!isWenwanNearby)
    {
      // 温婉不在身边，提示不在
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system',
        text: `温婉不在身边，无法赠送【${name}】。`,
        timestamp: new Date()
      }]);
    }
  };

  // 在背包中赠送服装给温婉：移除背包条目+解锁对应立绘
  const handleGiftClothing = async (outfitId: string, itemId: string, handleActionCallback?: (text: string, isSystem?: boolean) => Promise<void>) => {
    if (!outfitId)
    {
      alert('这件物品没有绑定对应的服装ID，无法解锁立绘。');
      return;
    }

    // 找到要赠送的物品信息
    const itemToGift = backpackItems.find(item => item.id === itemId);
    if (!itemToGift) return;

    setBackpackItems(prev => prev.filter(item => item.id !== itemId));
    setUnlockedOutfits(prev => {
      if (prev.includes(outfitId)) return prev;
      return [...prev, outfitId];
    });

    // 检查温婉是否在身边
    const isWenwanNearby = bodyStatus.location === userLocation;
    if (isWenwanNearby && handleActionCallback)
    {
      // 温婉在身边，生成剧情对话
      await handleActionCallback(`(System: 哥哥将【${itemToGift.name}】赠送给了温婉。根据当前好感度，生成温婉收到礼物后的反应和对话。她可能会开心、害羞、感动等。如果好感度高，她可能会主动拥抱或亲吻；如果好感度低，她可能会礼貌地接受但保持距离。记得更新情绪和好感度。)`, true);
    } else if (!isWenwanNearby)
    {
      // 温婉不在身边，简单描述即可
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system',
        text: `你将【${itemToGift.name}】放在了温婉的房间，等她回来就能看到。对应立绘已解锁。`,
        timestamp: new Date()
      }]);
    }
  };

  // 存档功能
  const handleSaveGame = (slotId: number, customName?: string) => {
    const success = saveGame(
      slotId,
      gameTime,
      messages,
      bodyStatus,
      userLocation,
      tweets,
      calendarEvents,
      todaySummary,
      todaySummaries,
      bigSummaries,
      lastSummaryMessageCount.current,
      lastBigSummaryCheckpoint.current,
      customName,
      walletBalance,
      walletTransactions,
      backpackItems,
      unlockedOutfits
    );
    if (success)
    {
      if (slotId === 0)
      {
        lastAutoSaveTimeRef.current = { ...gameTime };
      }
    }
  };

  // 读档功能
  const handleLoadGame = (slotId: number) => {
    const save = loadGame(slotId);
    if (save)
    {
      // 恢复游戏状态
      setMessages(save.messages);
      setBodyStatus(save.bodyStatus);
      setUserLocation(save.userLocation);
      setTweets(save.tweets);
      setCalendarEvents(save.calendarEvents);
      replaceTodaySummaries(save.todaySummaries, save.todaySummary);
      replaceBigSummaries(save.bigSummaries);
      lastSummaryMessageCount.current = save.summaryCheckpoint ?? 0;
      lastBigSummaryCheckpoint.current = save.bigSummaryCheckpoint ?? 0;
      summaryGenerationTargetRef.current = null;

      // 恢复钱包数据
      if (save.walletBalance !== undefined)
      {
        setWalletBalance(save.walletBalance);
      }
      if (save.walletTransactions)
      {
        setWalletTransactions(save.walletTransactions);
      }

      // 恢复背包数据
      if (save.backpackItems)
      {
        setBackpackItems(save.backpackItems);
      }

      // 恢复已解锁服装（如无则使用默认）
      if (save.unlockedOutfits && save.unlockedOutfits.length > 0)
      {
        setUnlockedOutfits(save.unlockedOutfits);
      } else
      {
        setUnlockedOutfits(defaultUnlockedOutfits);
      }

      // 恢复游戏时间
      setGameTime(save.gameTime);

      // 更新自动存档时间
      lastAutoSaveTimeRef.current = save.gameTime;

      // 开始游戏
      setGameStarted(true);

      alert('存档读取成功！');
    } else
    {
      alert('读取存档失败！');
    }
  };

  // 使用对话处理 Hook（现在在SettingsProvider内部，可以使用useSettings）
  const {
    input,
    isLoading,
    setInput,
    handleAction,
    addMemory
  } = useDialogue({
    messages,
    bodyStatus,
    userLocation,
    tweets,
    calendarEvents,
    setMessages,
    setBodyStatus,
    setTweets,
    setCalendarEvents,
    avatarUrl: AVATAR_URL,
    todaySummary, // 传递今日记忆
    todaySummaries,
    bigSummaries,
    summaryCheckpoint: lastSummaryMessageCount.current,
    advance, // 传递时间推进函数
    gameTime, // 传递当前游戏时间
    setUserLocation, // 传递用户位置更新函数
    onSaveGame: handleSaveGame, // 传递保存游戏函数，用于AI回复后自动保存
    backpackItems, // 传递背包物品，用于检测对话中的使用/赠送
    onUseItem: handleUseItem, // 传递使用物品函数
    onGiftItem: handleGiftItem, // 传递赠送物品函数
    onGiftClothing: handleGiftClothing, // 传递赠送服装函数
  });

  // 创建包装函数，将 handleAction 传递给背包按钮点击时的函数调用
  const handleUseItemWithAction = async (itemId: string, name: string, description: string) => {
    await handleUseItem(itemId, name, description, handleAction);
  };

  const handleGiftItemWithAction = async (itemId: string, name: string, description: string) => {
    await handleGiftItem(itemId, name, description, handleAction);
  };

  const handleGiftClothingWithAction = async (outfitId: string, itemId: string) => {
    await handleGiftClothing(outfitId, itemId, handleAction);
  };

  // 使用位置移动 Hook
  const { handleMoveUser } = useLocation({
    userLocation,
    setUserLocation,
    handleAction,
    addMemory,
    advance, // 传递时间推进函数
    gameTime,
  });

  const previousTimeRef = useRef<GameTime>(gameTime);
  const previousMessagesRef = useRef<Message[]>(messages);
  const previousBodyStatusRef = useRef<BodyStatus>(bodyStatus);
  const previousUserLocationRef = useRef<LocationID>(userLocation);
  const previousTweetsRef = useRef<Tweet[]>(tweets);
  const previousCalendarEventsRef = useRef<CalendarEvent[]>(calendarEvents);
  const previousTodaySummariesStateRef = useRef<SummaryEntry[]>(todaySummaries);
  const previousBigSummariesStateRef = useRef<string[]>(bigSummaries);
  const previousSummaryCheckpointRef = useRef<number>(lastSummaryMessageCount.current);
  const previousBigSummaryCheckpointRef = useRef<number>(lastBigSummaryCheckpoint.current);
  const previousGameTimeStateRef = useRef<GameTime>(cloneGameTime(gameTime));

  useEffect(() => {
    const previousMessages = previousMessagesRef.current;
    const newActionMessage = messages.length === previousMessages.length + 1
      ? messages[messages.length - 1]
      : null;

    if (
      newActionMessage &&
      !previousMessages.some(message => message.id === newActionMessage.id) &&
      (newActionMessage.sender === 'user' || newActionMessage.isSystemAction)
    )
    {
      actionSnapshotsRef.current.set(newActionMessage.id, {
        messages: [...previousMessages],
        bodyStatus: { ...previousBodyStatusRef.current },
        userLocation: previousUserLocationRef.current,
        tweets: [...previousTweetsRef.current],
        calendarEvents: [...previousCalendarEventsRef.current],
        todaySummaries: [...previousTodaySummariesStateRef.current],
        bigSummaries: [...previousBigSummariesStateRef.current],
        summaryCheckpoint: previousSummaryCheckpointRef.current,
        bigSummaryCheckpoint: previousBigSummaryCheckpointRef.current,
        gameTime: cloneGameTime(previousGameTimeStateRef.current),
      });
    }

    previousMessagesRef.current = messages;
    previousBodyStatusRef.current = bodyStatus;
    previousUserLocationRef.current = userLocation;
    previousTweetsRef.current = tweets;
    previousCalendarEventsRef.current = calendarEvents;
    previousTodaySummariesStateRef.current = todaySummaries;
    previousBigSummariesStateRef.current = bigSummaries;
    previousSummaryCheckpointRef.current = lastSummaryMessageCount.current;
    previousBigSummaryCheckpointRef.current = lastBigSummaryCheckpoint.current;
    previousGameTimeStateRef.current = cloneGameTime(gameTime);
  }, [messages, bodyStatus, userLocation, tweets, calendarEvents, todaySummaries, bigSummaries, gameTime]);

  const handleSkipByMinutes = async (minutes: number, label: string) => {
    const newTime = calculateAdvancedTime(gameTime, minutes);
    advance(minutes);

    await handleAction(
      `(System: 时间已经流逝了${label}，现在是${newTime.year}年${newTime.month}月${newTime.day}日${formatTime(newTime)}。生成一段剧情描述，描述这${label}里发生的事情，以及现在的情况。温婉在哪里、在做什么、心情如何。就像描述"前往电影院"一样，生成完整的剧情场景。)`,
      true
    );
  };

  const handleSkipOneHour = async () => {
    await handleSkipByMinutes(60, '1小时');
  };

  const handleSkipThreeHours = async () => {
    await handleSkipByMinutes(180, '3小时');
  };

  const handleSkipSixHours = async () => {
    await handleSkipByMinutes(360, '6小时');
  };

  // 包装跳过时间函数，使用 handleAction 生成AI剧情
  const handleSkipToday = async () => {
    await handleSkipByMinutes(30, '30分钟');
    return;
    const oldTime = { ...gameTime };
    // 推进30分钟
    advance(30);

    // 计算新时间（30分钟后）
    let newTime = { ...gameTime };
    newTime.minute += 30;
    if (newTime.minute >= 60)
    {
      newTime.minute -= 60;
      newTime.hour += 1;
      if (newTime.hour >= 24)
      {
        newTime.hour = 0;
        newTime.day += 1;
        // 处理月份和年份进位
        const maxDays = new Date(newTime.year, newTime.month, 0).getDate();
        if (newTime.day > maxDays)
        {
          newTime.day = 1;
          newTime.month += 1;
          if (newTime.month > 12)
          {
            newTime.month = 1;
            newTime.year += 1;
          }
        }
        newTime.weekday = (newTime.weekday + 1) % 7;
      }
    }

    const period = newTime.hour < 12 ? '上午' : newTime.hour < 18 ? '下午' : '晚上';
    const displayHour = newTime.hour > 12 ? newTime.hour - 12 : newTime.hour === 0 ? 12 : newTime.hour;
    const timeStr = `${period}${displayHour}点${newTime.minute === 0 ? '' : newTime.minute + '分'}`;

    // 使用 handleAction 生成AI剧情
    await handleAction(`(System: 时间已经流逝了30分钟，现在是${newTime.year}年${newTime.month}月${newTime.day}日 ${timeStr}。生成一段剧情描述，描述这30分钟里发生的事情，以及现在的情况。温婉在哪里、在做什么、心情如何。就像描述"前往电影院"一样，生成完整的剧情场景。)`, true);
  };

  const handleSkipTwoDays = async () => {
    const oldTime = { ...gameTime };
    const newTime = calculateSkippedTime(gameTime, 1);
    skipToday(); // 跳到第二天早上7点（原来是skipTwoDays，现在改为skipToday，推进1天）

    // 跳过1天不减少好感度（只有跳过3天才减少）

    // 使用 handleAction 生成AI剧情
    await handleAction(`(System: 时间已经流逝了1天，现在是${newTime.year}年${newTime.month}月${newTime.day}日的早上7点。生成一段剧情描述，描述这1天里发生的事情，以及现在（第二天早上）的情况。温婉在哪里、在做什么、心情如何。就像描述"前往电影院"一样，生成完整的剧情场景。)`, true);
  };

  const handleSkipWeek = async () => {
    const oldTime = { ...gameTime };
    // 推进3天（原来是7天）
    const newTime = calculateSkippedTime(gameTime, 3);

    // 手动推进3天
    let updatedTime = { ...gameTime };
    updatedTime.day += 3;
    // 处理月份和年份的进位
    while (true)
    {
      const maxDays = new Date(updatedTime.year, updatedTime.month, 0).getDate();
      if (updatedTime.day <= maxDays) break;
      updatedTime.day -= maxDays;
      updatedTime.month += 1;
      if (updatedTime.month > 12)
      {
        updatedTime.month = 1;
        updatedTime.year += 1;
      }
    }
    updatedTime.hour = 7;
    updatedTime.minute = 0;
    updatedTime.weekday = (updatedTime.weekday + 3) % 7;
    setGameTime(updatedTime);

    // 跳过3天时，好感度减3
    setBodyStatus(prev => {
      const newFavorability = Math.max(0, prev.favorability - 3); // 确保不低于0
      console.log(`[handleSkipWeek] 跳过3天，好感度减少: ${prev.favorability} → ${newFavorability}`);
      return {
        ...prev,
        favorability: newFavorability
      };
    });

    // 使用 handleAction 生成AI剧情
    await handleAction(`(System: 时间已经流逝了3天，现在是${newTime.year}年${newTime.month}月${newTime.day}日的早上7点。生成一段剧情描述，描述这3天里发生的事情，以及现在（第四天早上）的情况。温婉在哪里、在做什么、心情如何。就像描述"前往电影院"一样，生成完整的剧情场景。)`, true);
  };

  // 不再需要监听时间变化生成剧情，因为现在直接使用 handleAction 生成
  useEffect(() => {
    setBodyStatus((prev) => syncDailyGainState(prev, gameTime));
    previousTimeRef.current = gameTime;
  }, [gameTime.year, gameTime.month, gameTime.day, setBodyStatus]);

  // 监听消息变化，生成总结（不再自动推进时间）
  // 时间推进改为在用户发送消息时推进，而不是AI回复后
  useEffect(() => {
    const dialogueRounds = buildDialogueRounds(messages);
    const dialogueRoundCount = dialogueRounds.length;
    const nextSummaryCheckpoint = lastSummaryMessageCount.current + SUMMARY_BATCH_SIZE;
    const summaryBodyStatus = bodyStatus;
    const summaryGameTime = gameTime;

    if (dialogueRoundCount < nextSummaryCheckpoint)
    {
      return;
    }

    if (summaryGenerationTargetRef.current === nextSummaryCheckpoint)
    {
      return;
    }

    const existingSummaryCount = todaySummariesRef.current.length;
    const summaryAIConfig = backgroundAIConfig;
    const summaryAIProvider = settings.useIndependentContentAI
      ? (summaryAIConfig === settings.contentAI ? 'contentAI' : 'mainAI fallback')
      : 'mainAI';
    summaryGenerationTargetRef.current = nextSummaryCheckpoint;
    showSummaryToast('loading', 'small', '正在生成小总结...');
    console.log('[App] Generating calendar summary with', summaryAIProvider);
    console.log(`[App][Summary] 触发摘要生成：完整对话轮次=${dialogueRoundCount}，当前checkpoint=${lastSummaryMessageCount.current}，当前已有${existingSummaryCount}条summary`);
    appendSummaryDebugLog('summary-triggered', {
      dialogueRoundCount,
      existingSummaryCount,
      currentCheckpoint: lastSummaryMessageCount.current,
      targetCheckpoint: nextSummaryCheckpoint,
      aiProvider: summaryAIProvider,
    });
    let cancelled = false;

    const updateSummaries = async () => {
      const initialSmallSummaryCount = todaySummariesRef.current.length;
      let processedCheckpoint = lastSummaryMessageCount.current;
      let nextSummaries = [...todaySummariesRef.current];
      let processedBigSummaryCheckpoint = lastBigSummaryCheckpoint.current;
      let nextBigSummaries = [...bigSummariesRef.current];

      try
      {
        while (dialogueRounds.length >= processedCheckpoint + SUMMARY_BATCH_SIZE)
        {
          const targetCheckpoint = processedCheckpoint + SUMMARY_BATCH_SIZE;
          const summaryBatch = dialogueRounds.slice(processedCheckpoint, targetCheckpoint);
          const summary = await summarizeDialogueRounds(summaryBatch, summaryAIConfig, summaryBodyStatus);

          if (cancelled)
          {
            hideSummaryToast();
            console.log(`[App][Summary] 本次摘要已取消：完整对话轮次=${dialogueRoundCount}`);
            appendSummaryDebugLog('summary-cancelled', {
              dialogueRoundCount,
              currentSummaryCount: todaySummariesRef.current.length,
              currentCheckpoint: processedCheckpoint,
              targetCheckpoint,
            });
            return;
          }

          if (!summary)
          {
            showSummaryToast('error', 'small', '小总结生成失败', true);
            console.warn(`[App][Summary] 本次摘要生成失败：保持checkpoint=${processedCheckpoint}，等待后续对话重试，当前未总结轮次=${targetCheckpoint - processedCheckpoint}`);
            appendSummaryDebugLog('summary-empty', {
              dialogueRoundCount,
              currentSummaryCount: todaySummariesRef.current.length,
              currentCheckpoint: processedCheckpoint,
              targetCheckpoint,
              willRetry: true,
            });
            return;
          }

          processedCheckpoint = targetCheckpoint;
          nextSummaries = [
            ...nextSummaries,
            {
              content: summary,
              gameTime: cloneGameTime(summaryGameTime),
            },
          ];
          console.log(`[App][Summary] 本次摘要生成成功：checkpoint已推进到${processedCheckpoint}，共有${nextSummaries.length}条summary`);
          appendSummaryDebugLog('summary-generated', {
            dialogueRoundCount,
            currentSummaryCount: nextSummaries.length,
            currentCheckpoint: processedCheckpoint,
            latestSummary: summary,
          });
        }

        const hasNewSmallSummary = nextSummaries.length > initialSmallSummaryCount;

        if (hasNewSmallSummary)
        {
          while (nextSummaries.length >= processedBigSummaryCheckpoint + 50)
          {
            showSummaryToast('loading', 'big', '正在生成大总结...');
            const targetBigSummaryCheckpoint = processedBigSummaryCheckpoint + 50;
            const bigSummaryBatch = nextSummaries
              .slice(processedBigSummaryCheckpoint, targetBigSummaryCheckpoint)
              .map(summary => summary.content);

            console.log(`[App][Summary] 本轮新增了小总结，且小总结达到${targetBigSummaryCheckpoint}条，开始生成大总结`);
            appendSummaryDebugLog('big-summary-started', {
              dialogueRoundCount,
              currentSmallSummaryCount: nextSummaries.length,
              currentBigSummaryCount: nextBigSummaries.length,
              currentBigSummaryCheckpoint: processedBigSummaryCheckpoint,
              targetBigSummaryCheckpoint,
            });

            const bigSummary = await summarizeBigSummaryEntries(bigSummaryBatch, summaryAIConfig, summaryBodyStatus);

            if (cancelled)
            {
              hideSummaryToast();
              console.log(`[App][Summary] 大总结已取消：完整对话轮次=${dialogueRoundCount}`);
              appendSummaryDebugLog('big-summary-cancelled', {
                dialogueRoundCount,
                currentBigSummaryCheckpoint: processedBigSummaryCheckpoint,
                targetBigSummaryCheckpoint,
              });
              return;
            }

            if (!bigSummary)
            {
              showSummaryToast('error', 'big', '大总结生成失败', true);
              console.warn(`[App][Summary] 大总结生成失败：保持checkpoint=${processedBigSummaryCheckpoint}，等待下次小总结成功后重试`);
              appendSummaryDebugLog('big-summary-empty', {
                dialogueRoundCount,
                currentSmallSummaryCount: nextSummaries.length,
                currentBigSummaryCheckpoint: processedBigSummaryCheckpoint,
                targetBigSummaryCheckpoint,
                willRetry: true,
                retryCondition: 'after-next-small-summary',
              });
              break;
            }

            processedBigSummaryCheckpoint = targetBigSummaryCheckpoint;
            nextBigSummaries = [...nextBigSummaries, bigSummary];
            console.log(`[App][Summary] 大总结生成成功：大总结checkpoint已推进到${processedBigSummaryCheckpoint}，共有${nextBigSummaries.length}条大总结`);
            appendSummaryDebugLog('big-summary-generated', {
              dialogueRoundCount,
              currentSmallSummaryCount: nextSummaries.length,
              currentBigSummaryCount: nextBigSummaries.length,
              currentBigSummaryCheckpoint: processedBigSummaryCheckpoint,
              latestBigSummary: bigSummary,
            });
          }
        }

        if (
          processedCheckpoint > lastSummaryMessageCount.current ||
          processedBigSummaryCheckpoint > lastBigSummaryCheckpoint.current
        )
        {
          const hasNewBigSummary = processedBigSummaryCheckpoint > lastBigSummaryCheckpoint.current;
          replaceTodaySummaries(nextSummaries);
          replaceBigSummaries(nextBigSummaries);
          lastSummaryMessageCount.current = processedCheckpoint;
          lastBigSummaryCheckpoint.current = processedBigSummaryCheckpoint;
          console.log(`[App][Summary] 摘要列表已更新，小总结=${nextSummaries.length}条，大总结=${nextBigSummaries.length}条，小总结checkpoint=${processedCheckpoint}，大总结checkpoint=${processedBigSummaryCheckpoint}`);
          appendSummaryDebugLog('summary-updated', {
            dialogueRoundCount,
            finalSummaryCount: nextSummaries.length,
            finalCheckpoint: processedCheckpoint,
            finalBigSummaryCount: nextBigSummaries.length,
            finalBigSummaryCheckpoint: processedBigSummaryCheckpoint,
          });
          if (hasNewBigSummary)
          {
            showSummaryToast('success', 'big', '大总结生成成功', true);
          } else
          {
            showSummaryToast('success', 'small', '小总结生成成功', true);
          }
        } else
        {
          hideSummaryToast();
        }
      } catch (err)
      {
        showSummaryToast('error', 'small', '小总结生成失败', true);
        console.error(`[App][Summary] 本次摘要生成失败：当前已有${todaySummariesRef.current.length}条summary`, err);
        appendSummaryDebugLog('summary-failed', {
          dialogueRoundCount,
          currentSummaryCount: todaySummariesRef.current.length,
          currentCheckpoint: processedCheckpoint,
          error: toLoggableError(err),
        });
        console.error('生成总结失败:', err);
      } finally
      {
        if (summaryGenerationTargetRef.current === nextSummaryCheckpoint)
        {
          summaryGenerationTargetRef.current = null;
        }
      }
    };

    updateSummaries();

    return () => {
      cancelled = true;
      if (summaryGenerationTargetRef.current === nextSummaryCheckpoint)
      {
        summaryGenerationTargetRef.current = null;
      }
    };
  }, [backgroundAIConfig, messages, settings.contentAI, settings.mainAI, settings.useIndependentContentAI]);

  useEffect(() => {
    return () => {
      clearSummaryToastTimer();
    };
  }, []);

  // 自动存档：每天早上7点自动保存
  useEffect(() => {
    if (!gameStarted) return;

    const shouldSave = shouldAutoSave(gameTime, lastAutoSaveTimeRef.current);
    if (shouldSave)
    {
      handleSaveGame(0); // 自动存档到槽位0
      console.log('自动存档已触发');
    }
  }, [gameTime.year, gameTime.month, gameTime.day, gameTime.hour, gameStarted]);

  // 设置SillyTavern事件监听，自动同步世界书和预设更新
  useEffect(() => {
    return setupSillyTavernEventListeners(
      (worldbookName) => {
        console.log(`[App] 检测到世界书更新: ${worldbookName}`);
        clearSystemInstructionCache();
      },
      (presetName) => {
        console.log(`[App] 检测到预设切换: ${presetName}`);
        clearSystemInstructionCache();
      }
    );
  }, []);

  const handlePhoneSpendMoney = (amount: number, item: string) => {
    if (walletBalance >= amount)
    {
      setWalletBalance(prev => prev - amount);
      setWalletTransactions(prev => [{
        id: Date.now().toString(),
        name: item,
        price: amount,
        date: formatTime(gameTime),
        type: 'expense'
      }, ...prev]);
    } else
    {
      alert('余额不足！');
    }
  };

  const handlePhoneBuyItem = async (name: string, description: string, price: number) => {
    if (walletBalance < price)
    {
      alert('余额不足！');
      return;
    }

    setWalletBalance(prev => prev - price);
    const itemId = Date.now().toString();
    setBackpackItems(prev => [{
      id: itemId,
      name,
      description,
      price,
      date: formatTime(gameTime),
      type: 'item'
    }, ...prev]);
    setWalletTransactions(prev => [{
      id: itemId,
      name: `购买：${name}`,
      price,
      date: formatTime(gameTime),
      type: 'expense'
    }, ...prev]);

    const isWenwanNearby = bodyStatus.location === userLocation;
    if (isWenwanNearby)
    {
      await handleAction(`(System: 哥哥在情趣用品店购买了【${name}】，温婉就在身边看到了。根据当前好感度，生成温婉的反应和对话。她可能会害羞、好奇、或者表现出不同的情绪。如果好感度高，她可能会脸红但接受；如果好感度低，她可能会觉得尴尬或保持距离。)`, true);
    } else
    {
      setMessages(prev => [...prev, {
        id: itemId,
        sender: 'system',
        text: `你购买了【${name}】，已放入背包。`,
        timestamp: new Date()
      }]);
    }
  };

  const handlePhoneEarnMoney = async (amount: number, source: string, hours: number = 1) => {
    const startTime = cloneGameTime(gameTime);
    const endTime = calculateAdvancedTime(gameTime, hours * 60);

    setWalletBalance(prev => prev + amount);
    const transactionId = Date.now().toString();
    setWalletTransactions(prev => [{
      id: transactionId,
      name: source,
      price: amount,
      date: formatTime(endTime),
      type: 'income'
    }, ...prev]);
    const timeRange = `${String(startTime.hour).padStart(2, '0')}:${String(startTime.minute).padStart(2, '0')} - ${String(endTime.hour).padStart(2, '0')}:${String(endTime.minute).padStart(2, '0')}`;

    try
    {
      await handleAction(`(System: 哥哥在${source}连续打工了${hours}小时，时间从${startTime.year}年${startTime.month}月${startTime.day}日 ${timeRange}，一共赚到¥${amount}。现在时间已经推进到${endTime.year}年${endTime.month}月${endTime.day}日 ${String(endTime.hour).padStart(2, '0')}:${String(endTime.minute).padStart(2, '0')}。生成一段打工结束后的后续剧情，描述现场状态、哥哥当前状态，以及温婉此刻的情况。表现方式要和其他地点行动一样自然，给出完整回复。)`, true);
    } catch (error)
    {
      console.error('打工后的剧情生成失败:', error);
      setMessages(prev => [...prev, {
        id: `${transactionId}-work`,
        sender: 'system',
        text: `你在${source}打工了${hours}小时，赚到了¥${amount}。现在是${endTime.year}年${endTime.month}月${endTime.day}日 ${String(endTime.hour).padStart(2, '0')}:${String(endTime.minute).padStart(2, '0')}。`,
        timestamp: new Date(),
      }]);
    }
  };

  const handlePhoneSleep = async () => {
    const nightTime = { ...gameTime };
    nightTime.hour = 23;
    nightTime.minute = 0;
    setGameTime(nightTime);

    const sleepMessageId = Date.now().toString();
    setMessages(prev => [...prev, {
      id: sleepMessageId,
      sender: 'system',
      text: '【晚上11点】\n\n你躺在床上，准备入睡...',
      timestamp: new Date()
    }]);

    setBodyStatus(prev => ({
      ...prev,
      location: 'guest_bedroom'
    }));

    setTimeout(() => {
      setShowMidnightChoice(true);
    }, 800);
  };

  const handlePhoneEnterGuestRoom = async () => {
    await handleMoveUser('guest_bedroom', false);
    setTimeout(() => {
      setShowGuestRoomOptions(true);
    }, 800);
  };

  return (
    <div
      className="relative flex h-screen w-screen items-center justify-center overflow-hidden font-sans text-slate-800"
      style={{
        height: '100dvh',
        minHeight: '-webkit-fill-available'
      } as React.CSSProperties}
    >
      <Wallpaper />

      <style>{`
        @keyframes summaryToastSlideIn {
          0% {
            opacity: 0;
            transform: translate(-50%, -14px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
        }
      `}</style>

      {summaryToast.visible && (
        <div
          className="pointer-events-none fixed top-4 left-1/2 z-[70] px-4"
          style={{
            animation: 'summaryToastSlideIn 220ms cubic-bezier(0.22, 1, 0.36, 1)'
          }}
        >
          <div className={`flex min-w-[280px] items-center gap-3 rounded-[28px] border px-3 py-3 shadow-[0_16px_40px_rgba(190,24,93,0.18)] backdrop-blur-2xl transition-all duration-300 ${summaryToast.type === 'error'
            ? 'border-rose-100/80 bg-gradient-to-r from-pink-200/82 via-rose-100/74 to-pink-300/76 text-rose-950'
            : summaryToast.type === 'success'
              ? 'border-pink-50/85 bg-gradient-to-r from-pink-100/84 via-rose-50/78 to-pink-200/80 text-rose-900'
              : 'border-pink-50/85 bg-gradient-to-r from-pink-100/78 via-white/62 to-rose-100/76 text-rose-900'
            }`}>
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border shadow-inner ${summaryToast.stage === 'small'
              ? 'border-pink-200/70 bg-white/58 text-pink-600'
              : 'border-rose-200/70 bg-white/54 text-rose-600'
              }`}>
              {summaryToast.stage === 'small' ? <FileText size={18} strokeWidth={2.2} /> : <Layers3 size={18} strokeWidth={2.2} />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] uppercase text-rose-700/75">
                <span>{summaryToast.stage === 'small' ? '小总结' : '大总结'}</span>
                <span className="h-[4px] w-[4px] rounded-full bg-rose-400/70" />
                <span>{summaryToast.type === 'loading' ? '处理中' : summaryToast.type === 'success' ? '已完成' : '失败'}</span>
              </div>
              <div className="mt-1 truncate text-sm font-semibold sm:text-[15px]">
                {summaryToast.message}
              </div>
            </div>

            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${summaryToast.type === 'error'
              ? 'bg-rose-500/14 text-rose-600'
              : summaryToast.type === 'success'
                ? 'bg-pink-500/14 text-pink-600'
                : 'bg-white/45 text-pink-500'
              }`}>
              {summaryToast.type === 'loading' ? (
                <Loader2 size={17} className="animate-spin" strokeWidth={2.2} />
              ) : summaryToast.type === 'success' ? (
                <CheckCircle2 size={17} strokeWidth={2.2} />
              ) : (
                <AlertCircle size={17} strokeWidth={2.2} />
              )}
            </div>
          </div>
          <div className="mx-auto mt-2 h-1.5 w-24 rounded-full bg-white/28 backdrop-blur-sm" />
          <div className="mx-auto -mt-1 h-1.5 w-16 rounded-full bg-rose-200/55" />
        </div>
      )}

      {!gameStarted && (
        <StartScreen
          onStart={handleStartGame}
          onOpenSettings={handleOpenSettings}
          onLoadGame={handleLoadGame}
        />
      )}

      {showSettings && (
        <SettingsPanel
          onClose={handleCloseSettings}
          onBackToMain={handleBackToMain}
        />
      )}

      {showMidnightChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-gray-800">【晚上11点】</h3>
            <p className="mb-6 text-gray-600">你躺在床上，突然想到温婉就在隔壁房间...</p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  setShowMidnightChoice(false);
                  setUserLocation('guest_bedroom');
                  await handleAction(`(System: 现在是晚上11点（${gameTime.year}年${gameTime.month}月${gameTime.day}日晚上11点），你决定潜入妹妹的房间。User moved to guest_bedroom. Status: Alone. Wenwan is in guest_bedroom sleeping. 生成一段剧情描述，描述你潜入妹妹房间的过程和现在的情况。注意：现在是深夜11点，温婉应该在睡觉。)`, true);
                  setTimeout(() => {
                    setShowGuestRoomOptions(true);
                  }, 800);
                }}
                className="w-full rounded-xl bg-purple-600 py-3 font-bold text-white hover:bg-purple-700"
              >
                潜入妹妹房间
              </button>
              <button
                onClick={() => {
                  setShowMidnightChoice(false);
                  handleSleepCancel();
                }}
                className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-700"
              >
                继续睡
              </button>
            </div>
          </div>
        </div>
      )}

      {showGuestRoomOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-gray-800">次卧（温婉的房间）</h3>
            <p className="mb-6 text-gray-600">你已经潜入妹妹的房间，现在可以自由行动。在对话中输入你想做的事情。</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowGuestRoomOptions(false);
                  handleMoveUser('guest_bedroom', false);
                }}
                className="w-full rounded-xl bg-purple-600 py-3 font-bold text-white hover:bg-purple-700"
              >
                进入房间
              </button>
              <button
                onClick={() => setShowGuestRoomOptions(false)}
                className="w-full py-2 text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {settings.displayMode === 'desktop' ? (
        <div className={`flex h-full w-full max-w-[1800px] gap-6 p-6 transition-opacity duration-1000 ${gameStarted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex h-full w-[380px] shrink-0 animate-fade-in flex-col justify-center">
            <CharacterTachie status={bodyStatus} unlockedOutfits={unlockedOutfits} />
          </div>

          <DialogueInterface
            messages={messages}
            input={input}
            isLoading={isLoading}
            onInputChange={setInput}
            onAction={handleAction}
            onEditMessage={handleEditMessage}
            onRegenerateMessage={handleRegenerateMessage}
          />

          <PhoneInterface
            activeApp={activeApp}
            onCloseApp={handleCloseApp}
            onSetActiveApp={setActiveApp}
            onOpenSettings={handleOpenSettings}
            messages={messages}
            tweets={tweets}
            bodyStatus={bodyStatus}
            userLocation={userLocation}
            sisterLocation={bodyStatus.location}
            onMoveUser={handleMoveUser}
            onAction={handleAction}
            calendarEvents={calendarEvents}
            gameTime={gameTime}
            onSkipToday={handleSkipToday}
            onSkipOneHour={handleSkipOneHour}
            onSkipThreeHours={handleSkipThreeHours}
            onSkipSixHours={handleSkipSixHours}
            onSkipTwoDays={handleSkipTwoDays}
            onSkipWeek={handleSkipWeek}
            todaySummary={latestTodaySummary}
            todaySummaries={todaySummaries}
            onSaveGame={handleSaveGame}
            onLoadGame={handleLoadGame}
            walletBalance={walletBalance}
            walletTransactions={walletTransactions}
            onSpendMoney={handlePhoneSpendMoney}
            backpackItems={backpackItems}
            onBuyItem={handlePhoneBuyItem}
            onBuyClothing={handleBuyClothing}
            onGiftClothing={handleGiftClothingWithAction}
            onUseItem={handleUseItemWithAction}
            onGiftItem={handleGiftItemWithAction}
            unlockedOutfits={unlockedOutfits}
            onEarnMoney={handlePhoneEarnMoney}
            onSleep={handlePhoneSleep}
            onEnterGuestRoom={handlePhoneEnterGuestRoom}
            onStealUnderwear={handleStealUnderwear}
            onSleepCancel={handleSleepCancel}
            status={bodyStatus}
            advance={advance}
          />
        </div>
      ) : (
        <div
          className={`relative h-full w-full overflow-hidden transition-opacity duration-1000 ${gameStarted ? 'opacity-100' : 'opacity-0'}`}
          style={{
            height: '100dvh',
            minHeight: '-webkit-fill-available'
          } as React.CSSProperties}
        >
          <div
            className="absolute inset-0 flex flex-col overflow-hidden bg-gradient-to-br from-pink-50/30 via-purple-50/20 to-blue-50/30"
            style={{
              height: '100dvh',
              minHeight: '-webkit-fill-available'
            } as React.CSSProperties}
          >
            <DialogueInterface
              messages={messages}
              input={input}
              isLoading={isLoading}
              onInputChange={setInput}
              onAction={handleAction}
              onEditMessage={handleEditMessage}
              onRegenerateMessage={handleRegenerateMessage}
            />
          </div>

          <div className="absolute left-2 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-3 sm:left-4">
            <button
              onClick={() => {
                if (activeApp === 'tachie')
                {
                  setActiveApp(null);
                } else
                {
                  setActiveApp('tachie' as AppID);
                }
              }}
              className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-xl transition-all duration-300 active:scale-95 touch-manipulation backdrop-blur-md sm:h-16 sm:w-16 sm:text-3xl ${activeApp === 'tachie'
                ? 'scale-110 bg-gradient-to-br from-pink-500 via-purple-500 to-pink-600 text-white ring-4 ring-pink-300/50'
                : 'border-2 border-gray-300/50 bg-white/95 text-gray-700 hover:scale-105 hover:bg-white hover:shadow-2xl'
                }`}
              title="立绘"
            >
              绘
            </button>

            <button
              onClick={() => {
                const isPhoneOpen = activeApp !== null && activeApp !== 'tachie';
                if (isPhoneOpen)
                {
                  setActiveApp(null);
                } else
                {
                  setActiveApp(AppID.HOME);
                }
              }}
              className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-xl transition-all duration-300 active:scale-95 touch-manipulation backdrop-blur-md sm:h-16 sm:w-16 sm:text-3xl ${activeApp !== null && activeApp !== 'tachie'
                ? 'scale-110 bg-gradient-to-br from-blue-500 via-indigo-500 to-blue-600 text-white ring-4 ring-blue-300/50'
                : 'border-2 border-gray-300/50 bg-white/95 text-gray-700 hover:scale-105 hover:bg-white hover:shadow-2xl'
                }`}
              title="手机"
            >
              机
            </button>
          </div>

          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${activeApp !== null ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
            onClick={() => setActiveApp(null)}
          />

          <div className={`absolute left-0 top-0 bottom-0 z-40 w-[85vw] max-w-[90vw] border-r-2 border-pink-200/50 bg-gradient-to-br from-white via-pink-50/30 to-purple-50/20 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out sm:w-[420px] ${activeApp === 'tachie' ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-pink-300 scrollbar-track-transparent">
              <CharacterTachie status={bodyStatus} unlockedOutfits={unlockedOutfits} />
            </div>
            <button
              onClick={() => setActiveApp(null)}
              className="absolute top-2 right-2 z-[100] flex h-12 w-12 items-center justify-center rounded-full border-2 border-pink-200/50 bg-white/95 text-gray-600 shadow-xl transition-all duration-200 touch-manipulation active:scale-90 hover:border-pink-300 hover:bg-pink-50 hover:text-pink-600 sm:top-4 sm:right-4 sm:h-11 sm:w-11"
              style={{
                minWidth: '48px',
                minHeight: '48px',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              <span className="text-xl font-bold">✕</span>
            </button>
          </div>

          <div className={`absolute left-0 top-0 bottom-0 z-40 w-[100vw] max-w-[100vw] border-r-2 border-blue-200/50 bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/20 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out sm:w-[420px] ${activeApp !== null && activeApp !== 'tachie' ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex h-full w-full flex-col overflow-hidden touch-pan-y">
              <button
                onClick={() => setActiveApp(null)}
                className="absolute top-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border-2 border-blue-200/50 bg-white/95 text-gray-600 shadow-xl transition-all duration-200 touch-manipulation active:scale-90 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                <span className="text-xl font-bold">✕</span>
              </button>
              <div className="scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-transparent flex-1 overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch">
                <PhoneInterface
                  activeApp={activeApp === AppID.HOME ? AppID.HOME : (activeApp as AppID)}
                  onCloseApp={() => setActiveApp(null)}
                  onSetActiveApp={setActiveApp}
                  onOpenSettings={handleOpenSettings}
                  messages={messages}
                  tweets={tweets}
                  bodyStatus={bodyStatus}
                  userLocation={userLocation}
                  sisterLocation={bodyStatus.location}
                  onMoveUser={handleMoveUser}
                  onAction={handleAction}
                  calendarEvents={calendarEvents}
                  gameTime={gameTime}
                  onSkipToday={handleSkipToday}
                  onSkipOneHour={handleSkipOneHour}
                  onSkipThreeHours={handleSkipThreeHours}
                  onSkipSixHours={handleSkipSixHours}
                  onSkipTwoDays={handleSkipTwoDays}
                  onSkipWeek={handleSkipWeek}
                  todaySummary={latestTodaySummary}
                  todaySummaries={todaySummaries}
                  onSaveGame={handleSaveGame}
                  onLoadGame={handleLoadGame}
                  walletBalance={walletBalance}
                  walletTransactions={walletTransactions}
                  onSpendMoney={handlePhoneSpendMoney}
                  backpackItems={backpackItems}
                  onBuyItem={handlePhoneBuyItem}
                  onBuyClothing={handleBuyClothing}
                  onGiftClothing={handleGiftClothingWithAction}
                  onUseItem={handleUseItemWithAction}
                  onGiftItem={handleGiftItemWithAction}
                  unlockedOutfits={unlockedOutfits}
                  onEarnMoney={handlePhoneEarnMoney}
                  onSleep={handlePhoneSleep}
                  onEnterGuestRoom={handlePhoneEnterGuestRoom}
                  onStealUnderwear={handleStealUnderwear}
                  onSleepCancel={handleSleepCancel}
                  status={bodyStatus}
                  advance={advance}
                />
              </div>
            </div>
            <button
              onClick={() => setActiveApp(null)}
              className="absolute top-2 right-2 z-[100] flex h-12 w-12 items-center justify-center rounded-full border-2 border-gray-200 bg-white/90 text-gray-600 shadow-lg transition-all touch-manipulation active:scale-90 sm:top-4 sm:right-4 sm:h-10 sm:w-10"
              style={{
                minWidth: '48px',
                minHeight: '48px',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              ✕
            </button>
          </div>

          {(activeApp === 'tachie' || (activeApp !== null && activeApp !== 'tachie')) && (
            <div
              className="absolute inset-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity duration-300"
              onClick={() => setActiveApp(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

// 主App组件，包裹SettingsProvider
const App: React.FC = () => {
  return (
    <SettingsProvider>
      <AppContent />
    </SettingsProvider>
  );
};

export default App;
