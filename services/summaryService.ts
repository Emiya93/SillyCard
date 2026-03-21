import { BodyStatus } from '../types';
import { DialogueRound } from './dialogueSummaryUtils';

type SummaryAIConfig = {
    apiBase: string;
    apiKey: string;
    model: string;
};

type SummaryRequestKind = 'small' | 'merged' | 'big';

type SummaryGenerationOptions = {
    kind: SummaryRequestKind;
    maxTokens: number;
    retryMaxTokens: number;
    minLength: number;
    maxLength: number;
};

type SummaryAPIResponse = {
    choices?: Array<{
        message?: {
            content?: string | Array<{ type?: string; text?: string }>;
        };
        finish_reason?: string | null;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
};

export class SummaryRequestError extends Error {
    status?: number;
    retryAfterMs?: number;

    constructor(message: string, options?: { status?: number; retryAfterMs?: number }) {
        super(message);
        this.name = 'SummaryRequestError';
        this.status = options?.status;
        this.retryAfterMs = options?.retryAfterMs;
    }
}

const SMALL_SUMMARY_OPTIONS: SummaryGenerationOptions = {
    kind: 'small',
    maxTokens: 8192,
    retryMaxTokens: 16384,
    minLength: 30,
    maxLength: 200,
};

const MERGED_SUMMARY_OPTIONS: SummaryGenerationOptions = {
    kind: 'merged',
    maxTokens: 8192,
    retryMaxTokens: 16384,
    minLength: 20,
    maxLength: 200,
};

const BIG_SUMMARY_OPTIONS: SummaryGenerationOptions = {
    kind: 'big',
    maxTokens: 16384,
    retryMaxTokens: 32768,
    minLength: 60,
    maxLength: 600,
};

function formatBodyStatusForSummary(bodyStatus: BodyStatus): string {
    const displayLocation = bodyStatus.exactLocation
        ? `${bodyStatus.location}（${bodyStatus.exactLocation}）`
        : bodyStatus.location;

    return [
        '妹妹人设：温婉是哥哥的妹妹，敏感、细腻、会把和哥哥的互动偷偷记在心里。写总结时应保留她自己的情绪和少女心，不要写成旁白总结。',
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

    return cleaned.trim();
}

function formatRoundText(round: DialogueRound): string {
    const userText = cleanMessageText(round.userMessage.text);
    const replyText = round.replyMessages
        .map((message) => cleanMessageText(message.text))
        .filter((text) => text.length > 0)
        .join('\n');

    return `用户：${userText || '（空）'}\n温婉：${replyText || '（空）'}`;
}

function extractMessageContent(
    content: string | Array<{ type?: string; text?: string }> | undefined,
): string {
    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => (typeof part?.text === 'string' ? part.text : ''))
            .filter(Boolean)
            .join('');
    }

    return '';
}

function normalizeSummaryText(text: string): string {
    let normalized = text.trim();

    normalized = normalized.replace(/^["']|["']$/g, '');
    normalized = normalized.replace(/^```(?:text|markdown)?/i, '');
    normalized = normalized.replace(/```$/i, '');
    normalized = normalized.replace(/^日记内容[:：]\s*/i, '');
    normalized = normalized.replace(/^总结[:：]\s*/i, '');

    return normalized.trim();
}

function clampSummaryLength(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.substring(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function parseRetryAfterMs(value: string | null): number | undefined {
    if (!value) {
        return undefined;
    }

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.max(0, Math.round(seconds * 1000));
    }

    const retryAt = Date.parse(value);
    if (Number.isNaN(retryAt)) {
        return undefined;
    }

    return Math.max(0, retryAt - Date.now());
}

async function fetchSummaryCompletion(
    summaryPrompt: string,
    mainAIConfig: SummaryAIConfig,
    maxTokens: number,
): Promise<{ text: string; finishReason?: string | null }> {
    const response = await fetch(`${mainAIConfig.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mainAIConfig.apiKey}`,
        },
        body: JSON.stringify({
            model: mainAIConfig.model,
            messages: [
                {
                    role: 'system',
                    content: '你是一个剧情摘要助手。请把输入整理成简洁、完整的中文摘要正文。不要回复“好的”、不要解释、不要输出标题或列表。',
                },
                {
                    role: 'user',
                    content: summaryPrompt,
                },
            ],
            temperature: 0.3,
            max_tokens: maxTokens,
            stream: false,
        }),
    });

    if (!response.ok) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        let errorMessage = `API请求失败: ${response.status}`;

        try {
            const errorData = await response.json();
            const apiMessage = errorData?.error?.message || errorData?.message;
            if (typeof apiMessage === 'string' && apiMessage.trim()) {
                errorMessage = `API请求失败: ${response.status} - ${apiMessage.trim()}`;
            }
        } catch {
            // Ignore non-JSON error bodies.
        }

        throw new SummaryRequestError(errorMessage, {
            status: response.status,
            retryAfterMs,
        });
    }

    const data: SummaryAPIResponse = await response.json();
    const choice = data.choices?.[0];
    const text = extractMessageContent(choice?.message?.content);

    return {
        text: normalizeSummaryText(text),
        finishReason: choice?.finish_reason,
    };
}

