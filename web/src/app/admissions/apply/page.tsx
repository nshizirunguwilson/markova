"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, CardTitle, Input } from "@/components/ui";
import { useOpenIntakes, useSubmitApplication } from "@/hooks/use-admissions";
import { ENTRY_LABEL, FUNDING_LABEL, type Funding } from "@/lib/admissions";
import { CheckCircle2, Copy, Send } from "lucide-react";

/**
 * The school's application form.
 *
 * Stands in for the public admissions site until there is one: the same
 * endpoint, the same validation, the same reference coming back. Anything the
 * form does not ask becomes a data-entry job for the office on the day a
 * student is accepted, which is the work the whole feature exists to remove,
 * so it asks for the enrolment record rather than a name and a phone number.
 *
 * Three sections, in the order a family can answer them: the child, where they
 * live and what they have done, and who to talk to. Health sits with the
 * child because a parent filling this in has the immunisation card open.
 */

const PROVINCES = [
  "Kigali City",
  "Eastern Province",
  "Southern Province",
  "Northern Province",
  "Western Province",
];

export default function ApplyPage() {
  const { data: intakes } = useOpenIntakes();
  const submit = useSubmitApplication();
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [f, setF] = useState({
    intakeId: "",
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "FEMALE",
    province: "",
    district: "",
    sector: "",
    cell: "",
    village: "",
    previousSchool: "",
    examMark: "",
    isBoarder: false,
    funding: "FAMILY" as Funding,
    fundingDetail: "",
    bloodType: "",
    allergies: "",
    medicalConditions: "",
    insuranceNumber: "",
    guardianName: "",
    guardianPhone: "",
    guardianEmail: "",
    guardianRelation: "Mother",
    note: "",
  });
  const set = (k: keyof typeof f, v: string | boolean) =>
    setF((was) => ({ ...was, [k]: v }));

  const intake = intakes?.find((i) => i.id === f.intakeId);
  const ready =
    f.intakeId &&
    f.firstName.trim() &&
    f.lastName.trim() &&
    f.dateOfBirth &&
    f.guardianName.trim() &&
    f.guardianPhone.trim();

  const send = () =>
    submit
      .mutateAsync({
        intakeId: f.intakeId,
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        dateOfBirth: f.dateOfBirth,
        gender: f.gender,
        province: f.province || undefined,
        district: f.district.trim() || undefined,
        sector: f.sector.trim() || undefined,
        cell: f.cell.trim() || undefined,
        village: f.village.trim() || undefined,
        previousSchool: f.previousSchool.trim() || undefined,
        examMark: f.examMark ? Number(f.examMark) : undefined,
        examTotal: f.examMark ? 100 : undefined,
        isBoarder: f.isBoarder,
        funding: f.funding,
        fundingDetail: f.fundingDetail.trim() || undefined,
        bloodType: f.bloodType.trim() || undefined,
        allergies: f.allergies.trim() || undefined,
        medicalConditions: f.medicalConditions.trim() || undefined,
        insuranceNumber: f.insuranceNumber.trim() || undefined,
        guardianName: f.guardianName.trim(),
        guardianPhone: f.guardianPhone.trim(),
        guardianEmail: f.guardianEmail.trim() || undefined,
        guardianRelation: f.guardianRelation,
        note: f.note.trim() || undefined,
      })
      .then((r) => setDone({ reference: r.reference }))
      .catch(() => {});

  /*
    The reference is the only thing a family gets, and it is how they reach
    their application for months afterwards. So it is large, copyable, and the
    page says plainly to keep it.
  */
  if (done) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-xl px-5 py-16">
        <Card className="text-center">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-success" />
          <h1 className="text-xl font-bold text-foreground">
            The school has your application
          </h1>
          <p className="mt-2 text-sm text-muted">
            Keep this reference. It is how you check what is happening, and the
            school will ask for it if you call.
          </p>
          <p className="mt-5 select-all font-mono text-3xl font-bold text-primary">
            {done.reference}
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              navigator.clipboard
                ?.writeText(done.reference)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Copied" : "Copy the reference"}
          </Button>
          <p className="mt-6 text-sm">
            <Link href="/admissions" className="text-primary underline">
              Check on this application
            </Link>
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-5 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Apply for a place
        </h1>
        <p className="mt-1 text-sm text-muted">
          Everything the school needs to consider the application. It takes
          about five minutes, and you get a reference at the end.
        </p>
      </header>

      {!intakes?.length ? (
        <Card>
          <p className="text-sm text-muted">
            The school is not taking applications at the moment. Its admissions
            page says when the next round opens.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardTitle className="mb-4">What you are applying for</CardTitle>
            <div>
              <label
                htmlFor="apply-intake"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Intake
              </label>
              <select
                id="apply-intake"
                value={f.intakeId}
                onChange={(e) => set("intakeId", e.target.value)}
                className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
              >
                <option value="">Choose an intake...</option>
                {intakes.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({ENTRY_LABEL[i.entryPoint]})
                  </option>
                ))}
              </select>
              {intake && (
                <p className="mt-1 text-xs text-muted">
                  Closes{" "}
                  {new Date(intake.closesAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  .
                </p>
              )}
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.isBoarder}
                onChange={(e) => set("isBoarder", e.target.checked)}
              />
              Applying for a boarding place
            </label>
            {/* Boarders are asked for two more documents, and saying so here
                stops it arriving as a surprise a fortnight later. */}
            {f.isBoarder && (
              <p className="mt-1 text-xs text-muted">
                A boarder is also asked for a medical form and a Mutuelle de
                Sante or RSSB card.
              </p>
            )}
          </Card>

          <Card>
            <CardTitle className="mb-4">The child</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="First name"
                value={f.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
              <Input
                label="Family name"
                value={f.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
              <Input
                label="Date of birth"
                type="date"
                value={f.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
              />
              <div>
                <label
                  htmlFor="apply-gender"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Gender
                </label>
                <select
                  id="apply-gender"
                  value={f.gender}
                  onChange={(e) => set("gender", e.target.value)}
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
                >
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                </select>
              </div>
              <Input
                label="Blood type"
                value={f.bloodType}
                onChange={(e) => set("bloodType", e.target.value)}
                placeholder="Optional"
              />
              <Input
                label="Insurance number"
                value={f.insuranceNumber}
                onChange={(e) => set("insuranceNumber", e.target.value)}
                placeholder="Mutuelle de Sante or RSSB"
              />
              <Input
                label="Allergies"
                value={f.allergies}
                onChange={(e) => set("allergies", e.target.value)}
                placeholder="Optional"
              />
              <Input
                label="Medical conditions"
                value={f.medicalConditions}
                onChange={(e) => set("medicalConditions", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-4">Where you live</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="apply-province"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Province
                </label>
                <select
                  id="apply-province"
                  value={f.province}
                  onChange={(e) => set("province", e.target.value)}
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
                >
                  <option value="">Choose...</option>
                  {PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="District"
                value={f.district}
                onChange={(e) => set("district", e.target.value)}
              />
              <Input
                label="Sector"
                value={f.sector}
                onChange={(e) => set("sector", e.target.value)}
              />
              <Input
                label="Cell"
                value={f.cell}
                onChange={(e) => set("cell", e.target.value)}
              />
              <Input
                label="Village"
                value={f.village}
                onChange={(e) => set("village", e.target.value)}
              />
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-4">School so far</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="School coming from"
                value={f.previousSchool}
                onChange={(e) => set("previousSchool", e.target.value)}
                placeholder="EP Kacyiru"
              />
              <Input
                label="National exam mark, out of 100"
                type="number"
                min={0}
                max={100}
                value={f.examMark}
                onChange={(e) => set("examMark", e.target.value)}
                placeholder="Leave blank for a transfer"
              />
            </div>
            <div className="mt-4">
              <label
                htmlFor="apply-funding"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Who is paying the fees
              </label>
              <select
                id="apply-funding"
                value={f.funding}
                onChange={(e) => set("funding", e.target.value)}
                className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
              >
                {(Object.keys(FUNDING_LABEL) as Funding[]).map((k) => (
                  <option key={k} value={k}>
                    {FUNDING_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            {/* Only asked when it applies, and it explains why: a bursary
                needs a letter, and a family that knows that up front sends it. */}
            {f.funding !== "FAMILY" && (
              <div className="mt-4">
                <Input
                  label="Which bursary or sponsor"
                  value={f.fundingDetail}
                  onChange={(e) => set("fundingDetail", e.target.value)}
                  placeholder="Gasabo district bursary, 2026"
                />
                <p className="mt-1 text-xs text-muted">
                  The school will also ask for the letter confirming it.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle className="mb-4">Who the school should talk to</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                value={f.guardianName}
                onChange={(e) => set("guardianName", e.target.value)}
              />
              <div>
                <label
                  htmlFor="apply-relation"
                  className="mb-1 block text-sm font-medium text-foreground"
                >
                  Relationship to the child
                </label>
                <select
                  id="apply-relation"
                  value={f.guardianRelation}
                  onChange={(e) => set("guardianRelation", e.target.value)}
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm"
                >
                  {["Mother", "Father", "Guardian", "Aunt", "Uncle"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Phone"
                value={f.guardianPhone}
                onChange={(e) => set("guardianPhone", e.target.value)}
                placeholder="+250788000000"
              />
              <Input
                label="Email"
                type="email"
                value={f.guardianEmail}
                onChange={(e) => set("guardianEmail", e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="mt-4">
              <Input
                label="Anything you would like the school to know"
                value={f.note}
                onChange={(e) => set("note", e.target.value)}
                placeholder="Optional"
              />
            </div>
          </Card>

          <Card padding="sm">
            <p className="text-xs text-muted">
              The school will ask for the supporting documents once it has read
              the application: a birth certificate, the results slip, the last
              report card, a photograph and the parent&apos;s national ID.
            </p>
          </Card>

          <Button
            className="w-full"
            onClick={send}
            isLoading={submit.isPending}
            disabled={!ready}
          >
            <Send className="mr-2 h-4 w-4" /> Send the application
          </Button>

          <p className="pb-4 text-center text-sm">
            <Link href="/admissions" className="text-primary underline">
              Already applied? Check on it
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}
