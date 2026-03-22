// 黄毛系统服务 - 负责黄毛的出现、行为阶段值计算和温婉接受判定
// 注意：原弧光判定功能已移除，现在只保留黄毛相关功能

import { BodyStatus, GameTime, YellowHairInfo } from '../types';

const YELLOW_HAIR_SUPPRESSION_GAP = 60;

export function isYellowHairSuppressed(bodyStatus: BodyStatus): boolean {
  return bodyStatus.favorability - bodyStatus.degradation >= YELLOW_HAIR_SUPPRESSION_GAP;
}

// 已移除弧光判定函数（judgeArcLight, judgeArcLightAtoB, judgeArcLightC, shouldTriggerBodyModification）
// 身体改造触发逻辑已整合到 behaviorRules.ts 中

/**
 * 判定是否触发黄毛首次登场（周三触发）
 * @param bodyStatus 当前身体状态
 * @param gameTime 当前游戏时间
 * @returns 是否触发黄毛首次登场
 */
export function shouldTriggerYellowHair(bodyStatus: BodyStatus, gameTime: GameTime): boolean {
  if (isYellowHairSuppressed(bodyStatus))
  {
    return false;
  }

  // 周三时，黄毛首次出现
  // 检查是否是周三（weekday === 3）
  if (gameTime.weekday !== 3)
  {
    return false;
  }

  // 如果已经有黄毛，不再触发（兼容旧存档里的 yellowHair2）
  if (bodyStatus.yellowHair1 !== null || bodyStatus.yellowHair2 !== null)
  {
    return false;
  }

  return true;
}

function formatGameDate(gameTime: GameTime): string {
  return `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}-${String(gameTime.day).padStart(2, '0')}`;
}

/**
 * 判定是否需要生成第二个黄毛。
 * 第一个黄毛在周三首次出现后，从下一天开始可以补全另一名黄毛。
 */
export function shouldTriggerSecondYellowHair(bodyStatus: BodyStatus, gameTime: GameTime): boolean {
  if (isYellowHairSuppressed(bodyStatus))
  {
    return false;
  }

  if (bodyStatus.yellowHair1 === null || bodyStatus.yellowHair2 !== null)
  {
    return false;
  }

  if (!bodyStatus.yellowHair1.firstMetDate)
  {
    return true;
  }

  return formatGameDate(gameTime) > bodyStatus.yellowHair1.firstMetDate;
}

/**
 * 判定今天是否允许黄毛事件出现（从首次登场的周三起）
 * @param bodyStatus 当前身体状态
 * @param gameTime 当前游戏时间
 * @returns 今天是否允许黄毛事件出现
 */
export function shouldYellowHairAppearToday(bodyStatus: BodyStatus, gameTime: GameTime): boolean {
  if (isYellowHairSuppressed(bodyStatus))
  {
    return false;
  }

  // 如果还没有黄毛，不能出现
  if (bodyStatus.yellowHair1 === null && bodyStatus.yellowHair2 === null)
  {
    return false;
  }

  const firstMetDate = bodyStatus.yellowHair1?.firstMetDate || bodyStatus.yellowHair2?.firstMetDate;

  // 旧存档可能没有 firstMetDate，保持可触发。
  if (!firstMetDate)
  {
    return true;
  }

  // 从首个周三首次登场当日起，后续每一天都允许黄毛事件出现。
  return formatGameDate(gameTime) >= firstMetDate;
}

/**
 * 计算黄毛的行为阶段值（基于堕落度）
 * @param degradation 当前堕落度
 * @returns 黄毛的行为阶段值
 */
export function calculateYellowHairBehaviorStage(degradation: number): number {
  // 初始值5，随着堕落度增长而增长
  // 但不能差距太大，必须与堕落度匹配
  const behaviorStage = Math.min(degradation + 5, 100);

  // 确保行为阶段值不会跳跃太大
  // 如果堕落度很低，行为阶段值也不能太高
  // 注意：温婉接受程度分段（0-25, 26-50, 51-70, 71-90, 91-100）与黄毛行为阶段值分段（0-20, 21-40, 41-60, 61-80, 81-100）错开
  if (degradation < 25 && behaviorStage > 20)
  {
    return 20;
  }
  if (degradation < 50 && behaviorStage > 40)
  {
    return 40;
  }
  if (degradation < 70 && behaviorStage > 60)
  {
    return 60;
  }
  if (degradation < 90 && behaviorStage > 80)
  {
    return 80;
  }

  return behaviorStage;
}

export function isYellowHairInviteStage(degradation: number, yellowHairBehaviorStage?: number): boolean {
  if (degradation <= 25)
  {
    return true;
  }

  return typeof yellowHairBehaviorStage === 'number' && yellowHairBehaviorStage <= 20;
}

/**
 * 判断温婉是否会接受黄毛的要求（基于好感度和堕落度）
 * @param favorability 当前好感度（对哥哥）
 * @param degradation 当前堕落度
 * @param yellowHairBehaviorStage 黄毛的行为阶段值
 * @returns 温婉是否会接受
 */
