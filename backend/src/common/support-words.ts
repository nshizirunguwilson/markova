import { SupportArrangement, SupportNeed } from '@prisma/client';

/**
 * A support plan, in the words an invigilator or a teacher reads (B7).
 */
export const NEED_LABEL: Record<SupportNeed, string> = {
  SEEING: 'Seeing',
  HEARING: 'Hearing',
  MOVING: 'Moving about',
  LEARNING: 'Learning',
  SPEECH: 'Speech',
  LONG_TERM_ILLNESS: 'Long-term illness',
  OTHER: 'Other',
};

export const ARRANGEMENT_LABEL: Record<SupportArrangement, string> = {
  EXTRA_TIME: 'Extra time',
  READER: 'A reader',
  SCRIBE: 'A scribe',
  LARGE_PRINT: 'Large print',
  BRAILLE: 'Braille',
  SIGN_LANGUAGE: 'A sign language interpreter',
  SEPARATE_ROOM: 'A separate room',
  REST_BREAKS: 'Rest breaks',
  NEAR_THE_FRONT: 'Sits near the front',
  USE_A_COMPUTER: 'Uses a computer',
};

/** "25% extra time", "Large print", ... in the order a plan lists them. */
export function arrangementWords(plan: {
  arrangements: SupportArrangement[];
  extraTimePercent: number | null;
  otherArrangement: string | null;
}): string[] {
  const words = plan.arrangements.map((a) =>
    a === 'EXTRA_TIME' && plan.extraTimePercent
      ? `${plan.extraTimePercent}% extra time`
      : ARRANGEMENT_LABEL[a],
  );
  if (plan.otherArrangement?.trim()) words.push(plan.otherArrangement.trim());
  return words;
}

/**
 * The extra time an exam gives, in minutes, from its start and end ("08:00",
 * "10:00") and the share the plan gives. Rounded up: a student is never
 * given less than the plan says.
 */
export function extraMinutes(
  startTime: string,
  endTime: string,
  percent: number | null,
): number | null {
  if (!percent) return null;
  const minutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const length = minutes(endTime) - minutes(startTime);
  if (!(length > 0)) return null;
  return Math.ceil((length * percent) / 100);
}