function shouldRetrySummary(text: string, finishReason: string | null | undefined, minLength: number): boolean {
    if (!text) {
        return true;
    }

    if (finishReason === 'length') {
        return true;
    }

    return text.length < minLength;
}

async function requestSummaryFromAI(
    summaryPrompt: string,
    mainAIConfig: SummaryAIConfig,
    options: SummaryGenerationOptions,
): Promise<string> {
    const firstAttempt = await fetchSummaryCompletion(summaryPrompt, mainAIConfig, options.maxTokens);

    if (!shouldRetrySummary(firstAttempt.text, firstAttempt.finishReason, options.minLength)) {
        return firstAttempt.text;
    }

    console.warn(
        `[summaryService] ${options.kind} summary too short or truncated, retrying with a larger token budget.`,
        {
            length: firstAttempt.text.length,
            finishReason: firstAttempt.finishReason,
            maxTokens: options.maxTokens,
        },
    );

    const retryPrompt = `${summaryPrompt}\n\n补充要求：上一次输出过短或被截断了。这一次请直接输出完整正文，不要寒暄，不要解释，不要写“好的”。`;
    const retryAttempt = await fetchSummaryCompletion(retryPrompt, mainAIConfig, options.retryMaxTokens);

    return retryAttempt.text.length >= firstAttempt.text.length
        ? retryAttempt.text
        : firstAttempt.text;
}

export async function summarizeDialogueRounds(
    rounds: DialogueRound[],
    mainAIConfig: SummaryAIConfig,
    bodyStatus: BodyStatus,
): Promise<string | null> {
    const cleanedRounds = rounds
        .map((round) => ({
            ...round,
            userMessage: {
                ...round.userMessage,
                text: cleanMessageText(round.userMessage.text),
            },
            replyMessages: round.replyMessages
                .map((message) => ({
                    ...message,
                    text: cleanMessageText(message.text),
                }))
                .filter((message) => message.text.length > 0),
        }))
        .filter((round) => round.userMessage.text.length > 0 || round.replyMessages.length > 0);

    if (cleanedRounds.length === 0) {
        return null;
    }

    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase) {
        console.warn('[summaryService] 摘要AI配置不完整，跳过本次摘要，等待后续重试');
        return null;
    }

    const roundTexts = cleanedRounds.map((round, index) => {
        const formatted = formatRoundText(round);
        return `${index + 1}. ${formatted.substring(0, 400)}${formatted.length > 400 ? '...' : ''}`;
    });

    const summaryPrompt = `请你把下面这几轮互动整理成一小段“温婉写给自己的日记”。

重要要求：
1. 尽量控制在50-100字之间；如果为了保证内容完整，可以放宽到200字以内
2. 必须使用第一人称“我”，写成妹妹晚上偷偷记下来的日记口吻
3. 这是“用户发言 + 温婉回复”的完整对话，请同时参考双方内容再写
4. 只保留关键事件、情绪变化、关系变化，以及温婉对哥哥的感受
5. 结合下方人设与当前状态来决定语气，不要写成旁白，不要直接引用原对话
6. 不要输出标题、解释、Markdown、JSON

妹妹人设与当前状态：
${formatBodyStatusForSummary(bodyStatus)}

对话内容：
${roundTexts.join('\n\n')}

日记内容（目标50-100字，最多200字）：`;

    try {
        const summary = await requestSummaryFromAI(summaryPrompt, mainAIConfig, SMALL_SUMMARY_OPTIONS);

        if (summary.length < SMALL_SUMMARY_OPTIONS.minLength) {
            console.warn('[summaryService] 总结过短，跳过本次摘要，等待后续重试');
            return null;
        }

        return clampSummaryLength(summary, SMALL_SUMMARY_OPTIONS.maxLength);
    } catch (error: any) {
        if (error instanceof SummaryRequestError) {
            throw error;
        }
        console.error('总结生成失败:', error);
        return null;
    }
}

