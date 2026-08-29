"use client";

import { useState } from "react";
import { FamilyFees } from "@/components/finance/family-fees";
import { useMyChildren } from "@/hooks/use-children";

/**
 * A parent's fee account, one child at a time.
 *
 * The picker appears only for a parent with more than one child, which is the
 * same rule the rest of the parent section follows: a select box with one
 * option in it is a control that cannot be used.
 */
export default function ParentFeesPage() {
  const { data: kids } = useMyChildren();
  const children = (kids ?? []).map((c) => ({ id: c.id, name: c.name }));

  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? children[0]?.id ?? "";

  return (
    <FamilyFees
      studentId={selected}
      emptyMessage="No linked children found on this account."
      picker={
        children.length > 1 ? (
          <select
            aria-label="Child"
            className="rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            value={selected}
            onChange={(e) => setPicked(e.target.value)}
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    />
  );
}
