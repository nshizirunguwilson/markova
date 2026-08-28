"use client";

import { Card, CardTitle, Badge, Spinner } from "@/components/ui";
import {
  useStanding,
  useStudentDiscipline,
  type MeritCategory,
} from "@/hooks/use-discipline";
import { useAuthStore } from "@/stores/auth-store";
import { Shield, AlertTriangle, Award } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

const ACTION_LABELS: Record<string, string> = {
  VERBAL_WARNING: "Verbal Warning",
  WRITTEN_WARNING: "Written Warning",
  DETENTION: "Detention",
  SUSPENSION: "Suspension",
  EXPULSION: "Expulsion",
};

const MERIT_LABELS: Record<MeritCategory, string> = {
  ACADEMIC_EFFORT: "Real effort in class",
  HELPING_OTHERS: "Helping others",
  LEADERSHIP: "Leadership",
  SPORT: "Sport",
  ARTS: "Arts",
  SERVICE: "Service to the school",
  HONESTY: "Honesty",
  IMPROVEMENT: "Turning it around",
};

export default function StudentDisciplinePage() {
  const { user } = useAuthStore();
  const studentId = (user as any)?.studentId;
  const { data, isLoading } = useStudentDiscipline(studentId);
  const { data: standing } = useStanding(studentId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My conduct"
        description="Both sides of it, and how far back to a clean sheet"
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : data ? (
        <>
          {/* Points Summary */}
          <Card>
            <div className="flex items-center gap-4">
              <Shield className="h-10 w-10 text-primary" />
              <div className="flex-1">
                <p className="text-sm text-muted">Discipline Points</p>
                <p className="text-3xl font-bold text-foreground">
                  {data.student?.currentPoints ?? 0} / {data.student?.startingPoints ?? 0}
                </p>
                <div className="mt-2 h-3 w-full rounded-full bg-muted/20">
                  <div
                    className={`h-3 rounded-full motion-bar ${
                      (data.student?.percentage ?? 0) >= 80 ? "bg-success" :
                      (data.student?.percentage ?? 0) >= 50 ? "bg-warning" :
                      "bg-danger"
                    }`}
                    style={{ width: `${data.student?.percentage ?? 0}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{data.student?.percentage ?? 0}%</p>
                <p className="text-xs text-muted">{data.totalIncidents} incident{data.totalIncidents !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </Card>

          {/* The path back, which is the point of showing this at all. A
              student who can only see what they lost has nothing to aim at. */}
          {standing && standing.pointsToCleanSheet > 0 && (
            <Card className="border-primary/30 bg-accent-light/40">
              <p className="text-sm">
                You are{" "}
                <span className="font-semibold">
                  {standing.pointsToCleanSheet} points
                </span>{" "}
                from a clean sheet. Points come back when the school recognises
                something you have done.
              </p>
            </Card>
          )}

          {standing && standing.pointsToCleanSheet === 0 && (
            <Card className="border-success/30 bg-success/5">
              <p className="text-sm font-medium">
                Your conduct record is clean. Nothing is held against you.
              </p>
            </Card>
          )}

          {/* What the school has recognised. Deliberately above the incidents:
              a record that opens with what went wrong teaches a student that
              being unnoticed is the best they can do. */}
          {(standing?.merits?.length ?? 0) > 0 && (
            <Card>
              <CardTitle>
                <Award className="mr-2 inline h-5 w-5" /> What you have been
                recognised for
              </CardTitle>
              <div className="mt-4 space-y-3">
                {standing.merits.map((m: any) => (
                  <div
                    key={m.id}
                    className="rounded-lg border border-success/30 bg-success/5 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {m.description}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {new Date(m.date).toLocaleDateString()} · by{" "}
                          {m.awardedBy.firstName} {m.awardedBy.lastName}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="success">+{m.points}</Badge>
                        <div className="mt-1">
                          <Badge>
                            {MERIT_LABELS[m.category as MeritCategory] ??
                              m.category}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Incidents List */}
          {(data.incidents?.length ?? 0) > 0 ? (
            <Card>
              <CardTitle><AlertTriangle className="mr-2 inline h-5 w-5" /> Incidents</CardTitle>
              <div className="mt-4 space-y-3">
                {(data.incidents ?? []).map((inc: any) => (
                  <div key={inc.id} className="rounded-lg border border-border/50 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{inc.description}</p>
                        <p className="mt-1 text-xs text-muted">
                          {new Date(inc.date).toLocaleDateString()}
                          {inc.time && ` at ${inc.time}`}
                          {inc.location && ` — ${inc.location}`}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          By {inc.recordedBy.firstName} {inc.recordedBy.lastName}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="danger">-{inc.pointsDeducted}</Badge>
                        <div className="mt-1">
                          <Badge variant={inc.actionTaken === "VERBAL_WARNING" ? "default" : "warning"}>
                            {ACTION_LABELS[inc.actionTaken]}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    {inc.appeals?.length > 0 && (
                      <div className="mt-2 rounded bg-muted/10 px-3 py-2 text-xs">
                        Appeal: <Badge variant={
                          inc.appeals[0].status === "APPROVED" ? "success" :
                          inc.appeals[0].status === "REJECTED" ? "danger" : "default"
                        }>{inc.appeals[0].status}</Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card><p className="text-center text-muted py-8">No discipline incidents.</p></Card>
          )}
        </>
      ) : null}
    </div>
  );
}
