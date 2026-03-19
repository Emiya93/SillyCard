import { BodyStatus, GameTime } from "../types";

export const DAILY_FAVORABILITY_GAIN_LIMIT = 10;
export const DAILY_DEGRADATION_GAIN_LIMIT = 5;

function clampDailyGain(value: number | undefined, limit: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(limit, value));
}

export function getGameDateKey(gameTime?: GameTime): string | null {
  if (!gameTime) {
    return null;
  }

  return `${gameTime.year}-${String(gameTime.month).padStart(2, "0")}-${String(gameTime.day).padStart(2, "0")}`;
}

export function syncDailyGainState(status: BodyStatus, gameTime?: GameTime): BodyStatus {
  const currentDateKey = getGameDateKey(gameTime);
  const storedDate = typeof status.lastResetDate === "string" ? status.lastResetDate : "";

  if (currentDateKey && storedDate !== currentDateKey) {
    return {
      ...status,
      todayFavorabilityGain: 0,
      todayDegradationGain: 0,
      lastResetDate: currentDateKey,
    };
  }

  const normalizedFavorabilityGain = clampDailyGain(
    status.todayFavorabilityGain,
    DAILY_FAVORABILITY_GAIN_LIMIT,
  );
  const normalizedDegradationGain = clampDailyGain(
    status.todayDegradationGain,
    DAILY_DEGRADATION_GAIN_LIMIT,
  );

  if (
    normalizedFavorabilityGain !== status.todayFavorabilityGain ||
    normalizedDegradationGain !== status.todayDegradationGain ||
    storedDate !== status.lastResetDate
  ) {
    return {
      ...status,
      todayFavorabilityGain: normalizedFavorabilityGain,
      todayDegradationGain: normalizedDegradationGain,
      lastResetDate: storedDate,
    };
  }

  return status;
}
