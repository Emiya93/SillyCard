import { BodyStatus, GameTime } from '../types';
import { AIConfigLike, hasValidAIConfig } from './aiConfigUtils';

export interface PhoneTweetDraft {
  content: string;
  imageDescription: string;
}

function parseTweetJson(rawText: string): PhoneTweetDraft | null {
  if (!rawText) return null;

  const trimmed = rawText.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = codeBlockMatch?.[1] || trimmed;
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  const jsonText = (jsonMatch?.[0] || candidate).trim();

  try {
    const parsed = JSON.parse(jsonText);
    if (
      typeof parsed?.content === 'string' &&
      parsed.content.trim() &&
      typeof parsed?.imageDescription === 'string' &&
      parsed.imageDescription.trim()
    ) {
      return {
        content: parsed.content.trim(),
        imageDescription: parsed.imageDescription.trim(),
      };
    }
  } catch (error) {
    console.warn('[phoneContentService] Failed to parse tweet JSON:', error);
  }

  return null;
}

function formatGameTime(gameTime?: GameTime): string {
  if (!gameTime) return '未知';

  const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}-${String(gameTime.day).padStart(2, '0')} ${String(gameTime.hour).padStart(2, '0')}:${String(gameTime.minute).padStart(2, '0')} ${weekdayNames[gameTime.weekday]}`;
}

export async function generateTweetForPhoneApp(
  params: {
    latestReply: string;
    currentStatus: BodyStatus;
    userLocation: string;
    todaySummary?: string;
    gameTime?: GameTime;
    draftTweet?: PhoneTweetDraft;
  },
  aiConfig: AIConfigLike
): Promise<PhoneTweetDraft | null> {
  if (!hasValidAIConfig(aiConfig)) {
    return null;
  }

  const prompt = `你负责生成手机 App 中展示的 X/Twitter 内容。请根据下面的剧情上下文，为温婉的账号 @wenwan_cute 生成一条推文。

要求：
1. 输出必须是 JSON，对象结构为 {"content":"...", "imageDescription":"..."}
2. content 要像真实推文，简短、自然、有少女感，控制在 30-120 字
3. imageDescription 要描述她这条推文配图里“看起来像什么”，控制在 30-120 字
4. 不要输出多余解释，不要输出 Markdown
5. 如果提供了“主剧情 AI 草稿”，你可以参考其方向，但请以手机内容的口吻重写

当前剧情时间：${formatGameTime(params.gameTime)}
哥哥位置：${params.userLocation}
温婉当前状态：
${JSON.stringify(
  {
    location: params.currentStatus.location,
    exactLocation: params.currentStatus.exactLocation,
    emotion: params.currentStatus.emotion,
    favorability: params.currentStatus.favorability,
    degradation: params.currentStatus.degradation,
    overallClothing: params.currentStatus.overallClothing,
    currentAction: params.currentStatus.currentAction,
    innerThought: params.currentStatus.innerThought,
  },
  null,
  2
)}

今日总结：
${params.todaySummary || '暂无'}

刚刚发生的剧情回复：
${params.latestReply}

主剧情 AI 草稿（可参考）：
${params.draftTweet ? JSON.stringify(params.draftTweet, null, 2) : '无'}
`;

  const response = await fetch(`${aiConfig.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: aiConfig.model,
      temperature: 0.8,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: '你是手机内容生成助手，专门为社交 App 生成自然、简洁、可直接展示的内容。你必须严格输出 JSON。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Phone AI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '';
  const parsed = parseTweetJson(rawText);

  if (!parsed) {
    throw new Error('Phone AI returned invalid tweet JSON');
  }

  return parsed;
}
