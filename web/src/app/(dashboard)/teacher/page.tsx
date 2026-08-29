"use client";

import { useAuthStore } from "@/stores/auth-store";
import { classDisplayName } from "@/lib/utils";
import { Card, CardTitle, PageSpinner } from "@/components/ui";
import { useAssignments } from "@/hooks/use-academic";
import Link from "next/link";
import {
  BookOpen,
  ClipboardList,
  PenLine,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export default function TeacherDashboard() {
  const user = useAuthStore((s) => s.user);
  const { data: assignments, isLoading } = useAssignments(
    user?.id ? { teacherId: user.id } : undefined
  );

  if (isLoading) return <PageSpinner />;

  const assignmentList: any[] = assignments ?? [];

  // Deduplicate classes taught
  const uniqueClasses = new Map<string, string>();
  assignmentList.forEach((a: any) => {
    const section = a.classSection;
    if (section && !uniqueClasses.has(section.id)) {
      const label = section.classLevel
        ? classDisplayName(section)
        : section.name;
      uniqueClasses.set(section.id, label);
    }
  });

  const quickLinks = [
    { label: "Enter Marks", href: "/teacher/marks", icon: PenLine },
    { label: "Record Attendance", href: "/teacher/attendance", icon: ClipboardList },
    { label: "Homework", href: "/teacher/homework", icon: BookOpen },
  ];

  return (
    <div>
      <div className="mb-8">
        <PageHeader
          title={<>Welcome back, {user?.firstName}</>}
          description="Teacher Dashboard"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            My Assignments
          </CardTitle>
          <p className="mt-3 text-3xl font-bold text-foreground">
            {assignmentList.length}
          </p>
          <p className="mt-1 text-sm text-muted">
            {uniqueClasses.size} {uniqueClasses.size === 1 ? "class" : "classes"}
          </p>
        </Card>

        <Card className="sm:col-span-1 lg:col-span-2">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            My Schedule
          </CardTitle>
          {assignmentList.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No assignments found.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {assignmentList.slice(0, 6).map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {a.subject?.name ?? "-"}
                    </span>
                    <span className="mx-2 text-muted">|</span>
                    <span className="text-sm text-muted">
                      {classDisplayName(a.classSection)}
                    </span>
                  </div>
                </div>
              ))}
              {assignmentList.length > 6 && (
                <p className="text-xs text-muted">
                  +{assignmentList.length - 6} more
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-8">
        <Card>
          <CardTitle>Quick Links</CardTitle>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-lg border border-border p-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/10"
              >
                <div className="flex items-center gap-3">
                  <link.icon className="h-5 w-5 text-primary" />
                  {link.label}
                </div>
                <ArrowRight className="h-4 w-4 text-muted" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
