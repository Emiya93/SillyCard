export enum AppID {
  HOME = "HOME",
  SOCIAL = "SOCIAL", // WeChat style
  TWITTER = "TWITTER", // Social feed
  SHOP = "SHOP", // Shopping
  MONITOR = "MONITOR", // Body status
  PHOTOS = "PHOTOS", // Photo Gallery
  MAPS = "MAPS", // Maps
  WALLET = "WALLET", // Wallet/Payment
  CALENDAR = "CALENDAR", // Calendar & Weather
  SETTINGS = "SETTINGS", // Settings
  SAVE = "SAVE", // Save/Load Game
  BACKPACK = "BACKPACK", // Backpack/Inventory
}

// Combined list of all possible locations (Indoor + Outdoor)
export type LocationID =
  // Indoor Rooms
  | "master_bedroom"
  | "guest_bedroom"
  | "living_room"
  | "dining_room"
  | "kitchen"
  | "toilet"
  | "hallway"
  // Outdoor Locations
  | "cinema"
  | "mall"
  | "clothing_store"
  | "amusement_park"
  | "company"
  | "adult_shop"
  | "food_court"
  | "cake_shop"
  | "school"
  | "forest"
  | "square"
  | "port" // New: Harbor/Port
  | "exhibition_center"; // New: Convention Center

export interface Message {
  id: string;
  sender: "user" | "system" | "character";
  text: string;
  timestamp: Date;
  isMind?: boolean; // If true, it's a thought/narration
  isWeChat?: boolean; // If true, this message should only appear in WeChat app, not in main dialogue
  isRetryable?: boolean; // If true, this message can be retried
  retryAction?: () => void; // Function to retry the action
}

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string; // Placeholder
  description: string;
  category: "daily" | "gift" | "adult"; // Added category
}

export interface Comment {
  id: string;
  user: string;
  content: string;
}

export interface Tweet {
  id: string;
  author: string;
  handle: string;
  avatar: string; // Placeholder
  content: string;
  hasImage: boolean; // Whether the tweet has an image attachment
  imageDescription?: string; // The detailed text description of the image (Alt text / Mental image)
  likes: number;
  retweets: number;
  time: string;
  isPrivate: boolean; // "Fanbox" style content
  comments?: number;
}

export interface BodyPartStatus {
  level: number; // Development level (Calculated explicitly in Frontend based on count)
  usageCount: number; // New: Cumulative usage count
  status: string; // Current sensation/look
  clothing: string; // Specific clothing/accessory on this part
  lastUsedBy: string; // Who used it last
  usageProcess: string; // Detailed description of the usage
}

// 弧光类型
export type ArcLight = 'A' | 'B' | 'C' | 'D' | 'E' | null;

// 黄毛信息
export interface YellowHairInfo {
  name: string; // 黄耄（富二代）或 猪楠（肥宅）
  type: 'rich' | 'fat'; // 富二代或肥宅
  active: boolean; // 是否已激活
  firstMetDate?: string; // 首次见面日期
}

// 身体改造信息
export interface BodyModification {
  completed: boolean; // 是否已完成改造
  items: string[]; // 改造项目：['双乳乳环', '阴蒂环', '小腹淫纹']
  completedDate?: string; // 完成日期
}

export interface BodyStatus {
  location: LocationID;
  exactLocation?: string; // 精确位置（如"cos社活动室"、"A展厅"、"游艇上"等），用于在大地点中找到温婉
  isAccessible?: boolean; // 是否可被找到（true=能找到，false=找不到，如游艇已出海）
  favorability: number; // 0-100
  libido: number; // Sexual Desire (0-100)
  degradation: number; // Degradation Level (0-100)
  emotion: string; // Current facial expression/mood
  mouth: BodyPartStatus;
  chest: BodyPartStatus;
  nipples: BodyPartStatus;
  groin: BodyPartStatus; // "小穴"
  posterior: BodyPartStatus; // "屁穴"
  feet: BodyPartStatus;
  arousal: number; // 0-100 (Immediate physical arousal)
  heartRate: number;
  overallClothing: string; // General outfit description
  currentAction: string; // What she is explicitly doing right now
  innerThought: string; // Her hidden internal monologue
  // 已废弃：弧光系统（保留arcLight字段用于向后兼容，但不影响行为）
  arcLight: ArcLight | null; // 当前弧光：已废弃，保留用于向后兼容
  // 已删除：trialPeriod, lastArcLightCheck（试探期系统已移除）
  // 新增：黄毛系统
  yellowHair1: YellowHairInfo | null; // 黄毛1（富二代或肥宅）
  yellowHair2: YellowHairInfo | null; // 黄毛2（可以同时存在）
  // 新增：身体改造
  bodyModification: BodyModification; // 身体改造状态
  // 新增：每日增长计数器（用于限制每日好感度和堕落度增长上限）
  todayFavorabilityGain: number; // 今天已增长的好感度（每天0点重置）
  todayDegradationGain: number; // 今天已增长的堕落度（每天0点重置）
  lastResetDate: string; // 上次重置日期（格式：YYYY-MM-DD）
}

export interface CalendarEvent {
  id: string;
  time: string;
  title: string;
  description: string;
  color: string; // Tailwind color class for the border
}

export interface GameTime {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 0-6 (0=周日, 1=周一, ...)
  hour: number; // 0-23
  minute: number; // 0-59
  weather: {
    condition: string; // 天气状况，如"暴雨"、"晴天"等
    temperature: number; // 温度
    wind?: string; // 风力
    humidity?: number; // 湿度
  };
}

export interface GameState {
  credits: number;
  relationship: number;
  bodyStatus: BodyStatus;
}

export interface GeminiResponse {
  reply: string;
  status: BodyStatus;
  generatedTweet?: {
    content: string;
    imageDescription: string; // Detailed description of the photo
  };
}

// 游戏存档数据结构
export interface BackpackItem {
  id: string;
  name: string;
  description: string;
  price: number;
  date: string;
  type?: 'clothing' | 'item'; // 'clothing'为服装，'item'为普通物品
  outfitId?: string; // 如果是服装，对应的立绘服装ID（如 'princess_dress'）
}

export interface GameSave {
  id: number; // 存档槽位ID (0-7, 0为自动存档)
  name: string; // 存档名称
  timestamp: number; // 存档时间戳
  gameTime: GameTime; // 游戏时间
  messages: Message[]; // 对话记录
  bodyStatus: BodyStatus; // 身体状态
  userLocation: LocationID; // 用户位置
  tweets: Tweet[]; // 推特记录
  calendarEvents: CalendarEvent[]; // 日历事件
  todaySummary: string; // 今日总结
  todaySummaries?: string[]; // 今日总结列表
  walletBalance?: number; // 钱包余额
  walletTransactions?: Array<{id: string; name: string; price: number; date: string; type: 'expense' | 'income'}>; // 钱包交易记录
  backpackItems?: BackpackItem[]; // 背包物品
  unlockedOutfits?: string[]; // 已解锁的服装ID列表
}
