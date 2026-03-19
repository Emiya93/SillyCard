// 自动总结服务 - 将对话内容压缩为可复用的短摘要
import { BodyStatus } from '../types';
import { DialogueRound } from './dialogueSummaryUtils';

type SummaryAIConfig = {
    apiBase: string;
    apiKey: string;
    model: string;
};

function formatBodyStatusForSummary(bodyStatus: BodyStatus): string {
    const displayLocation = bodyStatus.exactLocation
        ? `${bodyStatus.location}（${bodyStatus.exactLocation}）`
        : bodyStatus.location;

    return [
        '妹妹人设：温婉是哥哥的妹妹，敏感、细腻、会把和哥哥的互动偷偷记在心里。写日记时应保留她自己的情绪和少女心，不要写成旁白总结。',
        `当前地点：${displayLocation}`,
        `当前情绪：${bodyStatus.emotion}`,
        `当前好感度：${bodyStatus.favorability}`,
        `当前堕落度：${bodyStatus.degradation}`,
        `当前性欲：${bodyStatus.libido}`,
        `当前兴奋度：${bodyStatus.arousal}`,
        `当前穿着：${bodyStatus.overallClothing}`,
        `当前动作：${bodyStatus.currentAction}`,
        `当前内心：${bodyStatus.innerThought}`,
    ].join('\n');
}

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

function formatRoundText(round: DialogueRound): string {
    const userText = cleanMessageText(round.userMessage.text);
    const replyText = round.replyMessages
        .map(message => cleanMessageText(message.text))
        .filter(text => text.length > 0)
        .join('\n');

    return `用户：${userText || '（空）'}\n温婉：${replyText || '（空）'}`;
}

async function requestSummaryFromAI(
    summaryPrompt: string,
    mainAIConfig: SummaryAIConfig,
    maxTokens: number = 150
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
                    content: '你是一个日记整理助手。你需要把剧情压缩成温婉写给自己的简短日记片段。最终输出必须是中文、第一人称、50-100字，只保留关键事件、情绪变化和她对哥哥的感受，不要附加解释。'
                },
                { role: 'user', content: summaryPrompt }
            ],
            temperature: 0.3,
            max_tokens: maxTokens
        })
    });

    if (!response.ok)
    {
        throw new Error(`API请求失败: ${response.status}`);
    }

    const data = await response.json();
    let summary = data.choices[0]?.message?.content || '';

    summary = summary.trim().replace(/^["']|["']$/g, '');

    if (summary.length > 150)
    {
        summary = summary.substring(0, 100) + '...';
        console.warn('[summaryService] 总结过长，已截断到100字');
    }

    return summary;
}

export async function summarizeDialogueRounds(
    rounds: DialogueRound[],
    mainAIConfig: SummaryAIConfig,
    bodyStatus: BodyStatus
): Promise<string | null> {
    const cleanedRounds = rounds
        .map(round => ({
            ...round,
            userMessage: {
                ...round.userMessage,
                text: cleanMessageText(round.userMessage.text)
            },
            replyMessages: round.replyMessages
                .map(message => ({
                    ...message,
                    text: cleanMessageText(message.text)
                }))
                .filter(message => message.text.length > 0)
        }))
        .filter(round => round.userMessage.text.length > 0 || round.replyMessages.length > 0);

    if (cleanedRounds.length === 0)
    {
        return null;
    }

    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase)
    {
        console.warn('[summaryService] 摘要AI配置不完整，跳过本次摘要，等待后续重试');
        return null;
    }

    const summaryPrompt = `请你把下面这几轮互动整理成一小段“温婉写给自己的日记”。

重要要求：
1. 必须严格控制在50-100字之间
2. 必须使用第一人称“我”，写成妹妹晚上偷偷记下来的日记口吻
3. 这是“用户发言 + 温婉回复”的完整对话，请同时参考双方内容再写
4. 只保留关键事件、情绪变化、关系变化，以及温婉对哥哥的感受
5. 结合下方人设与当前状态来决定语气，不要写成旁白，不要直接引用原对话
6. 不要输出标题、解释、Markdown、JSON

妹妹人设与当前状态：
${formatBodyStatusForSummary(bodyStatus)}

对话内容：
${cleanedRounds.map((round, index) => `${index + 1}. ${formatRoundText(round).substring(0, 400)}${formatRoundText(round).length > 400 ? '...' : ''}`).join('\n\n')}

日记内容（50-100字）：`;

    try
    {
        const summary = await requestSummaryFromAI(summaryPrompt, mainAIConfig, 150);

        if (summary.length < 30)
        {
            console.warn('[summaryService] 总结过短，跳过本次摘要，等待后续重试');
            return null;
        }

        return summary;
    } catch (error: any)
    {
        console.error('总结生成失败:', error);
        return null;
    }
}

