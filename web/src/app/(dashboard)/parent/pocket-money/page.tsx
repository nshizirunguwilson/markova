"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Input,
  PageSpinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useMyChildren } from "@/hooks/use-children";
import {
  usePocketMoneyAccount,
  usePocketMoneyStatement,
  useUpdateMoneyLimits,
  type PocketMoneyEntry,
} from "@/hooks/use-pocket-money";
import { Wallet } from "lucide-react";

function rwf(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-RW")} RWF`;
}

const KIND_LABELS: Record<PocketMoneyEntry["kind"], string> = {
  DEPOSIT: "Money in",
  WITHDRAWAL: "Spent",
  REFUND: "Returned to you",
  REVERSAL: "Correction",
  ADJUSTMENT: "Adjustment",
};

interface Child {
  id: string;
  name: string;
}

/**
 * What a parent came here to find out: where the money went.
 *
 * The statement is the whole page. The controls beneath it are the two things
 * a parent actually asks for once they can see the spending - a daily cap so a
 * term's money lasts a term, and a warning before it runs out.
 */
export default function ParentPocketMoneyPage() {
  const { data: kids } = useMyChildren();
  const children: Child[] = (kids ?? []).map((c) => ({ id: c.id, name: c.name }));

  /** Null until the parent picks. Most have one child, so the first will do. */
  const [picked, setPicked] = useState<string | null>(null);
  const selectedChild = picked ?? children[0]?.id ?? "";
  const setSelectedChild = (id: string) => setPicked(id);

  const { data: account, isLoading } = usePocketMoneyAccount(
    selectedChild || undefined,
  );
  const { data: statement } = usePocketMoneyStatement(
    selectedChild || undefined,
    1,
    50,
  );
  const limits = useUpdateMoneyLimits();

  /**
   * Null until a parent types. Until then each box shows what is on the
   * account, so it fills itself in as the account loads with no copy of it to
   * keep in step.
   */
  const [limitEdit, setLimitEdit] = useState<string | null>(null);
  const [alertEdit, setAlertEdit] = useState<string | null>(null);

  const dailyLimit =
    limitEdit ?? (account?.dailyLimit == null ? "" : String(account.dailyLimit));
  const lowAlert =
    alertEdit ??
    (account?.lowBalanceAlert == null ? "" : String(account.lowBalanceAlert));
  const setDailyLimit = (v: string) => setLimitEdit(v);
  const setLowAlert = (v: string) => setAlertEdit(v);

  const entries: PocketMoneyEntry[] = statement?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          title="Pocket money"
          description="What the school is holding, and where it has gone"
        />
        {children.length > 1 && (
          <select
            aria-label="Child"
            className="rounded-lg border border-input px-3 py-2 text-sm"
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {!selectedChild ? (
        <p className="py-16 text-center text-sm text-muted">
          No linked children found on this account.
        </p>
      ) : isLoading || !account ? (
        <PageSpinner />
      ) : (
        <>
          <Card>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wide text-muted">
                Held by the school
              </p>
              <p className="mt-1 text-4xl font-bold text-primary">
                {rwf(account.balance)}
              </p>
              {account.isLow && (
                <Badge variant="warning" className="mt-2">
                  Running low
                </Badge>
              )}
              {account.isFrozen && (
                <Badge variant="warning" className="mt-2">
                  Frozen by the school
                </Badge>
              )}
              {account.dailyLimit !== null && (
                <p className="mt-2 text-sm text-muted">
                  Daily limit {rwf(account.dailyLimit)} ·{" "}
                  {rwf(account.spentToday)} spent today
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Your controls</CardTitle>
            <p className="mt-1 text-sm text-muted">
              A daily limit is what makes a term&apos;s money last a term. Leave a
              box empty to turn that control off.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Input
                id="p-limit"
                label="Daily limit (RWF)"
                type="number"
                min="0"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder="No limit"
              />
              <Input
                id="p-alert"
                label="Warn me below (RWF)"
                type="number"
                min="0"
                value={lowAlert}
                onChange={(e) => setLowAlert(e.target.value)}
                placeholder="Never"
              />
              <Button
                onClick={() =>
                  limits.mutate({
                    studentId: selectedChild,
                    dailyLimit: dailyLimit === "" ? null : Number(dailyLimit),
                    lowBalanceAlert: lowAlert === "" ? null : Number(lowAlert),
                  })
                }
                isLoading={limits.isPending}
              >
                Save
              </Button>
            </div>
          </Card>

          <Card>
            <CardTitle>Statement</CardTitle>
            {entries.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                <Wallet className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Nothing has moved on this account yet.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>What</TableHead>
                      <TableHead>Recorded by</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm text-muted">
                          {new Date(e.createdAt).toLocaleDateString("en-GB")}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            {KIND_LABELS[e.kind]}
                            {/* A reversed entry stays visible. Hiding it would
                                make the statement disagree with the balance. */}
                            {e.isReversed && (
                              <Badge variant="warning">Reversed</Badge>
                            )}
                          </div>
                          {e.note && (
                            <div className="text-xs text-muted">{e.note}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted">
                          {e.recordedBy ?? "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            e.signedAmount < 0 ? "text-danger" : "text-success"
                          }`}
                        >
                          {e.signedAmount < 0 ? "−" : "+"}
                          {rwf(Math.abs(e.signedAmount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