export function willWenwanAccept(favorability: number, degradation: number, yellowHairBehaviorStage: number): boolean {
  // 好感度影响黄毛邀请的判断逻辑：
  // 好感90以上：拒绝（除非堕落高于好感）
  // 好感70-89：大概率拒绝（除非堕落高于好感）
  // 好感50-69：中概率拒绝
  // 好感30-49：小概率拒绝
  // 好感0-29：接受

  // 首先检查好感度对黄毛邀请的影响（仅针对约会邀请，行为阶段值<=20）
  if (isYellowHairInviteStage(degradation, yellowHairBehaviorStage))
  {
    // 黄毛邀请约会、看电影、拥抱
    if (favorability >= 90)
    {
      // 好感90以上：拒绝（除非堕落高于好感）
      return degradation > favorability;
    } else if (favorability >= 70)
    {
      // 好感70-89：直接拒绝（除非堕落高于好感）
      // 这里不再保留随机接受概率，否则会出现“明明高好感却鬼使神差答应”的违和情况
      return degradation > favorability;
    } else if (favorability >= 50)
    {
      // 好感50-69：中概率拒绝
      // 50%概率拒绝
      return Math.random() < 0.5;
    } else if (favorability >= 30)
    {
      // 好感30-49：小概率拒绝
      // 20%概率拒绝
      return Math.random() < 0.8;
    } else
    {
      // 好感0-29：接受
      return true;
    }
  }

  // 对于更深入的要求（接吻、调教、性交等），仍然基于堕落度判断
  // 但好感度仍然有影响：如果好感度很高，即使堕落度够，也可能拒绝
  if (yellowHairBehaviorStage <= 40)
  {
    // 黄毛要求接吻、轻度调教
    if (favorability >= 80 && degradation < favorability)
    {
      // 好感度很高且堕落度低于好感度，拒绝
      return false;
    }
    return degradation >= 26; // 需要堕落度26+
  } else if (yellowHairBehaviorStage <= 60)
  {
    // 黄毛要求中度调教、口交、手交
    if (favorability >= 80 && degradation < favorability)
    {
      return false;
    }
    return degradation >= 51; // 需要堕落度51+
  } else if (yellowHairBehaviorStage <= 80)
  {
    // 黄毛要求深度调教、性交
    if (favorability >= 80 && degradation < favorability)
    {
      return false;
    }
    return degradation >= 71; // 需要堕落度71+
  } else
  {
    // 黄毛要求完全恶堕、母狗化
    if (favorability >= 80 && degradation < favorability)
    {
      return false;
    }
    return degradation >= 91; // 需要堕落度91+
  }
}

/**
 * 生成黄毛信息（随机选择富二代或肥宅）
 * @returns 黄毛信息
 */
export function generateYellowHair(): { name: string; type: 'rich' | 'fat' } {
  const isRich = Math.random() < 0.45; // 45%概率富二代
  if (isRich)
  {
    return { name: '黄耄', type: 'rich' };
  } else
  {
    return { name: '猪楠', type: 'fat' };
  }
}

/**
 * 根据已有黄毛生成另一名黄毛，确保双黄毛都是不同身份。
 */
export function generateCompanionYellowHair(existingYellowHair: Pick<YellowHairInfo, 'type'>): { name: string; type: 'rich' | 'fat' } {
  if (existingYellowHair.type === 'rich')
  {
    return { name: '猪楠', type: 'fat' };
  }

  return { name: '黄耄', type: 'rich' };
}

function getYellowHairByName(bodyStatus: BodyStatus, yellowHairName?: string): YellowHairInfo | null {
  if (!yellowHairName)
  {
    return null;
  }

  if (bodyStatus.yellowHair1?.name === yellowHairName)
  {
    return bodyStatus.yellowHair1;
  }

  if (bodyStatus.yellowHair2?.name === yellowHairName)
  {
    return bodyStatus.yellowHair2;
  }

  return null;
}

/**
 * 决定今天出现的黄毛
 * @param bodyStatus 当前身体状态
 * @param gameTime 当前游戏时间
 * @param forcedYellowHairName 如果当前是某个黄毛的特殊事件，可强制指定该黄毛出场
 * @returns 今天出现的黄毛信息，或null
 */
export function decideTodayYellowHair(bodyStatus: BodyStatus, gameTime: GameTime, forcedYellowHairName?: string): { name: string; type: 'rich' | 'fat' } | null {
  if (isYellowHairSuppressed(bodyStatus))
  {
    return null;
  }

  // 如果还没有黄毛，返回null
  if (bodyStatus.yellowHair1 === null && bodyStatus.yellowHair2 === null)
  {
    return null;
  }

  // 如果只有一个黄毛，返回那个
  if (bodyStatus.yellowHair1 !== null && bodyStatus.yellowHair2 === null)
  {
    return { name: bodyStatus.yellowHair1.name, type: bodyStatus.yellowHair1.type };
  }

  if (bodyStatus.yellowHair1 === null && bodyStatus.yellowHair2 !== null)
  {
    return { name: bodyStatus.yellowHair2.name, type: bodyStatus.yellowHair2.type };
  }

  const forcedYellowHair = getYellowHairByName(bodyStatus, forcedYellowHairName);
  if (forcedYellowHair)
  {
    return { name: forcedYellowHair.name, type: forcedYellowHair.type };
  }

  // 如果两个黄毛都存在，日常事件时随机决定今天由谁出场
  if (bodyStatus.yellowHair1 !== null && bodyStatus.yellowHair2 !== null)
  {
    if (Math.random() < 0.5)
    {
      return { name: bodyStatus.yellowHair1.name, type: bodyStatus.yellowHair1.type };
    }

    return { name: bodyStatus.yellowHair2.name, type: bodyStatus.yellowHair2.type };
  }

  return null;
}

// 已移除弧光D结局判定函数（shouldGenerateArcLightDEnding）

