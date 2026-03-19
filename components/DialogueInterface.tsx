import { Cloud, Maximize, Minimize, Send, Sparkles, Pencil, RotateCcw, RefreshCw } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Message } from '../types';

// 对话界面组件 - 负责显示对话消息、建议操作按钮和输入框
// 这是游戏的核心交互界面，玩家在这里和角色对话
interface DialogueInterfaceProps {
    messages: Message[];
    input: string;
    isLoading: boolean;
    onInputChange: (value: string) => void;
    onAction: (actionText: string) => void;
    onEditMessage?: (messageId: string, newText: string) => void; // 编辑消息
    onRegenerateMessage?: (messageId: string) => void; // 重新生成消息
}

export const DialogueInterface: React.FC<DialogueInterfaceProps> = ({
    messages,
    input,
    isLoading,
    onInputChange,
    onAction,
    onEditMessage,
    onRegenerateMessage
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState<string>('');

    const handleSubmitAction = (actionText: string) => {
        if (!actionText.trim() || isLoading) {
            return;
        }

        onAction(actionText);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.repeat) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.nativeEvent.stopImmediatePropagation === 'function') {
            e.nativeEvent.stopImmediatePropagation();
        }

        handleSubmitAction(input);
    };

    // 自动滚动到底部
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 检测是否在SillyTavern环境中（iframe）
    const isInSillyTavern = () => {
        try {
            return window.parent !== window || (window as any).SillyTavern !== undefined;
        } catch (e) {
            // 跨域访问会抛出错误，说明在iframe中
            return true;
        }
    };

    // 全屏切换功能
    const toggleFullscreen = () => {
        const inSillyTavern = isInSillyTavern();
        const element = inSillyTavern ? (document.body || document.documentElement) : document.documentElement;
        
        if (!isFullscreen) {
            // 进入全屏
            try {
                if (element.requestFullscreen) {
                    element.requestFullscreen().then(() => setIsFullscreen(true)).catch((err) => {
                        console.warn('全屏请求失败:', err);
                        // 如果在SillyTavern中，尝试请求父窗口全屏
                        if (inSillyTavern && window.parent !== window) {
                            try {
                                window.parent.postMessage({ type: 'REQUEST_FULLSCREEN' }, '*');
                            } catch (e) {
                                console.warn('无法请求父窗口全屏:', e);
                            }
                        }
                    });
                } else if ((element as any).webkitRequestFullscreen) {
                    (element as any).webkitRequestFullscreen();
                    setIsFullscreen(true);
                } else if ((element as any).mozRequestFullScreen) {
                    (element as any).mozRequestFullScreen();
                    setIsFullscreen(true);
                } else if ((element as any).msRequestFullscreen) {
                    (element as any).msRequestFullscreen();
                    setIsFullscreen(true);
                } else {
                    // 如果在SillyTavern中，尝试请求父窗口全屏
                    if (inSillyTavern && window.parent !== window) {
                        try {
                            window.parent.postMessage({ type: 'REQUEST_FULLSCREEN' }, '*');
                        } catch (e) {
                            console.warn('无法请求父窗口全屏:', e);
                        }
                    }
                }
            } catch (err) {
                console.warn('全屏请求异常:', err);
            }
        } else {
            // 退出全屏
            try {
                if (document.exitFullscreen) {
                    document.exitFullscreen().then(() => setIsFullscreen(false));
                } else if ((document as any).webkitExitFullscreen) {
                    (document as any).webkitExitFullscreen();
                    setIsFullscreen(false);
                } else if ((document as any).mozCancelFullScreen) {
                    (document as any).mozCancelFullScreen();
                    setIsFullscreen(false);
                } else if ((document as any).msExitFullscreen) {
                    (document as any).msExitFullscreen();
                    setIsFullscreen(false);
                }
            } catch (err) {
                console.warn('退出全屏异常:', err);
            }
        }
    };

    // 监听全屏状态变化
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = !!(
                document.fullscreenElement ||
                (document as any).webkitFullscreenElement ||
                (document as any).mozFullScreenElement ||
                (document as any).msFullscreenElement
            );
            setIsFullscreen(isCurrentlyFullscreen);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
            document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
        };
    }, []);

    return (
        <div className="flex-1 h-full flex flex-col relative z-10 animate-fade-in delay-100 min-w-0" style={{ 
          height: '100%',
          maxHeight: '100dvh', // 使用动态视口高度
          minHeight: '-webkit-fill-available' // iOS Safari支持
        } as React.CSSProperties}>
            <div className="flex-1 border-[4px] sm:border-[6px] border-pink-200/50 rounded-[2rem] sm:rounded-[3rem] bg-gradient-to-br from-white/60 via-pink-50/40 to-purple-50/30 backdrop-blur-xl shadow-2xl shadow-pink-100/20 overflow-hidden flex flex-col relative">
                
                {/* 标题栏 - 手机端更紧凑，优化样式 */}
                <div className="h-14 sm:h-16 flex items-center justify-between px-4 sm:px-8 border-b border-pink-200/40 bg-gradient-to-r from-pink-50/60 via-white/40 to-purple-50/40 backdrop-blur-sm">
                    <div className="flex items-center min-w-0 flex-1">
                        <Cloud className="text-pink-400 mr-2 shrink-0 drop-shadow-sm" size={20} fill="currentColor" />
                        <span className="font-bold text-pink-600/90 tracking-widest text-sm sm:text-lg truncate drop-shadow-sm">我可爱的妹妹才不会这样对我</span>
                    </div>
                    <button
                        onClick={toggleFullscreen}
                        className="p-2 rounded-xl hover:bg-pink-100/60 active:bg-pink-100/80 transition-all duration-200 text-pink-500/90 hover:text-pink-600 shrink-0 hover:scale-110 active:scale-95"
                        title={isFullscreen ? "退出全屏" : "全屏"}
                    >
                        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                </div>

                {/* 消息列表区域 - 手机端优化间距和背景 */}
                <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gradient-to-b from-transparent via-pink-50/10 to-transparent">
                    {messages.map((msg) => {
                        // 隐藏微信消息在主界面中显示（微信消息只在手机App中显示）
                        // 包括标记为isWeChat的消息和以(发送微信)/(微信)开头的消息
                        if (msg.isWeChat || msg.text.startsWith('(发送微信)') || msg.text.startsWith('(微信)')) {
                            return null;
                        }

                        if (msg.isHidden) {
                            return null;
                        }

                        const displayContent = msg.text.replace('(发送微信)', '').replace('(微信)', '');

                        return (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.sender === 'system' ? (
                                    <div className="w-full flex flex-col items-center gap-2 my-2">
                                        <div className="w-full text-center text-xs text-pink-400 font-medium bg-pink-50/50 py-2 px-4 rounded-full">
                                            {msg.text}
                                        </div>
                                        {msg.isRetryable && msg.retryAction && (
                                            <button
                                                onClick={msg.retryAction}
                                                disabled={isLoading}
                                                className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-full text-xs font-bold hover:bg-pink-600 active:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                                                title="重新生成剧情"
                                            >
                                                <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                                                <span>重新生成</span>
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className={`relative max-w-[90%] sm:max-w-[85%] px-4 sm:px-6 py-3 sm:py-4 rounded-[1.5rem] sm:rounded-[2rem] shadow-lg backdrop-blur-md transition-all duration-300 border-2 flex flex-col ${
                                        msg.sender === 'user' 
                                        ? 'bg-gradient-to-br from-blue-500 via-indigo-500 to-blue-600 text-white rounded-tr-sm border-blue-300/30 shadow-blue-200/30' 
                                        : 'bg-gradient-to-br from-white via-pink-50/50 to-white text-slate-700 rounded-tl-sm border-pink-200/40 shadow-pink-100/50'
                                    }`}>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider opacity-80 ${msg.sender === 'user' ? 'text-blue-100' : 'text-pink-400'}`}>
                                                {msg.sender === 'user' ? 'ME' : 'WENWAN'}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {msg.sender === 'user' && onEditMessage && (
                                                    <button
                                                        onClick={() => {
                                                            setEditingMessageId(msg.id);
                                                            setEditingText(msg.text);
                                                        }}
                                                        className="p-1 rounded hover:bg-white/20 transition-colors opacity-60 hover:opacity-100"
                                                        title="编辑消息"
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                )}
                                                {msg.sender === 'character' && onRegenerateMessage && (
                                                    <button
                                                        onClick={() => onRegenerateMessage(msg.id)}
                                                        className="p-1 rounded hover:bg-white/20 transition-colors opacity-60 hover:opacity-100"
                                                        title="重新生成"
                                                        disabled={isLoading}
                                                    >
                                                        <RotateCcw size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {editingMessageId === msg.id ? (
                                            <div className="flex flex-col gap-2">
                                                <textarea
                                                    value={editingText}
                                                    onChange={(e) => setEditingText(e.target.value)}
                                                    className="w-full p-2 rounded-lg border border-blue-300 bg-white/90 text-sm text-slate-700 resize-none"
                                                    rows={3}
                                                    autoFocus
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (onEditMessage && editingText.trim()) {
                                                                onEditMessage(msg.id, editingText.trim());
                                                            }
                                                            setEditingMessageId(null);
                                                            setEditingText('');
                                                        }}
                                                        className="px-3 py-1 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600"
                                                    >
                                                        保存
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEditingMessageId(null);
                                                            setEditingText('');
                                                        }}
                                                        className="px-3 py-1 bg-gray-300 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-400"
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-sm sm:text-[15px] leading-relaxed font-medium whitespace-pre-wrap break-words">
                                                {displayContent}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    
                    {/* 加载中提示 */}
                    {isLoading && (
                        <div className="flex justify-start animate-pulse">
                            <div className="bg-white/60 px-5 py-3 rounded-full text-sm text-pink-400 font-medium flex items-center gap-2 shadow-sm border border-pink-100">
                                <Sparkles size={16} className="animate-spin" /> 
                                <span>Thinking...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* 底部输入区域 - 手机端优化 */}
                <div className="p-3 sm:p-6 bg-gradient-to-t from-white/60 to-transparent">
                    {/* 输入框 - 手机端更大更易点击 */}
                    <div className="flex items-center gap-2 bg-white rounded-full px-2 sm:px-2 py-2 sm:py-2 shadow-lg shadow-pink-100/50 border border-pink-50">
                        <input 
                            type="text" 
                            value={input} 
                            onChange={(e) => onInputChange(e.target.value)} 
                            onKeyDown={handleInputKeyDown}
                            placeholder="和她互动..." 
                            className="flex-1 bg-transparent text-slate-700 placeholder-pink-200 outline-none px-3 sm:px-4 font-medium text-sm sm:text-base" 
                            disabled={isLoading} 
                        />
                        <button 
                            onClick={() => handleSubmitAction(input)}
                            disabled={!input.trim() || isLoading} 
                            className="p-2.5 sm:p-3 bg-pink-400 text-white rounded-full hover:bg-pink-500 active:bg-pink-600 disabled:bg-pink-200 transition-all active:scale-90 shadow-md shadow-pink-200 touch-manipulation"
                        >
                            <Send size={18} fill="currentColor" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
