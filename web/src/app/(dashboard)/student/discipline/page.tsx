"use client";

import { Card, CardTitle, Badge, Spinner } from "@/components/ui";
import { useStudentDiscipline } from "@/hooks/use-discipline";
import { useAuthStore } from "@/stores/auth-store";
import { Shield, AlertTriangle } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  VERBAL_WARNING: "Verbal Warning",
  WRITTEN_WARNING: "Written Warning",
  DETENTION: "Detention",
  SUSPENSION: "Suspension",
  EXPULSION: "Expulsion",
};

export default function StudentDisciplinePage() {
  const { user } = useAuthStore();
  const studentId = (user as any)?.studentId;
  const { data, isLoading } = useStudentDiscipline(studentId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Discipline Record</h1>
        <p className="text-sm text-muted">View your discipline points and incidents</p>
      </div>

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
                  {data.student.currentPoints} / {data.student.startingPoints}
                </p>
                <div className="mt-2 h-3 w-full rounded-full bg-muted/20">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      data.student.percentage >= 80 ? "bg-success" :
                      data.student.percentage >= 50 ? "bg-warning" :
                      "bg-danger"
                    }`}
                    style={{ width: `${data.student.percentage}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{data.student.percentage}%</p>
                <p className="text-xs text-muted">{data.totalIncidents} incident{data.totalIncidents !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </Card>

          {/* Incidents List */}
          {data.incidents.length > 0 ? (
            <Card>
              <CardTitle><AlertTriangle className="mr-2 inline h-5 w-5" /> Incidents</CardTitle>
              <div className="mt-4 space-y-3">
                {data.incidents.map((inc: any) => (
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
