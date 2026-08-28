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
import { useUsers, type UserFilters } from "@/hooks/use-users";
import { useAssignments, useAcademicYears } from "@/hooks/use-academic";
import { exportData } from "@/lib/export";
import { Search, ChevronLeft, ChevronRight, Users, Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";

export default function AdminTeachersPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<UserFilters>({
    page: 1,
    limit: 20,
    role: "TEACHER",
  });
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading } = useUsers(filters);
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: assignments } = useAssignments(
    currentYear ? { academicYearId: currentYear.id } : undefined
  );

  const teachers = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, limit: 20, totalPages: 1 };

  const getTeacherAssignments = (teacherId?: string) => {
    if (!assignments || !teacherId) return [];
    return assignments.filter((a: any) => a.teacherId === teacherId);
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

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") => {
    exportData(format, {
      filename: "teachers",
      title: "Teachers",
      columns: [
        { header: "Name", key: "_name" },
        { header: "Email", key: "email" },
        { header: "Phone", key: "phone" },
        { header: "Staff ID", key: "code" },
        { header: "Employment Status", key: "teacher.employmentStatus" },
        { header: "Status", key: "_status" },
      ],
      data: teachers.map((u: any) => ({
        ...u,
        _name: `${u.firstName} ${u.lastName}`,
        _status: u.isActive ? "Active" : "Inactive",
      })),
    });
  };

  return (
    <div>
      <PageHeader
        title="Teachers"
        description={<>{meta.total} teachers in the system</>}
        actions={
          <>
            <ExportDropdown onExport={handleExport} disabled={teachers.length === 0} />
          </>
        }
      />

      <Card padding="sm" className="mb-5">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
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
          <Button variant="outline" size="sm" onClick={handleSearch}>
            Search
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Employment</TableHead>
                <TableHead>Subjects & Classes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Profile</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No teachers found
                  </TableCell>
                </TableRow>
              ) : (
                teachers.map((user: any) => {
                  // An assignment's teacherId is the Teacher record's id, not
                  // the User's. Passing user.id compared two different id
                  // spaces, so every teacher read "No assignments".
                  const teacherAssignments = getTeacherAssignments(user.teacher?.id);
                  const open = () => router.push(`/admin/teachers/${user.id}`);
                  return (
                    // The whole row opens the teacher, because that is what
                    // anyone clicking a name expects; the button is there for
                    // the keyboard and for anyone who wants to be told so.
                    <TableRow
                      key={user.id}
                      className="cursor-pointer"
                      onClick={open}
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
                            {/*
                              A teacher's staff number is `user.code` (TCH-…).
                              There is no `employeeId` on the Teacher model, so
                              this line was blank for every teacher.
                            */}
                            {user.code && (
                              <p className="text-xs font-mono text-muted">{user.code}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {user.email && <p>{user.email}</p>}
                          {user.phone && <p className="text-muted">{user.phone}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {user.teacher?.employmentStatus || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {teacherAssignments.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {teacherAssignments.slice(0, 3).map((a: any) => (
                              <Badge key={a.id} variant="info">
                                {a.subject?.name} – {classDisplayName(a.classSection)}
                              </Badge>
                            ))}
                            {teacherAssignments.length > 3 && (
                              <Badge variant="default">+{teacherAssignments.length - 3} more</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted">No assignments</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "success" : "danger"}>
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`View ${user.firstName} ${user.lastName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            open();
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              Showing {meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1}–
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
