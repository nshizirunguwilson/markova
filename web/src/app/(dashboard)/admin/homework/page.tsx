"use client";

import { useState, useEffect } from "react";
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
import {
  Plus,
  Pencil,
  Trash2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toLocalDateString, classDisplayName, sectionLabel } from "@/lib/utils";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";

/**
 * Who an assessment is for is fixed once it exists, so those four controls are
 * disabled while editing and their values are never sent on an update.
 * Requiring them anyway meant a row the API returned without a term could not
 * be edited at all: the form refused, and it refused on a control the person
 * could not reach to fix. So the requirement is carried in the data rather
 * than in two schemas, which react-hook-form would not swap between anyway.
 */
const homeworkSchema = z
  .object({
    // Not `.default()`: that makes the field optional on the way in, which no
    // longer matches the resolver's own type. The default lives in
    // `defaultValues` instead.
    kind: z.enum(["HOMEWORK", "ASSIGNMENT", "QUIZ", "TEST", "PROJECT", "PRACTICAL"]),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    subjectId: z.string(),
    classSectionId: z.string(),
    termId: z.string(),
    teacherId: z.string(),
    dueDate: z.string().min(1, "Due date is required"),
    maxMarks: z.number().min(1, "Must be at least 1").max(1000, "Max 1000"),
    /** Not a field on screen: which of the two shapes above is being asked for. */
    editing: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.editing) return;
    const required = [
      ["subjectId", "Subject is required"],
      ["classSectionId", "Class section is required"],
      ["termId", "Term is required"],
      ["teacherId", "Teacher is required"],
    ] as const;
    for (const [field, message] of required) {
      if (!value[field]) {
        ctx.addIssue({ code: "custom", path: [field], message });
      }
    }
  });
type HomeworkForm = z.infer<typeof homeworkSchema>;

const defaultValues: HomeworkForm = {
  kind: "HOMEWORK",
  title: "",
  description: "",
  subjectId: "",
  classSectionId: "",
  termId: "",
  teacherId: "",
  dueDate: "",
  maxMarks: 100,
  editing: false,
};

/**
 * What a teacher can set. One model behind them all, because they differ only
 * in what they are called and how much they are worth.
 */
const KIND_LABELS: Record<string, string> = {
  HOMEWORK: "Homework",
  ASSIGNMENT: "Assignment",
  QUIZ: "Quiz",
  TEST: "Test",
  PROJECT: "Project",
  PRACTICAL: "Practical",
};

