"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { THEME_HINT, THEME_LABEL, THEMES, type Theme } from "@/lib/theme";
import { useThemeStore } from "@/stores/theme-store";

/**
 * Three buttons rather than a switch.
 *
 * A two-state toggle cannot express "follow the machine", and hiding that
 * behind a long-press or a settings page means the reader whose laptop goes
 * dark at sunset never finds it. Three segments show all three answers and
 * which one is currently chosen, in one glance and one click.
 *
 * It is a radio group, not a row of buttons: they are three values of one
 * setting, so a screen reader should announce it as such, and the arrow keys
 * should move between them the way they do in every other radio group.
 */

const ICON: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeSwitch({ className = "" }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`flex items-center gap-0.5 rounded-lg bg-surface-muted p-0.5 ${className}`}
    >
      {THEMES.map((option) => {
        const Icon = ICON[option];
        const active = theme === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${THEME_LABEL[option]} theme`}
            title={THEME_HINT[option]}
            onClick={() => setTheme(option)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {THEME_LABEL[option]}
          </button>
        );
      })}
    </div>
  );
}
