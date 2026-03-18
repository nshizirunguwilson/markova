"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Card, CardTitle } from "@/components/ui";

export default function TeacherDashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {user?.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">Teacher Dashboard</p>
      </div>
      <Card>
        <CardTitle>My Classes</CardTitle>
        <p className="mt-4 text-sm text-muted">Class overview — coming in Sprint 4</p>
      </Card>
    </div>
  );
}
