import React from 'react';
import { Activity, Backpack, Calendar, Image, Map, MessageCircle, Twitter, Wallet, Settings, Save } from 'lucide-react';
import { AppID, GameTime, BackpackItem } from '../types';
import { BackpackApp, CalendarApp, MapsApp, MonitorApp, PhotosApp, SaveApp, SocialApp, TwitterApp, WalletApp } from './Apps';
import { isMobileDevice } from '../utils/deviceUtils';

// 手机界面组件 - 负责显示右侧的手机外观和内部应用
// 这是模拟真实手机外观的容器，包含状态栏、应用图标和应用内容
interface PhoneInterfaceProps {
    activeApp: AppID | null;
    onCloseApp: () => void;
    onSetActiveApp: (app: AppID) => void;
    onOpenSettings?: () => void; // 打开设置面板
    // 传递给各个App的props
    messages?: any[];
    tweets?: any[];
    bodyStatus?: any;
    userLocation?: any;
    sisterLocation?: any;
    onMoveUser?: (location: any, withSister: boolean, isFacility?: boolean, facilityName?: string) => void;
    onAction?: (text: string) => void;
    calendarEvents?: any[];
    gameTime?: GameTime;
    onSkipToday?: () => void;
    onSkipOneHour?: () => void;
    onSkipThreeHours?: () => void;
    onSkipSixHours?: () => void;
    onSkipTwoDays?: () => void;
    onSkipWeek?: () => void;
    todaySummary?: string;
    onSaveGame?: (slotId: number, customName?: string) => void;
    onLoadGame?: (slotId: number) => void;
    walletBalance?: number;
    walletTransactions?: Array<{id: string; name: string; price: number; date: string; type: 'expense' | 'income'}>;
    onSpendMoney?: (amount: number, item: string) => void;
    backpackItems?: BackpackItem[];
    onBuyItem?: (name: string, description: string, price: number) => void; // 现有通用购买（成人店等）
    onBuyClothing?: (outfitId: string, name: string, description: string, price: number) => void; // 奢侈品店购买服装
    onGiftClothing?: (outfitId: string, itemId: string) => void; // 背包中赠送服装
    onUseItem?: (itemId: string, name: string, description: string) => void; // 使用物品（情趣用品等）
    onGiftItem?: (itemId: string, name: string, description: string) => void; // 赠送物品给温婉
    unlockedOutfits?: string[]; // 已解锁服装
    onEarnMoney?: (amount: number, source: string) => void;
    onSleep?: () => void;
    onEnterGuestRoom?: () => void;
    onStealUnderwear?: () => void;
    status?: any;
    advance?: (minutes: number) => void; // 时间推进函数
}

