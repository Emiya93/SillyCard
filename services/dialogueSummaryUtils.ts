import { Message } from '../types';

export const SUMMARY_BATCH_SIZE = 5;
export const SUMMARY_MAX_BATCH_SIZE = 20;

export interface DialogueRound {
    userMessage: Message;
    replyMessages: Message[];
}

function isDialogueMessage(message: Message): boolean {
    return message.sender === 'user' || message.sender === 'character' || message.isSystemAction === true;
}

export function buildDialogueRounds(messages: Message[]): DialogueRound[] {
    const rounds: DialogueRound[] = [];
    let pendingUserMessage: Message | null = null;
    let pendingStandaloneReplies: Message[] = [];

    for (const message of messages)
    {
        if (!isDialogueMessage(message))
        {
            continue;
        }

        if (message.sender === 'user' || message.isSystemAction)
        {
            pendingUserMessage = message;
            continue;
        }

        if (!pendingUserMessage)
        {
            // 角色先开场，或夹在轮次之间的独立发言，延后并入下一次完整对话轮，
            // 避免它永远停留在“未摘要历史”里重复进入 prompt。
            pendingStandaloneReplies.push(message);
            continue;
        }

        const lastRound = rounds[rounds.length - 1];
        if (lastRound && lastRound.userMessage.id === pendingUserMessage.id)
        {
            lastRound.replyMessages.push(message);
            continue;
        }

        rounds.push({
            userMessage: pendingUserMessage,
            replyMessages: [...pendingStandaloneReplies, message],
        });
        pendingStandaloneReplies = [];
    }

    return rounds.filter(round => round.replyMessages.length > 0);
}

export function getCompletedDialogueRoundCount(messages: Message[]): number {
    return buildDialogueRounds(messages).length;
}

export function getSummaryCheckpoint(messages: Message[]): number {
    const roundCount = getCompletedDialogueRoundCount(messages);
    return Math.floor(roundCount / SUMMARY_BATCH_SIZE) * SUMMARY_BATCH_SIZE;
}
