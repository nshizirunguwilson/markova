"use client";

import { useState } from "react";
import { Accessibility, Search } from "lucide-react";

import { Badge, Button, Card, ExportDropdown, Input, Modal, Spinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { SupportPlanCard } from "@/components/support/support-plan-card";
import { useSupportRegister } from "@/hooks/use-support";
import { useUsers } from "@/hooks/use-users";
import { useDebounce } from "@/hooks/use-debounce";
import { exportData } from "@/lib/export";
import { dayWords, schoolToday } from "@/lib/standing";
import { classDisplayName } from "@/lib/utils";

/**
 * Every student's support plan (B7 in docs/STUDENT-LIFE-DESIGN.md).
 *
 * The Director of Studies and the nurse keep them here; the principal reads
 * them. Exported, it is the list a school sends with its national exam
 * registration.
 */
export default function SupportPlansPage() {
  const { data: plans, isLoading } = useSupportRegister();
  const [open, setOpen] = useState<{ studentId: string; name: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const query = useDebounce(search, 300);
  const { data: found } = useUsers({
    role: "STUDENT",
    studentStatus: "ACTIVE",
    search: query || undefined,
    limit: 8,
  });
  const today = schoolToday();
  const rows = plans ?? [];

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") =>
    exportData(format, {
      filename: "support-plans",
      title: "Support plans",
      columns: [
        { header: "Name", key: "name" },
        { header: "Student ID", key: "studentIdNumber" },
        { header: "Class", key: "class" },
        { header: "Needs", key: "_needs" },
        { header: "In exams", key: "_arrangements" },
        { header: "Look again on", key: "_review" },
      ],
      data: rows.map((r) => ({
        ...r,
        _needs: r.needs.join(", "),
        _arrangements: r.arrangements.join(", "),
        _review: r.reviewOn ? r.reviewOn.slice(0, 10) : "",
      })),
    });

  return (
    <div>
      <PageHeader
        title="Support plans"
        description="Students with special needs, and what is done for them in tests and exams"
        actions={
          <>
            <ExportDropdown onExport={handleExport} disabled={rows.length === 0} />
            <Button onClick={() => setAdding(true)}>Add a plan</Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-muted">
          <Accessibility className="mx-auto mb-2 h-10 w-10 text-border-strong" aria-hidden="true" />
          No student has a support plan yet.
        </Card>
      ) : (
        <Card padding="sm">
          <ul className="divide-y divide-border" aria-label="Support plans">
            {rows.map((r) => {
              const overdue = !!r.reviewOn && r.reviewOn.slice(0, 10) < today;
              return (
                <li key={r.studentId}>
                  <button
                    type="button"
                    onClick={() => setOpen({ studentId: r.studentId, name: r.name })}
                    className="flex w-full flex-wrap items-start gap-x-4 gap-y-1 px-2 py-3 text-left hover:bg-surface-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{r.name}</span>
                      <span className="block text-xs text-muted">
                        {r.class} · {r.studentIdNumber}
                      </span>
                    </span>
                    <span className="min-w-0 flex-[2] text-sm text-foreground">
                      {r.arrangements.join(", ") || "Nothing different in exams"}
                      <span className="block text-xs text-muted">{r.needs.join(", ")}</span>
                    </span>
                    {r.reviewOn && (
                      <span className="text-xs text-muted">
                        {overdue ? <Badge variant="warning">Look at it again</Badge> : `Again on ${dayWords(r.reviewOn)}`}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {adding && (
        <Modal isOpen onClose={() => setAdding(false)} title="Add a support plan">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-[2.35rem] h-4 w-4 text-muted" aria-hidden="true" />
              <Input
                label="Find the student"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or student ID"
                className="pl-9"
              />
            </div>
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {(found?.data ?? []).map((u: any) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setOpen({ studentId: u.student.id, name: `${u.firstName} ${u.lastName}` });
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
                  >
                    <span className="font-medium text-foreground">
                      {u.firstName} {u.lastName}
                    </span>{" "}
                    <span className="text-muted">{classDisplayName(u.student?.classSection)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}

      {open && (
        <Modal isOpen onClose={() => setOpen(null)} title={open.name}>
          <SupportPlanCard studentId={open.studentId} name={open.name} />
        </Modal>
      )}
    </div>
  );
}
