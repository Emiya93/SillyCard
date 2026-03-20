/**
 * 代码层规则组装器
 * 组装所有代码层规则（角色人设、响应格式、游戏逻辑等）
 */

import { CHARACTER_PROFILE_RULES } from './characterProfileRules';
import { buildBehaviorRules } from './behaviorRules';
import { GAMEPLAY_LOGIC_RULES } from './gameplayLogicRules';
import { RESPONSE_FORMAT_RULES } from './responseFormatRules';
import { EMOTION_CLOTHING_RULES } from './emotionClothingRules';
import { LOCATION_INTERACTION_RULES } from './locationInteractionRules';
import { SOCIAL_MEDIA_RULES } from './socialMediaRules';
import { TIME_SCHEDULE_RULES } from './timeScheduleRules';

/**
 * 组装基础代码层规则
 * 这些规则是固定的，不随游戏状态变化
 * 注意：behaviorRules会根据当前好感度、堕落度动态裁剪，只保留当前阶段需要的行为规则
 */
export function assembleCodeRules(favorability?: number, degradation?: number): string {
  const rules = [
    CHARACTER_PROFILE_RULES,
    buildBehaviorRules(favorability, degradation),
    TIME_SCHEDULE_RULES,
    LOCATION_INTERACTION_RULES,
    SOCIAL_MEDIA_RULES,
    GAMEPLAY_LOGIC_RULES,
    EMOTION_CLOTHING_RULES,
    RESPONSE_FORMAT_RULES,
  ];

  return rules.join('\n\n');
}

