// 自动总结服务 - 将对话内容压缩为可复用的短摘要
import { Message } from '../types';

type SummaryAIConfig = {
    apiBase: string;
    apiKey: string;
    model: string;
};

function cleanMessageText(text: string): string {
    if (!text) return '';

    let cleaned = text;

    cleaned = cleaned.replace(/```json[\s\S]*?```/gi, '');
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');

    cleaned = cleaned.replace(/<game>([\s\S]*?)<\/game>/gi, '$1');
    cleaned = cleaned.replace(/<summary>[\s\S]*?<\/summary>/gi, '');
    cleaned = cleaned.replace(/<details>[\s\S]*?<\/details>/gi, '');
    cleaned = cleaned.replace(/<[^>]+>/g, '');

    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.trim();

    return cleaned;
}

function buildFallbackSummary(texts: string[], sliceLength: number = 30): string {
    const fallback = texts
        .map(text => cleanMessageText(text))
        .filter(text => text.length > 0)
        .map(text => text.substring(0, sliceLength))
        .join('；');

    if (!fallback) {
        return '';
    }

    return fallback.length > 100 ? `${fallback.substring(0, 100)}...` : fallback;
}

async function requestSummaryFromAI(
    summaryPrompt: string,
    mainAIConfig: SummaryAIConfig
): Promise<string> {
    const response = await fetch(`${mainAIConfig.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mainAIConfig.apiKey}`
        },
        body: JSON.stringify({
            model: mainAIConfig.model,
            messages: [
                {
                    role: 'system',
                    content: '你是一个专业的文本总结助手，擅长将对话内容总结成简洁的回忆片段。你必须严格遵守字数限制（50-100字），只总结关键信息，不要包含详细描写。'
                },
                { role: 'user', content: summaryPrompt }
            ],
            temperature: 0.3,
            max_tokens: 150
        })
    });

    if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
    }

    const data = await response.json();
    let summary = data.choices[0]?.message?.content || '';

    summary = summary.trim().replace(/^["']|["']$/g, '');

    if (summary.length > 150) {
        summary = summary.substring(0, 100) + '...';
        console.warn('[summaryService] 总结过长，已截断到100字');
    }

    return summary;
}

export async function summarizeCharacterMessages(
    messages: Message[],
    mainAIConfig: SummaryAIConfig
): Promise<string> {
    const characterMessages = messages
        .filter(m => m.sender === 'character')
        .slice(-5);

    if (characterMessages.length === 0) {
        return '';
    }

    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase) {
        return buildFallbackSummary(characterMessages.map(m => m.text), 50);
    }

    const cleanedMessages = characterMessages
        .map(m => ({
            ...m,
            text: cleanMessageText(m.text)
        }))
        .filter(m => m.text.length > 0);

    if (cleanedMessages.length === 0) {
        return '';
    }

    const summaryPrompt = `请将以下温婉（妹妹）的发言总结成一段简洁的文字（严格控制在50-100字之间），用于帮助AI回忆今天发生的事情。

重要要求：
1. 必须严格控制在50-100字之间
2. 只总结关键事件和状态变化，不要写详细动作描写
3. 使用第三人称描述，用“温婉”或“她”来表述
4. 不要直接引用原对话，不要堆砌细节

温婉的发言：
${cleanedMessages.map((m, i) => `${i + 1}. ${m.text.substring(0, 200)}${m.text.length > 200 ? '...' : ''}`).join('\n')}

总结（50-100字）：`;

    try {
        const summary = await requestSummaryFromAI(summaryPrompt, mainAIConfig);

        if (summary.length < 30) {
            console.warn('[summaryService] 总结过短，使用备用总结');
            return buildFallbackSummary(cleanedMessages.map(m => m.text), 30);
        }

        return summary;
    } catch (error: any) {
        console.error('总结生成失败:', error);
        return buildFallbackSummary(characterMessages.map(m => m.text), 30);
    }
}

export async function summarizeSummaryEntries(
    summaryEntries: string[],
    mainAIConfig: SummaryAIConfig
): Promise<string> {
    const cleanedEntries = summaryEntries
        .map(entry => cleanMessageText(entry))
        .filter(entry => entry.length > 0)
        .slice(0, 10);

    if (cleanedEntries.length === 0) {
        return '';
    }

    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase) {
        return buildFallbackSummary(cleanedEntries, 20);
    }

    const summaryPrompt = `请把以下多条“今日总结”再次整合成1条新的摘要，严格控制在50-100字之间，供后续对话长期使用。

重要要求：
1. 只保留关键事件、关系变化和重要状态变化
2. 合并重复信息，不要按条目逐个复述
3. 使用第三人称，用“温婉”或“她”来表述
4. 不要直接引用原对话内容

今日总结列表：
${cleanedEntries.map((entry, index) => `${index + 1}. ${entry.substring(0, 160)}${entry.length > 160 ? '...' : ''}`).join('\n')}

整合后的新总结（50-100字）：`;

    try {
        const summary = await requestSummaryFromAI(summaryPrompt, mainAIConfig);

        if (summary.length < 20) {
            console.warn('[summaryService] 整合总结过短，使用备用总结');
            return buildFallbackSummary(cleanedEntries, 20);
        }

        return summary;
    } catch (error: any) {
        console.error('整合总结生成失败:', error);
        return buildFallbackSummary(cleanedEntries, 20);
    }
}
