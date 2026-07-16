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

  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId || undefined);
  const { data, isLoading } = useUsers({
    ...filters,
    classSectionId: sectionId || undefined,
  });

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
        _status: u.isActive ? "Active" : "Inactive",
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Students</h1>
          <p className="mt-1 text-sm text-muted">
            {meta.total} students enrolled
          </p>
        </div>
        <ExportDropdown onExport={handleExport} disabled={students.length === 0} />
      </div>

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
              className="w-full rounded-lg border border-border bg-white py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>

          <select
            className="rounded-lg border border-border px-3 py-2 text-sm"
            value={levelId}
            onChange={(e) => {
              setLevelId(e.target.value);
              setSectionId("");
              setFilters((f) => ({ ...f, classSectionId: undefined, page: 1 }));
            }}
          >
            <option value="">All Levels</option>
            {levels?.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          {levelId && (
            <select
              className="rounded-lg border border-border px-3 py-2 text-sm"
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                setFilters((f) => ({ ...f, page: 1 }));
              }}
            >
              <option value="">All Sections</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>
              ))}
            </select>
          )}
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
                        {user.student?.studentIdNumber || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {user.student?.classSection ? (
                        <span className="text-sm">
                          {classDisplayName(user.student.classSection)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{user.student?.gender || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.phone && <p>{user.phone}</p>}
                        {user.student?.parentUser && (
                          <p className="text-xs text-muted">
                            Parent: {user.student.parentUser.firstName} {user.student.parentUser.lastName}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "success" : "danger"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              Showing {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1}–
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) - 1 }))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="flex items-center px-3 text-sm text-muted">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))}
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
