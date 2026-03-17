import {
    Activity,
    Anchor,
    Armchair,
    ArrowLeft,
    Backpack,
    Bath,
    BedDouble,
    Box,
    Brain,
    Briefcase,
    Cake,
    Calendar as CalendarIcon,
    CreditCard as CardIcon,
    ChevronRight,
    ChevronUp, ChevronsDown,
    Clock,
    Cloud,
    CloudRain,
    Coffee,
    DoorOpen,
    Download,
    Eye, EyeOff,
    FerrisWheel,
    Film,
    Flag,
    Flame,
    Ghost,
    Gift,
    GraduationCap,
    Heart,
    Home,
    Image, Lock,
    LogOut,
    MessageCircle,
    Mic,
    MoreHorizontal,
    Plus,
    Repeat,
    Save,
    ShoppingBag,
    Smile,
    Sofa,
    Sparkles,
    Store,
    Sun,
    Tent,
    Thermometer,
    Ticket,
    Trash2,
    Trees,
    Upload,
    User,
    Users,
    Utensils,
    Wallet,
    Wind,
    X,
    Zap
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { deleteSave, getAllSaves, loadGame, exportSave, importSave, saveImportedGame } from '../services/saveService';
import { BackpackItem, BodyPartStatus, BodyStatus, CalendarEvent, Comment, GameSave, GameTime, LocationID, Message, Product, Tweet } from '../types';

// --- Shared Components ---

const Header = ({ title, onClose, onBack, rightIcon }: { title: string; onClose?: () => void; onBack?: () => void; rightIcon?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-4 py-3 bg-white/90 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-20 transition-all shadow-sm">
    <div className="flex items-center gap-2">
        {onBack && (
            <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-gray-100 text-gray-800">
                <ArrowLeft size={22} />
            </button>
        )}
        <h1 className="text-lg font-semibold text-gray-900 tracking-tight">{title}</h1>
    </div>
    <div className="flex items-center gap-2">
        {rightIcon}
        {onClose && (
        <button 
            onClick={onClose} 
            className="p-1.5 rounded-full bg-gray-100/80 hover:bg-gray-200 text-gray-500 active:scale-95 transition-all"
        >
            <X size={20} />
        </button>
        )}
    </div>
  </div>
);

interface AppProps {
  onClose: () => void;
  userLocation?: LocationID;
  sisterLocation?: LocationID;
  onMoveUser?: (location: LocationID, withSister: boolean, isFacility?: boolean, facilityName?: string) => void;
  status?: BodyStatus;
  onAction?: (text: string) => void; // For sending messages/buying items
  messages?: Message[]; // To show chat history in SocialApp
  calendarEvents?: CalendarEvent[]; // For CalendarApp history
  tweets?: Tweet[]; // For TwitterApp
  gameTime?: GameTime; // For CalendarApp
  onSkipToday?: () => void; // For CalendarApp
  onSkipOneHour?: () => void; // For CalendarApp
  onSkipThreeHours?: () => void; // For CalendarApp
  onSkipSixHours?: () => void; // For CalendarApp
  onSkipTwoDays?: () => void; // For CalendarApp
  onSkipWeek?: () => void; // For CalendarApp
  todaySummary?: string; // For CalendarApp - 今日总结
  onSaveGame?: (slotId: number, customName?: string) => void; // For SaveApp
  onLoadGame?: (slotId: number) => void; // For SaveApp
  walletBalance?: number; // For WalletApp / MapsApp 显示余额
  walletTransactions?: Array<{id: string; name: string; price: number; date: string; type: 'expense' | 'income'}>; // For WalletApp
  onSpendMoney?: (amount: number, item: string) => void; // For MapsApp - 消费功能
  onSleep?: () => void; // For MapsApp - 睡觉功能（潜入妹妹房间）
  onSleepCancel?: () => void; // For MapsApp - 正常睡觉到第二天早上
  onEnterGuestRoom?: () => void; // For MapsApp - 进入次卧
  advance?: (minutes: number) => void; // For MapsApp - 时间推进功能
  backpackItems?: BackpackItem[]; // For BackpackApp
  onBuyClothing?: (outfitId: string, name: string, description: string, price: number) => void; // 购买服装
  onGiftClothing?: (outfitId: string, itemId: string) => void; // 赠送服装给温婉
  onUseItem?: (itemId: string, name: string, description: string) => void; // 使用物品（情趣用品等）
  onGiftItem?: (itemId: string, name: string, description: string) => void; // 赠送物品给温婉
  unlockedOutfits?: string[]; // 已解锁的服装ID列表
}

// --- Social App (WeChat Style - Filtered View) ---
export const SocialApp: React.FC<AppProps> = ({ onClose, onAction, messages = [] }) => {
    const [view, setView] = useState<'LIST' | 'CHAT'>('LIST');
    const [input, setInput] = useState('');
    const chatEndRef = React.useRef<HTMLDivElement>(null);
    const AVATAR_URL = "https://files.catbox.moe/n5ah9q.jpeg";

    // Filter messages to only show "WeChat" interactions
    // Criteria: isWeChat flag is true OR Starts with (发送微信) OR Starts with (微信)
    const chatHistory = messages.filter(m => 
        m.isWeChat || m.text.startsWith('(发送微信)') || m.text.startsWith('(微信)')
    ).map(m => ({
        ...m,
        text: m.text.replace('(发送微信)', '').replace('(微信)', '').trim()
    }));

    useEffect(() => {
        if (view === 'CHAT') {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, view]);

    const handleSend = () => {
        if (!input.trim() || !onAction) return;
        onAction(`(发送微信) ${input}`);
        setInput('');
    };

    if (view === 'LIST') {
        return (
            <div className="flex flex-col h-full bg-[#f5f5f7]">
                <Header title="微聊" onClose={onClose} rightIcon={<Plus size={20} className="text-gray-600 mr-2"/>} />
                <div className="flex-1 overflow-y-auto">
                    {/* Pinned Contact: Wenwan */}
                    <div onClick={() => setView('CHAT')} className="bg-white p-3 flex gap-3 items-center border-b border-gray-100 active:bg-gray-100 cursor-pointer">
                        <div className="relative">
                            <img src={AVATAR_URL} alt="温婉" className="w-12 h-12 rounded-lg object-cover shadow-sm" />
                            {chatHistory.length > 0 && (
                                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">!</div>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-baseline mb-1">
                                <span className="font-semibold text-gray-900">温婉</span>
                                <span className="text-xs text-gray-400">刚刚</span>
                            </div>
                            <div className="text-sm text-gray-500 truncate">
                                {chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].text : "（点击开始聊天）"}
                            </div>
                        </div>
                    </div>
                     {/* Other Contacts */}
                     {['家族群', '公司通知', '快递助手'].map((name, i) => (
                        <div key={i} className="bg-white p-3 flex gap-3 items-center border-b border-gray-100 active:bg-gray-100 cursor-pointer">
                            <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-500 font-bold">
                                {name[0]}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="font-semibold text-gray-900">{name}</span>
                                    <span className="text-xs text-gray-400">昨天</span>
                                </div>
                                <div className="text-sm text-gray-500 truncate">[图片]</div>
                            </div>
                        </div>
                     ))}
                </div>
            </div>
        );
    }

    // Chat View
    return (
        <div className="flex flex-col h-full bg-[#f2f2f2]">
            <Header title="温婉" onClose={onClose} onBack={() => setView('LIST')} rightIcon={<MoreHorizontal size={20} className="text-gray-600 mr-2"/>} />
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm mt-10">
                        和温婉发个消息吧...
                    </div>
                ) : (
                    chatHistory.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.sender !== 'user' && (
                                <img src={AVATAR_URL} alt="温婉" className="w-9 h-9 rounded-lg mr-2 object-cover shadow-sm flex-shrink-0" />
                            )}
                            <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm leading-relaxed shadow-sm ${
                                msg.sender === 'user' 
                                ? 'bg-[#95ec69] text-black rounded-tr-none' // WeChat Green
                                : 'bg-white text-gray-900 rounded-tl-none border border-gray-200'
                            }`}>
                                {msg.text}
                            </div>
                            {msg.sender === 'user' && (
                                /* User Avatar Placeholder - Could be made customizable later */
                                <div className="w-9 h-9 rounded-lg ml-2 bg-gray-300 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                    <User size={20} className="text-gray-500" />
                                </div>
                            )}
                        </div>
                    ))
                )}
                <div ref={chatEndRef} />
            </div>
            {/* Input Area */}
            <div className="bg-[#f7f7f7] p-2 border-t border-gray-300 flex items-end gap-2">
                <button className="p-2 text-gray-600"><Mic size={24} /></button>
                <div className="flex-1 bg-white rounded-lg p-2 min-h-[40px] shadow-sm">
                    <input 
                        className="w-full h-full bg-transparent outline-none text-sm"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />
                </div>
                <button className="p-2 text-gray-600"><Plus size={24} /></button>
                {input.trim() && (
                    <button onClick={handleSend} className="bg-[#07C160] text-white px-3 py-1.5 rounded-md text-sm font-bold">发送</button>
                )}
            </div>
        </div>
    );
};

// --- Twitter App (Updated with Modal for Description) ---
export const TwitterApp: React.FC<AppProps> = ({ onClose, tweets = [] }) => {
  const [activeComments, setActiveComments] = useState<string | null>(null);
  const [randomComments, setRandomComments] = useState<Comment[]>([]);
  const [viewingImageTweet, setViewingImageTweet] = useState<Tweet | null>(null);

  const handleShowComments = (tweetId: string) => {
      const npcNames = ["路人A", "纯爱战神", "隔壁老王", "吃瓜群众", "匿名用户"];
      const contents = ["这是可以免费看的吗？", "太可爱了吧！", "博主缺不缺男朋友？", "羡慕哥哥...", "awsl", "多发点，孩子爱看", "这是什么神仙颜值"];
      const generated: Comment[] = Array.from({length: 5}).map((_, i) => ({
          id: i.toString(),
          user: npcNames[Math.floor(Math.random() * npcNames.length)],
          content: contents[Math.floor(Math.random() * contents.length)]
      }));
      setRandomComments(generated);
      setActiveComments(tweetId);
  };

  return (
    <div className="flex flex-col h-full bg-black text-white relative">
      <div className="px-4 py-3 border-b border-gray-800 sticky top-0 bg-black/80 backdrop-blur-md z-20 flex justify-between items-center">
        <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center text-xs">
             ME
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800/50 hover:bg-gray-800 transition-colors">
            <X size={18} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {tweets.map(tweet => (
          <div key={tweet.id} className="border-b border-gray-800 p-4 hover:bg-gray-900/40 transition-colors cursor-pointer">
            <div className="flex gap-3">
              {/* Avatar Placeholder */}
              <img src={tweet.avatar} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="Avatar"/>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[15px]">{tweet.author}</span>
                  <span className="text-gray-500 text-[14px]">{tweet.handle}</span>
                  <span className="text-gray-500 text-[14px]">· {tweet.time}</span>
                  {tweet.isPrivate && <Lock size={12} className="text-gray-500" />}
                </div>
                <p className="mt-1 text-[15px] whitespace-pre-wrap">{tweet.content}</p>
                {/* Image Placeholder with Click Action */}
                {tweet.hasImage && (
                    <div 
                        onClick={(e) => { e.stopPropagation(); setViewingImageTweet(tweet); }}
                        className="mt-3 rounded-xl overflow-hidden border border-gray-800 bg-gray-900 min-h-[160px] flex flex-col items-center justify-center text-gray-500 text-sm relative group cursor-zoom-in hover:bg-gray-800 transition-colors"
                    >
                        <Image size={32} className="mb-2 text-gray-600 group-hover:text-blue-400 transition-colors" />
                        <span className="font-bold text-xs text-gray-600 group-hover:text-gray-300">点击查看图片详情</span>
                        <div className="absolute inset-0 border-2 border-transparent group-hover:border-blue-500/30 rounded-xl transition-colors"></div>
                    </div>
                )}
                <div className="flex justify-between mt-3 text-gray-500 max-w-md">
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleShowComments(tweet.id); }}
                        className="flex items-center gap-1 hover:text-blue-400 transition-colors group"
                    >
                        <MessageCircle size={16} className="group-hover:bg-blue-500/10 rounded-full p-px" />
                        <span className="text-xs">{tweet.comments}</span>
                    </button>
                    <button className="flex items-center gap-1 hover:text-green-400 transition-colors group">
                        <Repeat size={16} className="group-hover:bg-green-500/10 rounded-full p-px" />
                        <span className="text-xs">{tweet.retweets}</span>
                    </button>
                    <button className="flex items-center gap-1 hover:text-pink-500 transition-colors group">
                        <Heart size={16} className="group-hover:bg-pink-500/10 rounded-full p-px" />
                        <span className="text-xs">{tweet.likes}</span>
                    </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Image Description Modal */}
      {viewingImageTweet && (
          <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col animate-fade-in p-6">
              <div className="flex justify-end mb-4">
                  <button onClick={() => setViewingImageTweet(null)} className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-white hover:bg-gray-700">
                      <X size={24} />
                  </button>
              </div>
              <div className="flex-1 flex flex-col justify-center items-center text-center px-4">
                  <div className="w-16 h-16 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-500 mb-6 animate-pulse">
                      <Image size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">图片内容描述</h3>
                  <div className="w-full max-w-xs h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent mb-6"></div>
                  <p className="text-gray-300 leading-relaxed text-base max-w-sm italic">
                      "{viewingImageTweet.imageDescription || "（图片加载失败或已被删除...）"}"
                  </p>
              </div>
          </div>
      )}

      {/* Comments Modal */}
      {activeComments && (
          <div className="absolute inset-0 z-50 bg-black/95 transform transition-transform animate-slide-up flex flex-col">
              <div className="p-4 border-b border-gray-800 flex items-center gap-4">
                  <button onClick={() => setActiveComments(null)}><ArrowLeft className="text-white" /></button>
                  <h2 className="text-lg font-bold">评论</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {randomComments.map(c => (
                      <div key={c.id} className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs">{c.user[0]}</div>
                          <div>
                              <div className="text-gray-400 text-sm font-bold">{c.user}</div>
                              <div className="text-white text-sm mt-1">{c.content}</div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
};

// --- Shop App (Updated with Tabs) ---
export const ShopApp: React.FC<AppProps> = ({ onClose, onAction }) => {
     const [activeTab, setActiveTab] = useState<'daily' | 'gift' | 'adult'>('daily');

     const allProducts: Product[] = [
         // Daily
         { id: 'd1', name: '矿泉水', price: 2, image: '', description: '补充水分', category: 'daily' },
         { id: 'd2', name: '薯片大礼包', price: 25, image: '', description: '追剧必备', category: 'daily' },
         { id: 'd3', name: '毛巾', price: 15, image: '', description: '柔软亲肤', category: 'daily' },
         { id: 'd4', name: '纸巾 (12卷)', price: 18, image: '', description: '居家常备', category: 'daily' },
         // Gifts
         { id: 'g1', name: '玫瑰花束', price: 199, image: '', description: '浪漫惊喜', category: 'gift' },
         { id: 'g2', name: '水晶项链', price: 1299, image: '', description: '精致典雅', category: 'gift' },
         { id: 'g3', name: '大号泰迪熊', price: 350, image: '', description: '温暖拥抱', category: 'gift' },
         { id: 'g4', name: '女士香水', price: 580, image: '', description: '迷人香氛', category: 'gift' },
         // Adult
         { id: 'a1', name: '超薄0.01mm', price: 89, image: '', description: '亲密无间', category: 'adult' },
         { id: 'a2', name: '蕾丝女仆装', price: 299, image: '', description: '情趣角色扮演', category: 'adult' },
         { id: 'a3', name: '润滑液 (草莓)', price: 59, image: '', description: '丝滑体验', category: 'adult' },
         { id: 'a4', name: '震动玩具', price: 450, image: '', description: '愉悦探索', category: 'adult' },
         { id: 'a5', name: '香氛蜡烛', price: 128, image: '', description: '营造氛围', category: 'adult' },
     ];

     const filteredProducts = allProducts.filter(p => p.category === activeTab);

     const handleBuy = (item: Product) => {
         if (onAction) onAction(`购买了商品: ${item.name}`);
     };

     return (
        <div className="flex flex-col h-full bg-gray-50">
            <Header title="桃宝商城" onClose={onClose} rightIcon={<ShoppingBag size={20} className="text-orange-500 mr-2"/>} />
            
            {/* Tabs */}
            <div className="flex bg-white px-2 pt-2 border-b border-gray-100 shadow-sm z-10 sticky top-[53px]">
                {[
                    { id: 'daily', label: '日常用品' },
                    { id: 'gift', label: '礼品专区' },
                    { id: 'adult', label: '情趣优选' }
                ].map((tab) => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-3 text-sm font-bold relative transition-colors ${activeTab === tab.id ? 'text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-orange-600 rounded-full"></div>
                        )}
                    </button>
                ))}
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-3 no-scrollbar content-start">
                {filteredProducts.map(p => (
                    <div key={p.id} className="bg-white rounded-xl overflow-hidden shadow-sm flex flex-col group active:scale-95 transition-all duration-200">
                        {/* Product Image Placeholder */}
                        <div className="aspect-square bg-gray-100 relative overflow-hidden flex items-center justify-center text-gray-300">
                            <ShoppingBag size={24} />
                        </div>
                        <div className="p-3 flex-1 flex flex-col">
                            <h3 className="text-sm font-bold text-gray-800 line-clamp-1 mb-1">{p.name}</h3>
                            <p className="text-[10px] text-gray-400 mb-3">{p.description}</p>
                            <div className="flex justify-between items-center mt-auto">
                                <span className="text-orange-600 font-bold text-base">¥{p.price}</span>
                                <button onClick={() => handleBuy(p)} className="bg-orange-500 text-white text-[10px] px-2 py-1 rounded-full font-bold shadow-md shadow-orange-200 hover:bg-orange-600">
                                    购买
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
     );
};

// --- Photos App ---
export const PhotosApp: React.FC<AppProps> = ({ onClose }) => {
     const photos = Array.from({length: 12});
     return (
        <div className="flex flex-col h-full bg-white">
             <Header title="相册" onClose={onClose} />
             <div className="flex-1 overflow-y-auto p-1 grid grid-cols-3 gap-0.5 no-scrollbar">
                {photos.map((_, i) => (
                    // Photo Placeholder
                    <div key={i} className="aspect-[3/4] bg-gray-200 cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center text-gray-400">
                        <Image size={24} />
                    </div>
                ))}
             </div>
        </div>
     );
};

// --- Maps App (Restored Advanced Version) ---

export const MapsApp: React.FC<AppProps> = ({
  onClose,
  userLocation,
  sisterLocation,
  onMoveUser,
  onSpendMoney,
  onBuyItem,
  onEarnMoney,
  onSleep,
  onEnterGuestRoom,
  onStealUnderwear,
  status,
  walletBalance = 0,
  advance,
  onBuyClothing,
}) => {
  const [showSleepConfirm, setShowSleepConfirm] = useState(false);
  const [showGuestRoomOptions, setShowGuestRoomOptions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{id: string, name: string} | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<{name: string, price?: number, priceForTwo?: number, movieTypes?: string[]} | null>(null);
  const [expandedLuxuryShop, setExpandedLuxuryShop] = useState(false); // 奢侈品店是否展开
  const [selectedMovieType, setSelectedMovieType] = useState<string | null>(null);
  const [selectedSeatType, setSelectedSeatType] = useState<'normal' | 'vip' | 'couple' | null>(null); // 座位类型：普通座、VIP座、情侣座
  const [viewMode, setViewMode] = useState<'INTERIOR' | 'CITY' | 'FACILITY'>('INTERIOR');

  // Interior Rooms Definition
  const rooms: { id: LocationID; label: string; icon: any; className?: string }[] = [
      { id: 'master_bedroom', label: '主卧', icon: BedDouble, className: 'rounded-tl-[2rem]' },
      { id: 'guest_bedroom', label: '次卧', icon: BedDouble, className: 'rounded-tr-[2rem]' },
      { id: 'living_room', label: '客厅', icon: Armchair, className: 'row-span-2' },
      { id: 'dining_room', label: '餐厅', icon: Utensils, className: '' },
      { id: 'kitchen', label: '厨房', icon: Box, className: '' },
      { id: 'toilet', label: '卫浴', icon: Bath, className: '' },
      { id: 'hallway', label: '门厅', icon: DoorOpen, className: 'col-span-2 rounded-b-[2rem] border-b-4 border-gray-300' },
  ];

  // City Locations Definition
  const cityLocations: { id: LocationID; name: string; icon: any; color: string }[] = [
    { id: 'company', name: '公司', icon: Briefcase, color: 'bg-blue-600' },
    { id: 'mall', name: '商城', icon: ShoppingBag, color: 'bg-orange-500' },
    { id: 'cinema', name: '电影院', icon: Film, color: 'bg-purple-600' },
    { id: 'amusement_park', name: '游乐场', icon: FerrisWheel, color: 'bg-pink-500' },
    { id: 'forest', name: '树林', icon: Trees, color: 'bg-green-700' },
    { id: 'square', name: '广场', icon: Flag, color: 'bg-sky-500' },
    { id: 'clothing_store', name: '服装店', icon: Store, color: 'bg-rose-400' },
    { id: 'food_court', name: '美食广场', icon: Utensils, color: 'bg-yellow-500' },
    { id: 'cake_shop', name: '蛋糕店', icon: Cake, color: 'bg-pink-300' },
    { id: 'school', name: '学校', icon: GraduationCap, color: 'bg-indigo-500' },
    { id: 'adult_shop', name: '情趣用品', icon: Ghost, color: 'bg-red-600' },
    { id: 'port', name: '港口', icon: Anchor, color: 'bg-cyan-600' }, 
    { id: 'exhibition_center', name: '展会中心', icon: Tent, color: 'bg-violet-500' }, 
  ];

  // Sub-Facilities Mapping (添加价格和待添加标记)
  const facilities: Record<string, {name: string, icon: any, price?: number, priceForTwo?: number, comingSoon?: boolean, movieTypes?: string[], description?: string, isWork?: boolean}[]> = {
      'amusement_park': [
          { name: '旋转木马', icon: FerrisWheel },
          { name: '云霄飞车', icon: Ticket },
          { name: '摩天轮', icon: Sun },
          { name: '鬼屋', icon: Ghost },
          { name: '海盗船', icon: Anchor },
          { name: '梦幻城堡', icon: Flag },
          { name: '花车巡游', icon: Sparkles },
          { name: '冰淇淋车', icon: Cake },
          { name: '游乐场套票', icon: Ticket, price: 480, priceForTwo: 900 }
      ],
      'company': [
          { name: '工位办公', icon: Briefcase, price: 100, description: '工作1小时获得100元', isWork: true },
          { name: '老板办公室', icon: User },
          { name: '茶水间', icon: Coffee },
          { name: '会议室', icon: Users }
      ],
      'mall': [
          { name: '奢侈品店', icon: ShoppingBag, description: '购买服装赠送给温婉' },
          { name: '珠宝店', icon: Gift, comingSoon: true },
          { name: '休息区', icon: Sofa }
      ],
      'cinema': [
          { name: '购票处', icon: Ticket, movieTypes: ['爱情类', '恐怖类', '科幻类', '剧情类'] }
      ],
      'school': [
        { name: '教室', icon: Briefcase },
        { name: '操场', icon: Flag },
        { name: '天台', icon: Cloud }
      ],
      'food_court': [
        { name: '回转寿司', icon: Utensils, price: 150, priceForTwo: 300 },
        { name: '美式汉堡', icon: Coffee, price: 50, priceForTwo: 100 },
        { name: '川渝火锅', icon: Flame, price: 300, priceForTwo: 600 },
        { name: '网红奶茶', icon: Coffee, price: 100, priceForTwo: 200 },
      ],
      'cake_shop': [
        { name: '蛋糕', icon: Cake, price: 100 }
      ],
      'port': [
        { name: '豪华游艇', icon: Anchor, price: 3500 },
        { name: '海上快艇', icon: Zap, price: 1000 },
        { name: '海钓平台', icon: Sun, price: 500 },
      ],
      'exhibition_center': [
        { name: '漫展主会场', icon: Users },
        { name: 'Cosplay摄影区', icon: Image },
        { name: '周边贩卖', icon: ShoppingBag },
        { name: '科技博览', icon: Zap },
      ],
      'adult_shop': [
        { name: '超薄避孕套', icon: Gift, price: 89, description: '超薄设计，亲密无间' },
        { name: '震动棒', icon: Zap, price: 450, description: '多档震动模式，带来极致体验' },
        { name: '跳蛋', icon: Sparkles, price: 199, description: '小巧便携，隐秘刺激' },
        { name: 'SM手铐', icon: Lock, price: 299, description: '金属材质，安全可靠' },
        { name: 'SM项圈', icon: Lock, price: 189, description: '皮质项圈，彰显归属' },
        { name: '润滑液', icon: Gift, price: 59, description: '水溶性润滑，舒适安全' },
        { name: '按摩棒', icon: Zap, price: 380, description: '多频震动，深度按摩' },
        { name: '延时喷雾', icon: Gift, price: 128, description: '延长持久时间' },
        { name: '情趣蜡烛', icon: Flame, price: 158, description: '低温蜡烛，营造氛围' },
        { name: '情趣眼罩', icon: Eye, price: 88, description: '丝质眼罩，增加神秘感' },
        { name: '肛塞', icon: Gift, price: 199, description: '硅胶材质，渐进式设计' },
        { name: '绳子', icon: Gift, price: 89, description: '专业束缚绳，安全牢固' },
        { name: '乳夹', icon: Gift, price: 128, description: '可调节力度，敏感刺激' },
        { name: '贞操带', icon: Lock, price: 888, description: '金属材质，完全控制' },
        { name: '困龙锁', icon: Lock, price: 666, description: '特殊设计，限制行动' },
        { name: '吸奶器', icon: Gift, price: 299, description: '电动吸奶器，舒适体验' },
        { name: '避孕药', icon: Gift, price: 58, description: '紧急避孕，安全有效' }
      ]
  };

  const isUserInside = rooms.some(r => r.id === userLocation);
  
  // Logic to switch view based on location
  useEffect(() => {
      if (isUserInside) {
          setViewMode('INTERIOR');
      } else {
          if (userLocation && facilities[userLocation]) {
             setViewMode('FACILITY');
          } else {
             setViewMode('CITY');
          }
      }
  }, [userLocation]);

  const handleCityLocationSelect = (loc: {id: LocationID, name: string}) => {
      if (userLocation === loc.id) {
          if (facilities[loc.id]) setViewMode('FACILITY');
          return; 
      }
      setSelectedLocation(loc); // Confirm travel to new city location
  };

  const handleFacilityClick = (facilityName: string) => {
      const facility = facilities[userLocation || '']?.find(f => f.name === facilityName);
      if (facility) {
          // 特殊处理：奢侈品店 -> 展开/折叠服装列表
          if (userLocation === 'mall' && facility.name === '奢侈品店') {
              setExpandedLuxuryShop(!expandedLuxuryShop);
              return;
          }
          setSelectedFacility({ 
              name: facilityName,
              price: facility.price,
              priceForTwo: facility.priceForTwo,
              movieTypes: facility.movieTypes,
              description: facility.description,
              isWork: facility.isWork
          });
          if (facility.movieTypes) {
              setSelectedMovieType(null); // 重置电影类型选择
              setSelectedSeatType(null); // 重置座位类型选择
              setSelectedSeatType(null); // 重置座位类型选择
          }
      } else {
          setSelectedFacility({ name: facilityName });
      }
  };

  const confirmMove = (inviteSister: boolean) => {
      if (selectedLocation && onMoveUser) {
          const targetLocation = selectedLocation.id as LocationID;
          const isMasterBedroom = targetLocation === 'master_bedroom';
          const isGuestBedroom = targetLocation === 'guest_bedroom';
          
          onMoveUser(targetLocation, inviteSister).then(() => {
              setSelectedLocation(null);
              
              // 如果移动到主卧，自动显示睡觉选项
              if (isMasterBedroom && onSleep) {
                  setTimeout(() => {
                      setShowSleepConfirm(true);
                  }, 800);
              }
              // 如果移动到次卧，自动显示选项（让玩家自己决定做什么）
              else if (isGuestBedroom && onEnterGuestRoom) {
                  setTimeout(() => {
                      if (onEnterGuestRoom) onEnterGuestRoom();
                  }, 800);
              }
          }).catch((error) => {
              console.error('移动失败:', error);
              setSelectedLocation(null);
          });
      }
  };

  const confirmFacilityAction = (inviteSister: boolean) => {
      if (selectedFacility && userLocation && onMoveUser) {
          // 如果是购票处，需要先选择电影类型和座位类型
          if (selectedFacility.movieTypes && (!selectedMovieType || !selectedSeatType)) {
              return; // 不执行，等待选择电影类型和座位类型
          }
          
          // 如果是工作，给钱并推进时间（工作1小时）
          if (selectedFacility.isWork && selectedFacility.price && onEarnMoney) {
              onEarnMoney(selectedFacility.price, selectedFacility.name);
              // 工作1小时，推进60分钟
              if (advance) {
                  advance(60);
              }
              // 工作不需要移动，直接关闭弹窗
              setSelectedFacility(null);
              setSelectedMovieType(null);
              setSelectedSeatType(null);
              return;
          }
          
          // 如果是情趣用品店，购买商品（需要检查余额）
          if (userLocation === 'adult_shop' && selectedFacility.price && selectedFacility.description && onBuyItem) {
              if (walletBalance >= selectedFacility.price) {
                  onBuyItem(selectedFacility.name, selectedFacility.description, selectedFacility.price);
                  setSelectedFacility(null);
                  setSelectedMovieType(null);
                  return;
              } else {
                  alert('余额不足！');
                  return;
              }
          }
          
          // 计算价格（非工作、非购买商品的情况）
          let finalPrice = 0;
          if (selectedFacility.price && !selectedFacility.isWork && userLocation !== 'adult_shop') {
              // 如果是购票处，根据座位类型和是否和温婉一起计算价格
              if (userLocation === 'cinema' && selectedFacility.movieTypes && selectedSeatType) {
                  const seatPrices = {
                      'normal': 100,  // 普通座100元
                      'vip': 200,     // VIP座200元
                      'couple': 300   // 情侣座300元
                  };
                  const basePrice = seatPrices[selectedSeatType];
                  finalPrice = inviteSister ? basePrice * 2 : basePrice; // 和温婉一起×2，独自×1
              } else if (inviteSister && selectedFacility.priceForTwo) {
                  finalPrice = selectedFacility.priceForTwo;
              } else {
                  finalPrice = selectedFacility.price;
              }
          }
          
          // 如果有价格，检查余额并扣款
          if (finalPrice > 0) {
              if (walletBalance >= finalPrice && onSpendMoney) {
                  const seatTypeNames = {
                      'normal': '普通座',
                      'vip': 'VIP座',
                      'couple': '情侣座'
                  };
                  const seatName = selectedSeatType ? seatTypeNames[selectedSeatType] : '';
                  const facilityName = `${selectedFacility.name}${selectedMovieType ? ` - ${selectedMovieType}` : ''}${seatName ? ` - ${seatName}` : ''}`;
                  onSpendMoney(finalPrice, facilityName);
              } else {
                  alert('余额不足！');
                  return;
              }
          }
          
          // 构建设施名称（包含电影类型和座位类型）
          const seatTypeNames = {
              'normal': '普通座',
              'vip': 'VIP座',
              'couple': '情侣座'
          };
          const seatName = selectedSeatType ? seatTypeNames[selectedSeatType] : '';
          const facilityName = `${selectedFacility.name}${selectedMovieType ? ` - ${selectedMovieType}` : ''}${seatName ? ` - ${seatName}` : ''}`;
          
          onMoveUser(userLocation, inviteSister, true, facilityName);
          setSelectedFacility(null);
          setSelectedMovieType(null);
          setSelectedSeatType(null);
      }
  };

  const isSisterInside = rooms.some(r => r.id === sisterLocation);
  const canInviteSister = (isUserInside && isSisterInside) || (userLocation === sisterLocation);

  const RoomCard = ({ id, label, icon: Icon, className }: any) => {
    const isHere = userLocation === id;
    const isSisterHere = sisterLocation === id;
    const isMasterBedroom = id === 'master_bedroom';
    const isGuestBedroom = id === 'guest_bedroom';
    
    const handleRoomClick = () => {
      if (userLocation === id) {
        // 如果已经在主卧，显示睡觉选项
        if (isMasterBedroom && onSleep) {
          setShowSleepConfirm(true);
        }
        // 如果已经在次卧，显示进入/偷内衣选项
        else if (isGuestBedroom) {
          setShowGuestRoomOptions(true);
        }
      } else {
        // 如果不在该房间，显示移动选项
        setSelectedLocation({id, name: label});
      }
    };
    
    return (
      <div 
        onClick={handleRoomClick}
        className={`relative rounded-xl border-2 transition-all cursor-pointer p-2 flex flex-col justify-between overflow-visible
          ${isHere ? 'bg-blue-50 border-blue-400 shadow-md' : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-gray-50'}
          ${className}
        `}
      >
        <div className="text-gray-400 flex items-center gap-1">
           <Icon size={14} />
           <span className="text-[10px] font-bold uppercase">{label}</span>
        </div>
        <div className="flex gap-1 justify-center items-center mt-1 absolute inset-0 pt-4 pointer-events-none">
             {isHere && <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold z-10">ME</div>}
             {isSisterHere && <div className="w-8 h-8 rounded-full border-2 border-pink-400 shadow-lg z-10 bg-pink-200 flex items-center justify-center text-xs font-bold text-white">妹</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#f5f5f7] relative overflow-hidden">
      <Header 
        title={viewMode === 'INTERIOR' ? "我的家" : viewMode === 'FACILITY' ? "当前地点" : "城市导航"} 
        onClose={onClose} 
        onBack={() => {
            if (viewMode === 'FACILITY') setViewMode('CITY');
            else if (viewMode === 'CITY' && isUserInside) setViewMode('INTERIOR');
        }}
      />
      
      {/* --- Interior View --- */}
      {viewMode === 'INTERIOR' && (
          <div className="flex-1 p-4 flex flex-col justify-center gap-3 animate-fade-in">
             <div className="grid grid-cols-2 gap-3 h-32">
                 <RoomCard {...rooms[0]} />
                 <RoomCard {...rooms[1]} />
             </div>
             <div className="grid grid-cols-3 gap-3 h-40">
                 <div className="col-span-2 grid grid-rows-2 gap-3">
                    <RoomCard {...rooms[2]} />
                 </div>
                 <div className="grid grid-rows-2 gap-3">
                     <RoomCard {...rooms[3]} />
                     <RoomCard {...rooms[4]} />
                 </div>
             </div>
             <div className="grid grid-cols-3 gap-3 h-24">
                  <RoomCard {...rooms[5]} />
                  <RoomCard {...rooms[6]} />
             </div>
             <div className="mt-4">
                  <button onClick={() => setViewMode('CITY')} className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">
                      <LogOut size={20} /> 外出
                  </button>
             </div>
          </div>
      )}

      {/* --- City View --- */}
      {viewMode === 'CITY' && (
          <div className="flex-1 p-4 grid grid-cols-3 gap-4 overflow-y-auto no-scrollbar content-start animate-slide-up">
             <button onClick={() => handleCityLocationSelect({id: 'hallway', name: '回家'})} className="col-span-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-4 rounded-2xl font-bold shadow-md flex items-center justify-center gap-2">
                 <Home size={20} /> 返回家中
             </button>
             {cityLocations.map((loc) => {
                 const isHere = userLocation === loc.id;
                 const isSisterHere = sisterLocation === loc.id;
                 return (
                     <button key={loc.id} onClick={() => handleCityLocationSelect(loc)}
                        className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm border-2 relative
                            ${isHere ? 'bg-white border-green-500' : 'bg-white border-transparent'}`}
                     >
                         <div className={`w-10 h-10 rounded-full ${loc.color} flex items-center justify-center text-white shadow-lg relative`}>
                             <loc.icon size={20} />
                             {isSisterHere && <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white bg-pink-200"></div>}
                         </div>
                         <span className="text-xs font-bold text-gray-600">{loc.name}</span>
                         {isHere && <div className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>}
                     </button>
                 )
             })}
          </div>
      )}

      {/* --- Facility View (Vertical List) --- */}
      {viewMode === 'FACILITY' && userLocation && facilities[userLocation] && (
          <div className="flex-1 p-4 space-y-3 overflow-y-auto no-scrollbar animate-slide-up bg-white">
              <div className="pb-4 border-b border-gray-100 mb-2 sticky top-0 bg-white z-10">
                  <h2 className="text-xl font-bold text-gray-800">当前位于: {cityLocations.find(l=>l.id===userLocation)?.name}</h2>
                  <p className="text-sm text-gray-500">选择要进行的活动...</p>
              </div>
              {facilities[userLocation].map((fac, idx) => {
                  const isLuxuryShop = userLocation === 'mall' && fac.name === '奢侈品店';
                  const isExpanded = isLuxuryShop && expandedLuxuryShop;
                  
                  return (
                      <div key={idx} className="space-y-2">
                          <button 
                              onClick={() => !fac.comingSoon && handleFacilityClick(fac.name)}
                              disabled={fac.comingSoon}
                              className={`w-full p-4 rounded-2xl flex items-center justify-between group transition-all border ${
                                fac.comingSoon 
                                  ? 'bg-gray-100 opacity-60 cursor-not-allowed' 
                                  : 'bg-gray-50 hover:bg-blue-50 border-transparent hover:border-blue-200'
                              }`}
                          >
                              <div className="flex items-center gap-4 flex-1">
                                  <div className={`w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform ${
                                    fac.comingSoon ? 'text-gray-400' : fac.isWork ? 'text-green-500' : 'text-blue-500'
                                  }`}>
                                      <fac.icon size={24} />
                                  </div>
                                  <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                          <span className="font-bold text-lg text-gray-700">{fac.name}</span>
                                          {fac.comingSoon && (
                                              <span className="text-xs bg-gray-300 text-gray-600 px-2 py-0.5 rounded-full">待添加</span>
                                          )}
                                          {fac.isWork && (
                                              <span className="text-xs bg-green-300 text-green-700 px-2 py-0.5 rounded-full">工作</span>
                                          )}
                                      </div>
                                      {fac.description && (
                                          <div className="text-xs text-gray-500 mt-1">{fac.description}</div>
                                      )}
                                      {fac.price && (
                                          <div className={`text-sm font-bold mt-1 ${
                                            fac.isWork ? 'text-green-600' : 'text-orange-600'
                                          }`}>
                                              {fac.isWork 
                                                ? `+¥${fac.price}/小时`
                                                : fac.priceForTwo 
                                                  ? `¥${fac.price}/人，双人¥${fac.priceForTwo}` 
                                                  : `¥${fac.price}/人`}
                                          </div>
                                      )}
                                  </div>
                              </div>
                              {!fac.comingSoon && (
                                  <ChevronRight 
                                      className={`text-gray-300 group-hover:text-blue-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                                  />
                              )}
                          </button>
                          
                          {/* 奢侈品店展开内容 */}
                          {isLuxuryShop && isExpanded && (
                              <div className="ml-4 mr-4 space-y-2 bg-orange-50/30 rounded-2xl p-3 border border-orange-100">
                                  {[
                                      { id: 'princess_dress', name: '公主裙', price: 678, desc: '通体白色裙摆，点缀淡蓝色，像冰雪公主一样梦幻。' },
                                      { id: 'hanfu', name: '汉服', price: 1200, desc: '通体白色汉服，腰间粉色系带，袖口也是柔和的粉色，很仙气。' },
                                      { id: 'black_lingerie', name: '黑色情趣内衣', price: 1500, desc: '黑色深V情趣内衣，薄纱半透设计，没有丝袜，线条十分色气。' },
                                      { id: 'lolita', name: '洛丽塔洋装', price: 888, desc: '精致的洛丽塔洋装，蓬松裙摆与蕾丝边点缀，甜美又华丽。' },
                                      { id: 'cat_onesie', name: '猫咪连体衣', price: 466, desc: '蓝色猫咪连体衣，肚皮是白色毛茸茸的，看起来软萌可抱。' },
                                      { id: 'sweet_sweater', name: '甜美毛衣', price: 566, desc: '棕色长袖毛衣配棕色格子短裙，温柔又带一点学院风。' },
                                      { id: 'magical_girl', name: '魔法少女装', price: 1000, desc: '粉白色魔法少女服装，配白色过膝袜，像从动画里走出来一样。' },
                                      { id: 'qipao', name: '旗袍', price: 1500, desc: '黑色贴身旗袍，上有精致花纹，搭配黑色过膝袜，格外色气。' },
                                      { id: 'sportswear', name: '运动服', price: 398, desc: '白色运动抹胸加运动短裤，配过膝袜，元气又清爽。' },
                                  ].map(item => (
                                      <div
                                          key={item.id}
                                          className="border border-orange-100 rounded-xl p-3 flex flex-col gap-2 bg-white"
                                      >
                                          <div className="flex justify-between items-center">
                                              <div className="font-bold text-gray-800 text-sm">{item.name}</div>
                                              <div className="text-orange-600 font-bold text-sm">¥{item.price}</div>
                                          </div>
                                          <p className="text-xs text-gray-500">{item.desc}</p>
                                          <button
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (!onBuyClothing) {
                                                      alert('购买功能未初始化');
                                                      return;
                                                  }
                                                  if (walletBalance < item.price) {
                                                      alert('余额不足，无法购买这件服装。');
                                                      return;
                                                  }
                                                  onBuyClothing(item.id, item.name, item.desc, item.price);
                                              }}
                                              className="mt-1 w-full py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 active:scale-95 transition-all"
                                          >
                                              购买并放入背包
                                          </button>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  );
              })}
          </div>
      )}

      {/* --- Modals --- */}
      {(selectedLocation || selectedFacility) && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in">
              <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-slide-up max-h-[90vh] flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                          {selectedLocation ? `前往 ${selectedLocation.name}?` : `体验 ${selectedFacility?.name}?`}
                      </h3>
                  
                  {/* 电影类型选择（仅购票处） */}
                  {selectedFacility?.movieTypes && (
                      <>
                          <div className="mb-4">
                              <p className="text-sm text-gray-600 mb-2">选择电影类型：</p>
                              <div className="grid grid-cols-2 gap-2">
                                  {selectedFacility.movieTypes.map((type) => (
                                      <button
                                          key={type}
                                          onClick={() => {
                                              setSelectedMovieType(type);
                                              setSelectedSeatType(null); // 重置座位类型选择
                                          }}
                                          className={`py-2 px-4 rounded-xl font-bold text-sm transition-all ${
                                              selectedMovieType === type
                                                  ? 'bg-purple-500 text-white shadow-lg'
                                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                          }`}
                                      >
                                          {type}
                                      </button>
                                  ))}
                              </div>
                          </div>
                          
                          {/* 座位类型选择（仅购票处，且已选择电影类型） */}
                          {selectedMovieType && (
                              <div className="mb-4">
                                  <p className="text-sm text-gray-600 mb-2">选择座位类型：</p>
                                  <div className="grid grid-cols-3 gap-2">
                                      <button
                                          onClick={() => setSelectedSeatType('normal')}
                                          className={`py-2 px-3 rounded-xl font-bold text-sm transition-all ${
                                              selectedSeatType === 'normal'
                                                  ? 'bg-blue-500 text-white shadow-lg'
                                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                          }`}
                                      >
                                          普通座
                                      </button>
                                      <button
                                          onClick={() => setSelectedSeatType('vip')}
                                          className={`py-2 px-3 rounded-xl font-bold text-sm transition-all ${
                                              selectedSeatType === 'vip'
                                                  ? 'bg-purple-500 text-white shadow-lg'
                                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                          }`}
                                      >
                                          VIP座
                                      </button>
                                      <button
                                          onClick={() => setSelectedSeatType('couple')}
                                          className={`py-2 px-3 rounded-xl font-bold text-sm transition-all ${
                                              selectedSeatType === 'couple'
                                                  ? 'bg-pink-500 text-white shadow-lg'
                                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                          }`}
                                      >
                                          情侣座
                                      </button>
                                  </div>
                              </div>
                          )}
                          
                          {/* 价格显示（仅购票处，且已选择座位类型） */}
                          {selectedSeatType && (
                              <div className="mb-4 p-3 bg-orange-50 rounded-xl border border-orange-200">
                                  <div className="text-sm text-gray-600 mb-1">费用：</div>
                                  <div className="text-lg font-bold text-orange-600">
                                      {(() => {
                                          const seatPrices = {
                                              'normal': 100,
                                              'vip': 200,
                                              'couple': 300
                                          };
                                          const basePrice = seatPrices[selectedSeatType];
                                          return `独自 ¥${basePrice} / 和温婉一起 ¥${basePrice * 2}`;
                                      })()}
                                  </div>
                              </div>
                          )}
                      </>
                  )}
                  
                  {/* 价格显示（非购票处） */}
                  {selectedFacility?.price && !selectedFacility.movieTypes && (
                      <div className="mb-4 p-3 bg-orange-50 rounded-xl border border-orange-200">
                          <div className="text-sm text-gray-600 mb-1">费用：</div>
                          <div className="text-lg font-bold text-orange-600">
                              {selectedFacility.priceForTwo 
                                  ? `单人 ¥${selectedFacility.price} / 双人 ¥${selectedFacility.priceForTwo}`
                                  : `¥${selectedFacility.price}/人`}
                          </div>
                      </div>
                  )}
                  
                  <p className="text-gray-500 text-sm mb-6">
                      {selectedLocation ? "室外移动将消耗较多时间。" : "这将触发特殊剧情互动。"}
                  </p>
                  
                  <div className="space-y-3">
                      {canInviteSister && (
                          <button 
                            onClick={() => selectedLocation ? confirmMove(true) : confirmFacilityAction(true)}
                            disabled={selectedFacility?.movieTypes && (!selectedMovieType || !selectedSeatType)}
                            className={`w-full py-3 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 ${
                                selectedFacility?.movieTypes && (!selectedMovieType || !selectedSeatType)
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-pink-500 hover:bg-pink-600 shadow-pink-200'
                            }`}
                          >
                              <Users size={18} />
                              {selectedLocation ? "邀请温婉一起去" : "和温婉一起玩"}
                          </button>
                      )}
                      
                      <button 
                        onClick={() => selectedLocation ? confirmMove(false) : confirmFacilityAction(false)}
                        disabled={selectedFacility?.movieTypes && (!selectedMovieType || !selectedSeatType)}
                        className={`w-full py-3 rounded-xl font-bold text-white shadow-lg ${
                            selectedFacility?.movieTypes && (!selectedMovieType || !selectedSeatType)
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                        }`}
                      >
                          {selectedLocation ? "独自前往" : "独自进行"}
                      </button>
                      
                      <button 
                        onClick={() => { 
                            setSelectedLocation(null); 
                            setSelectedFacility(null); 
                            setSelectedMovieType(null);
                            setSelectedSeatType(null);
                        }}
                        className="w-full py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200"
                      >
                          取消
                      </button>
                  </div>
                  </div>
              </div>
          </div>
      )}

      {/* 睡觉确认弹窗 */}
      {showSleepConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-800 mb-4">睡觉</h3>
            <p className="text-gray-600 mb-6">选择你的行动：</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  if (onSleep) onSleep();
                  setShowSleepConfirm(false);
                }}
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700"
              >
                睡觉
              </button>
              <button
                onClick={() => setShowSleepConfirm(false)}
                className="w-full py-2 text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 次卧选项弹窗（潜入后让玩家自己决定做什么） */}
      {showGuestRoomOptions && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-800 mb-4">次卧（温婉的房间）</h3>
            <p className="text-gray-600 mb-6">你已经潜入妹妹的房间，现在可以自由行动。在对话中输入你想做的事情。</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  if (onEnterGuestRoom) onEnterGuestRoom();
                  setShowGuestRoomOptions(false);
                }}
                className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700"
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
    </div>
  );
};

// --- Wallet App ---
export const WalletApp: React.FC<AppProps> = ({ onClose, walletBalance = 5000, walletTransactions = [] }) => {
     return (
        <div className="flex flex-col h-full bg-gray-900 text-white">
             <Header title="钱包" onClose={onClose} />
             <div className="p-6">
                 <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-4 opacity-10"><Wallet size={100} /></div>
                     <div className="text-gray-400 text-sm font-medium mb-1">总资产 (CNY)</div>
                     <div className="text-4xl font-bold tracking-tight mb-8">¥ {walletBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                     <div className="flex gap-4">
                         <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg text-sm font-medium backdrop-blur-sm"><Zap size={16} className="text-yellow-400"/> 充值</div>
                         <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg text-sm font-medium backdrop-blur-sm"><CardIcon size={16} className="text-blue-400"/> 银行卡</div>
                     </div>
                 </div>
             </div>
             <div className="flex-1 bg-white rounded-t-3xl text-gray-900 p-6 overflow-y-auto">
                 <h3 className="font-bold text-lg mb-4">近期交易</h3>
                 {walletTransactions.length === 0 ? (
                     <div className="text-center py-10 text-gray-400">
                         <ShoppingBag size={48} className="mx-auto mb-2 opacity-30" />
                         <p className="text-sm">暂无交易记录</p>
                     </div>
                 ) : (
                     <div className="space-y-4">
                         {walletTransactions.map((t) => (
                             <div key={t.id} className="flex justify-between items-center">
                                 <div className="flex gap-3 items-center">
                                     <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                         t.type === 'expense' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                                     }`}>
                                         <ShoppingBag size={20}/>
                                     </div>
                                     <div>
                                         <div className="font-bold text-sm">{t.name}</div>
                                         <div className="text-xs text-gray-400">{t.date}</div>
                                     </div>
                                 </div>
                                 <span className={`font-bold ${
                                     t.type === 'expense' ? 'text-red-600' : 'text-green-600'
                                 }`}>
                                     {t.type === 'expense' ? '-' : '+'}¥{t.price.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                 </span>
                             </div>
                         ))}
                     </div>
                 )}
             </div>
        </div>
     );
};

// --- Calendar App (Updated with Dynamic Memory) ---
export const CalendarApp: React.FC<AppProps> = ({ 
    onClose, 
    calendarEvents = [], 
    gameTime,
    onSkipToday,
    onSkipOneHour,
    onSkipThreeHours,
    onSkipSixHours,
    onSkipTwoDays,
    onSkipWeek,
    todaySummary
}) => {
    const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    // 格式化时间显示
    const formatTime = (time: GameTime | undefined) => {
        if (!time) return '下午6点30分';
        const period = time.hour < 12 ? '上午' : time.hour < 18 ? '下午' : '晚上';
        const displayHour = time.hour > 12 ? time.hour - 12 : time.hour === 0 ? 12 : time.hour;
        return `${period}${displayHour}点${time.minute === 0 ? '' : time.minute + '分'}`;
    };
    
    // 获取天气图标
    const getWeatherIcon = (condition: string) => {
        if (condition.includes('暴雨') || condition.includes('雨')) return <CloudRain size={32} className="text-blue-100" />;
        if (condition.includes('晴')) return <Sun size={32} className="text-yellow-100" />;
        return <Cloud size={32} className="text-blue-100" />;
    };
    
    const currentTime = gameTime || {
        year: 2025,
        month: 1,
        day: 14,
        weekday: 2,
        hour: 18,
        minute: 30,
        weather: { condition: '暴雨', temperature: 3, wind: '3级西北风', humidity: 85 }
    };
    
    return (
        <div className="flex flex-col h-full bg-white">
            <Header title="日历" onClose={onClose} rightIcon={<CalendarIcon size={20} className="text-red-500 mr-2"/>} />
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="flex justify-between items-end border-b pb-4">
                    <div>
                        <div className="text-red-500 font-bold uppercase text-sm">今日</div>
                        <div className="text-5xl font-bold text-gray-900">{currentTime.day}</div>
                        <div className="text-sm text-gray-500 mt-1">{currentTime.year}年{currentTime.month}月</div>
                    </div>
                    <div className="text-gray-500 font-medium mb-1 text-right">
                        <div className="text-lg">{weekdayNames[currentTime.weekday]}</div>
                        <div className="text-sm">{formatTime(currentTime)}</div>
                    </div>
                </div>

                {/* Weather Widget */}
                <div className="bg-blue-500 text-white rounded-2xl p-4 shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="text-blue-100 font-medium text-sm">当前天气</div>
                            <div className="text-3xl font-bold mt-1">{currentTime.weather.temperature}°C</div>
                            <div className="text-blue-100 text-sm mt-1">{currentTime.weather.condition}</div>
                        </div>
                        {getWeatherIcon(currentTime.weather.condition)}
                    </div>
                    <div className="mt-4 flex gap-4 text-sm font-medium text-blue-100">
                        {currentTime.weather.wind && (
                            <span className="flex items-center gap-1"><Wind size={14}/> {currentTime.weather.wind}</span>
                        )}
                        {currentTime.weather.humidity && (
                            <span className="flex items-center gap-1"><Thermometer size={14}/> 湿度 {currentTime.weather.humidity}%</span>
                        )}
                    </div>
                </div>

                {/* Skip Time Buttons */}
                <div className="space-y-2">
                    <div className="text-xs font-bold text-gray-500 uppercase mb-2">时间控制</div>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={onSkipToday}
                            className="bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all rounded-xl p-3 text-xs font-bold text-gray-700 flex flex-col items-center gap-1"
                        >
                            <Clock size={16} />
                            <span>30分钟</span>
                        </button>
                        <button
                            onClick={onSkipOneHour}
                            className="bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all rounded-xl p-3 text-xs font-bold text-gray-700 flex flex-col items-center gap-1"
                        >
                            <Clock size={16} />
                            <span>1小时</span>
                        </button>
                        <button
                            onClick={onSkipThreeHours}
                            className="bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all rounded-xl p-3 text-xs font-bold text-gray-700 flex flex-col items-center gap-1"
                        >
                            <Clock size={16} />
                            <span>3小时</span>
                        </button>
                        <button
                            onClick={onSkipSixHours}
                            className="bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all rounded-xl p-3 text-xs font-bold text-gray-700 flex flex-col items-center gap-1"
                        >
                            <Clock size={16} />
                            <span>6小时</span>
                        </button>
                        <button
                            onClick={onSkipTwoDays}
                            className="bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all rounded-xl p-3 text-xs font-bold text-gray-700 flex flex-col items-center gap-1"
                        >
                            <Clock size={16} />
                            <span>跳过1天</span>
                        </button>
                        <button
                            onClick={onSkipWeek}
                            className="bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all rounded-xl p-3 text-xs font-bold text-gray-700 flex flex-col items-center gap-1"
                        >
                            <Clock size={16} />
                            <span>跳过3天</span>
                        </button>
                    </div>
                </div>

                {/* Today Summary */}
                {todaySummary && (
                    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-4 border border-yellow-200">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles size={16} className="text-yellow-600"/>
                            <h3 className="font-bold text-gray-900 text-sm">今日总结</h3>
                        </div>
                        <p className="text-xs text-gray-700 leading-relaxed">{todaySummary}</p>
                    </div>
                )}

                {/* Events / Memory Lane */}
                <div>
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <Sparkles size={16} className="text-yellow-500"/> 今日记忆
                    </h3>
                    
                    {calendarEvents.length === 0 ? (
                        <div className="py-10 text-center flex flex-col items-center opacity-50">
                            <Cloud size={48} className="text-gray-300 mb-2"/>
                            <p className="text-sm text-gray-400">今天还没有发生特别的事情...</p>
                            <p className="text-xs text-gray-300 mt-1">去带温婉出去玩玩吧？</p>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-fade-in">
                            {calendarEvents.map((event) => (
                                <div key={event.id} className={`flex gap-3 border-l-4 ${event.color} pl-4 py-1 relative`}>
                                    <div className="text-gray-400 text-xs font-bold w-12 flex-shrink-0 pt-0.5">{event.time}</div>
                                    <div>
                                        <div className="font-bold text-sm text-gray-800">{event.title}</div>
                                        <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{event.description}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Save App (Save/Load Game) ---
export const SaveApp: React.FC<AppProps> = ({ 
    onClose, 
    gameTime,
    messages = [],
    bodyStatus,
    userLocation,
    tweets = [],
    calendarEvents = [],
    todaySummary = '',
    onSaveGame,
    onLoadGame
}) => {
    const [saves, setSaves] = useState<(GameSave | null)[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
    const [saveName, setSaveName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showLoadDialog, setShowLoadDialog] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [importSlot, setImportSlot] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // 加载所有存档
        setSaves(getAllSaves());
    }, []);

    const handleSave = (slotId: number) => {
        if (slotId === 0) {
            // 自动存档，直接保存
            if (onSaveGame) {
                onSaveGame(slotId);
                setSaves(getAllSaves());
                alert('自动存档成功！');
            }
        } else {
            // 手动存档，显示输入框
            setSelectedSlot(slotId);
            setSaveName('');
            setShowSaveDialog(true);
        }
    };

    const handleConfirmSave = () => {
        if (selectedSlot !== null && onSaveGame) {
            onSaveGame(selectedSlot, saveName || undefined);
            setSaves(getAllSaves());
            setShowSaveDialog(false);
            setSelectedSlot(null);
            setSaveName('');
            alert('存档成功！');
        }
    };

    const handleLoad = (slotId: number) => {
        const save = loadGame(slotId);
        if (save && onLoadGame) {
            onLoadGame(slotId);
            onClose();
        } else {
            alert('该存档槽位为空！');
        }
    };

    const handleDelete = (slotId: number) => {
        if (confirm('确定要删除这个存档吗？')) {
            deleteSave(slotId);
            setSaves(getAllSaves());
            alert('存档已删除！');
        }
    };

    const handleExport = (slotId: number) => {
        const success = exportSave(slotId);
        if (success) {
            alert('存档导出成功！');
        } else {
            alert('导出失败！该存档槽位为空。');
        }
    };

    const handleImportClick = (slotId: number) => {
        setImportSlot(slotId);
        setShowImportDialog(true);
        // 触发文件选择
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            setShowImportDialog(false);
            setImportSlot(null);
            return;
        }

        if (!file.name.endsWith('.json')) {
            alert('请选择JSON格式的存档文件！');
            setShowImportDialog(false);
            setImportSlot(null);
            return;
        }

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const fileContent = e.target?.result as string;
                    const data = JSON.parse(fileContent);
                    
                    // 检查是否是批量存档文件（包含saves数组）
                    if (data.saves && Array.isArray(data.saves)) {
                        // 批量导入
                        let importedCount = 0;
                        for (const saveData of data.saves) {
                            // 尝试找到空槽位，或使用原槽位（如果可用）
                            let targetSlot = saveData.id !== undefined ? saveData.id : null;
                            
                            // 如果原槽位已被占用，找第一个空槽位
                            if (targetSlot === null || saves[targetSlot] !== null) {
                                targetSlot = saves.findIndex(s => s === null);
                                if (targetSlot === -1) {
                                    // 没有空槽位，询问用户是否覆盖
                                    if (!confirm(`没有空槽位，是否覆盖槽位${saveData.id || 0}的存档？`)) {
                                        continue;
                                    }
                                    targetSlot = saveData.id || 0;
                                }
                            }
                            
                            if (targetSlot !== null && targetSlot !== -1) {
                                const existingSave = saves[targetSlot];
                                if (existingSave && !confirm(`槽位${targetSlot}已有存档，确定要覆盖吗？`)) {
                                    continue;
                                }
                                
                                const importedSave: GameSave = {
                                    ...saveData,
                                    messages: saveData.messages.map((msg: Message) => ({
                                        ...msg,
                                        timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)
                                    }))
                                };
                                
                                if (saveImportedGame(targetSlot, importedSave)) {
                                    importedCount++;
                                }
                            }
                        }
                        setSaves(getAllSaves());
                        alert(`成功导入 ${importedCount} 个存档！`);
                    } else {
                        // 单个存档导入
                        if (importSlot === null) {
                            // 如果没有指定槽位，找第一个空槽位
                            const emptySlot = saves.findIndex(s => s === null);
                            if (emptySlot === -1) {
                                alert('没有空槽位！请先删除一个存档或选择一个槽位覆盖。');
                                setShowImportDialog(false);
                                setImportSlot(null);
                                if (fileInputRef.current) {
                                    fileInputRef.current.value = '';
                                }
                                return;
                            }
                            setImportSlot(emptySlot);
                        }
                        
                        const result = await importSave(file);
                        if (result.success && result.save && importSlot !== null) {
                            // 显示确认对话框，让用户选择是否覆盖
                            const existingSave = saves[importSlot];
                            if (existingSave) {
                                if (!confirm(`槽位${importSlot}已有存档，确定要覆盖吗？`)) {
                                    setShowImportDialog(false);
                                    setImportSlot(null);
                                    if (fileInputRef.current) {
                                        fileInputRef.current.value = '';
                                    }
                                    return;
                                }
                            }
                            
                            // 保存导入的存档
                            const success = saveImportedGame(importSlot, result.save);
                            if (success) {
                                setSaves(getAllSaves());
                                alert('存档导入成功！');
                            } else {
                                alert('导入存档失败！');
                            }
                        } else {
                            alert(result.error || '导入存档失败！');
                        }
                    }
                } catch (parseError) {
                    alert('文件格式不正确！请确保是有效的存档文件。');
                }
                
                setShowImportDialog(false);
                setImportSlot(null);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            };
            reader.readAsText(file);
        } catch (error) {
            alert('读取文件失败！');
            setShowImportDialog(false);
            setImportSlot(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const formatSaveTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <Header title="存档管理" onClose={onClose} rightIcon={<Save size={20} className="text-blue-500 mr-2"/>} />
            {/* 导出/导入按钮 */}
            <div className="px-4 py-2 border-b border-gray-200 flex gap-2">
                <button
                    onClick={() => {
                        // 导出所有存档（打包成一个文件）
                        const allSaves = getAllSaves();
                        const nonEmptySaves = allSaves.filter((save, index) => save !== null);
                        if (nonEmptySaves.length === 0) {
                            alert('没有可导出的存档！');
                            return;
                        }
                        const exportData = {
                            version: '1.0',
                            exportTime: new Date().toISOString(),
                            saves: nonEmptySaves
                        };
                        const json = JSON.stringify(exportData, null, 2);
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `wenwan_all_saves_${Date.now()}.json`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                        alert('所有存档导出成功！');
                    }}
                    className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <Download size={14} />
                    导出所有存档
                </button>
                <button
                    onClick={() => {
                        // 导入存档文件
                        if (fileInputRef.current) {
                            fileInputRef.current.click();
                        }
                    }}
                    className="flex-1 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <Upload size={14} />
                    导入存档
                </button>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
            />
            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-3">
                    {saves.map((save, index) => (
                        <div 
                            key={index}
                            className={`border-2 rounded-xl p-3 transition-all ${
                                save 
                                    ? 'border-blue-200 bg-blue-50/50 hover:bg-blue-50' 
                                    : 'border-gray-200 bg-gray-50/50 hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                    <div className="font-bold text-sm text-gray-800 mb-1">
                                        {index === 0 ? '自动存档' : `存档 ${index}`}
                                    </div>
                                    {save ? (
                                        <>
                                            <div className="text-xs text-gray-600 mb-1">{save.name}</div>
                                            <div className="text-xs text-gray-400">
                                                {formatSaveTime(save.timestamp)}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {save.gameTime.year}年{save.gameTime.month}月{save.gameTime.day}日
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-xs text-gray-400">空存档</div>
                                    )}
                                </div>
                                {save && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(index);
                                        }}
                                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={() => handleSave(index)}
                                    className="flex-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors"
                                >
                                    保存
                                </button>
                                {save && (
                                    <>
                                        <button
                                            onClick={() => handleLoad(index)}
                                            className="flex-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition-colors"
                                        >
                                            读取
                                        </button>
                                        <button
                                            onClick={() => handleExport(index)}
                                            className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-lg transition-colors"
                                            title="导出存档"
                                        >
                                            <Download size={14} />
                                        </button>
                                    </>
                                )}
                                {!save && (
                                    <button
                                        onClick={() => handleImportClick(index)}
                                        className="flex-1 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                                        title="导入存档到此槽位"
                                    >
                                        <Upload size={14} />
                                        导入
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 保存对话框 */}
            {showSaveDialog && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4">
                        <h3 className="font-bold text-lg mb-4">保存游戏</h3>
                        <input
                            type="text"
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            placeholder="存档名称（留空使用默认）"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    handleConfirmSave();
                                }
                            }}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleConfirmSave}
                                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-colors"
                            >
                                确认
                            </button>
                            <button
                                onClick={() => {
                                    setShowSaveDialog(false);
                                    setSelectedSlot(null);
                                    setSaveName('');
                                }}
                                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition-colors"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Backpack App ---
export const BackpackApp: React.FC<AppProps> = ({ onClose, backpackItems = [], onGiftClothing, onUseItem, onGiftItem, unlockedOutfits = [] }) => {
    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-amber-50 to-orange-50">
            <Header title="背包" onClose={onClose} rightIcon={<Backpack size={20} className="text-orange-500 mr-2"/>} />
            <div className="flex-1 overflow-y-auto p-4">
                {backpackItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <Backpack size={64} className="text-gray-300 mb-4 opacity-50" />
                        <p className="text-gray-400 text-lg font-bold">背包是空的</p>
                        <p className="text-gray-300 text-sm mt-2">购买的商品会显示在这里</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {backpackItems.map((item) => (
                            <div 
                                key={item.id}
                                className="bg-white rounded-xl p-4 shadow-sm border border-orange-100 hover:shadow-md transition-all space-y-2"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                                        <Gift size={24} className="text-orange-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-gray-800 text-sm mb-1 line-clamp-1">{item.name}</h3>
                                        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{item.description}</p>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-gray-400">¥{item.price}</span>
                                            <span className="text-xs text-gray-400">{item.date}</span>
                                        </div>
                                        {/* 服装类物品：赠送按钮 */}
                                        {item.type === 'clothing' && onGiftClothing && (
                                          <button
                                            onClick={() => onGiftClothing(item.outfitId || '', item.id)}
                                            disabled={!item.outfitId}
                                            className="w-full mt-1 py-1.5 text-[11px] font-bold rounded-full text-white bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                          >
                                            赠送给温婉（解锁立绘）
                                          </button>
                                        )}
                                        {/* 普通物品（情趣用品等）：使用和赠送按钮 */}
                                        {item.type === 'item' && (
                                          <div className="flex gap-2 mt-1">
                                            {onUseItem && (
                                              <button
                                                onClick={() => onUseItem(item.id, item.name, item.description)}
                                                className="flex-1 py-1.5 text-[11px] font-bold rounded-full text-white bg-purple-500 hover:bg-purple-600 active:scale-95 transition-all"
                                              >
                                                使用
                                              </button>
                                            )}
                                            {onGiftItem && (
                                              <button
                                                onClick={() => onGiftItem(item.id, item.name, item.description)}
                                                className="flex-1 py-1.5 text-[11px] font-bold rounded-full text-white bg-pink-500 hover:bg-pink-600 active:scale-95 transition-all"
                                              >
                                                赠送
                                              </button>
                                            )}
                                          </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- 3. Monitor App (Updated with Leveling System) ---

// Level Logic
const getLevel = (count: number) => {
    if (count >= 350) return 3;
    if (count >= 150) return 2;
    if (count >= 50) return 1;
    return 0;
};

// Image Config (Lv0-Lv3)
const bodyPartImages: Record<string, Record<number, string>> = {
    'mouth': {
        0: 'https://files.catbox.moe/a9dbuf.png',
        1: 'https://files.catbox.moe/93k111.png', 
        2: 'https://files.catbox.moe/b93s97.png', 
        3: 'https://files.catbox.moe/bacose.png', 
    },
    'chest': {
        0: 'https://files.catbox.moe/rsy8vq.png',
        1: 'https://files.catbox.moe/k0k5br.png',
        2: 'https://files.catbox.moe/2ttvg8.png',
        3: 'https://files.catbox.moe/xfm5yg.png',
    },
    'nipples': {
        0: 'https://files.catbox.moe/wk2tro.png',
        1: 'https://files.catbox.moe/1pma7e.png',
        2: 'https://files.catbox.moe/2gycfi.png',
        3: 'https://files.catbox.moe/73vwup.png',
    },
    'groin': {
        0: 'https://files.catbox.moe/by5o34.png',
        1: 'https://files.catbox.moe/pxfurj.png',
        2: 'https://files.catbox.moe/7w25vn.png',
        3: 'https://files.catbox.moe/8pc2zz.png',
    },
    'posterior': {
        0: 'https://files.catbox.moe/mq1g5j.png',
        1: 'https://files.catbox.moe/z32yb9.png',
        2: 'https://files.catbox.moe/t0r20d.png',
        3: 'https://files.catbox.moe/ds9ww7.png',
    },
    'feet': {
        0: 'https://files.catbox.moe/ue3u3x.png',
        1: 'https://files.catbox.moe/m61372.png',
        2: 'https://files.catbox.moe/polnew.png',
        3: 'https://files.catbox.moe/wb12yr.png',
    },
};

const BodyPartCard = ({ label, part, onClick, partKey }: { label: string, part: BodyPartStatus, onClick: () => void, partKey: string }) => {
    const level = getLevel(part.usageCount || 0);
    
    return (
        <div 
            onClick={onClick}
            className="bg-white/60 p-3 rounded-xl border border-pink-100 shadow-sm backdrop-blur-sm animate-fade-in cursor-pointer hover:bg-white/90 active:scale-95 transition-all"
        >
            <div className="flex justify-between items-center mb-1">
                <span className="text-pink-800 font-bold text-sm">{label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${level === 3 ? 'bg-red-500 text-white' : 'bg-pink-50 text-pink-400'}`}>
                    Lv.{level}
                </span>
            </div>
            <div className="text-xs text-gray-600 mb-1">使用: <span className="text-pink-600 font-mono">{part.usageCount || 0}</span>次</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
                <ShoppingBag size={10} />
                <span className="truncate max-w-[80px]">{part.clothing}</span>
            </div>
            
            {/* Level Progress Bar (Visual only, relative to next level) */}
            <div className="mt-2 h-1.5 w-full bg-pink-100 rounded-full overflow-hidden">
                {/* 
                   Simple visualization: 
                   Lv0: 0-49 -> % of 50
                   Lv1: 50-149 -> % of 100
                   Lv2: 150-349 -> % of 200
                   Lv3: 350+ -> Full
                */}
                <div className="h-full bg-pink-400 transition-all duration-500" style={{ 
                    width: `${
                        level === 0 ? (part.usageCount / 50) * 100 :
                        level === 1 ? ((part.usageCount - 50) / 100) * 100 :
                        level === 2 ? ((part.usageCount - 150) / 200) * 100 :
                        100
                    }%` 
                }}></div>
            </div>
        </div>
    );
}

const BodyPartDetailModal = ({ label, part, onClose, partKey }: { label: string, part: BodyPartStatus, onClose: () => void, partKey: string }) => {
    const level = getLevel(part.usageCount || 0);
    const imageUrl = bodyPartImages[partKey]?.[level] || bodyPartImages[partKey]?.[0];

    return (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white rounded-3xl p-0 w-full shadow-2xl animate-slide-up overflow-hidden flex flex-col max-h-[85%]">
                 <div className="h-64 bg-gray-100 relative flex items-center justify-center overflow-hidden group">
                     {/* Detail Image */}
                     {imageUrl ? (
                         <img src={imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={label} />
                     ) : (
                         <span className="text-gray-400">无图片</span>
                     )}
                     
                     <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/60 to-transparent"></div>
                     <div className="absolute bottom-4 left-4 text-white">
                         <h3 className="text-2xl font-bold">{label}</h3>
                         <div className="flex gap-2 items-center">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${level === 3 ? 'bg-red-500' : 'bg-pink-500'}`}>Lv.{level}</span>
                            <span className="text-xs opacity-80">累计使用 {part.usageCount || 0} 次</span>
                         </div>
                     </div>

                     <button onClick={onClose} className="absolute top-4 right-4 bg-black/30 p-2 rounded-full text-white hover:bg-black/50 backdrop-blur-md">
                         <X size={20} />
                     </button>
                 </div>
                 
                 <div className="p-6 overflow-y-auto flex-1">
                     <div className="space-y-5">
                         <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                             <div className="text-xs text-gray-400 uppercase font-bold mb-2">当前状态</div>
                             <div className="flex flex-col gap-2">
                                 <div>
                                     <span className="text-xs text-gray-400 block">外观描述</span>
                                     <span className="font-bold text-gray-800 text-sm">{part.status}</span>
                                 </div>
                                 <div className="h-px bg-gray-200 w-full"></div>
                                 <div>
                                     <span className="text-xs text-gray-400 block">穿戴物品</span>
                                     <span className="font-bold text-gray-800 text-sm">{part.clothing}</span>
                                 </div>
                             </div>
                         </div>
    
                         <div>
                             <div className="text-xs text-pink-400 uppercase font-bold mb-2 flex items-center gap-1">
                                 <User size={12} /> 上一次被谁使用
                             </div>
                             <p className="text-gray-800 font-bold text-base leading-relaxed border-l-2 border-pink-300 pl-3">
                                 {part.lastUsedBy || "无"}
                             </p>
                         </div>
    
                         <div>
                             <div className="text-xs text-pink-400 uppercase font-bold mb-2 flex items-center gap-1">
                                 <Activity size={12} /> 开发记录 / 使用过程
                             </div>
                             <p className="text-gray-600 text-sm leading-relaxed bg-pink-50/50 p-3 rounded-lg border border-pink-100/50">
                                 {part.usageProcess || "暂无记录"}
                             </p>
                         </div>
                     </div>
                 </div>
            </div>
        </div>
    );
}

export const MonitorApp: React.FC<AppProps> = ({ status, onClose }) => {
    const [isDeepDataOpen, setIsDeepDataOpen] = useState(false);
    const [isRealTimeOpen, setIsRealTimeOpen] = useState(false);
    // Include partKey in state
    const [selectedPart, setSelectedPart] = useState<{label: string, data: BodyPartStatus, key: string} | null>(null);

    if (!status) return null;
    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-pink-50 to-rose-100 font-sans relative overflow-hidden">
            <div className="px-5 py-4 bg-white/70 backdrop-blur flex justify-between items-center shadow-sm z-10">
                <div className="flex items-center gap-2">
                    <Heart className="text-pink-500 fill-pink-500 animate-pulse" size={20} />
                    <h1 className="text-lg font-bold text-pink-800">温婉的身体日记</h1>
                </div>
                <button onClick={onClose} className="text-pink-400 hover:text-pink-600 transition-colors">
                    <X size={24} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar z-10 pb-20">
                
                {/* Stats Card */}
                <div className="bg-white/80 rounded-2xl p-5 shadow-sm border border-pink-100 flex flex-col gap-4">
                    {/* Favorability */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <Smile className="text-pink-500" size={16} />
                                <span className="text-pink-900 font-bold text-sm">对哥哥的好感度</span>
                            </div>
                            <span className="text-lg font-bold text-pink-600">{status.favorability}</span>
                        </div>
                        <div className="h-2 w-full bg-pink-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-pink-300 to-red-400" style={{ width: `${status.favorability}%` }}></div>
                        </div>
                    </div>

                    {/* Libido */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <Flame className="text-purple-500" size={16} />
                                <span className="text-purple-900 font-bold text-sm">性欲值 (Libido)</span>
                            </div>
                            <span className="text-lg font-bold text-purple-600">{status.libido}</span>
                        </div>
                        <div className="h-2 w-full bg-purple-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-300 to-fuchsia-500" style={{ width: `${status.libido}%` }}></div>
                        </div>
                    </div>

                     {/* Degradation (New) */}
                     <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <ChevronsDown className="text-gray-800" size={16} />
                                <span className="text-gray-800 font-bold text-sm">堕落值 (Degradation)</span>
                            </div>
                            <span className="text-lg font-bold text-gray-800">{status.degradation || 0}</span>
                        </div>
                        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-gray-700 to-black" style={{ width: `${status.degradation || 0}%` }}></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-2">
                        <div className="bg-pink-50 rounded-xl p-3 text-center">
                            <div className="text-xs text-pink-400 mb-1">心率</div>
                            <div className="text-xl font-bold text-pink-700">{status.heartRate} <span className="text-xs font-normal">BPM</span></div>
                        </div>
                        <div className="bg-pink-50 rounded-xl p-3 text-center">
                            <div className="text-xs text-pink-400 mb-1">当前兴奋</div>
                            <div className="text-xl font-bold text-pink-700">{status.arousal}%</div>
                        </div>
                    </div>
                </div>

                {/* Current Outfit */}
                <div className="bg-white/80 rounded-2xl p-4 shadow-sm border border-pink-100">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-pink-100 rounded-lg text-pink-500"><User size={20}/></div>
                        <div>
                            <div className="text-sm font-bold text-pink-900">此时穿搭</div>
                            <div className="text-sm text-gray-600 mt-1 leading-relaxed">{status.overallClothing}</div>
                        </div>
                    </div>
                </div>

                {/* Collapsible Deep Data */}
                <div className="bg-white/40 rounded-2xl border border-pink-100 overflow-hidden transition-all duration-300">
                    <button 
                        onClick={() => setIsDeepDataOpen(!isDeepDataOpen)}
                        className="w-full p-4 flex items-center justify-between bg-white/60 hover:bg-white/80 transition-colors"
                    >
                        <div className="flex items-center gap-2 text-pink-800 font-bold">
                             <Eye size={18} /> 深度数据
                        </div>
                        <div className="text-pink-400">
                            {isDeepDataOpen ? <ChevronUp size={20} /> : <EyeOff size={18} />}
                        </div>
                    </button>
                    {isDeepDataOpen && (
                        <div className="p-4 grid grid-cols-2 gap-3 bg-white/30">
                            <BodyPartCard label="口腔" partKey="mouth" part={status.mouth} onClick={() => setSelectedPart({label: '口腔', key: 'mouth', data: status.mouth})} />
                            <BodyPartCard label="胸部" partKey="chest" part={status.chest} onClick={() => setSelectedPart({label: '胸部', key: 'chest', data: status.chest})} />
                            <BodyPartCard label="乳头" partKey="nipples" part={status.nipples} onClick={() => setSelectedPart({label: '乳头', key: 'nipples', data: status.nipples})} />
                            <BodyPartCard label="私处" partKey="groin" part={status.groin} onClick={() => setSelectedPart({label: '私处', key: 'groin', data: status.groin})} />
                            <BodyPartCard label="后庭" partKey="posterior" part={status.posterior} onClick={() => setSelectedPart({label: '后庭', key: 'posterior', data: status.posterior})} />
                            <BodyPartCard label="足部" partKey="feet" part={status.feet} onClick={() => setSelectedPart({label: '足部', key: 'feet', data: status.feet})} />
                        </div>
                    )}
                </div>

                {/* Collapsible Real-time Reality (New) */}
                <div className="bg-white/40 rounded-2xl border border-pink-100 overflow-hidden transition-all duration-300">
                     <button 
                        onClick={() => setIsRealTimeOpen(!isRealTimeOpen)}
                        className="w-full p-4 flex items-center justify-between bg-white/60 hover:bg-white/80 transition-colors"
                    >
                        <div className="flex items-center gap-2 text-pink-800 font-bold">
                             <Activity size={18} /> 当下真实
                        </div>
                        <div className="text-pink-400">
                            {isRealTimeOpen ? <ChevronUp size={20} /> : <EyeOff size={18} />}
                        </div>
                    </button>
                    {isRealTimeOpen && (
                        <div className="p-4 space-y-4 bg-white/30 animate-fade-in">
                            <div>
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                                    <User size={10} /> 正在做...
                                </h4>
                                <p className="text-sm text-gray-800 leading-relaxed bg-white/50 p-3 rounded-xl border border-white/50 shadow-sm">
                                    {status.currentAction || "（正安静地待着...）"}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                                    <Brain size={10} /> 内心OS
                                </h4>
                                <div className="text-sm text-pink-600 leading-relaxed bg-pink-50/80 p-3 rounded-xl border border-pink-100 shadow-sm italic relative">
                                    <span className="absolute top-[-4px] left-2 text-xl text-pink-200">“</span>
                                    {status.innerThought || "（发呆中...）"}
                                    <span className="absolute bottom-[-10px] right-2 text-xl text-pink-200">”</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

            </div>
            
            {/* Overlay for Detail Modal */}
            {selectedPart && (
                <BodyPartDetailModal 
                    label={selectedPart.label} 
                    partKey={selectedPart.key}
                    part={selectedPart.data} 
                    onClose={() => setSelectedPart(null)} 
                />
            )}

            <div className="absolute top-20 right-[-20px] text-pink-200 opacity-50 transform rotate-12"><Heart size={100} fill="currentColor" /></div>
            <div className="absolute bottom-10 left-[-20px] text-pink-200 opacity-50 transform -rotate-12"><Sparkles size={80} /></div>
        </div>
    );
};
