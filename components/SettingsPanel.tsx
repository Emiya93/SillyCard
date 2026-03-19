import { Download, FileText, Home, Loader2, Monitor, RotateCcw, Save, Smartphone, X } from 'lucide-react';
import React, { useState } from 'react';
import { DisplayMode, useSettings } from '../contexts/SettingsContext';
import { getModels, ModelInfo } from '../services/aiService';
import { clearDebugLogs, downloadDebugLogs, getDebugLogCount } from '../services/debugLogService';
import { isMobileDevice } from '../utils/deviceUtils';

// 设置面板组件 - 用于配置AI服务
interface SettingsPanelProps {
    onClose: () => void;
    onBackToMain?: () => void; // 回到主界面
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, onBackToMain }) => {
    const {
        settings,
        updateMainAI,
        updateContentAI,
        updateUseIndependentContentAI,
        updateUseSillyTavernGenerate,
        updateDebugLoggingEnabled,
        updateDisplayMode,
        resetSettings
    } = useSettings();

    // 标签页状态
    const [activeTab, setActiveTab] = useState<'ai' | 'display'>('ai');

    // 本地状态，用于编辑（使用useEffect同步settings变化）
    const [mainAI, setMainAI] = useState(settings.mainAI);
    const [contentAI, setContentAI] = useState(settings.contentAI);
    const [useIndependentContentAI, setUseIndependentContentAI] = useState(settings.useIndependentContentAI);
    const [useSillyTavernGenerate, setUseSillyTavernGenerate] = useState(settings.useSillyTavernGenerate);
    const [debugLoggingEnabled, setDebugLoggingEnabled] = useState(settings.debugLoggingEnabled);
    const [displayMode, setDisplayMode] = useState<DisplayMode>(settings.displayMode);
    const [debugLogCount, setDebugLogCount] = useState(getDebugLogCount());

    // 当settings变化时，同步到本地状态
    React.useEffect(() => {
        setMainAI(settings.mainAI);
        setContentAI(settings.contentAI);
        setUseIndependentContentAI(settings.useIndependentContentAI);
        setUseSillyTavernGenerate(settings.useSillyTavernGenerate);
        setDebugLoggingEnabled(settings.debugLoggingEnabled);
        setDisplayMode(settings.displayMode);
        setDebugLogCount(getDebugLogCount());
    }, [settings.mainAI.apiBase, settings.mainAI.apiKey, settings.mainAI.model,
    settings.contentAI.apiBase, settings.contentAI.apiKey, settings.contentAI.model,
    settings.useIndependentContentAI, settings.useSillyTavernGenerate, settings.debugLoggingEnabled, settings.displayMode]);

    // 模型列表相关状态
    const [mainModels, setMainModels] = useState<ModelInfo[]>([]);
    const [contentModels, setContentModels] = useState<ModelInfo[]>([]);
    const [loadingMainModels, setLoadingMainModels] = useState(false);
    const [loadingContentModels, setLoadingContentModels] = useState(false);
    const [showMainModelList, setShowMainModelList] = useState(false);
    const [showContentModelList, setShowContentModelList] = useState(false);

    // 常用模型列表（作为默认选项）
    const commonModels = [
        'gpt-4o-mini',
        'gpt-4o',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229'
    ];

    // 获取主AI模型列表
    const handleGetMainModels = async () => {
        if (!mainAI.apiKey || !mainAI.apiBase)
        {
            alert('请先填写API密钥和接口地址');
            return;
        }

        setLoadingMainModels(true);
        try
        {
            const models = await getModels(mainAI.apiBase, mainAI.apiKey);
            setMainModels(models);
            setShowMainModelList(true);
        } catch (error: any)
        {
            alert(`获取模型列表失败: ${error.message || '未知错误'}`);
            console.error('Get models error:', error);
        } finally
        {
            setLoadingMainModels(false);
        }
    };

    // 获取副AI模型列表
    const handleGetContentModels = async () => {
        if (!contentAI.apiKey || !contentAI.apiBase)
        {
            alert('请先填写API密钥和接口地址');
            return;
        }

        setLoadingContentModels(true);
        try
        {
            const models = await getModels(contentAI.apiBase, contentAI.apiKey);
            setContentModels(models);
            setShowContentModelList(true);
        } catch (error: any)
        {
            alert(`获取模型列表失败: ${error.message || '未知错误'}`);
            console.error('Get models error:', error);
        } finally
        {
            setLoadingContentModels(false);
        }
    };

    // 选择主AI模型
    const handleSelectMainModel = (modelId: string) => {
        setMainAI({ ...mainAI, model: modelId });
        setShowMainModelList(false);
    };

    // 选择副AI模型
    const handleSelectContentModel = (modelId: string) => {
        setContentAI({ ...contentAI, model: modelId });
        setShowContentModelList(false);
    };


    const handleSave = () => {
        // 确保保存完整的配置对象
        const updatedMainAI = {
            apiBase: mainAI.apiBase.trim() || 'https://api.openai.com/v1',
            apiKey: mainAI.apiKey.trim() || '',
            model: mainAI.model.trim() || 'gpt-4o-mini'
        };

        const updatedContentAI = {
            apiBase: contentAI.apiBase.trim() || 'https://api.openai.com/v1',
            apiKey: contentAI.apiKey.trim() || '',
            model: contentAI.model.trim() || 'gpt-4o-mini'
        };

        // 更新设置
        updateMainAI(updatedMainAI);
        updateContentAI(updatedContentAI);
        updateUseIndependentContentAI(useIndependentContentAI);
        updateUseSillyTavernGenerate(useSillyTavernGenerate);
        updateDebugLoggingEnabled(debugLoggingEnabled);
        updateDisplayMode(displayMode);

        // 强制保存到localStorage
        try
        {
            const currentSettings = {
                ...settings,
                mainAI: updatedMainAI,
                contentAI: updatedContentAI,
                useIndependentContentAI: useIndependentContentAI,
                useSillyTavernGenerate: useSillyTavernGenerate,
                debugLoggingEnabled: debugLoggingEnabled,
                displayMode: displayMode
            };
            localStorage.setItem('game_settings', JSON.stringify(currentSettings));
            console.log('设置已保存到localStorage:', currentSettings);
        } catch (error)
        {
            console.error('保存设置到localStorage失败:', error);
            alert('保存设置失败，可能是localStorage被禁用或空间不足');
        }

        alert('设置已保存！');
        onClose();
    };

    const handleReset = () => {
        if (confirm('确定要重置所有设置吗？'))
        {
            resetSettings();
            setMainAI(settings.mainAI);
            setContentAI(settings.contentAI);
            setUseIndependentContentAI(settings.useIndependentContentAI);
            setUseSillyTavernGenerate(settings.useSillyTavernGenerate);
            setDebugLoggingEnabled(settings.debugLoggingEnabled);
        }
    };

    // 检测是否为移动端
    const handleDownloadDebugLogs = () => {
        downloadDebugLogs();
    };

    const handleClearDebugLogs = () => {
        if (!confirm('Clear saved debug logs?'))
        {
            return;
        }

        clearDebugLogs();
        setDebugLogCount(0);
    };

    const isMobile = isMobileDevice();

    return (
        <div className={`fixed inset-0 z-50 ${isMobile ? 'flex flex-col' : 'flex items-center justify-center'} bg-black/60 backdrop-blur-md overflow-y-auto`}>
            <div className={`bg-white/95 backdrop-blur-xl shadow-2xl border border-white/50 w-full ${isMobile ? 'h-full rounded-none flex flex-col' : 'max-w-4xl max-h-[90vh] rounded-[3rem] mx-4 flex flex-col overflow-hidden'}`}>
                {/* 标题栏 - 手机端优化 */}
                <div className={`flex items-center justify-between ${isMobile ? 'px-4 py-4' : 'px-8 py-6'} border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10`}>
                    <h2 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600`}>
                        游戏设置
                    </h2>
                    <div className="flex items-center gap-2">
                        {onBackToMain && (
                            <button
                                onClick={onBackToMain}
                                className={`${isMobile ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full font-semibold flex items-center gap-1.5 transition-all active:scale-95`}
                            >
                                <Home size={isMobile ? 16 : 18} />
                                {!isMobile && <span>回到主界面</span>}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className={`${isMobile ? 'p-2 min-w-[44px] min-h-[44px]' : 'p-2'} rounded-full hover:bg-gray-100 text-gray-500 transition-colors active:scale-95 touch-manipulation`}
                            style={{
                                touchAction: 'manipulation',
                                WebkitTapHighlightColor: 'transparent'
                            }}
                        >
                            <X size={isMobile ? 22 : 24} />
                        </button>
                    </div>
                </div>

                {/* 标签页导航 - 手机端优化 */}
                <div className={`flex items-center gap-2 ${isMobile ? 'px-3 py-3 overflow-x-auto' : 'px-8 py-4'} border-b border-gray-200 bg-gray-50/50 sticky top-[73px] z-10`}>
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`${isMobile ? 'px-4 py-1.5 text-xs flex-shrink-0' : 'px-6 py-2 text-sm'} rounded-full font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${activeTab === 'ai'
                                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md'
                                : 'bg-white text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        <Download size={isMobile ? 14 : 18} />
                        <span>AI服务配置</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('display')}
                        className={`${isMobile ? 'px-4 py-1.5 text-xs flex-shrink-0' : 'px-6 py-2 text-sm'} rounded-full font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${activeTab === 'display'
                                ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-md'
                                : 'bg-white text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        {displayMode === 'desktop' ? <Monitor size={isMobile ? 14 : 18} /> : <Smartphone size={isMobile ? 14 : 18} />}
                        <span>显示模式</span>
                    </button>
                </div>

                {/* 内容区域 - 手机端优化，确保可以滚动 */}
                <div className={`flex-1 overflow-y-auto ${isMobile ? 'p-4 space-y-6 min-h-0' : 'p-8 space-y-8'}`} style={isMobile ? { WebkitOverflowScrolling: 'touch' } : {}}>
                    {/* AI服务配置标签页 */}
                    {activeTab === 'ai' && (
                        <>
                            {/* 主AI配置 */}
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                                <h3 className="text-xl font-bold text-blue-900 mb-2 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                    主AI配置
                                    <span className="text-sm font-normal text-blue-600">(控制对话界面)</span>
                                </h3>
                                <p className="text-sm text-blue-700 mb-6">主AI负责处理中间对话界面的所有交互内容</p>

                                <div className="space-y-4">
                                    {/* 使用酒馆 Generate（ST_API） */}
                                    <div className="bg-white/80 rounded-xl border border-blue-100 p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <label className="block text-sm font-semibold text-gray-800">
                                                    优先使用酒馆 Generate（ST_API）
                                                </label>
                                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                                    仅在嵌入 SillyTavern 且已启用 st-api-wrapper 时生效。开启后会走酒馆的生成流程，同时保留应用侧拼装的系统提示词、自定义预设内容和酒馆当前预设/世界书。若酒馆侧失败，不会再自动补发直连主API，避免同一条消息重复请求。
                                                </p>
                                            </div>
                                            <label className="inline-flex items-center gap-2 shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={useSillyTavernGenerate}
                                                    onChange={(e) => setUseSillyTavernGenerate(e.target.checked)}
                                                    className="h-5 w-5 accent-blue-600"
                                                />
                                            </label>
                                        </div>
                                    </div>

                                    {/* 接口地址 */}
                                    <div className="bg-white/80 rounded-xl border border-blue-100 p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <label className="block text-sm font-semibold text-gray-800">
                                                    Debug log for real I/O
                                                </label>
                                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                                    Save real user input, final model payload, raw model output, and cleaned reply into local log storage instead of the browser console.
                                                </p>
                                                <p className="text-xs text-gray-500 mt-2">
                                                    Saved entries: {debugLogCount}
                                                </p>
                                            </div>
                                            <label className="inline-flex items-center gap-2 shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={debugLoggingEnabled}
                                                    onChange={(e) => setDebugLoggingEnabled(e.target.checked)}
                                                    className="h-5 w-5 accent-blue-600"
                                                />
                                            </label>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button
                                                onClick={handleDownloadDebugLogs}
                                                disabled={debugLogCount === 0}
                                                className="px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-full text-sm font-semibold flex items-center gap-2 transition-all"
                                            >
                                                <FileText size={16} />
                                                <span>Export logs</span>
                                            </button>
                                            <button
                                                onClick={handleClearDebugLogs}
                                                disabled={debugLogCount === 0}
                                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-slate-700 rounded-full text-sm font-semibold flex items-center gap-2 transition-all"
                                            >
                                                <RotateCcw size={16} />
                                                <span>Clear logs</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            接口地址
                                        </label>
                                        <input
                                            type="text"
                                            value={mainAI.apiBase}
                                            onChange={(e) => setMainAI({ ...mainAI, apiBase: e.target.value })}
                                            placeholder="https://api.openai.com/v1"
                                            className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                        />
                                    </div>

                                    {/* API密钥 */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            API密钥
                                        </label>
                                        <input
                                            type="password"
                                            value={mainAI.apiKey}
                                            onChange={(e) => setMainAI({ ...mainAI, apiKey: e.target.value })}
                                            placeholder="sk-..."
                                            className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all font-mono text-sm"
                                        />
                                    </div>

                                    {/* 模型选择 */}
                                    <div className="relative">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            模型选择
                                        </label>
                                        <div className="flex gap-2">
                                            <select
                                                value={mainAI.model}
                                                onChange={(e) => setMainAI({ ...mainAI, model: e.target.value })}
                                                className="flex-1 px-4 py-3 bg-white rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                            >
                                                {commonModels.map(model => (
                                                    <option key={model} value={model}>{model}</option>
                                                ))}
                                                {mainModels.length > 0 && (
                                                    <>
                                                        <option disabled>--- 从API获取的模型 ---</option>
                                                        {mainModels.map(model => (
                                                            <option key={model.id} value={model.id}>{model.id}</option>
                                                        ))}
                                                    </>
                                                )}
                                                {/* 如果当前模型不在列表中，也显示它 */}
                                                {!commonModels.includes(mainAI.model) &&
                                                    !mainModels.some(m => m.id === mainAI.model) &&
                                                    mainAI.model !== 'custom' && (
                                                        <option value={mainAI.model} key={mainAI.model}>
                                                            {mainAI.model} (已保存)
                                                        </option>
                                                    )}
                                                <option value="custom">自定义模型</option>
                                            </select>
                                            <button
                                                onClick={handleGetMainModels}
                                                disabled={loadingMainModels || !mainAI.apiKey || !mainAI.apiBase}
                                                className={`${isMobile ? 'px-3 py-2.5 text-xs' : 'px-4 py-3'} bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md hover:shadow-lg active:scale-95`}
                                                title="从API获取可用模型列表"
                                            >
                                                {loadingMainModels ? (
                                                    <Loader2 size={isMobile ? 14 : 18} className="animate-spin" />
                                                ) : (
                                                    <Download size={isMobile ? 14 : 18} />
                                                )}
                                                <span className="whitespace-nowrap">获取模型</span>
                                            </button>
                                        </div>
                                        {mainAI.model === 'custom' && (
                                            <input
                                                type="text"
                                                value={mainAI.model}
                                                onChange={(e) => setMainAI({ ...mainAI, model: e.target.value })}
                                                placeholder="输入自定义模型名称"
                                                className="w-full mt-2 px-4 py-3 bg-white rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                            />
                                        )}

                                        {/* 模型列表弹窗 */}
                                        {showMainModelList && mainModels.length > 0 && (
                                            <div className="absolute z-50 mt-2 w-full bg-white rounded-xl border border-gray-200 shadow-2xl max-h-64 overflow-y-auto">
                                                <div className="p-2 border-b border-gray-100 flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-700">选择模型</span>
                                                    <button
                                                        onClick={() => setShowMainModelList(false)}
                                                        className="text-gray-400 hover:text-gray-600"
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                                <div className="p-2">
                                                    {mainModels.map((model) => (
                                                        <button
                                                            key={model.id}
                                                            onClick={() => handleSelectMainModel(model.id)}
                                                            className="w-full text-left px-4 py-2 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-between group"
                                                        >
                                                            <div>
                                                                <div className="font-medium text-gray-900">{model.id}</div>
                                                                <div className="text-xs text-gray-500">{model.owned_by}</div>
                                                            </div>
                                                            {mainAI.model === model.id && (
                                                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 副AI配置 */}
                            <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-6 border border-pink-100">
                                <h3 className="text-xl font-bold text-pink-900 mb-2 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
                                    副AI配置
                                    <span className="text-sm font-normal text-pink-600">(控制手机内容生成)</span>
                                </h3>
                                <p className="text-sm text-pink-700 mb-4">副AI负责生成手机App中的内容（推特、微信、日历等）</p>

                                <div className="mb-6 rounded-2xl border border-pink-200 bg-white/80 p-4">
                                    <label className="flex items-start justify-between gap-4 cursor-pointer">
                                        <div>
                                            <div className="text-sm font-semibold text-pink-900">启用独立副AI请求</div>
                                            <div className="text-xs text-pink-700 mt-1 leading-relaxed">
                                                关闭时，普通对话只请求主AI；推文润色与摘要会回退主AI，不再额外走本地摘要兜底。
                                            </div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={useIndependentContentAI}
                                            onChange={(e) => setUseIndependentContentAI(e.target.checked)}
                                            className="mt-0.5 h-5 w-5 accent-pink-600"
                                        />
                                    </label>
                                </div>

                                <div className={`space-y-4 ${useIndependentContentAI ? '' : 'opacity-60'}`}>
                                    {/* 接口地址 */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            接口地址
                                        </label>
                                        <input
                                            type="text"
                                            value={contentAI.apiBase}
                                            onChange={(e) => setContentAI({ ...contentAI, apiBase: e.target.value })}
                                            placeholder="https://api.openai.com/v1"
                                            disabled={!useIndependentContentAI}
                                            className="w-full px-4 py-3 bg-white rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
                                        />
                                    </div>

                                    {/* API密钥 */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            API密钥
                                        </label>
                                        <input
                                            type="password"
                                            value={contentAI.apiKey}
                                            onChange={(e) => setContentAI({ ...contentAI, apiKey: e.target.value })}
                                            placeholder="sk-..."
                                            disabled={!useIndependentContentAI}
                                            className={`w-full ${isMobile ? 'px-3 py-2.5 text-xs' : 'px-4 py-3 text-sm'} bg-white rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all font-mono`}
                                        />
                                    </div>

                                    {/* 模型选择 */}
                                    <div className="relative">
                                        <label className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 mb-1.5`}>
                                            模型选择
                                        </label>
                                        <div className={`flex ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
                                            <select
                                                value={contentAI.model}
                                                onChange={(e) => setContentAI({ ...contentAI, model: e.target.value })}
                                                disabled={!useIndependentContentAI}
                                                className={`flex-1 ${isMobile ? 'px-3 py-2.5 text-sm' : 'px-4 py-3'} bg-white rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all`}
                                            >
                                                {commonModels.map(model => (
                                                    <option key={model} value={model}>{model}</option>
                                                ))}
                                                {contentModels.length > 0 && (
                                                    <>
                                                        <option disabled>--- 从API获取的模型 ---</option>
                                                        {contentModels.map(model => (
                                                            <option key={model.id} value={model.id}>{model.id}</option>
                                                        ))}
                                                    </>
                                                )}
                                                {/* 如果当前模型不在列表中，也显示它 */}
                                                {!commonModels.includes(contentAI.model) &&
                                                    !contentModels.some(m => m.id === contentAI.model) &&
                                                    contentAI.model !== 'custom' && (
                                                        <option value={contentAI.model} key={contentAI.model}>
                                                            {contentAI.model} (已保存)
                                                        </option>
                                                    )}
                                                <option value="custom">自定义模型</option>
                                            </select>
                                            <button
                                                onClick={handleGetContentModels}
                                                disabled={!useIndependentContentAI || loadingContentModels || !contentAI.apiKey || !contentAI.apiBase}
                                                className={`${isMobile ? 'px-3 py-2.5 text-xs' : 'px-4 py-3'} bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md hover:shadow-lg active:scale-95`}
                                                title="从API获取可用模型列表"
                                            >
                                                {loadingContentModels ? (
                                                    <Loader2 size={isMobile ? 14 : 18} className="animate-spin" />
                                                ) : (
                                                    <Download size={isMobile ? 14 : 18} />
                                                )}
                                                <span className="whitespace-nowrap">获取模型</span>
                                            </button>
                                        </div>
                                        {contentAI.model === 'custom' && (
                                            <input
                                                type="text"
                                                value={contentAI.model}
                                                onChange={(e) => setContentAI({ ...contentAI, model: e.target.value })}
                                                placeholder="输入自定义模型名称"
                                                disabled={!useIndependentContentAI}
                                                className="w-full mt-2 px-4 py-3 bg-white rounded-xl border border-gray-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 outline-none transition-all"
                                            />
                                        )}

                                        {/* 模型列表弹窗 */}
                                        {showContentModelList && contentModels.length > 0 && (
                                            <div className="absolute z-50 mt-2 w-full bg-white rounded-xl border border-gray-200 shadow-2xl max-h-64 overflow-y-auto">
                                                <div className="p-2 border-b border-gray-100 flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-700">选择模型</span>
                                                    <button
                                                        onClick={() => setShowContentModelList(false)}
                                                        className="text-gray-400 hover:text-gray-600"
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                                <div className="p-2">
                                                    {contentModels.map((model) => (
                                                        <button
                                                            key={model.id}
                                                            onClick={() => handleSelectContentModel(model.id)}
                                                            className="w-full text-left px-4 py-2 hover:bg-pink-50 rounded-lg transition-colors flex items-center justify-between group"
                                                        >
                                                            <div>
                                                                <div className="font-medium text-gray-900">{model.id}</div>
                                                                <div className="text-xs text-gray-500">{model.owned_by}</div>
                                                            </div>
                                                            {contentAI.model === model.id && (
                                                                <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* 显示模式标签页 */}
                    {activeTab === 'display' && (
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
                            <h3 className="text-xl font-bold text-purple-900 mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                                显示模式切换
                            </h3>
                            <p className="text-sm text-purple-700 mb-6">选择你喜欢的界面布局方式</p>

                            <div className="grid grid-cols-2 gap-4">
                                {/* 电脑模式 */}
                                <button
                                    onClick={() => setDisplayMode('desktop')}
                                    className={`p-6 rounded-xl border-2 transition-all ${displayMode === 'desktop'
                                            ? 'border-purple-500 bg-purple-100 shadow-lg scale-105'
                                            : 'border-gray-200 bg-white hover:border-purple-300'
                                        }`}
                                >
                                    <Monitor size={32} className={`mx-auto mb-3 ${displayMode === 'desktop' ? 'text-purple-600' : 'text-gray-400'}`} />
                                    <div className="font-bold text-lg mb-1">电脑模式</div>
                                    <div className="text-sm text-gray-600">三栏布局：立绘 + 对话 + 手机</div>
                                </button>

                                {/* 手机模式 */}
                                <button
                                    onClick={() => setDisplayMode('mobile')}
                                    className={`p-6 rounded-xl border-2 transition-all ${displayMode === 'mobile'
                                            ? 'border-pink-500 bg-pink-100 shadow-lg scale-105'
                                            : 'border-gray-200 bg-white hover:border-pink-300'
                                        }`}
                                >
                                    <Smartphone size={32} className={`mx-auto mb-3 ${displayMode === 'mobile' ? 'text-pink-600' : 'text-gray-400'}`} />
                                    <div className="font-bold text-lg mb-1">手机模式</div>
                                    <div className="text-sm text-gray-600">中间对话 + 下方立绘，可切换手机界面</div>
                                </button>
                            </div>
                        </div>
                    )}

                </div>

                {/* 底部按钮 - 手机端优化 */}
                <div className={`flex items-center justify-between ${isMobile ? 'px-4 py-4 flex-col gap-3' : 'px-8 py-6 flex-row'} border-t border-gray-200 bg-gray-50/50 sticky bottom-0 z-10`}>
                    <button
                        onClick={handleReset}
                        className={`${isMobile ? 'w-full px-4 py-3 text-sm' : 'px-6 py-3'} bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full font-semibold flex items-center justify-center gap-2 transition-all active:scale-95`}
                    >
                        <RotateCcw size={isMobile ? 16 : 18} />
                        <span>重置设置</span>
                    </button>
                    <button
                        onClick={handleSave}
                        className={`${isMobile ? 'w-full px-6 py-3.5 text-base' : 'px-8 py-3'} bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-full font-bold flex items-center justify-center gap-2 shadow-lg shadow-pink-300 hover:scale-105 active:scale-95 transition-all`}
                    >
                        <Save size={isMobile ? 18 : 18} />
                        <span>保存设置</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
