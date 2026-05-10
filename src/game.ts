import type { CaseData } from './types';

const STREAK_KEY = 'courtcall_streak';
const LAST_DATE_KEY = 'courtcall_last_date';

function dateToSeed(date: string): number {
  return date.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0);
}

export function getDailyCase(
  allCases: Record<string, CaseData>,
  schedule: Record<string, string>,
  date: string,
): string {
  if (schedule[date]) return schedule[date];
  // Fallback: seeded pick from all cases for unscheduled days
  const keys = Object.keys(allCases);
  const idx = Math.abs(dateToSeed(date)) % keys.length;
  return keys[idx];
}

export function getStreak(): number {
  return parseInt(localStorage.getItem(STREAK_KEY) ?? '0', 10);
}

export function updateStreak(date: string): void {
  const last = localStorage.getItem(LAST_DATE_KEY) ?? '';
  if (last === date) return;

  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const current = getStreak();
  const next = last === yesterdayStr ? current + 1 : 1;
  localStorage.setItem(STREAK_KEY, String(next));
  localStorage.setItem(LAST_DATE_KEY, date);
}
