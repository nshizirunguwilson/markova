"use client";

import { useState } from "react";
import { classDisplayName } from "@/lib/utils";
import {
  Card,
  Button,
  Badge,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Modal,
  Input,
} from "@/components/ui";
import {
  useHomeworks,
  useHomework,
  useCreateHomework,
  useDeleteHomework,
  useGradeSubmission,
} from "@/hooks/use-homework";
import { useTerms, useAcademicYears } from "@/hooks/use-academic";
import { Plus, Trash2, Eye, Check } from "lucide-react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";
import { PageHeader } from "@/components/layout/page-header";

interface Assignment {
  id: string;
  // The API returns flat ids; the nested `subject` has no id.
  subjectId: string;
  classSectionId: string;
  subject: { name: string };
  classSection: { name: string; classLevel: { name: string } };
}

export default function TeacherHomeworkPage() {
  const { user } = useAuthStore();
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);
  const currentTerm = terms?.find((t: any) => t.isCurrent);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const { data: homeworks, isLoading } = useHomeworks(currentTerm ? { termId: currentTerm.id } : undefined);
  const createHomework = useCreateHomework();
  const deleteHomework = useDeleteHomework();
  const gradeSubmission = useGradeSubmission();

  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const { data: viewingHw } = useHomework(viewingId || undefined);

  const [form, setForm] = useState({
    assignmentId: "",
    title: "",
    description: "",
    dueDate: "",
    maxMarks: 100,
    lateDeductionPerDay: 5,
  });

  useEffect(() => {
    if (!user?.id) return;
    api.get("/academic/assignments", { params: { teacherUserId: user.id } })
      .then((res) => setAssignments(res.data || []))
      .catch(() => {});
  }, [user?.id]);

  const handleCreate = () => {
    const assignment = assignments.find((a) => a.id === form.assignmentId);
    if (!assignment || !currentTerm) return;
    createHomework.mutate({
      subjectId: assignment.subjectId,
      classSectionId: assignment.classSectionId,
      termId: currentTerm.id,
      title: form.title,
      description: form.description,
      dueDate: form.dueDate,
      maxMarks: form.maxMarks,
      lateDeductionPerDay: form.lateDeductionPerDay,
    }, {
      onSuccess: () => { setShowAddModal(false); setForm({ ...form, title: "", description: "", dueDate: "" }); },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homework"
        description="Create and manage assignments"
        actions={
          <>
            <Button onClick={() => setShowAddModal(true)}>
          <Plus className="mr-1 h-4 w-4" /> Create Homework
        </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : homeworks?.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Submissions</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {homeworks.map((hw: any) => {
                const isPastDue = new Date(hw.dueDate) < new Date();
                return (
                  <TableRow key={hw.id}>
                    <TableCell className="font-medium">{hw.title}</TableCell>
                    <TableCell>{hw.subject.name}</TableCell>
                    <TableCell>{classDisplayName(hw.classSection)}</TableCell>
                    <TableCell>
                      <Badge variant={isPastDue ? "danger" : "default"}>
                        {new Date(hw.dueDate).toLocaleDateString()}
                      </Badge>
                    </TableCell>
                    <TableCell>{hw._count.submissions}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewingId(hw.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setConfirmAction(() => () => deleteHomework.mutate(hw.id)); }}>
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card><p className="text-center text-muted py-8">No homework created this term.</p></Card>
      )}

      {/* View Submissions Modal */}
      <Modal isOpen={!!viewingId} onClose={() => setViewingId(null)} title={viewingHw?.title || "Submissions"}>
        {viewingHw && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{viewingHw.description}</p>
            <p className="text-sm">
              Due: {new Date(viewingHw.dueDate).toLocaleDateString()} | Max: {viewingHw.maxMarks} |
              Submissions: {viewingHw.submissions?.length || 0}/{viewingHw.totalStudents}
            </p>
            {viewingHw.submissions?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>Marks</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewingHw.submissions.map((sub: any) => (
                    <TableRow key={sub.id}>
                      <TableCell>{sub.student.user.firstName} {sub.student.user.lastName}</TableCell>
                      <TableCell className="text-sm">{new Date(sub.submittedAt).toLocaleDateString()}</TableCell>
                      <TableCell>{sub.isLate ? <Badge variant="warning">Late</Badge> : <Badge variant="success">On time</Badge>}</TableCell>
                      <TableCell>
                        {sub.marks !== null ? (
                          <span className="font-bold">{sub.marks}/{viewingHw.maxMarks}</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            max={viewingHw.maxMarks}
                            placeholder="—"
                            className="w-16 rounded border border-input px-2 py-1 text-sm"
                            onBlur={(e) => {
                              if (e.target.value) {
                                gradeSubmission.mutate({ id: sub.id, marks: Number(e.target.value) });
                              }
                            }}
                           aria-label="—"/>
                        )}
                      </TableCell>
                      <TableCell>
                        {sub.marks !== null && <Check className="h-4 w-4 text-success" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted py-4">No submissions yet.</p>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)} title="Confirm Action">
        <p className="text-sm text-muted mb-4">Are you sure you want to delete this homework?</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { confirmAction?.(); setConfirmAction(null); }}>Confirm</Button>
        </div>
      </Modal>

      {/* Create Homework Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Create Homework">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Class & Subject</label>
            <select
              value={form.assignmentId}
              onChange={(e) => setForm({ ...form, assignmentId: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
             aria-label="Class & Subject">
              <option value="">Select...</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {classDisplayName(a.classSection)} — {a.subject.name}
                </option>
              ))}
            </select>
          </div>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Due Date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            <Input label="Max Marks" type="number" value={String(form.maxMarks)} onChange={(e) => setForm({ ...form, maxMarks: Number(e.target.value) })} />
            <Input label="Late Deduction/Day" type="number" value={String(form.lateDeductionPerDay)} onChange={(e) => setForm({ ...form, lateDeductionPerDay: Number(e.target.value) })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={createHomework.isPending}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
