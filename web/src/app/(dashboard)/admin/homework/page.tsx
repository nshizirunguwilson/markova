"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
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
import { Plus, Pencil, Trash2, ClipboardList, Search } from "lucide-react";
import { toast } from "sonner";

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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [modalLevelId, setModalLevelId] = useState("");
  const { data: modalSections } = useSections(modalLevelId || undefined);

  const [form, setForm] = useState({
    title: "",
    description: "",
    subjectId: "",
    classSectionId: "",
    termId: "",
    teacherId: "",
    dueDate: "",
    totalMarks: 100,
  });

  const resetForm = () => {
    setForm({ title: "", description: "", subjectId: "", classSectionId: "", termId: "", teacherId: "", dueDate: "", totalMarks: 100 });
    setEditingId(null);
    setModalLevelId("");
    setShowModal(false);
  };

  const handleEdit = (hw: any) => {
    setForm({
      title: hw.title,
      description: hw.description || "",
      subjectId: hw.subjectId || "",
      classSectionId: hw.classSectionId || "",
      termId: hw.termId || "",
      teacherId: hw.teacherId || "",
      dueDate: hw.dueDate ? new Date(hw.dueDate).toISOString().slice(0, 10) : "",
      totalMarks: hw.totalMarks || 100,
    });
    if (hw.classSection?.classLevelId) setModalLevelId(hw.classSection.classLevelId);
    setEditingId(hw.id);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.title || !form.subjectId || !form.classSectionId) {
      return toast.error("Title, subject, and class are required");
    }
    const payload = { ...form, dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined };
    if (editingId) {
      updateHomework.mutate({ id: editingId, ...payload }, { onSuccess: resetForm });
    } else {
      createHomework.mutate(payload, { onSuccess: resetForm });
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteHomework.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Homework</h1>
          <p className="mt-1 text-sm text-muted">Manage homework assignments</p>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Create Homework
        </Button>
      </div>

      <Card padding="sm" className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <select
            className="rounded-lg border border-border px-3 py-2 text-sm"
            value={filterLevelId}
            onChange={(e) => { setFilterLevelId(e.target.value); setFilterSectionId(""); }}
          >
            <option value="">All Levels</option>
            {levels?.map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {filterLevelId && (
            <select
              className="rounded-lg border border-border px-3 py-2 text-sm"
              value={filterSectionId}
              onChange={(e) => setFilterSectionId(e.target.value)}
            >
              <option value="">All Sections</option>
              {filterSections?.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <select
            className="rounded-lg border border-border px-3 py-2 text-sm"
            value={filterSubjectId}
            onChange={(e) => setFilterSubjectId(e.target.value)}
          >
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
                    {hw.classSection?.classLevel?.name} {hw.classSection?.name}
                  </TableCell>
                  <TableCell>
                    {hw.teacher?.firstName} {hw.teacher?.lastName}
                  </TableCell>
                  <TableCell>
                    {hw.dueDate ? new Date(hw.dueDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>{hw.totalMarks ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(hw)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(hw.id)}>
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
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Homework title"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Subject</label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              >
                <option value="">Select subject</option>
                {subjects?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Teacher</label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={form.teacherId}
                onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
              >
                <option value="">Select teacher</option>
                {teachers.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Class Level</label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={modalLevelId}
                onChange={(e) => { setModalLevelId(e.target.value); setForm({ ...form, classSectionId: "" }); }}
              >
                <option value="">Select level</option>
                {levels?.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Section</label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={form.classSectionId}
                onChange={(e) => setForm({ ...form, classSectionId: e.target.value })}
              >
                <option value="">Select section</option>
                {modalSections?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Term</label>
              <select
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={form.termId}
                onChange={(e) => setForm({ ...form, termId: e.target.value })}
              >
                <option value="">Select term</option>
                {terms?.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Due Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Total Marks</label>
              <input
                type="number"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={form.totalMarks}
                onChange={(e) => setForm({ ...form, totalMarks: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleSave} isLoading={createHomework.isPending || updateHomework.isPending}>
              {editingId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Homework" size="sm">
        <p className="mb-4 text-sm text-muted">Are you sure you want to delete this homework?</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteHomework.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