export const PhoneInterface: React.FC<PhoneInterfaceProps> = ({
    activeApp,
    onCloseApp,
    onSetActiveApp,
    onOpenSettings,
    messages,
    tweets,
    bodyStatus,
    userLocation,
    sisterLocation,
    onMoveUser,
    onAction,
    calendarEvents,
    gameTime,
    onSkipToday,
    onSkipOneHour,
    onSkipThreeHours,
    onSkipSixHours,
    onSkipTwoDays,
    onSkipWeek,
    todaySummary,
    onSaveGame,
    onLoadGame,
    walletBalance,
    walletTransactions,
    onSpendMoney,
    backpackItems,
    onBuyItem,
    onBuyClothing,
    onGiftClothing,
    onUseItem,
    onGiftItem,
    unlockedOutfits,
    onEarnMoney,
    onSleep,
    onEnterGuestRoom,
    onStealUnderwear,
    status,
    advance
}) => {
    // 渲染手机主屏幕的应用网格
    const renderPhoneContent = () => {
        if (activeApp === AppID.HOME) {
            const gridApps = [
                { id: AppID.SOCIAL, name: '微聊', icon: <MessageCircle size={28} />, bg: 'bg-[#07C160]' },
                { id: AppID.TWITTER, name: 'X', icon: <Twitter size={28} />, bg: 'bg-black' },
                { id: AppID.PHOTOS, name: '照片', icon: <Image size={28} />, bg: 'bg-gradient-to-tr from-blue-400 to-purple-400' },
                { id: AppID.MAPS, name: '地图', icon: <Map size={28} />, bg: 'bg-green-600' },
                { id: AppID.WALLET, name: '钱包', icon: <Wallet size={28} />, bg: 'bg-black' },
                { id: AppID.BACKPACK, name: '背包', icon: <Backpack size={28} />, bg: 'bg-orange-500' },
                { id: AppID.MONITOR, name: '身体监控', icon: <Activity size={28} />, bg: 'bg-pink-500' },
                { id: AppID.CALENDAR, name: '日历', icon: <Calendar size={28} />, bg: 'bg-white text-black' },
                { id: AppID.SAVE, name: '存档', icon: <Save size={28} />, bg: 'bg-blue-500' },
                { id: AppID.SETTINGS, name: '设置', icon: <Settings size={28} />, bg: 'bg-gray-600' },
            ];
            return (
                <div className={`grid grid-cols-4 gap-x-3 gap-y-6 ${isMobile ? 'pt-12 px-4 pb-4' : 'pt-14 px-5'} min-h-full`}>
                    {gridApps.map((app, i) => (
                        <button 
                            key={i} 
                            onClick={() => {
                                // 如果是设置图标，直接打开设置面板
                                if (app.id === AppID.SETTINGS && onOpenSettings) {
                                    onOpenSettings();
                                } else {
                                    onSetActiveApp(app.id);
                                }
                            }}
                            className="flex flex-col items-center gap-1.5 group active:scale-90 transition-all duration-200"
                        >
                            <div className={`w-[3.6rem] h-[3.6rem] rounded-[1.4rem] ${app.bg} shadow-xl shadow-black/20 flex items-center justify-center text-white ring-2 ring-white/20 group-active:ring-white/40 transition-all duration-200 group-hover:scale-110`}>
                                {app.icon}
                            </div>
                            <span className="text-white text-[11px] font-semibold drop-shadow-lg tracking-wide group-active:opacity-70 transition-opacity">{app.name}</span>
                        </button>
                    ))}
                </div>
            );
        }

        // 根据选中的应用显示对应内容
        switch (activeApp) {
            case AppID.SOCIAL: 
                return <SocialApp onClose={onCloseApp} onAction={onAction} messages={messages} />;
            case AppID.TWITTER: 
                return <TwitterApp onClose={onCloseApp} tweets={tweets} />;
            case AppID.MONITOR: 
                return <MonitorApp status={bodyStatus} onClose={onCloseApp} />;
            case AppID.PHOTOS: 
                return <PhotosApp onClose={onCloseApp} />;
            case AppID.MAPS: 
                return <MapsApp 
                    onClose={onCloseApp} 
                    userLocation={userLocation}
                    sisterLocation={sisterLocation} 
                    onMoveUser={onMoveUser}
                    onSpendMoney={onSpendMoney}
                    onBuyItem={onBuyItem}
                    onEarnMoney={onEarnMoney}
                    onSleep={onSleep}
                    onEnterGuestRoom={onEnterGuestRoom}
                    onStealUnderwear={onStealUnderwear}
                    status={status}
                    walletBalance={walletBalance}
                    advance={advance}
                    onBuyClothing={onBuyClothing}
                />;
            case AppID.WALLET: 
                return <WalletApp 
                    onClose={onCloseApp}
                    walletBalance={walletBalance}
                    walletTransactions={walletTransactions}
                />;
            case AppID.BACKPACK:
                return (
                  <BackpackApp
                    onClose={onCloseApp}
                    backpackItems={backpackItems}
                    onGiftClothing={onGiftClothing}
                    onUseItem={onUseItem}
                    onGiftItem={onGiftItem}
                    unlockedOutfits={unlockedOutfits}
                  />
                );
            case AppID.CALENDAR: 
                return <CalendarApp 
                    onClose={onCloseApp} 
                    calendarEvents={calendarEvents}
                    gameTime={gameTime}
                    onSkipToday={onSkipToday}
                    onSkipOneHour={onSkipOneHour}
                    onSkipThreeHours={onSkipThreeHours}
                    onSkipSixHours={onSkipSixHours}
                    onSkipTwoDays={onSkipTwoDays}
                    onSkipWeek={onSkipWeek}
                    todaySummary={todaySummary}
                />;
            case AppID.SAVE:
                return <SaveApp
                    onClose={onCloseApp}
                    gameTime={gameTime}
                    messages={messages}
                    bodyStatus={bodyStatus}
                    userLocation={userLocation}
                    tweets={tweets}
                    calendarEvents={calendarEvents}
                    todaySummary={todaySummary}
                    onSaveGame={onSaveGame}
                    onLoadGame={onLoadGame}
                />;
            case AppID.SETTINGS:
                // 设置App会通过onOpenSettings回调打开设置面板
                // 注意：这个case实际上不会被执行，因为点击设置图标时会直接调用onOpenSettings
                // 但保留这个case以防万一
                if (onOpenSettings) {
                    onOpenSettings();
                    onCloseApp();
                }
                return null;
            default: 
                return null;
        }
    };

    // 检测是否为移动端
    const isMobile = isMobileDevice();
    
    return (
        <div className={`${isMobile ? 'w-full h-full' : 'w-[380px] shrink-0 h-full'} flex items-center justify-center relative z-20 animate-fade-in delay-200`} style={isMobile ? { 
          height: '100dvh', // 使用动态视口高度
          minHeight: '-webkit-fill-available' // iOS Safari支持
        } as React.CSSProperties : {}}>
            <div className={`relative ${isMobile ? 'w-full h-full rounded-none' : 'w-[360px] h-[780px] rounded-[3.5rem]'} bg-black shadow-[0_25px_60px_-10px_rgba(0,0,0,0.4)] ${isMobile ? 'border-0' : 'border-[8px] border-gray-800'} overflow-hidden ring-4 ring-gray-900/10`} style={isMobile ? { 
              height: '100dvh',
              minHeight: '-webkit-fill-available'
            } as React.CSSProperties : {}}>
                {/* 手机背景 */}
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center"></div>
                
                {/* 手机顶部刘海（仅桌面端显示） */}
                {!isMobile && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-black rounded-b-2xl z-50 flex justify-center items-center">
                        <div className="w-16 h-4 bg-black rounded-full flex items-center justify-end pr-1">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                        </div>
                    </div>
                )}
                
                {/* 状态栏 - 优化样式 */}
                <div className="absolute top-2 w-full px-6 flex justify-between text-white text-[12px] font-bold z-40 drop-shadow-lg">
                    <span className="text-white/95">9:41</span>
                    <div className="flex gap-1.5 items-center">
                        <Activity size={14} className="text-white/90" />
                        <div className="w-6 h-3.5 border border-white/90 rounded-[4px] flex items-center px-[1px] bg-white/10 backdrop-blur-sm">
                            <div className="w-full h-full bg-white rounded-[2px]"></div>
                        </div>
                    </div>
                </div>
                
                {/* 应用内容区域 - 优化背景和滚动效果 */}
                <div className="w-full h-full relative overflow-y-auto overflow-x-hidden bg-gradient-to-b from-white/20 via-white/10 to-white/5 backdrop-blur-md -webkit-overflow-scrolling-touch touch-pan-y">
                    <div className="min-h-full pb-4">
                        {renderPhoneContent()}
                    </div>
                </div>
                
                {/* 底部指示条（仅桌面端显示） */}
                {!isMobile && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-36 h-1.5 bg-white/80 rounded-full z-50 pointer-events-none backdrop-blur-md"></div>
                )}
            </div>
        </div>
    );
};

