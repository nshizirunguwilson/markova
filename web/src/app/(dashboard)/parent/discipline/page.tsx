"use client";

import { useState, useEffect } from "react";
import { conductPercentage } from "@/lib/conduct";
import { classDisplayName } from "@/lib/utils";
import {
  Card,
  CardTitle,
  Button,
  Badge,
  Spinner,
  Modal,
} from "@/components/ui";
import {
  useStudentDiscipline,
  useCreateAppeal,
  useAcknowledgeIncident,
} from "@/hooks/use-discipline";
import { useAuthStore } from "@/stores/auth-store";
import { Shield, AlertTriangle, Users, Gavel } from "lucide-react";
import api from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";

interface Child { id: string; name: string; className: string; }

const ACTION_LABELS: Record<string, string> = {
  VERBAL_WARNING: "Verbal Warning",
  WRITTEN_WARNING: "Written Warning",
  DETENTION: "Detention",
  SUSPENSION: "Suspension",
  EXPULSION: "Expulsion",
};

export default function ParentDisciplinePage() {
  const { user } = useAuthStore();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState("");
  const [appealModal, setAppealModal] = useState<string | null>(null);
  const [appealStatement, setAppealStatement] = useState("");

  const createAppeal = useCreateAppeal();
  const acknowledge = useAcknowledgeIncident();

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/users/${user.id}`).then((res) => {
      const links = res.data?.parentStudents || [];
      const mapped = links.map((ps: any) => ({
        id: ps.student.id,
        name: `${ps.student?.user?.firstName} ${ps.student?.user?.lastName}`,
        className: ps.student.classSection
          ? classDisplayName(ps.student.classSection)
          : "",
      }));
      setChildren(mapped);
      if (mapped.length > 0) setSelectedChild(mapped[0].id);
    }).catch(() => {});
  }, [user?.id]);

  const { data, isLoading } = useStudentDiscipline(selectedChild);

  const handleAppeal = () => {
    if (!appealModal || !appealStatement.trim()) return;
    createAppeal.mutate(
      { incidentId: appealModal, statement: appealStatement },
      { onSuccess: () => { setAppealModal(null); setAppealStatement(""); } }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Child&apos;s Discipline"
        description="View incidents and submit appeals"
        actions={
          <>
            {children.length > 1 && (
          <select
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
           aria-label="Select child">
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.className})</option>
            ))}
          </select>
        )}
          </>
        }
      />

      {children.length > 0 && (
        <Card>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-foreground">{children.find((c) => c.id === selectedChild)?.name}</p>
              <p className="text-xs text-muted">{children.find((c) => c.id === selectedChild)?.className}</p>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : data ? (
        <>
          <Card>
            <div className="flex items-center gap-4">
              <Shield className="h-10 w-10 text-primary" />
              <div className="flex-1">
                <p className="text-sm text-muted">Discipline Points</p>
                <p className="text-3xl font-bold">
                  {data.student?.currentPoints} / {data.student?.startingPoints}
                </p>
                {/* The mark alone does not say whether it is good; the
                    percentage is the form the report card uses. */}
                <p className="text-sm text-muted">
                  {conductPercentage(
                    data.student?.currentPoints,
                    data.student?.startingPoints,
                  ) ?? "–"}
                  % this term</p>
                <div className="mt-2 h-3 w-full rounded-full bg-muted/20">
                  <div
                    className={`h-3 rounded-full ${
                      data.student?.percentage >= 80 ? "bg-success" :
                      data.student?.percentage >= 50 ? "bg-warning" : "bg-danger"
                    }`}
                    style={{ width: `${data.student?.percentage}%` }}
                  />
                </div>
              </div>
              <p className="text-2xl font-bold text-primary">{data.student?.percentage}%</p>
            </div>
          </Card>

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
                      </div>
                      <Badge variant="danger">-{inc.pointsDeducted}</Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge>{ACTION_LABELS[inc.actionTaken]}</Badge>
                      {!inc.parentAcknowledged && (
                        <Button size="sm" variant="outline" onClick={() => acknowledge.mutate(inc.id)}>
                          Acknowledge
                        </Button>
                      )}
                      {inc.parentAcknowledged && <Badge variant="success">Acknowledged</Badge>}
                      {!inc.appeals?.length && (
                        <Button size="sm" variant="outline" onClick={() => setAppealModal(inc.id)}>
                          <Gavel className="mr-1 h-3 w-3" /> Appeal
                        </Button>
                      )}
                      {inc.appeals?.length > 0 && (
                        <Badge variant={
                          inc.appeals[0].status === "APPROVED" ? "success" :
                          inc.appeals[0].status === "REJECTED" ? "danger" : "default"
                        }>
                          Appeal: {inc.appeals[0].status}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card><p className="text-center text-muted py-8">No discipline incidents.</p></Card>
          )}
        </>
      ) : null}

      {/* Appeal Modal */}
      <Modal isOpen={!!appealModal} onClose={() => setAppealModal(null)} title="Submit Appeal">
        <div className="space-y-4">
          <div>
            <label htmlFor="f-statement" className="mb-1 block text-sm font-medium text-foreground">Statement</label>
            <textarea id="f-statement"
              value={appealStatement}
              onChange={(e) => setAppealStatement(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="Explain why this incident should be reconsidered..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAppealModal(null)}>Cancel</Button>
            <Button onClick={handleAppeal} isLoading={createAppeal.isPending}>Submit Appeal</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
