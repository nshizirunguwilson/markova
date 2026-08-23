"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Button,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  PageSpinner,
  Modal,
  ExportDropdown,
} from "@/components/ui";
import {
  useSubjects,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
} from "@/hooks/use-academic";
import { exportData } from "@/lib/export";
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";

const subjectSchema = z.object({
  name: z.string().min(1, "Subject name is required"),
  category: z.string().optional(),
  maxMarks: z.number().min(1, "Must be at least 1").max(1000, "Must be at most 1000"),
});
type SubjectForm = z.infer<typeof subjectSchema>;

export default function AdminSubjectsPage() {
  const { data: subjects, isLoading } = useSubjects();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [page, setPage] = useState(1);

  /**
   * Paged in the browser.
   *
   * `/academic/subjects` answers with a plain array and is used by half the
   * app, so it is not the place to introduce an envelope. Ninety rows is small
   * enough to hold and large enough that nobody should have to scroll it.
   */
  const PER_PAGE = 20;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SubjectForm>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: "", category: "", maxMarks: 100 },
  });

  const resetForm = () => {
    reset({ name: "", category: "", maxMarks: 100 });
    setEditingId(null);
    setShowModal(false);
  };

  const handleEdit = (subject: any) => {
    reset({
      name: subject.name,
      category: subject.category || "",
      maxMarks: subject.maxMarks || 100,
    });
    setEditingId(subject.id);
    setShowModal(true);
  };

  const onSubmit = (data: SubjectForm) => {
    if (editingId) {
      updateSubject.mutate({ id: editingId, ...data }, { onSuccess: resetForm });
    } else {
      createSubject.mutate(data, { onSuccess: resetForm });
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteSubject.mutate(deleteTarget.id, {
        onSuccess: () => setDeleteTarget(null),
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil((subjects?.length ?? 0) / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageOf = (rows: any[]) =>
    rows.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") => {
    exportData(format, {
      filename: "subjects",
      title: "Subjects",
      columns: [
        { header: "Name", key: "name" },
        { header: "Category", key: "category" },
        { header: "Max Marks", key: "maxMarks" },
      ],
      data: subjects || [],
    });
  };

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Manage curriculum subjects"
        actions={
          <>
            <div className="flex gap-2">
          <ExportDropdown onExport={handleExport} disabled={!subjects || subjects.length === 0} />
          <Button onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Subject
          </Button>
        </div>
          </>
        }
      />

      {isLoading ? (
        <PageSpinner />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Max Marks</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!subjects || subjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted">
                  <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No subjects yet
                </TableCell>
              </TableRow>
            ) : (
              pageOf(subjects).map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>
                    <Badge variant="info">
                      {s.category || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.maxMarks ?? 100}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button aria-label="Edit" variant="ghost" size="sm" onClick={() => handleEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button aria-label="Delete" variant="ghost" size="sm" onClick={() => setDeleteTarget({ id: s.id, name: s.name })}>
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted">
            Showing {(currentPage - 1) * PER_PAGE + 1}–
            {Math.min(currentPage * PER_PAGE, subjects.length)} of {subjects.length}
          </p>
          <div className="flex gap-2">
            <Button
              aria-label="Previous page"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center px-3 text-sm text-muted">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              aria-label="Next page"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={resetForm}
        title={editingId ? "Edit Subject" : "Add Subject"}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="f-name" className="mb-1 block text-sm font-medium">Name</label>
            <input id="f-name"
              className={`w-full rounded-lg border ${errors.name ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...register("name")}
              placeholder="e.g. Mathematics"
             aria-label="Name"/>
            {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="f-category" className="mb-1 block text-sm font-medium">Category</label>
            <input id="f-category"
              className={`w-full rounded-lg border ${errors.category ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...register("category")}
              placeholder="e.g. Sciences, Languages, Humanities"
             aria-label="Category"/>
            {errors.category && <p className="mt-1 text-xs text-danger">{errors.category.message}</p>}
          </div>
          <div>
            <label htmlFor="f-max-marks" className="mb-1 block text-sm font-medium">Max Marks</label>
            <input id="f-max-marks"
              type="number"
              className={`w-full rounded-lg border ${errors.maxMarks ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...register("maxMarks", { valueAsNumber: true })}
             aria-label="Max Marks"/>
            {errors.maxMarks && <p className="mt-1 text-xs text-danger">{errors.maxMarks.message}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button
              onClick={handleSubmit(onSubmit)}
              isLoading={createSubject.isPending || updateSubject.isPending}
            >
              {editingId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Subject"
        size="sm"
      >
        <p className="mb-4 text-sm text-muted">
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteSubject.isPending}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
