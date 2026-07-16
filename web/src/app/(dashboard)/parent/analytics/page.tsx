"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { StudentPerformance } from "@/components/student-performance";
import api from "@/lib/api";

interface Child {
  id: string;
  name: string;
}

// A parent sees the same performance profile the school sees, one child at a
// time. The backend enforces that only their own children resolve.
export default function ParentAnalyticsPage() {
  const { user } = useAuthStore();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    api
      .get(`/users/${user.id}`)
      .then((res) => {
        const links = res.data?.parentStudents || [];
        const kids = links.map((ps: any) => ({
          id: ps.student.id,
          name: `${ps.student.user.firstName} ${ps.student.user.lastName}`,
        }));
        setChildren(kids);
        if (kids.length > 0) setSelectedChild(kids[0].id);
      })
      .catch(() => {});
  }, [user?.id]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            Child performance
          </h1>
          <p className="mt-1 text-sm text-muted">
            Subjects, terms and progress, exactly as the school sees them
          </p>
        </div>
        {children.length > 1 && (
          <select
            className="rounded-lg border border-border px-3 py-2 text-sm"
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {selectedChild ? (
        <StudentPerformance studentId={selectedChild} />
      ) : (
        <p className="py-16 text-center text-sm text-muted">
          No linked children found on this account.
        </p>
      )}
    </div>
  );
}
