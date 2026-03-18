// 存档服务 - 负责游戏的保存和读取功能
import { GameSave, GameTime, Message, BodyStatus, LocationID, Tweet, CalendarEvent, BackpackItem } from '../types';

const SAVE_STORAGE_KEY = 'wenwan_game_saves';
const AUTO_SAVE_SLOT = 0; // 自动存档槽位

function normalizeTodaySummaries(save: GameSave): GameSave {
    const todaySummaries = Array.isArray(save.todaySummaries)
        ? save.todaySummaries
            .filter((summary): summary is string => typeof summary === 'string')
            .map(summary => summary.trim())
            .filter(summary => summary.length > 0)
        : (save.todaySummary
            ? [save.todaySummary.trim()].filter(summary => summary.length > 0)
            : []);

    return {
        ...save,
        todaySummary: todaySummaries.join('\n'),
        todaySummaries,
    };
}

/**
 * 获取所有存档
 */
export function getAllSaves(): (GameSave | null)[] {
    try {
        const savesJson = localStorage.getItem(SAVE_STORAGE_KEY);
        if (!savesJson) {
            return new Array(8).fill(null);
        }
        const saves: (GameSave | null)[] = JSON.parse(savesJson);
        // 确保返回8个槽位
        while (saves.length < 8) {
            saves.push(null);
        }
        return saves.slice(0, 8);
    } catch (error) {
        console.error('读取存档失败:', error);
        return new Array(8).fill(null);
    }
}

/**
 * 保存游戏
 */
export function saveGame(
    slotId: number,
    gameTime: GameTime,
    messages: Message[],
    bodyStatus: BodyStatus,
    userLocation: LocationID,
    tweets: Tweet[],
    calendarEvents: CalendarEvent[],
    todaySummary: string,
    todaySummaries?: string[],
    customName?: string,
    walletBalance?: number,
    walletTransactions?: Array<{id: string; name: string; price: number; date: string; type: 'expense' | 'income'}>,
    backpackItems?: BackpackItem[],
    unlockedOutfits?: string[],
): boolean {
    try {
        const saves = getAllSaves();
        
        // 生成存档名称
        let saveName: string;
        if (slotId === AUTO_SAVE_SLOT) {
            saveName = '自动存档';
        } else if (customName) {
            saveName = customName;
        } else {
            const date = new Date(gameTime.year, gameTime.month - 1, gameTime.day);
            const timeStr = `${gameTime.hour.toString().padStart(2, '0')}:${gameTime.minute.toString().padStart(2, '0')}`;
            saveName = `${date.toLocaleDateString('zh-CN')} ${timeStr}`;
        }
        
        const save: GameSave = {
            id: slotId,
            name: saveName,
            timestamp: Date.now(),
            gameTime,
            messages: messages.map(msg => ({
                ...msg,
                timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)
            })),
            bodyStatus,
            userLocation,
            tweets,
            calendarEvents,
            todaySummary,
            todaySummaries,
            walletBalance,
            walletTransactions,
            backpackItems,
            unlockedOutfits,
        };
        
        saves[slotId] = save;
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saves));
        
        console.log(`存档成功: 槽位${slotId} - ${saveName}`);
        return true;
    } catch (error) {
        console.error('保存游戏失败:', error);
        return false;
    }
}

/**
 * 读取存档
 */
export function loadGame(slotId: number): GameSave | null {
    try {
        const saves = getAllSaves();
        const save = saves[slotId];
        
        if (!save) {
            return null;
        }
        
        // 转换时间戳为Date对象
        const loadedSave: GameSave = {
            ...save,
            messages: save.messages.map(msg => ({
                ...msg,
                timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)
            }))
        };
        
        return normalizeTodaySummaries(loadedSave);
    } catch (error) {
        console.error('读取存档失败:', error);
        return null;
    }
}

/**
 * 删除存档
 */
export function deleteSave(slotId: number): boolean {
    try {
        const saves = getAllSaves();
        saves[slotId] = null;
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saves));
        return true;
    } catch (error) {
        console.error('删除存档失败:', error);
        return false;
    }
}

/**
 * 检查是否需要自动存档（每天早上7点）
 */
