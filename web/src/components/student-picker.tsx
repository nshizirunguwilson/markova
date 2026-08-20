"use client";

import { useState } from "react";
import { useClassLevels, useSections } from "@/hooks/use-academic";
import { useUsers } from "@/hooks/use-users";

interface Props {
  /** Selected Student record id (not the user id). */
  value: string;
  onChange: (studentId: string) => void;
  label?: string;
}

/**
 * Pick a student via Class Level → Section → Student dropdowns instead of
 * pasting a raw UUID. Emits the Student record id.
 */
export function StudentPicker({ value, onChange, label = "Student" }: Props) {
  const [level, setLevel] = useState("");
  const [section, setSection] = useState("");
  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(level || undefined);
  const { data: studentsData } = useUsers(
    section
      ? { role: "STUDENT", classSectionId: section, limit: 100 }
      : { role: "STUDENT", limit: 1 }
  );
  const students = section ? studentsData?.data || [] : [];

  const cls =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-muted/10 disabled:text-muted";

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          className={cls}
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setSection("");
            onChange("");
          }}
         aria-label="Level…">
          <option value="">Level…</option>
          {levels?.map((l: any) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select
          className={cls}
          value={section}
          disabled={!level}
          onChange={(e) => {
            setSection(e.target.value);
            onChange("");
          }}
         aria-label="Section…">
          <option value="">Section…</option>
          {sections?.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className={cls}
          value={value}
          disabled={!section}
          onChange={(e) => onChange(e.target.value)}
         aria-label="Student…">
          <option value="">Student…</option>
          {students.map((u: any) => (
            <option key={u.id} value={u.student?.id}>
              {u.firstName} {u.lastName}
              {u.student?.studentIdNumber ? ` (${u.student.studentIdNumber})` : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
