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
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useAcademicYears,
  useClassLevels,
  useSections,
  useSubjects,
} from "@/hooks/use-academic";
import { useUsers } from "@/hooks/use-users";
import { Plus, Trash2, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function AdminTimetablePage() {
  const { data: years } = useAcademicYears();
  const { data: levels } = useClassLevels();
  const { data: subjects } = useSubjects();
  const { data: teacherData } = useUsers({ role: "TEACHER", limit: 100 });

  const currentYear = years?.find((y: any) => y.isCurrent);
  const [filterLevelId, setFilterLevelId] = useState("");
  const [filterSectionId, setFilterSectionId] = useState("");
  const { data: filterSections } = useSections(filterLevelId || undefined);

  const { data: assignments, isLoading } = useAssignments({
    academicYearId: currentYear?.id,
    classSectionId: filterSectionId || undefined,
  });

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ teacherId: "", subjectId: "", classSectionId: "", academicYearId: "" });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const teachers = teacherData?.data || [];

  const handleCreate = () => {
    if (!form.teacherId || !form.subjectId || !form.classSectionId) {
      return toast.error("All fields are required");
    }
    createAssignment.mutate(
      { ...form, academicYearId: currentYear?.id },
      { onSuccess: () => { setShowModal(false); setForm({ teacherId: "", subjectId: "", classSectionId: "", academicYearId: "" }); } }
    );
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteAssignment.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
    }
  };

  // For the section selector in the create modal
  const [modalLevelId, setModalLevelId] = useState("");
  const { data: modalSections } = useSections(modalLevelId || undefined);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Timetable / Assignments</h1>
          <p className="mt-1 text-sm text-muted">
            Teacher-Subject-Class assignments for {currentYear?.name || "current year"}
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Assignment
        </Button>
      </div>

      <Card padding="sm" className="mb-5">
        <div className="flex items-center gap-4">
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
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Teacher</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Class</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!assignments || assignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted">
                  <Calendar className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No assignments found
                </TableCell>
              </TableRow>
            ) : (
              assignments.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.teacher?.firstName} {a.teacher?.lastName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="info">{a.subject?.name}</Badge>
                  </TableCell>
                  <TableCell>
                    {a.classSection?.classLevel?.name} {a.classSection?.name}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(a.id)}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      {/* Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Assignment" size="lg">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Teacher</label>
            <select
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={form.teacherId}
              onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
            >
              <option value="">Select teacher</option>
              {teachers.map((t: any) => (
                <option key={t.id} value={t.teacher?.id || t.id}>{t.firstName} {t.lastName}</option>
              ))}
            </select>
          </div>
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
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={createAssignment.isPending}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Assignment" size="sm">
        <p className="mb-4 text-sm text-muted">Remove this teacher-subject-class assignment?</p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} isLoading={deleteAssignment.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
