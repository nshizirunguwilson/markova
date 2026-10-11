"use client";

import { useState, useEffect } from "react";
import { classDisplayName } from "@/lib/utils";
import {
  Card,
  Button,
  Badge,
  Avatar,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  PageSpinner,
  ExportDropdown,
} from "@/components/ui";
import { useRouter } from "next/navigation";
import { useUsers, type UserFilters } from "@/hooks/use-users";
import { useClassLevels, useSections } from "@/hooks/use-academic";
import { exportData } from "@/lib/export";
import { Search, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { STANDING_LABEL } from "@/lib/standing";

export default function AdminStudentsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<UserFilters>({
    page: 1,
    limit: 20,
    role: "STUDENT",
  });
  const [searchInput, setSearchInput] = useState("");
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  // Default to today's school: former students live behind this filter.
  const [status, setStatus] = useState("ACTIVE");

  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId || undefined);
  const { data, isLoading } = useUsers({
    ...filters,
    classSectionId: sectionId || undefined,
    studentStatus: status || undefined,
  });
  /* Students with no date of birth are treated as under 18, so their
     parents see everything whatever their age (A8). The school is told how
     many, and can list them to fix. */
  const { data: undated } = useUsers({
    role: "STUDENT",
    studentStatus: "ACTIVE",
    noDateOfBirth: true,
    limit: 1,
  });
  const undatedCount: number = undated?.meta?.total ?? 0;

  const students = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, limit: 20, totalPages: 1 };

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") => {
    exportData(format, {
      filename: "students",
      title: "Students",
      columns: [
        { header: "Name", key: "_name" },
        { header: "Email", key: "email" },
        { header: "Student ID", key: "student.studentIdNumber" },
        { header: "Class", key: "_class" },
        { header: "Gender", key: "student.gender" },
        { header: "Phone", key: "phone" },
        { header: "Status", key: "_status" },
      ],
      data: students.map((u: any) => ({
        ...u,
        _name: `${u.firstName} ${u.lastName}`,
        _class: classDisplayName(u.student?.classSection),
        _status: u.student?.status
          ? u.student.status.charAt(0) + u.student.status.slice(1).toLowerCase()
          : u.isActive
            ? "Active"
            : "Inactive",
      })),
    });
  };

  const handleSearch = () => {
    setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
  };

  // Auto-search: debounce typing into the query (no button needed)
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => {
        const next = searchInput.trim() || undefined;
        if (f.search === next) return f;
        return { ...f, search: next, page: 1 };
      });
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  return (
    <div>
      <PageHeader
        title="Students"
        description={<>{meta.total} students enrolled</>}
        actions={
          <>
            <ExportDropdown onExport={handleExport} disabled={students.length === 0} />
          </>
        }
      />

      {undatedCount > 0 && (
        <Card padding="sm" className="mb-5">
          <div
            className="flex flex-wrap items-center justify-between gap-3"
            data-testid="undated-students"
          >
            <p className="text-sm text-foreground">
              {undatedCount === 1
                ? "1 student has no date of birth."
                : `${undatedCount} students have no date of birth.`}{" "}
              <span className="text-muted">
                They are treated as under 18, so their parents see all their
                records. Adding the date lets a student of 18 decide.
              </span>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  noDateOfBirth: f.noDateOfBirth ? undefined : true,
                  page: 1,
                }))
              }
            >
              {filters.noDateOfBirth ? "Show everyone" : "Show them"}
            </Button>
          </div>
        </Card>
      )}

      <Card padding="sm" className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
             aria-label="Search by name, email, or phone..."/>
          </div>

          <select
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={levelId}
            onChange={(e) => {
              setLevelId(e.target.value);
              setSectionId("");
              setFilters((f) => ({ ...f, classSectionId: undefined, page: 1 }));
            }}
           aria-label="All Levels">
            <option value="">All Levels</option>
            {levels?.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          {levelId && (
            <select
              className="rounded-lg border border-input px-3 py-2 text-sm"
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
             aria-label="All Sections">
              <option value="">All Sections</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>
              ))}
            </select>
          )}

          <select
            aria-label="Filter students by status"
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setFilters((f) => ({ ...f, page: 1 }));
            }}
          >
            {Object.entries(STANDING_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <option value="">All statuses</option>
          </select>
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted">
                    <GraduationCap className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No students found
                  </TableCell>
                </TableRow>
              ) : (
                students.map((user: any) => (
                  <TableRow
                    key={user.id}
                    className={user.student?.id ? "cursor-pointer" : undefined}
                    onClick={() =>
                      user.student?.id && router.push(`/admin/students/${user.student.id}`)
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={user.photoUrl}
                          fallback={`${user.firstName[0]}${user.lastName[0]}`}
                          size="sm"
                        />
                        <div>
                          <p className="font-medium">{user.firstName} {user.lastName}</p>
                          {user.email && <p className="text-xs text-muted">{user.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">
                        {user.student?.studentIdNumber || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {user.student?.classSection ? (
                        <span className="text-sm">
                          {classDisplayName(user.student.classSection)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{user.student?.gender || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.phone && <p>{user.phone}</p>}
                        {/*
                          Students rarely carry a phone of their own, so the
                          number worth showing is a parent's. The relation is
                          `parentStudents`; the old `parentUser` field never
                          existed, which left this column blank for everyone.
                        */}
                        {user.student?.parentStudents?.[0]?.parent && (
                          <>
                            {!user.phone && user.student.parentStudents[0].parent.phone && (
                              <p>{user.student.parentStudents[0].parent.phone}</p>
                            )}
                            <p className="text-xs text-muted">
                              {user.student.parentStudents[0].relationship || "Parent"}:{" "}
                              {user.student.parentStudents[0].parent.firstName}{" "}
                              {user.student.parentStudents[0].parent.lastName}
                            </p>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.student?.status === "ACTIVE"
                            ? "success"
                            : user.student?.status === "GRADUATED"
                              ? "info"
                              : user.student?.status === "EXPELLED"
                                ? "danger"
                                : "default"
                        }
                      >
                        {user.student?.status
                          ? (STANDING_LABEL[
                              user.student.status as keyof typeof STANDING_LABEL
                            ] ?? user.student.status)
                          : user.isActive
                            ? "Active"
                            : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              Showing {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1}-
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <Button aria-label="Previous page"
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                // Stepped from the page the footer is showing, which is the
              // one the server answered with, not the one that was asked for.
              onClick={() => setFilters((f) => ({ ...f, page: meta.page - 1 }))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex items-center px-3 text-sm text-muted">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button aria-label="Next page"
                variant="outline"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: meta.page + 1 }))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
