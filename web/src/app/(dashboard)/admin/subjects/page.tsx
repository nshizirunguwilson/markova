"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Button,
  Badge,
  Card,
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
  useTrades,
  useClassLevels,
} from "@/hooks/use-academic";
import { exportData } from "@/lib/export";
import { SUBJECT_SCOPES, scopeInfo, scopeLabel } from "@/lib/subject-scope";
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

const subjectSchema = z
  .object({
    name: z.string().min(1, "Subject name is required"),
    category: z.string().optional(),
    scope: z.enum(["O_CORE", "O_ELECTIVE", "A_GENERAL", "A_SPECIFIC"]),
    tradeId: z.string().optional(),
    classLevelId: z.string().optional(),
    maxMarks: z.number().min(1, "Must be at least 1").max(1000, "Must be at most 1000"),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    // The server enforces both of these and answers 400. Checking here means
    // the admin is told which field is wrong instead of watching the save fail.
    const info = scopeInfo(v.scope);
    if (info?.requiresTrade && !v.tradeId) {
      ctx.addIssue({
        code: "custom",
        path: ["tradeId"],
        message: "A trade module has to belong to a trade",
      });
    }
    if (!info?.requiresTrade && v.tradeId) {
      ctx.addIssue({
        code: "custom",
        path: ["tradeId"],
        message: "Only a trade module can belong to a trade",
      });
    }
  });

type SubjectForm = z.infer<typeof subjectSchema>;

const EMPTY: SubjectForm = {
  name: "",
  category: "",
  scope: "O_CORE",
  tradeId: "",
  classLevelId: "",
  maxMarks: 100,
  isActive: true,
};

const inputCls =
  "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30";

