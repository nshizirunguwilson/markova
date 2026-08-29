"use client";

import { FamilyFees } from "@/components/finance/family-fees";
import { useAuthStore } from "@/stores/auth-store";

/**
 * A student's own fee account.
 *
 * Here because a student who cannot see their marks is owed an explanation
 * they can read themselves, rather than one only their parent can reach.
 */
export default function StudentFeesPage() {
  const { user } = useAuthStore();

  return (
    <FamilyFees
      studentId={user?.studentId ?? ""}
      emptyMessage="No student record is linked to this account."
    />
  );
}
