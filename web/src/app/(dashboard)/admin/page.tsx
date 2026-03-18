"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Card, CardTitle } from "@/components/ui";
import {
  Users,
  GraduationCap,
  UserCheck,
  BookOpen,
  Calendar,
  AlertTriangle,
  DollarSign,
  Library,
} from "lucide-react";

const statCards = [
  { label: "Total Students", value: "—", icon: GraduationCap, color: "text-blue-600 bg-blue-50" },
  { label: "Total Teachers", value: "—", icon: UserCheck, color: "text-emerald-600 bg-emerald-50" },
  { label: "Total Users", value: "—", icon: Users, color: "text-violet-600 bg-violet-50" },
  { label: "Subjects", value: "—", icon: BookOpen, color: "text-amber-600 bg-amber-50" },
  { label: "Attendance Today", value: "—", icon: Calendar, color: "text-cyan-600 bg-cyan-50" },
  { label: "Incidents This Term", value: "—", icon: AlertTriangle, color: "text-red-600 bg-red-50" },
  { label: "Fee Collection", value: "—", icon: DollarSign, color: "text-green-600 bg-green-50" },
  { label: "Books on Loan", value: "—", icon: Library, color: "text-orange-600 bg-orange-50" },
];

export default function AdminDashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {user?.firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Here&apos;s an overview of your school
        </p>
      </div>

      <div className="grid grid-cols-4 gap-5">
        {statCards.map((card) => (
          <Card key={card.label} padding="md" className="flex items-center gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.color}`}>
              <card.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-muted">{card.label}</p>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5">
        <Card>
          <CardTitle>Recent Activity</CardTitle>
          <p className="mt-4 text-sm text-muted">Activity feed — coming in Sprint 3</p>
        </Card>
        <Card>
          <CardTitle>Quick Actions</CardTitle>
          <p className="mt-4 text-sm text-muted">Quick action buttons — coming in Sprint 3</p>
        </Card>
      </div>
    </div>
  );
}
