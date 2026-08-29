"use client";

import { useEffect } from "react";
import { useTerms } from "@/hooks/use-academic";

/**
 * Which term the fee screens are about.
 *
 * Every question a bursar is asked is about one term — "has she paid for this
 * term", "what is still out for Term 2" — so the term is the first thing on
 * every one of these pages and the last thing to change on its own. It opens
 * on the current term and stays wherever it is put.
 *
 * Terms are labelled with their year because a school looking at February is
 * usually chasing money from November, and "Term 1" alone does not say which.
 */
export function TermPicker({
  value,
  onChange,
  label = "Term",
  id = "fee-term",
}: {
  value: string;
  onChange: (termId: string) => void;
  label?: string;
  id?: string;
}) {
  const { data: terms } = useTerms();

  useEffect(() => {
    if (value || !terms?.length) return;
    const current = terms.find((t: { isCurrent?: boolean }) => t.isCurrent);
    onChange((current ?? terms[terms.length - 1]).id);
  }, [terms, value, onChange]);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-input bg-surface px-3 py-2 text-sm"
      >
        {!terms?.length && <option value="">Loading…</option>}
        {terms?.map(
          (t: {
            id: string;
            name: string;
            isCurrent?: boolean;
            academicYear?: { name: string };
          }) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.academicYear ? ` · ${t.academicYear.name}` : ""}
              {t.isCurrent ? " (current)" : ""}
            </option>
          ),
        )}
      </select>
    </div>
  );
}