export default function AdminHomeworkPage() {
  const [filterLevelId, setFilterLevelId] = useState("");
  const [filterSectionId, setFilterSectionId] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [page, setPage] = useState(1);
  const { data: filterSections } = useSections(filterLevelId || undefined);

  // Always paged on this screen: a whole school sets hundreds of assessments a
  // term, and the teacher and student views read the same endpoint unpaged.
  const params: Record<string, string> = { page: String(page), limit: "20" };
  if (filterSectionId) params.classSectionId = filterSectionId;
  if (filterSubjectId) params.subjectId = filterSubjectId;
  if (filterKind) params.kind = filterKind;

  const { data: response, isLoading } = useHomeworks(params);
  const homeworks: any[] = response?.data ?? [];
  const meta = response?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 };

  // Narrowing the list while deep in it would land on a page that is gone.
  useEffect(() => {
    setPage(1);
  }, [filterSectionId, filterSubjectId, filterKind]);
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
      editing: true,
    });
    if (hw.classSection?.classLevelId) setModalLevelId(hw.classSection.classLevelId);
    setEditingId(hw.id);
    setShowModal(true);
  };

  const onSubmit = ({ editing: _editing, ...data }: HomeworkForm) => {
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
        _dueDate: hw.dueDate ? new Date(hw.dueDate).toLocaleDateString() : "-",
      })),
    });
  };

  return (
    <div>
      <PageHeader
        title="Assessments"
        description="Homework, assignments, quizzes, tests and projects across the school"
        actions={
          <>
            <div className="flex gap-2">
          <ExportDropdown onExport={handleExport} disabled={!homeworks || homeworks.length === 0} />
          <Button onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            New assessment
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
                <option key={s.id} value={s.id}>{sectionLabel(s)}</option>
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

          <select
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            aria-label="All Types"
          >
            <option value="">All Types</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
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
                  No assessments found
                </TableCell>
              </TableRow>
            ) : (
              homeworks.map((hw: any) => (
                <TableRow key={hw.id}>
                  <TableCell className="font-medium">
                    <div>{hw.title}</div>
                    <Badge variant="default" className="mt-1">
                      {KIND_LABELS[hw.kind] ?? "Homework"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="info">{hw.subject?.name || "-"}</Badge>
                  </TableCell>
                  <TableCell>
                    {classDisplayName(hw.classSection)}
                  </TableCell>
                  <TableCell>
                    {hw.teacher?.firstName} {hw.teacher?.lastName}
                  </TableCell>
                  <TableCell>
                    {hw.dueDate ? new Date(hw.dueDate).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell>{hw.maxMarks ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button aria-label="Edit" variant="ghost" size="sm" onClick={() => handleEdit(hw)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button aria-label="Delete" variant="ghost" size="sm" onClick={() => setDeleteTarget({ id: hw.id, title: hw.title })}>
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

      {!isLoading && meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted">
            Showing {(meta.page - 1) * meta.limit + 1}-
            {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
          </p>
          <div className="flex gap-2">
            <Button
              aria-label="Previous page"
              variant="outline"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center px-3 text-sm text-muted">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              aria-label="Next page"
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={resetForm} title={editingId ? "Edit assessment" : "New assessment"} size="lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="f-kind" className="mb-1 block text-sm font-medium">Type</label>
            <select
              id="f-kind"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              {...register("kind")}
              aria-label="Type"
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-title" className="mb-1 block text-sm font-medium">Title</label>
            <input id="f-title"
              className={`w-full rounded-lg border ${errors.title ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
              {...register("title")}
              placeholder="e.g. Algebra sheet 3"
             aria-label="Title"/>
            {errors.title && <p className="mt-1 text-xs text-danger">{errors.title.message}</p>}
          </div>
          <div>
            <label htmlFor="f-description" className="mb-1 block text-sm font-medium">Description</label>
            <textarea id="f-description"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              rows={3}
              {...register("description")}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="f-subject" className="mb-1 block text-sm font-medium">Subject</label>
              <select id="f-subject"
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
              <label htmlFor="f-teacher" className="mb-1 block text-sm font-medium">Teacher</label>
              <select id="f-teacher"
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
              <label htmlFor="f-class-level" className="mb-1 block text-sm font-medium">Class Level</label>
              <select id="f-class-level"
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
              <label htmlFor="f-section" className="mb-1 block text-sm font-medium">Section</label>
              <select id="f-section"
                className={`w-full rounded-lg border ${errors.classSectionId ? "border-danger" : "border-border"} px-3 py-2 text-sm disabled:bg-muted/10 disabled:text-muted`}
                disabled={!!editingId}
                value={watch("classSectionId") || ""}
                onChange={(e) => setValue("classSectionId", e.target.value, { shouldValidate: true })}
               aria-label="Section">
                <option value="">Select section</option>
                {modalSections?.map((s: any) => (
                  <option key={s.id} value={s.id}>{sectionLabel(s)}</option>
                ))}
              </select>
              {errors.classSectionId && <p className="mt-1 text-xs text-danger">{errors.classSectionId.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="f-term" className="mb-1 block text-sm font-medium">Term</label>
              <select id="f-term"
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
              <label htmlFor="f-due-date" className="mb-1 block text-sm font-medium">Due Date</label>
              <input id="f-due-date"
                type="date"
                className={`w-full rounded-lg border ${errors.dueDate ? "border-danger" : "border-border"} px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30`}
                {...register("dueDate")}
               aria-label="Due Date"/>
              {errors.dueDate && <p className="mt-1 text-xs text-danger">{errors.dueDate.message}</p>}
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
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete assessment" size="sm">
        <p className="mb-4 text-sm text-muted">Are you sure you want to delete <strong>{deleteTarget?.title}</strong>?</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteHomework.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