export default function AdminSubjectsPage() {
  const { data: subjects, isLoading } = useSubjects();
  const { data: trades } = useTrades();
  const { data: levels } = useClassLevels();
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const deleteSubject = useDeleteSubject();

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");

  /**
   * Paged in the browser.
   *
   * `/academic/subjects` answers with a plain array and is used by half the
   * app, so it is not the place to introduce an envelope. Ninety rows is small
   * enough to hold and large enough that nobody should have to scroll it.
   */
  const PER_PAGE = 20;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SubjectForm>({
    resolver: zodResolver(subjectSchema),
    defaultValues: EMPTY,
  });

  const scope = watch("scope");
  const info = scopeInfo(scope);

  const resetForm = () => {
    reset(EMPTY);
    setEditingId(null);
    setShowModal(false);
  };

  const handleEdit = (subject: any) => {
    reset({
      name: subject.name,
      category: subject.category || "",
      scope: subject.scope || "O_CORE",
      tradeId: subject.tradeId || "",
      classLevelId: subject.classLevelId || "",
      maxMarks: subject.maxMarks || 100,
      isActive: subject.isActive ?? true,
    });
    setEditingId(subject.id);
    setShowModal(true);
  };

  const onSubmit = (data: SubjectForm) => {
    // The API rejects unknown fields and empty uuids alike, so an unset
    // relation is left out rather than sent as "".
    const payload = {
      name: data.name,
      category: data.category || undefined,
      scope: data.scope,
      maxMarks: data.maxMarks,
      ...(data.tradeId ? { tradeId: data.tradeId } : {}),
      ...(data.classLevelId ? { classLevelId: data.classLevelId } : {}),
    };
    if (editingId) {
      updateSubject.mutate(
        { id: editingId, ...payload, isActive: data.isActive },
        { onSuccess: resetForm },
      );
    } else {
      createSubject.mutate(payload, { onSuccess: resetForm });
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteSubject.mutate(deleteTarget.id, {
        onSuccess: () => setDeleteTarget(null),
      });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (subjects ?? []).filter((s: any) => {
      if (scopeFilter && s.scope !== scopeFilter) return false;
      if (tradeFilter && s.tradeId !== tradeFilter) return false;
      if (!q) return true;
      return [s.name, s.category, s.trade?.code, s.trade?.name, s.classLevel?.name]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q));
    });
  }, [subjects, search, scopeFilter, tradeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE,
  );

  // How the curriculum breaks down, which is the first thing anyone opening
  // this page wants to know and the page never said.
  const counts = useMemo(() => {
    const byScope = new Map<string, number>();
    let inactive = 0;
    for (const s of subjects ?? []) {
      byScope.set(s.scope, (byScope.get(s.scope) ?? 0) + 1);
      if (s.isActive === false) inactive += 1;
    }
    return { byScope, inactive };
  }, [subjects]);

  const handleExport = (format: "json" | "csv" | "pdf" | "xlsx") => {
    exportData(format, {
      filename: "subjects",
      title: "Subjects",
      columns: [
        { header: "Name", key: "name" },
        { header: "Category", key: "category" },
        { header: "Scope", key: "_scope" },
        { header: "Trade", key: "_trade" },
        { header: "Class level", key: "_level" },
        { header: "Max Marks", key: "maxMarks" },
        { header: "Teachers", key: "_teachers" },
        { header: "Status", key: "_status" },
      ],
      data: filtered.map((s: any) => ({
        ...s,
        _scope: scopeLabel(s.scope),
        _trade: s.trade ? `${s.trade.code} — ${s.trade.name}` : "",
        _level: s.classLevel?.name ?? "All levels",
        _teachers: s._count?.teacherSubjectClasses ?? 0,
        _status: s.isActive === false ? "Inactive" : "Active",
      })),
    });
  };

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Every subject and trade module the school teaches, and how each one is marked"
        actions={
          <div className="flex gap-2">
            <ExportDropdown onExport={handleExport} disabled={filtered.length === 0} />
            <Button onClick={() => { reset(EMPTY); setEditingId(null); setShowModal(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Add Subject
            </Button>
          </div>
        }
      />

      {/* What the curriculum is made of */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SUBJECT_SCOPES.map((s) => (
          <Card key={s.value} padding="sm">
            <p className="text-xs text-muted">{s.label}</p>
            <p className="text-2xl font-bold text-foreground">
              {counts.byScope.get(s.value) ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">{s.weighting}</p>
          </Card>
        ))}
      </div>

      <Card padding="sm" className="mb-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search subjects, trades or levels..."
              aria-label="Search subjects"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className={`${inputCls} pl-10`}
            />
          </div>
          <select
            aria-label="Filter by scope"
            className={inputCls}
            value={scopeFilter}
            onChange={(e) => { setScopeFilter(e.target.value); setPage(1); }}
          >
            <option value="">All scopes</option>
            {SUBJECT_SCOPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            aria-label="Filter by trade"
            className={inputCls}
            value={tradeFilter}
            onChange={(e) => { setTradeFilter(e.target.value); setPage(1); }}
          >
            <option value="">All trades</option>
            {trades?.map((t: any) => (
              <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>How it is marked</TableHead>
                <TableHead>In use</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted">
                    <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    {subjects?.length ? "No subject matches that" : "No subjects yet"}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((s: any) => {
                  const meta = scopeInfo(s.scope);
                  const teachers = s._count?.teacherSubjectClasses ?? 0;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="font-medium">{s.name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {s.category && (
                            <span className="text-xs text-muted">{s.category}</span>
                          )}
                          {s.isActive === false && <Badge variant="danger">Inactive</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta?.countsTowardAggregate ? "info" : "warning"}>
                          {scopeLabel(s.scope)}
                        </Badge>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {meta?.countsTowardAggregate
                            ? "Counts toward the aggregate"
                            : "Outside the aggregate"}
                        </p>
                      </TableCell>
                      <TableCell>
                        {s.trade ? (
                          <span title={s.trade.name}>{s.trade.code}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.classLevel?.name ?? (
                          <span className="text-muted">All levels</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs">{meta?.weighting ?? "—"}</p>
                        <p className="text-[11px] text-muted">
                          Out of {s.maxMarks ?? 100} · {meta?.scale}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs">
                          {teachers} {teachers === 1 ? "teacher" : "teachers"}
                        </p>
                        <p className="text-[11px] text-muted">
                          {s._count?.marks ?? 0} marks recorded
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button aria-label={`Edit ${s.name}`} variant="ghost" size="sm" onClick={() => handleEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button aria-label={`Delete ${s.name}`} variant="ghost" size="sm" onClick={() => setDeleteTarget(s)}>
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted">
            Showing {(currentPage - 1) * PER_PAGE + 1}–
            {Math.min(currentPage * PER_PAGE, filtered.length)} of {filtered.length}
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

      {/* Create / Edit */}
      <Modal
        isOpen={showModal}
        onClose={resetForm}
        title={editingId ? "Edit Subject" : "Add Subject"}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="f-name" className="mb-1 block text-sm font-medium">Name</label>
              <input id="f-name"
                className={`${inputCls} ${errors.name ? "border-danger" : ""}`}
                {...register("name")}
                placeholder="e.g. Mathematics"
                aria-label="Name"/>
              {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
            </div>
            <div>
              <label htmlFor="f-category" className="mb-1 block text-sm font-medium">Category</label>
              <input id="f-category"
                className={inputCls}
                {...register("category")}
                placeholder="e.g. Sciences, Languages, Humanities"
                aria-label="Category"/>
            </div>
          </div>

          <div>
            <label htmlFor="f-scope" className="mb-1 block text-sm font-medium">Scope</label>
            <select
              id="f-scope"
              aria-label="Scope"
              className={inputCls}
              {...register("scope", {
                onChange: (e) => {
                  // A trade belongs to exactly one scope; leaving a stale one
                  // behind is refused by the server.
                  if (!scopeInfo(e.target.value)?.requiresTrade) setValue("tradeId", "");
                },
              })}
            >
              {SUBJECT_SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.stage} — {s.label}
                </option>
              ))}
            </select>
            {info && (
              <div className="mt-2 rounded-lg bg-accent-light/60 px-3 py-2 text-xs text-foreground-muted">
                <p>{info.hint}</p>
                <p className="mt-1">
                  Term mark: {info.weighting}. Graded on the {info.scale} scale, and{" "}
                  {info.countsTowardAggregate ? "counted toward" : "left out of"} the aggregate.
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="f-trade" className="mb-1 block text-sm font-medium">Trade</label>
              <select
                id="f-trade"
                aria-label="Trade"
                className={`${inputCls} disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted`}
                disabled={!info?.requiresTrade}
                {...register("tradeId")}
              >
                <option value="">
                  {info?.requiresTrade ? "Select a trade..." : "Not a trade module"}
                </option>
                {trades?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
                ))}
              </select>
              {errors.tradeId && <p className="mt-1 text-xs text-danger">{errors.tradeId.message}</p>}
            </div>
            <div>
              <label htmlFor="f-level" className="mb-1 block text-sm font-medium">Class level</label>
              <select id="f-level" aria-label="Class level" className={inputCls} {...register("classLevelId")}>
                <option value="">Every level</option>
                {levels?.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">Pin it to one year, or leave it open.</p>
            </div>
            <div>
              <label htmlFor="f-max-marks" className="mb-1 block text-sm font-medium">Max Marks</label>
              <input id="f-max-marks"
                type="number"
                className={`${inputCls} ${errors.maxMarks ? "border-danger" : ""}`}
                {...register("maxMarks", { valueAsNumber: true })}
                aria-label="Max Marks"/>
              {errors.maxMarks && <p className="mt-1 text-xs text-danger">{errors.maxMarks.message}</p>}
            </div>
          </div>

          {editingId && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("isActive")} className="h-4 w-4 rounded border-border" />
              <span>
                Active
                <span className="ml-1 text-xs text-muted">
                  — a subject with marks against it cannot be deleted, only deactivated
                </span>
              </span>
            </label>
          )}

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
        {/* Deleting a subject cascades to its marks, so the server refuses when
            any exist. Saying so here means the admin is not surprised by a
            rejection after pressing a destructive button. */}
        {(deleteTarget?._count?.marks ?? 0) > 0 && (
          <p className="mb-4 rounded-lg bg-warning-wash px-3 py-2 text-sm text-warning">
            {deleteTarget._count.marks} marks have been recorded against this
            subject, so it cannot be deleted. Edit it and untick Active instead.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={(deleteTarget?._count?.marks ?? 0) > 0}
            isLoading={deleteSubject.isPending}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