export async function summarizeSummaryEntries(
    summaryEntries: string[],
    mainAIConfig: SummaryAIConfig,
    bodyStatus: BodyStatus
): Promise<string | null> {
    const cleanedEntries = summaryEntries
        .map(entry => cleanMessageText(entry))
        .filter(entry => entry.length > 0)
        .slice(0, 10);

    if (cleanedEntries.length === 0)
    {
        return null;
    }

    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase)
    {
        console.warn('[summaryService] 归并摘要AI配置不完整，跳过本次归并，等待后续重试');
        return null;
    }

    const summaryPrompt = `请把以下多条“今日总结”再次整合成1条新的“温婉日记”，供后续对话长期使用。

重要要求：
1. 必须严格控制在50-100字之间
2. 必须使用第一人称“我”，保持妹妹写日记的口吻
3. 只保留关键事件、关系变化、重要状态变化和她对哥哥的感受
4. 合并重复信息，不要按条目逐个复述，不要直接引用原对话内容
5. 结合下方人设与当前状态来决定语气，不要写成第三人称总结
6. 不要输出标题、解释、Markdown、JSON

妹妹人设与当前状态：
${formatBodyStatusForSummary(bodyStatus)}

今日总结列表：
${cleanedEntries.map((entry, index) => `${index + 1}. ${entry.substring(0, 160)}${entry.length > 160 ? '...' : ''}`).join('\n')}

整合后的新日记（50-100字）：`;

    try
    {
        const summary = await requestSummaryFromAI(summaryPrompt, mainAIConfig, 150);

        if (summary.length < 20)
        {
            console.warn('[summaryService] 整合总结过短，跳过本次归并，等待后续重试');
            return null;
        }

        return summary;
    } catch (error: any)
    {
        console.error('整合总结生成失败:', error);
        return null;
    }
}

export async function summarizeBigSummaryEntries(
    summaryEntries: string[],
    mainAIConfig: SummaryAIConfig,
    bodyStatus: BodyStatus
): Promise<string | null> {
    const cleanedEntries = summaryEntries
        .map(entry => cleanMessageText(entry))
        .filter(entry => entry.length > 0)
        .slice(0, 50);

    if (cleanedEntries.length === 0)
    {
        return null;
    }

    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase)
    {
        console.warn('[summaryService] 大总结AI配置不完整，跳过本次大总结，等待后续重试');
        return null;
    }

    const summaryPrompt = `请把以下50条以内的小总结整合成1条长期记忆用的大总结。

重要要求：
1. 输出必须控制在100-300字之间
2. 不要使用日记形式，不要使用第一人称
3. 使用第三人称总结温婉这段时间的重要经历、情绪变化、关系变化和状态变化
4. 去掉重复细节，保留长期有价值的信息
5. 结合下方当前状态判断哪些变化最重要
6. 不要输出标题、解释、Markdown、JSON

温婉当前状态：
${formatBodyStatusForSummary(bodyStatus)}

小总结列表：
${cleanedEntries.map((entry, index) => `${index + 1}. ${entry.substring(0, 160)}${entry.length > 160 ? '...' : ''}`).join('\n')}

大总结（100-300字）：`;

    try
    {
        const summary = await requestSummaryFromAI(summaryPrompt, mainAIConfig, 500);

        if (summary.length < 60)
        {
            console.warn('[summaryService] 大总结过短，跳过本次大总结，等待后续重试');
            return null;
        }

        return summary;
    } catch (error: any)
    {
        console.error('大总结生成失败:', error);
        return null;
    }
}
