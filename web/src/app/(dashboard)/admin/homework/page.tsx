"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
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
  useHomeworks,
  useCreateHomework,
  useUpdateHomework,
  useDeleteHomework,
} from "@/hooks/use-homework";
import {
  useClassLevels,
  useSections,
  useSubjects,
  useAcademicYears,
  useTerms,
} from "@/hooks/use-academic";
import { useUsers } from "@/hooks/use-users";
import { exportData } from "@/lib/export";
import { Plus, Pencil, Trash2, ClipboardList } from "lucide-react";
import { toLocalDateString, classDisplayName } from "@/lib/utils";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";

const homeworkSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  subjectId: z.string().min(1, "Subject is required"),
  classSectionId: z.string().min(1, "Class section is required"),
  termId: z.string().min(1, "Term is required"),
  teacherId: z.string().min(1, "Teacher is required"),
  dueDate: z.string().min(1, "Due date is required"),
  maxMarks: z.number().min(1, "Must be at least 1").max(1000, "Max 1000"),
});
type HomeworkForm = z.infer<typeof homeworkSchema>;

const defaultValues: HomeworkForm = {
  title: "",
  description: "",
  subjectId: "",
  classSectionId: "",
  termId: "",
  teacherId: "",
  dueDate: "",
  maxMarks: 100,
};

