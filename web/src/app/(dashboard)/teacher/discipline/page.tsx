"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
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
import { useIncidents, useCreateIncident } from "@/hooks/use-discipline";
import { useTerms, useAcademicYears } from "@/hooks/use-academic";
import { StudentPicker } from "@/components/student-picker";
import { AlertTriangle, Plus } from "lucide-react";
import { toLocalDateString } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

const ACTION_LABELS: Record<string, string> = {
  VERBAL_WARNING: "Verbal Warning",
  WRITTEN_WARNING: "Written Warning",
  DETENTION: "Detention",
  SUSPENSION: "Suspension",
  EXPULSION: "Expulsion",
};

export default function TeacherDisciplinePage() {
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: terms } = useTerms(currentYear?.id);
  const currentTerm = terms?.find((t: any) => t.isCurrent);

  const { data: incidents, isLoading } = useIncidents(currentTerm ? { termId: currentTerm.id } : undefined);
  const createIncident = useCreateIncident();
  const [showAddModal, setShowAddModal] = useState(false);

  const [form, setForm] = useState({
    studentId: "",
    date: toLocalDateString(new Date()),
    time: "",
    location: "",
    description: "",
    pointsDeducted: 5,
    actionTaken: "VERBAL_WARNING",
  });

  const handleCreate = () => {
    if (!currentTerm) return;
    createIncident.mutate(
      { ...form, termId: currentTerm.id },
      { onSuccess: () => { setShowAddModal(false); setForm({ ...form, description: "", studentId: "" }); } }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discipline"
        description="Record and view incidents"
        actions={
          <>
            <Button onClick={() => setShowAddModal(true)}>
          <Plus className="mr-1 h-4 w-4" /> Record Incident
        </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : incidents?.length > 0 ? (
        <Card>
          <CardTitle><AlertTriangle className="mr-2 inline h-5 w-5" /> Recent Incidents</CardTitle>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((inc: any) => (
                  <TableRow key={inc.id}>
                    <TableCell>{new Date(inc.date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">
                      {`${inc.student?.user?.firstName ?? ""} ${
                        inc.student?.user?.lastName ?? ""
                      }`.trim() || "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{inc.description}</TableCell>
                    <TableCell><Badge variant="danger">-{inc.pointsDeducted}</Badge></TableCell>
                    <TableCell>
                      <Badge>{ACTION_LABELS[inc.actionTaken] || inc.actionTaken}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        <Card><p className="text-center text-muted py-8">No incidents recorded this term.</p></Card>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Record Incident">
        <div className="space-y-4">
          <StudentPicker
            value={form.studentId}
            onChange={(studentId) => setForm({ ...form, studentId })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <Input label="Time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="e.g. 10:30 AM" />
          </div>
          <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <div>
            <label htmlFor="f-description" className="mb-1 block text-sm font-medium text-foreground">Description</label>
            <textarea id="f-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Points" type="number" value={String(form.pointsDeducted)} onChange={(e) => setForm({ ...form, pointsDeducted: Number(e.target.value) })} />
            <div>
              <label htmlFor="f-action" className="mb-1 block text-sm font-medium text-foreground">Action</label>
              <select id="f-action" value={form.actionTaken} onChange={(e) => setForm({ ...form, actionTaken: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none" aria-label="Action">
                {Object.entries(ACTION_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={createIncident.isPending}>Record</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
