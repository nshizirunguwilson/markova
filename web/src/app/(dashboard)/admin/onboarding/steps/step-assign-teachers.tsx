"use client";

import { useState } from "react";
import { Button, Badge } from "@/components/ui";
import {
  useAcademicYears,
  useSubjects,
  useSections,
  useAssignments,
  useCreateAssignment,
} from "@/hooks/use-academic";
import { useUsers } from "@/hooks/use-users";
import { Plus, Link2 } from "lucide-react";

export function StepAssignTeachers() {
  const { data: years } = useAcademicYears();
  const currentYear = years?.find((y: any) => y.isCurrent);
  const { data: subjects } = useSubjects();
  const { data: sections } = useSections();
  const { data: teachersData } = useUsers({ role: "TEACHER", limit: 100 });
  const { data: assignments } = useAssignments(
    currentYear ? { academicYearId: currentYear.id } : undefined
  );
  const createAssignment = useCreateAssignment();

  const teachers = teachersData?.data || [];

  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const handleAssign = () => {
    if (!teacherId || !subjectId || !sectionId || !currentYear) return;
    createAssignment.mutate({
      teacherId: teachers.find((t: any) => t.id === teacherId)?.teacher?.id,
      subjectId,
      classSectionId: sectionId,
      academicYearId: currentYear.id,
    });
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">Assign Teachers to Classes</h2>
      <p className="mb-6 text-sm text-muted">
        Link each teacher to the subjects and classes they teach
      </p>

      {/* Existing assignments */}
      {assignments?.length > 0 && (
        <div className="mb-6 space-y-2">
          {assignments.map((a: any) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="font-medium">
                {a.teacher?.user?.firstName} {a.teacher?.user?.lastName}
              </span>
              <span className="text-muted">teaches</span>
              <Badge>{a.subject?.name}</Badge>
              <span className="text-muted">in</span>
              <Badge variant="success">
                {a.classSection?.classLevel?.name} {a.classSection?.name}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Assignment form */}
      <div className="flex items-end gap-3 max-w-2xl">
        <div className="flex-1">
          <label className="block text-sm font-medium text-foreground mb-1.5">Teacher</label>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
           aria-label="Teacher">
            <option value="">Select teacher...</option>
            {teachers.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-foreground mb-1.5">Subject</label>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
           aria-label="Subject">
            <option value="">Select subject...</option>
            {subjects?.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-foreground mb-1.5">Class</label>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
           aria-label="Class">
            <option value="">Select class...</option>
            {sections?.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.classLevel?.name} {s.name}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={handleAssign} isLoading={createAssignment.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Assign
        </Button>
      </div>
    </div>
  );
}
