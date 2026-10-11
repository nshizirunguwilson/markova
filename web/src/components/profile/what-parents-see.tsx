"use client";

import { Eye } from "lucide-react";
import { Card } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";
import { useChangeSharing, useMySharing, type Sharing } from "@/hooks/use-sharing";

const SWITCHES: { key: "results" | "conduct" | "health"; label: string; hint: string }[] = [
  { key: "results", label: "Results", hint: "Marks and report cards" },
  { key: "conduct", label: "Attendance and discipline", hint: "Registers, absence texts, conduct" },
  { key: "health", label: "Health visits", hint: "The sick bay and medicines" },
];

/**
 * What a student of 18 lets their parents see (A8 in
 * docs/STUDENT-LIFE-DESIGN.md).
 *
 * Everything is shared until the student chooses; most are happy to keep it
 * that way, and a family should not find a page gone dark on a birthday.
 * Before 18, and when the school has no date of birth, it says so instead.
 */
export function WhatParentsSee() {
  const role = useAuthStore((s) => s.user?.role);
  const { data } = useMySharing(role === "STUDENT");
  const change = useChangeSharing();
  if (role !== "STUDENT" || !data) return null;

  return (
    <Card className="p-6 space-y-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Eye aria-hidden="true" className="h-4 w-4 text-muted" />
        What your parents can see
      </h2>
      {data.adult ? (
        <>
          <p className="text-sm text-muted">
            You are 18 or over, so you decide. Your school fees are always shared
            with whoever pays them.
          </p>
          <ul className="space-y-3">
            {SWITCHES.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-4">
                <label htmlFor={`share-${s.key}`} className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{s.label}</span>
                  <span className="block text-xs text-muted">{s.hint}</span>
                </label>
                <input
                  id={`share-${s.key}`}
                  type="checkbox"
                  role="switch"
                  aria-checked={data[s.key as keyof Sharing] as boolean}
                  checked={data[s.key as keyof Sharing] as boolean}
                  disabled={change.isPending}
                  onChange={(e) => change.mutate({ [s.key]: e.target.checked })}
                  className="h-5 w-5 rounded border-border"
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted" data-testid="sharing-not-yet">
          {data.knowsBirthday
            ? "From your 18th birthday you decide what your parents can see of your results, attendance and health visits. Until then, they see your records."
            : "The school has no date of birth for you yet, so your parents see your records. Ask the office to add it: from your 18th birthday you decide."}
        </p>
      )}
    </Card>
  );
}