export default function AdminHomeworkPage() {
  const [filterLevelId, setFilterLevelId] = useState("");
  const [filterSectionId, setFilterSectionId] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const { data: filterSections } = useSections(filterLevelId || undefined);

  const params: Record<string, string> = {};
  if (filterSectionId) params.classSectionId = filterSectionId;
  if (filterSubjectId) params.subjectId = filterSubjectId;

  const { data: homeworks, isLoading } = useHomeworks(Object.keys(params).length > 0 ? params : undefined);
  const { data: levels } = useClassLevels();
  const { data: subjects } = useSubjects();
  const { data: years } = useAcademicYears();
  const { data: teacherData } = useUsers({ role: "TEACHER", limit: 100 });

  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);

  const createHomework = useCreateHomework();
  const updateHomework = useUpdateHomework();
  const deleteHomework = useDeleteHomework();

  const teachers = teacherData?.data || [];


  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const [modalLevelId, setModalLevelId] = useState("");
  const { data: modalSections } = useSections(modalLevelId || undefined);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<HomeworkForm>({
    resolver: zodResolver(homeworkSchema),
    defaultValues,
  });

  const resetForm = () => {
    reset(defaultValues);
    setEditingId(null);
    setModalLevelId("");
    setShowModal(false);
  };

  const handleEdit = (hw: any) => {
    reset({
      title: hw.title,
      description: hw.description || "",
      subjectId: hw.subjectId || "",
      classSectionId: hw.classSectionId || "",
      termId: hw.termId || "",
      teacherId: hw.teacherId || "",
      dueDate: hw.dueDate ? toLocalDateString(new Date(hw.dueDate)) : "",
      maxMarks: hw.maxMarks || 100,
    });
    if (hw.classSection?.classLevelId) setModalLevelId(hw.classSection.classLevelId);
    setEditingId(hw.id);
    setShowModal(true);
  };

  const onSubmit = (data: HomeworkForm) => {
    const dueDate = data.dueDate ? new Date(data.dueDate).toISOString() : undefined;
    if (editingId) {
      // A homework's recipients (subject/class/term/teacher) are fixed; update
      // only its editable content fields.
      updateHomework.mutate(
        {
          id: editingId,
          title: data.title,
          description: data.description,
          dueDate,
          maxMarks: data.maxMarks,
        },
        { onSuccess: resetForm }
      );
    } else {
      createHomework.mutate({ ...data, dueDate }, { onSuccess: resetForm });
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteHomework.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
    }
  };

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") => {
    exportData(format, {
      filename: "homework",
      title: "Homework",
      columns: [
        { header: "Title", key: "title" },
        { header: "Subject", key: "subject.name" },
        { header: "Class", key: "_class" },
        { header: "Teacher", key: "_teacher" },
        { header: "Due Date", key: "_dueDate" },
        { header: "Max Marks", key: "maxMarks" },
      ],
      data: (homeworks || []).map((hw: any) => ({
        ...hw,
        _class: classDisplayName(hw.classSection),
        _teacher: `${hw.teacher?.firstName || ""} ${hw.teacher?.lastName || ""}`.trim(),
        _dueDate: hw.dueDate ? new Date(hw.dueDate).toLocaleDateString() : "—",
      })),
    });
  };

  return (
    <div>
      <PageHeader
        title="Homework"
        description="Manage homework assignments"
        actions={
          <>
            <div className="flex gap-2">
          <ExportDropdown onExport={handleExport} disabled={!homeworks || homeworks.length === 0} />
          <Button onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Create Homework
          </Button>
        </div>
          </>
        }
      />

      <Card padding="sm" className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <select
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={filterLevelId}
            onChange={(e) => { setFilterLevelId(e.target.value); setFilterSectionId(""); }}
           aria-label="All Levels">
            <option value="">All Levels</option>
            {levels?.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {filterLevelId && (
            <select
              className="rounded-lg border border-input px-3 py-2 text-sm"
              value={filterSectionId}
              onChange={(e) => setFilterSectionId(e.target.value)}
             aria-label="All Sections">
              <option value="">All Sections</option>
              {filterSections?.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <select
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={filterSubjectId}
            onChange={(e) => setFilterSubjectId(e.target.value)}
           aria-label="All Subjects">
            <option value="">All Subjects</option>
            {subjects?.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Teacher</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Marks</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!homeworks || homeworks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted">
                  <ClipboardList className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No homework found
                </TableCell>
              </TableRow>
            ) : (
              homeworks.map((hw: any) => (
                <TableRow key={hw.id}>
                  <TableCell className="font-medium">{hw.title}</TableCell>
                  <TableCell>
                    <Badge variant="info">{hw.subject?.name || "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    {classDisplayName(hw.classSection)}
                  </TableCell>
                  <TableCell>
                    {hw.teacher?.firstName} {hw.teacher?.lastName}
                  </TableCell>
                  <TableCell>
                    {hw.dueDate ? new Date(hw.dueDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>{hw.maxMarks ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(hw)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ id: hw.id, title: hw.title })}>
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

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? "Edit Homework" : "Create Homework"} size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input
              className={`w-full rounded-lg border ${errors.title ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...register("title")}
              placeholder="Homework title"
             aria-label="Title"/>
            {errors.title && <p className="mt-1 text-xs text-danger">{errors.title.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              className={`w-full rounded-lg border ${errors.description ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              rows={3}
              {...register("description")}
            />
            {errors.description && <p className="mt-1 text-xs text-danger">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Subject</label>
              <select
                className={`w-full rounded-lg border ${errors.subjectId ? "border-danger" : "border-border"} px-3 py-2 text-sm disabled:bg-muted/10 disabled:text-muted`}
                disabled={!!editingId}
                {...register("subjectId")}
               aria-label="Subject">
                <option value="">Select subject</option>
                {subjects?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {errors.subjectId && <p className="mt-1 text-xs text-danger">{errors.subjectId.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Teacher</label>
              <select
                className={`w-full rounded-lg border ${errors.teacherId ? "border-danger" : "border-border"} px-3 py-2 text-sm disabled:bg-muted/10 disabled:text-muted`}
                disabled={!!editingId}
                {...register("teacherId")}
               aria-label="Teacher">
                <option value="">Select teacher</option>
                {teachers.map((t: any) => (
                  <option key={t.id} value={t.teacher?.id || t.id}>{t.firstName} {t.lastName}</option>
                ))}
              </select>
              {errors.teacherId && <p className="mt-1 text-xs text-danger">{errors.teacherId.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Class Level</label>
              <select
                className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:bg-muted/10 disabled:text-muted"
                value={modalLevelId}
                disabled={!!editingId}
                onChange={(e) => { setModalLevelId(e.target.value); setValue("classSectionId", ""); }}
               aria-label="Class Level">
                <option value="">Select level</option>
                {levels?.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Section</label>
              <select
                className={`w-full rounded-lg border ${errors.classSectionId ? "border-danger" : "border-border"} px-3 py-2 text-sm disabled:bg-muted/10 disabled:text-muted`}
                disabled={!!editingId}
                value={watch("classSectionId") || ""}
                onChange={(e) => setValue("classSectionId", e.target.value, { shouldValidate: true })}
               aria-label="Section">
                <option value="">Select section</option>
                {modalSections?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {errors.classSectionId && <p className="mt-1 text-xs text-danger">{errors.classSectionId.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Term</label>
              <select
                className={`w-full rounded-lg border ${errors.termId ? "border-danger" : "border-border"} px-3 py-2 text-sm disabled:bg-muted/10 disabled:text-muted`}
                disabled={!!editingId}
                {...register("termId")}
               aria-label="Term">
                <option value="">Select term</option>
                {terms?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {errors.termId && <p className="mt-1 text-xs text-danger">{errors.termId.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Due Date</label>
              <input
                type="date"
                className={`w-full rounded-lg border ${errors.dueDate ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
                {...register("dueDate")}
               aria-label="Due Date"/>
              {errors.dueDate && <p className="mt-1 text-xs text-danger">{errors.dueDate.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Max Marks</label>
              <input
                type="number"
                className={`w-full rounded-lg border ${errors.maxMarks ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
                {...register("maxMarks", { valueAsNumber: true })}
               aria-label="Max Marks"/>
              {errors.maxMarks && <p className="mt-1 text-xs text-danger">{errors.maxMarks.message}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={resetForm}>Cancel</Button>
            <Button type="submit" isLoading={createHomework.isPending || updateHomework.isPending}>
              {editingId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Homework" size="sm">
        <p className="mb-4 text-sm text-muted">Are you sure you want to delete <strong>{deleteTarget?.title}</strong>?</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteHomework.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