export async function summarizeSummaryEntries(
    summaryEntries: string[],
    mainAIConfig: SummaryAIConfig,
    bodyStatus: BodyStatus,
): Promise<string | null> {
    const cleanedEntries = summaryEntries
        .map((entry) => cleanMessageText(entry))
        .filter((entry) => entry.length > 0)
        .slice(0, 10);

    if (cleanedEntries.length === 0) {
        return null;
    }

    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase) {
        console.warn('[summaryService] 归并摘要AI配置不完整，跳过本次归并，等待后续重试');
        return null;
    }

    const summaryPrompt = `请把以下多条“今日总结”再次整合成1条新的“温婉日记”，供后续对话长期使用。

重要要求：
1. 尽量控制在50-100字之间；如果为了保证信息完整，可以放宽到200字以内
2. 必须使用第一人称“我”，保持妹妹写日记的口吻
3. 只保留关键事件、关系变化、重要状态变化和她对哥哥的感受
4. 合并重复信息，不要按条目逐个复述，不要直接引用原对话内容
5. 结合下方人设与当前状态来决定语气，不要写成第三人称总结
6. 不要输出标题、解释、Markdown、JSON

妹妹人设与当前状态：
${formatBodyStatusForSummary(bodyStatus)}

今日总结列表：
${cleanedEntries.map((entry, index) => `${index + 1}. ${entry.substring(0, 160)}${entry.length > 160 ? '...' : ''}`).join('\n')}

整合后的新日记（目标50-100字，最多200字）：`;

    try {
        const summary = await requestSummaryFromAI(summaryPrompt, mainAIConfig, MERGED_SUMMARY_OPTIONS);

        if (summary.length < MERGED_SUMMARY_OPTIONS.minLength) {
            console.warn('[summaryService] 整合总结过短，跳过本次归并，等待后续重试');
            return null;
        }

        return clampSummaryLength(summary, MERGED_SUMMARY_OPTIONS.maxLength);
    } catch (error: any) {
        if (error instanceof SummaryRequestError) {
            throw error;
        }
        console.error('整合总结生成失败:', error);
        return null;
    }
}

export async function summarizeBigSummaryEntries(
    summaryEntries: string[],
    mainAIConfig: SummaryAIConfig,
    bodyStatus: BodyStatus,
): Promise<string | null> {
    const cleanedEntries = summaryEntries
        .map((entry) => cleanMessageText(entry))
        .filter((entry) => entry.length > 0)
        .slice(0, 50);

    if (cleanedEntries.length === 0) {
        return null;
    }

    if (!mainAIConfig.apiKey || !mainAIConfig.apiBase) {
        console.warn('[summaryService] 大总结AI配置不完整，跳过本次大总结，等待后续重试');
        return null;
    }

    const summaryPrompt = `请把以下50条以内的小总结整合成1条长期记忆用的大总结。

重要要求：
1. 优先控制在100-300字之间；如果为了保证信息完整，可以放宽到600字以内
2. 不要使用日记形式，不要使用第一人称
3. 使用第三人称总结温婉这段时间的重要经历、情绪变化、关系变化和状态变化
4. 去掉重复细节，保留长期有价值的信息
5. 结合下方当前状态判断哪些变化最重要
6. 不要输出标题、解释、Markdown、JSON

温婉当前状态：
${formatBodyStatusForSummary(bodyStatus)}

小总结列表：
${cleanedEntries.map((entry, index) => `${index + 1}. ${entry.substring(0, 160)}${entry.length > 160 ? '...' : ''}`).join('\n')}

大总结（目标100-300字，最多600字）：`;

    try {
        const summary = await requestSummaryFromAI(summaryPrompt, mainAIConfig, BIG_SUMMARY_OPTIONS);

        if (summary.length < BIG_SUMMARY_OPTIONS.minLength) {
            console.warn('[summaryService] 大总结过短，跳过本次大总结，等待后续重试');
            return null;
        }

        return clampSummaryLength(summary, BIG_SUMMARY_OPTIONS.maxLength);
    } catch (error: any) {
        if (error instanceof SummaryRequestError) {
            throw error;
        }
        console.error('大总结生成失败:', error);
        return null;
    }
}
