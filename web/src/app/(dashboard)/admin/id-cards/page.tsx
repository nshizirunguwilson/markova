"use client";

import { useState } from "react";
import {
  Card,
  CardTitle,
  Button,
  Spinner,
} from "@/components/ui";
import {
  useClassLevels,
  useSections,
} from "@/hooks/use-academic";
import { useBulkIdCards } from "@/hooks/use-reports";
import { CreditCard, Printer, Users } from "lucide-react";
import { toast } from "sonner";

export default function AdminIdCardsPage() {
  const [levelId, setLevelId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [cards, setCards] = useState<any[]>([]);

  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelId);
  const bulkGenerate = useBulkIdCards();

  const handleGenerate = () => {
    if (!sectionId) return toast.error("Select a class section");
    bulkGenerate.mutate(
      { classSectionId: sectionId },
      {
        onSuccess: (data: any) => {
          setCards(data);
          toast.success(`Generated ${data.length} ID cards`);
        },
        onError: () => toast.error("Failed to generate"),
      }
    );
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1B4F72]">Student ID Cards</h1>

      <Card className="p-6 space-y-4">
        <CardTitle>Generate ID Cards</CardTitle>
        <div className="flex gap-4 items-end">
          <div>
            <label className="text-sm font-medium">Class Level</label>
            <select
              className="block border rounded-lg px-3 py-2 text-sm mt-1"
              value={levelId}
              onChange={(e) => { setLevelId(e.target.value); setSectionId(""); }}
            >
              <option value="">Select</option>
              {levels?.map((l: any) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Section</label>
            <select
              className="block border rounded-lg px-3 py-2 text-sm mt-1"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">Select</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleGenerate} disabled={bulkGenerate.isPending}>
            {bulkGenerate.isPending ? <Spinner className="w-4 h-4" /> : <Users className="w-4 h-4 mr-2" />}
            Generate
          </Button>
          {cards.length > 0 && (
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print All
            </Button>
          )}
        </div>
      </Card>

      {cards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-2">
          {cards.map((card: any, i: number) => (
            <Card key={i} className="p-4 border-2 border-[#1B4F72]">
              <div className="text-center space-y-2">
                <p className="text-xs text-gray-500 uppercase">{card.schoolName}</p>
                <div className="w-16 h-16 rounded-full bg-[#D6EAF8] mx-auto flex items-center justify-center">
                  <CreditCard className="w-8 h-8 text-[#1B4F72]" />
                </div>
                <p className="font-bold text-lg">{card.studentName}</p>
                <p className="text-sm text-gray-600">{card.className}</p>
                <p className="text-sm font-mono bg-gray-100 rounded px-2 py-1 inline-block">{card.studentIdNumber}</p>
                <p className="text-xs text-gray-500">QR: {card.qrData}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
