"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Badge, Button, Card, CardTitle, Input, Modal } from "@/components/ui";
import {
  useAddTeacherDuty,
  useRemoveTeacherDuty,
  useSections,
  type TeacherDutyRole,
} from "@/hooks/use-academic";
import { classDisplayName } from "@/lib/utils";

const LABEL: Record<TeacherDutyRole, string> = {
  CLASS_TEACHER: "Class teacher",
  HOD: "Head of department",
  DOS: "Director of Studies",
};

interface Duty {
  id: string;
  role: TeacherDutyRole;
  department?: string | null;
  classSection?: { id: string; name: string; classLevel?: { name: string } | null } | null;
}

/**
 * A teacher's duties, and naming them to one.
 *
 * The page only showed these, and nothing else could set them, so a school
 * could not name its class teachers. The class teacher's comment on every
 * report card depends on who leads the class.
 */
export function TeacherDutiesCard({
  teacherId,
  duties,
}: {
  teacherId: string;
  duties: Duty[];
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<TeacherDutyRole>("CLASS_TEACHER");
  const [classSectionId, setClassSectionId] = useState("");
  const [department, setDepartment] = useState("");
  const { data: sections } = useSections();
  const add = useAddTeacherDuty(teacherId);
  const remove = useRemoveTeacherDuty(teacherId);

  const ready =
    role === "DOS" ||
    (role === "CLASS_TEACHER" && !!classSectionId) ||
    (role === "HOD" && department.trim() !== "");

  const close = () => {
    setOpen(false);
    setClassSectionId("");
    setDepartment("");
  };

  const save = () =>
    add.mutate(
      {
        role,
        ...(role === "CLASS_TEACHER" && { classSectionId }),
        ...(role === "HOD" && { department: department.trim() }),
      },
      { onSuccess: close },
    );

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Duties</CardTitle>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Add a duty
        </Button>
      </div>
      {duties.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No duties. Name them class teacher of a class, head of a department,
          or Director of Studies.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {duties.map((d) => (
            <li key={d.id}>
              <Badge variant="info">
                {LABEL[d.role] ?? d.role}
                {d.classSection ? `, ${classDisplayName(d.classSection)}` : ""}
                {d.department ? `, ${d.department}` : ""}
                <button
                  type="button"
                  onClick={() => remove.mutate(d.id)}
                  disabled={remove.isPending}
                  className="ml-2 rounded hover:text-danger"
                  aria-label={`End duty: ${LABEL[d.role] ?? d.role}`}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={open} onClose={close} title="Add a duty" size="sm">
        <div className="space-y-4">
          <div>
            <label htmlFor="duty-role" className="mb-1 block text-sm font-medium">
              Duty
            </label>
            <select
              id="duty-role"
              value={role}
              onChange={(e) => setRole(e.target.value as TeacherDutyRole)}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
            >
              {(Object.keys(LABEL) as TeacherDutyRole[]).map((r) => (
                <option key={r} value={r}>
                  {LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          {role === "CLASS_TEACHER" && (
            <div>
              <label htmlFor="duty-class" className="mb-1 block text-sm font-medium">
                Class they lead
              </label>
              <select
                id="duty-class"
                value={classSectionId}
                onChange={(e) => setClassSectionId(e.target.value)}
                className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
              >
                <option value="">Choose a class</option>
                {(sections ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {classDisplayName(s)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                A class has one class teacher. If it has one already, the duty
                is handed over to this teacher.
              </p>
            </div>
          )}

          {role === "HOD" && (
            <Input
              id="duty-department"
              label="Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Sciences"
            />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!ready} isLoading={add.isPending}>
              Add duty
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
