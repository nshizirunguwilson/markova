import { describe, it, expect } from 'vitest';
import { cn, toLocalDateString } from './utils';

describe('toLocalDateString', () => {
  it('should format date as YYYY-MM-DD', () => {
    const date = new Date(2026, 2, 22); // March 22, 2026
    expect(toLocalDateString(date)).toBe('2026-03-22');
  });

  it('should handle single-digit months and days with zero padding', () => {
    const date = new Date(2026, 0, 5); // January 5, 2026
    expect(toLocalDateString(date)).toBe('2026-01-05');
  });

  it('should handle December 31st correctly', () => {
    const date = new Date(2025, 11, 31); // December 31, 2025
    expect(toLocalDateString(date)).toBe('2025-12-31');
  });
});

describe('cn', () => {
  it('should merge tailwind classes correctly', () => {
    const result = cn('px-4', 'py-2', 'text-sm');
    expect(result).toBe('px-4 py-2 text-sm');
  });

  it('should handle conflicting classes via twMerge behavior', () => {
    // twMerge should resolve conflicts — last conflicting class wins
    const result = cn('px-4', 'px-6');
    expect(result).toBe('px-6');
  });

  it('should handle conditional classes via clsx', () => {
    const isActive = true;
    const result = cn('base', isActive && 'active', false && 'hidden');
    expect(result).toBe('base active');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
  });
});
