"use client";

import { formatNid, nidDigits } from "@/lib/person-form";

/**
 * Masked input for the NIDA 16-digit national ID. Displays the number in its
 * printed sections separated by spaces (1 2008 8 0123456 0 12) while the
 * caller receives raw digits only.
 */
export function NationalIdInput({
  value,
  onChange,
  onBlur,
  error,
  label,
}: {
  value: string; // raw digits, no spaces
  onChange: (digits: string) => void;
  onBlur?: () => void;
  error?: string | null;
  label?: string;
}) {
  return (
    <div className="w-full">
      <label htmlFor="f-label-national-id" className="mb-1.5 block text-sm font-medium text-foreground">
        {label ?? "National ID"}
      </label>
      <input id="f-label-national-id"
        inputMode="numeric"
        autoComplete="off"
        placeholder="1 2008 8 0123456 0 12"
        value={formatNid(value)}
        onChange={(e) => onChange(nidDigits(e.target.value))}
        onBlur={onBlur}
        className={`w-full rounded-lg border ${
          error ? "border-danger" : "border-border"
        } bg-field px-3.5 py-2.5 font-mono text-sm tracking-wider text-foreground placeholder:font-sans placeholder:tracking-normal placeholder:text-muted focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/50`}
      />
      {error ? (
        <p className="mt-1 text-sm text-danger">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          16 digits as printed on the card; spaces appear automatically
        </p>
      )}
    </div>
  );
}
