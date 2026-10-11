"use client";

import { Eye } from "lucide-react";
import { Card, CardTitle } from "@/components/ui";
import { isAdult } from "@/lib/sharing";

const KINDS = [
  { key: "sharesResults", label: "Results" },
  { key: "sharesConduct", label: "Attendance and discipline" },
  { key: "sharesHealth", label: "Health visits" },
] as const;

/**
 * What a student's parents can see, for the school to know (A8). Read only:
 * from 18 it is the student's own choice, made on their profile.
 */
export function ParentsSee({
  student,
  firstName,
}: {
  student: {
    dateOfBirth?: string | null;
    sharesResults?: boolean;
    sharesConduct?: boolean;
    sharesHealth?: boolean;
  };
  firstName: string;
}) {
  const adult = isAdult(student.dateOfBirth);
  return (
    <Card>
      <CardTitle>Parents can see</CardTitle>
      <div className="mt-3 space-y-2 text-sm" data-testid="parents-see">
        {adult ? (
          <>
            <p className="flex items-start gap-2 text-muted">
              <Eye aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {firstName} is 18 or over and decides. Fees are always shared.
            </p>
            <ul className="space-y-1">
              {KINDS.map((k) => (
                <li key={k.key} className="flex justify-between gap-3">
                  <span className="text-foreground">{k.label}</span>
                  <span className={student[k.key] === false ? "font-medium text-foreground" : "text-muted"}>
                    {student[k.key] === false ? "Private" : "Shared"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted">
            {student.dateOfBirth
              ? `Everything: ${firstName} is under 18.`
              : `Everything, because the school has no date of birth for ${firstName}. Add it so that from 18 they decide.`}
          </p>
        )}
      </div>
    </Card>
  );
}
