"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Upload,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  Avatar,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  PageSpinner,
  Modal,
} from "@/components/ui";
import { useUsers, useDeleteUser, type UserFilters } from "@/hooks/use-users";
import { AddUserModal } from "./add-user-modal";
import { BulkImportModal } from "./bulk-import-modal";

const ROLES = ["ALL", "ADMIN", "TEACHER", "STUDENT", "PARENT", "LIBRARIAN"];

const roleBadge: Record<string, "info" | "success" | "default" | "warning"> = {
  ADMIN: "info",
  TEACHER: "success",
  STUDENT: "default",
  PARENT: "warning",
  LIBRARIAN: "info",
};

export default function UsersPage() {
  const [filters, setFilters] = useState<UserFilters>({
    page: 1,
    limit: 20,
  });
  const [searchInput, setSearchInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useUsers(filters);
  const deleteMutation = useDeleteUser();

  const users = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, limit: 20, totalPages: 1 };

  const handleSearch = () => {
    setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
  };

  const handleRoleFilter = (role: string) => {
    setFilters((f) => ({
      ...f,
      role: role === "ALL" ? undefined : role,
      page: 1,
    }));
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted">
            Manage all users in the system
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setShowImportModal(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card padding="sm" className="mb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {/* Search */}
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

          {/* Role tabs */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
            {ROLES.map((role) => (
              <button
                key={role}
                onClick={() => handleRoleFilter(role)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  (filters.role || "ALL") === role
                    ? "bg-primary text-white"
                    : "text-muted hover:bg-accent-light"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted">
                    <UsersIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    <p className="font-medium">No users found</p>
                    <p className="mt-1 text-xs">Try adjusting your search or filters</p>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user: any) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={user.photoUrl}
                          fallback={`${user.firstName[0]}${user.lastName[0]}`}
                          size="sm"
                        />
                        <div>
                          <p className="font-medium">
                            {user.firstName} {user.lastName}
                          </p>
                          {user.student?.studentIdNumber && (
                            <p className="text-xs text-muted">
                              {user.student.studentIdNumber}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadge[user.role] || "default"}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.email && <p>{user.email}</p>}
                        {user.phone && (
                          <p className="text-muted">{user.phone}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? "success" : "danger"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.student?.classSection ? (
                        <span className="text-sm">
                          {user.student.classSection.classLevel.name}{" "}
                          {user.student.classSection.name}
                        </span>
                      ) : (
                        <span className="text-sm text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleDateString()
                          : "Never"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/users/${user.id}`}>
                          <Button variant="ghost" size="sm" aria-label="View user">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete user"
                          onClick={() => setDeleteTarget({ id: user.id, name: `${user.firstName} ${user.lastName}` })}
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              Showing {(meta.page - 1) * meta.limit + 1}–
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page || 1) - 1 }))
                }
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
                onClick={() =>
                  setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Add User Modal */}
      <AddUserModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
      />

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Deactivate User"
        size="sm"
      >
        <p className="mb-4 text-sm text-muted">
          Are you sure you want to deactivate <strong>{deleteTarget?.name}</strong>? They will lose access
          but their data will be preserved.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteMutation.isPending}
          >
            Deactivate
          </Button>
        </div>
      </Modal>
    </div>
  );
}
