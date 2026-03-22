"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Button,
  Spinner,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Modal,
  Input,
} from "@/components/ui";
import {
  useAcademicYears,
  useTerms,
} from "@/hooks/use-academic";
import {
  useFees,
  useFeeSummary,
  useRecordPayment,
} from "@/hooks/use-fees";
import { DollarSign, Plus, Printer, TrendingUp, Receipt } from "lucide-react";
import { toast } from "sonner";

export default function AdminFeesPage() {
  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showRecord, setShowRecord] = useState(false);

  const { data: years } = useAcademicYears();
  const { data: terms } = useTerms(yearId);
  const { data: summary } = useFeeSummary(yearId || undefined, termId || undefined);
  const { data: records, isLoading, isError, refetch } = useFees({
    academicYearId: yearId || undefined,
    termId: termId || undefined,
    status: statusFilter || undefined,
  });
  const recordPayment = useRecordPayment();

  const [form, setForm] = useState({
    studentId: "",
    academicYearId: "",
    termId: "",
    amountDue: 0,
    amountPaid: 0,
    paymentMethod: "CASH",
    receiptNumber: "",
    notes: "",
  });

  const handleRecord = () => {
    if (!form.studentId || !form.academicYearId || !form.termId) {
      return toast.error("Fill required fields");
    }
    recordPayment.mutate(form, {
      onSuccess: () => {
        toast.success("Payment recorded");
        setShowRecord(false);
        setForm({ studentId: "", academicYearId: "", termId: "", amountDue: 0, amountPaid: 0, paymentMethod: "CASH", receiptNumber: "", notes: "" });
      },
      onError: () => toast.error("Failed to record payment"),
    });
  };

  const statusColor = (s: string) => {
    if (s === "PAID") return "bg-green-100 text-green-700";
    if (s === "PARTIAL") return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  const handlePrintReceipt = (id: string) => {
    const url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"}/fees/${id}/receipt/pdf`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <h1 className="text-2xl font-bold text-[#1B4F72]">Fee Management</h1>
        <Button onClick={() => setShowRecord(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Record Payment
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-gray-500">Total Due</p>
            <p className="text-2xl font-bold text-[#1B4F72]">{summary.totalDue?.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-500">Total Paid</p>
            <p className="text-2xl font-bold text-green-600">{summary.totalPaid?.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-500">Balance</p>
            <p className="text-2xl font-bold text-red-600">{summary.totalBalance?.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-500">Collection Rate</p>
            <p className="text-2xl font-bold text-[#2E86C1]">{summary.collectionRate}%</p>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-4">
        <select className="border rounded-lg px-3 py-2 text-sm" value={yearId} onChange={(e) => { setYearId(e.target.value); setTermId(""); }}>
          <option value="">All Years</option>
          {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">All Terms</option>
          {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="PAID">Paid</option>
          <option value="PARTIAL">Partial</option>
          <option value="UNPAID">Unpaid</option>
        </select>
        {(yearId || termId || statusFilter) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setYearId("");
              setTermId("");
              setStatusFilter("");
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Result Count */}
      {!isLoading && records && (
        <p className="text-sm text-gray-500">
          Showing {Array.isArray(records) ? records.length : (records?.meta?.total ?? records?.data?.length ?? 0)} records
        </p>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-lg font-semibold text-foreground">Something went wrong</p>
          <p className="mt-1 text-sm text-muted">We could not load the fee records.</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Records Table */}
      {!isError && <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><Spinner /></div>
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Term</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records?.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.student?.user?.firstName} {r.student?.user?.lastName}
                  </TableCell>
                  <TableCell>{r.student?.classSection?.classLevel?.name} {r.student?.classSection?.name}</TableCell>
                  <TableCell>{r.term?.name}</TableCell>
                  <TableCell className="text-right">{r.amountDue?.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{r.amountPaid?.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{r.balance?.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={statusColor(r.status)}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.paymentMethod}</TableCell>
                  <TableCell>
                    <button onClick={() => handlePrintReceipt(r.id)} aria-label="Print receipt" className="text-[#2E86C1] hover:underline text-sm">
                      <Printer className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {(!records || records.length === 0) && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-gray-500 py-12">
                    <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    <p className="font-medium">No fee records found</p>
                    <p className="mt-1 text-xs">Try adjusting the year, term, or status filters</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        )}
      </Card>}

      {/* Record Payment Modal */}
      <Modal isOpen={showRecord} onClose={() => setShowRecord(false)} title="Record Payment">
        <div className="space-y-4">
          <Input label={<>Student ID <span className="text-red-500">*</span></>} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Academic Year <span className="text-red-500">*</span></label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}>
                <option value="">Select</option>
                {years?.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Term <span className="text-red-500">*</span></label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={form.termId} onChange={(e) => setForm({ ...form, termId: e.target.value })}>
                <option value="">Select</option>
                {terms?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={<>Amount Due <span className="text-red-500">*</span></>} type="number" value={form.amountDue} onChange={(e) => setForm({ ...form, amountDue: +e.target.value })} />
            <Input label={<>Amount Paid <span className="text-red-500">*</span></>} type="number" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: +e.target.value })} />
          </div>
          <div>
            <label className="text-sm font-medium">Payment Method</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="CASH">Cash</option>
              <option value="MOMO">Mobile Money</option>
              <option value="AIRTEL">Airtel Money</option>
              <option value="CARD">Card</option>
              <option value="BANK">Bank Transfer</option>
            </select>
          </div>
          <Input label="Receipt Number" value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowRecord(false)}>Cancel</Button>
            <Button onClick={handleRecord} disabled={recordPayment.isPending}>
              {recordPayment.isPending ? <Spinner className="w-4 h-4" /> : "Record Payment"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