export function shouldAutoSave(currentTime: GameTime, lastAutoSaveTime: GameTime | null): boolean {
    // 如果没有上次存档时间，第一次到达7点时保存
    if (!lastAutoSaveTime) {
        return currentTime.hour >= 7;
    }
    
    // 检查是否跨过了早上7点
    const lastDate = new Date(lastAutoSaveTime.year, lastAutoSaveTime.month - 1, lastAutoSaveTime.day);
    const currentDate = new Date(currentTime.year, currentTime.month - 1, currentTime.day);
    
    // 如果日期不同，且当前时间是早上7点或之后
    if (currentDate.getTime() > lastDate.getTime() && currentTime.hour >= 7) {
        // 检查是否已经保存过今天7点后的存档
        const lastSaveDate = new Date(lastAutoSaveTime.year, lastAutoSaveTime.month - 1, lastAutoSaveTime.day);
        const lastSaveHour = lastAutoSaveTime.hour;
        
        // 如果上次保存是昨天，或者今天但还没到7点，则需要保存
        if (currentDate.getTime() > lastSaveDate.getTime() || 
            (currentDate.getTime() === lastSaveDate.getTime() && lastSaveHour < 7)) {
            return true;
        }
    }
    
    return false;
}

/**
 * 导出存档（将存档数据转换为JSON并下载）
 */
export function exportSave(slotId: number): boolean {
    try {
        const save = loadGame(slotId);
        if (!save) {
            return false;
        }
        
        // 将存档数据转换为JSON字符串
        const saveJson = JSON.stringify(save, null, 2);
        
        // 创建Blob对象
        const blob = new Blob([saveJson], { type: 'application/json' });
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `wenwan_save_${slotId}_${save.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 释放URL对象
        URL.revokeObjectURL(url);
        
        console.log(`存档导出成功: 槽位${slotId} - ${save.name}`);
        return true;
    } catch (error) {
        console.error('导出存档失败:', error);
        return false;
    }
}

/**
 * 导入存档（从JSON文件读取存档数据）
 */
export function importSave(file: File): Promise<{ success: boolean; save: GameSave | null; error?: string }> {
    return new Promise((resolve) => {
        try {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const fileContent = e.target?.result as string;
                    const saveData = JSON.parse(fileContent) as GameSave;
                    
                    // 验证存档数据格式
                    if (!saveData.id && saveData.id !== 0) {
                        // 如果没有id，尝试从文件名或其他方式推断
                        // 这里我们允许导入，但需要用户选择槽位
                    }
                    
                    // 转换时间戳为Date对象
                    const importedSave: GameSave = {
                        ...saveData,
                        messages: saveData.messages.map(msg => ({
                            ...msg,
                            timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp)
                        }))
                    };
                    
                    resolve({ success: true, save: normalizeTodaySummaries(importedSave) });
                } catch (parseError) {
                    console.error('解析存档文件失败:', parseError);
                    resolve({ success: false, save: null, error: '存档文件格式不正确' });
                }
            };
            
            reader.onerror = () => {
                resolve({ success: false, save: null, error: '读取文件失败' });
            };
            
            reader.readAsText(file);
        } catch (error) {
            console.error('导入存档失败:', error);
            resolve({ success: false, save: null, error: '导入存档时发生错误' });
        }
    });
}

/**
 * 将导入的存档保存到指定槽位
 */
export function saveImportedGame(slotId: number, importedSave: GameSave, customName?: string): boolean {
    try {
        const saves = getAllSaves();
        
        // 生成存档名称
        let saveName: string;
        if (slotId === AUTO_SAVE_SLOT) {
            saveName = '自动存档';
        } else if (customName) {
            saveName = customName;
        } else {
            // 使用导入的存档名称，或生成新名称
            saveName = importedSave.name || `导入存档 ${new Date().toLocaleString('zh-CN')}`;
        }
        
        const save: GameSave = normalizeTodaySummaries({
            ...importedSave,
            id: slotId,
            name: saveName,
            timestamp: Date.now(), // 更新导入时间为当前时间
        });
        
        saves[slotId] = save;
        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saves));
        
        console.log(`导入存档成功: 槽位${slotId} - ${saveName}`);
        return true;
    } catch (error) {
        console.error('保存导入的存档失败:', error);
        return false;
    }
}

