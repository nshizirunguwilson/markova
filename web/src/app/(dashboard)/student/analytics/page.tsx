"use client";

import { useAuthStore } from "@/stores/auth-store";
import { StudentPerformance } from "@/components/student-performance";

// A student's own performance profile - the same view their teachers see.
export default function StudentAnalyticsPage() {
  const user = useAuthStore((s) => s.user);

  if (!user?.studentId) {
    return (
      <p className="py-16 text-center text-sm text-muted">
        Your student record could not be found.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">My performance</h1>
        <p className="mt-1 text-sm text-muted">
          Your subjects, terms and progress across the year
        </p>
      </div>
      <StudentPerformance studentId={user.studentId} />
    </div>
  );
}
