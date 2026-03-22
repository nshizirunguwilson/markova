"use client";

import { useState } from "react";
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
import { Search, ChevronLeft, ChevronRight, Users } from "lucide-react";

export default function AdminTeachersPage() {
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

  const getTeacherAssignments = (teacherId: string) => {
    if (!assignments) return [];
    return assignments.filter((a: any) => a.teacherId === teacherId);
  };

  const handleSearch = () => {
    setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
  };

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") => {
    exportData(format, {
      filename: "teachers",
      title: "Teachers",
      columns: [
        { header: "Name", key: "_name" },
        { header: "Email", key: "email" },
        { header: "Phone", key: "phone" },
        { header: "Employee ID", key: "teacher.employeeId" },
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Teachers</h1>
          <p className="mt-1 text-sm text-muted">
            {meta.total} teachers in the system
          </p>
        </div>
        <ExportDropdown onExport={handleExport} disabled={teachers.length === 0} />
      </div>

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
              className="w-full rounded-lg border border-border bg-white py-2 pl-10 pr-4 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {teachers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No teachers found
                  </TableCell>
                </TableRow>
              ) : (
                teachers.map((user: any) => {
                  const teacherAssignments = getTeacherAssignments(user.id);
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={user.photoUrl}
                            fallback={`${user.firstName[0]}${user.lastName[0]}`}
                            size="sm"
                          />
                          <div>
                            <p className="font-medium">{user.firstName} {user.lastName}</p>
                            {user.teacher?.employeeId && (
                              <p className="text-xs text-muted">{user.teacher.employeeId}</p>
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
                                {a.subject?.name} – {a.classSection?.classLevel?.name} {a.classSection?.name}
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
