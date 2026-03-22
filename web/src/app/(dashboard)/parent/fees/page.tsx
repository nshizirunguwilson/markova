"use client";

import { useState, useEffect } from "react";
import {
  Card,
  Spinner,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui";
import { useStudentFees } from "@/hooks/use-fees";
import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/api";

interface Child { id: string; name: string; }

export default function ParentFeesPage() {
  const { user } = useAuthStore();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState("");

  const { data, isLoading } = useStudentFees(selectedChild);

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/users/${user.id}`).then((res) => {
      const links = res.data?.parentStudents || [];
      const kids = links.map((ps: any) => ({
        id: ps.student.id,
        name: `${ps.student.user.firstName} ${ps.student.user.lastName}`,
      }));
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0].id);
    }).catch(() => {});
  }, [user?.id]);

  const statusColor = (s: string) => {
    if (s === "PAID") return "bg-green-100 text-green-700";
    if (s === "PARTIAL") return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-[#1B4F72]">Fee Records</h1>

      {children.length > 1 && (
        <select className="border rounded-lg px-3 py-2 text-sm" value={selectedChild} onChange={(e) => setSelectedChild(e.target.value)}>
          {children.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {isLoading && <div className="text-center py-8"><Spinner /></div>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Due</p>
              <p className="text-2xl font-bold text-[#1B4F72]">{data.totalDue?.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Paid</p>
              <p className="text-2xl font-bold text-green-600">{data.totalPaid?.toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Balance</p>
              <p className="text-2xl font-bold text-red-600">{data.totalBalance?.toLocaleString()}</p>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.records?.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.term?.name}</TableCell>
                    <TableCell>{r.academicYear?.name}</TableCell>
                    <TableCell className="text-right">{r.amountDue?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.amountPaid?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.balance?.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={statusColor(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {r.paymentDate ? new Date(r.paymentDate).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
