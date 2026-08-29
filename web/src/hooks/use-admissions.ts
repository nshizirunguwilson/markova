import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type {
  ApplicationStatus,
  Completeness,
  DocumentKind,
  EntryPoint,
  Funding,
} from "@/lib/admissions";

/**
 * The admissions desk.
 *
 * Every write invalidates the whole of `admissions`, because a decision moves
 * an application between piles and changes how many places an intake has left,
 * and a queue that disagrees with the row a reviewer just acted on is worse
 * than a slow page.
 */

export interface AdmissionIntake {
  id: string;
  name: string;
  entryPoint: EntryPoint;
  places: number;
  placesLeft: number;
  opensAt: string;
  closesAt: string;
  isOpen: boolean;
  total: number;
  counts: Record<string, number>;
  classLevel: { id: string; name: string };
  academicYear: { id: string; name: string };
}

export interface QueueRow {
  id: string;
  reference: string;
  status: ApplicationStatus;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  isBoarder: boolean;
  funding: Funding;
  district: string | null;
  province: string | null;
  examMark: number | null;
  examTotal: number | null;
  /* A transfer has no exam mark to show, so the row shows where they are
     coming from instead. */
  previousSchool: string | null;
  submittedAt: string;
  sinceAt: string;
  offerExpiresAt: string | null;
  completeness: Completeness;
  intake: {
    id: string;
    name: string;
    entryPoint: EntryPoint;
    /* The level's id as well as its name: the offer picker narrows the class
       list to the level the intake is for. */
    classLevel: { id: string; name: string };
  };
  trade: { code: string; name: string } | null;
}

export interface ApplicationDocument {
  id: string;
  kind: DocumentKind;
  fileUrl: string;
  fileName: string;
  verifiedAt: string | null;
  uploadedAt: string;
  verifiedBy: { firstName: string; lastName: string } | null;
}

export interface ApplicationEvent {
  id: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  reason: string | null;
  createdAt: string;
  actor: { firstName: string; lastName: string } | null;
}

export interface AdmissionOffer {
  id: string;
  isBoarder: boolean;
  termFee: number | null;
  conditions: string | null;
  expiresAt: string;
  offeredAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  classSection: {
    id: string;
    name: string;
    classLevel: { name: string };
    trade: { code: string } | null;
  };
  offeredBy: { firstName: string; lastName: string } | null;
}

export interface ApplicationDetail extends QueueRow {
  nationality: string | null;
  nationalId: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  fundingDetail: string | null;
  bloodType: string | null;
  allergies: string | null;
  medicalConditions: string | null;
  disability: string | null;
  insuranceNumber: string | null;
  religion: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  guardianNationalId: string | null;
  guardianRelation: string;
  secondGuardianName: string | null;
  secondGuardianPhone: string | null;
  note: string | null;
  secondChoiceTrade: { code: string; name: string } | null;
  documents: ApplicationDocument[];
  events: ApplicationEvent[];
  notes: {
    id: string;
    body: string;
    createdAt: string;
    author: { firstName: string; lastName: string };
  }[];
  offers: AdmissionOffer[];
  student: { id: string; studentIdNumber: string } | null;
  duplicates: {
    sameChild: { id: string; reference: string; status: string }[];
    sameGuardian: {
      id: string;
      reference: string;
      firstName: string;
      lastName: string;
      status: string;
    }[];
    alreadyStudent: {
      id: string;
      studentIdNumber: string;
      status: string;
      user: { firstName: string; lastName: string };
    } | null;
  };
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["admissions"] });
  // Enrolling writes a student, a parent and a first invoice.
  qc.invalidateQueries({ queryKey: ["students"] });
  qc.invalidateQueries({ queryKey: ["users"] });
  qc.invalidateQueries({ queryKey: ["finance"] });
}

// ── Reading ───────────────────────────────────────────────────────────────

export function useIntakes() {
  return useQuery<AdmissionIntake[]>({
    queryKey: ["admissions", "intakes"],
    queryFn: async () => (await api.get("/admissions/intakes")).data,
  });
}

export function useApplicationQueue(filters: {
  intakeId?: string;
  bucket?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<{
    data: QueueRow[];
    total: number;
    page: number;
    limit: number;
    buckets: Record<string, number>;
  }>({
    queryKey: ["admissions", "queue", filters],
    queryFn: async () =>
      (await api.get("/admissions/applications", { params: filters })).data,
  });
}

export function useApplication(id?: string) {
  return useQuery<ApplicationDetail>({
    queryKey: ["admissions", "application", id],
    queryFn: async () => (await api.get(`/admissions/applications/${id}`)).data,
    enabled: !!id,
  });
}

// ── Writing ───────────────────────────────────────────────────────────────

export function useSaveIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.put("/admissions/intakes", body)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Intake saved");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save that intake")),
  });
}

/**
 * Move an application along.
 *
 * The success line names where it went rather than saying "saved", because a
 * reviewer working at speed needs to see that the thing they meant happened.
 */
export function useDecide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      id: string;
      status: ApplicationStatus;
      reason?: string;
      said: string;
    }) =>
      (
        await api.post(`/admissions/applications/${body.id}/decide`, {
          status: body.status,
          reason: body.reason,
        })
      ).data,
    onSuccess: (_r, vars) => {
      invalidate(qc);
      toast.success(vars.said);
    },
    onError: (e) => toast.error(errorMessage(e, "Could not move that application")),
  });
}

export function useRequestInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      id: string;
      documents: DocumentKind[];
      note?: string;
    }) =>
      (
        await api.post(`/admissions/applications/${body.id}/request-info`, {
          documents: body.documents,
          note: body.note,
        })
      ).data,
    onSuccess: (_r, vars) => {
      invalidate(qc);
      toast.success(
        vars.documents.length
          ? `Asked the family for ${vars.documents.length} document${vars.documents.length === 1 ? "" : "s"}`
          : "Asked the family for more",
      );
    },
    onError: (e) => toast.error(errorMessage(e, "Could not send that request")),
  });
}

export function useMakeOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      id: string;
      classSectionId: string;
      isBoarder?: boolean;
      termFee?: number;
      conditions?: string;
      expiresAt: string;
    }) => {
      const { id, ...rest } = body;
      return (await api.post(`/admissions/applications/${id}/offer`, rest)).data;
    },
    onSuccess: () => {
      invalidate(qc);
      toast.success("Place offered. It is held until the expiry date.");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not offer that place")),
  });
}

export function useRevokeOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { offerId: string; reason: string }) =>
      (await api.post("/admissions/offers/revoke", body)).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Place taken back. The application is in the pile again.");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not withdraw that offer")),
  });
}

export function useExpireOffers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post("/admissions/offers/expire", {})).data,
    onSuccess: (r: { expired: number }) => {
      invalidate(qc);
      toast.success(
        r.expired === 0
          ? "No offers had run out."
          : `${r.expired} place${r.expired === 1 ? "" : "s"} released.`,
      );
    },
    onError: (e) => toast.error(errorMessage(e, "Could not release those places")),
  });
}

/**
 * Turn an accepted application into a student.
 *
 * The reply carries the student number and the school address, and the toast
 * says both: the office reads them out to the family on the spot.
 */
export function useEnrol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admissions/applications/${id}/enrol`, {})).data as {
        studentIdNumber: string;
        email: string;
      },
    onSuccess: (r) => {
      invalidate(qc);
      toast.success(`Enrolled as ${r.studentIdNumber}`);
    },
    onError: (e) => toast.error(errorMessage(e, "Could not enrol that student")),
  });
}

export function useVerifyDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) =>
      (await api.post(`/admissions/documents/${documentId}/verify`, {})).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Checked");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not record that check")),
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { id: string; body: string }) =>
      (
        await api.post(`/admissions/applications/${body.id}/notes`, {
          body: body.body,
        })
      ).data,
    onSuccess: () => {
      invalidate(qc);
      toast.success("Note added");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not add that note")),
  });
}

// ── The public side ───────────────────────────────────────────────────────

/**
 * What a family can reach without an account.
 *
 * Kept apart from the rest because none of it is cached under `admissions`:
 * a family looking up their own application must never be served a reviewer's
 * cached copy of somebody else's.
 */
export function useOpenIntakes() {
  return useQuery<
    {
      id: string;
      name: string;
      entryPoint: EntryPoint;
      closesAt: string;
      classLevel: { id: string; name: string };
    }[]
  >({
    queryKey: ["admissions-public", "intakes"],
    queryFn: async () => (await api.get("/admissions/public/intakes")).data,
  });
}

export interface PublicStatus {
  reference: string;
  status: ApplicationStatus;
  applicant: string;
  submittedAt: string;
  stillNeeded: string[];
  intake: { name: string; entryPoint: EntryPoint; classLevel: { name: string } };
  offer: {
    expiresAt: string;
    isBoarder: boolean;
    termFee: number | null;
    conditions: string | null;
    acceptedAt: string | null;
    declinedAt: string | null;
    classSection: {
      name: string;
      classLevel: { name: string };
      trade: { code: string } | null;
    };
  } | null;
  history: { status: ApplicationStatus; at: string; reason: string | null }[];
}

export function useCheckStatus() {
  return useMutation({
    mutationFn: async (body: { reference: string; dateOfBirth: string }) =>
      (await api.post("/admissions/public/status", body)).data as PublicStatus,
    onError: (e) =>
      toast.error(
        errorMessage(e, "No application matches that reference and date of birth"),
      ),
  });
}

export function useAnswerOffer() {
  return useMutation({
    mutationFn: async (body: {
      reference: string;
      dateOfBirth: string;
      accept: boolean;
      reason?: string;
    }) => (await api.post("/admissions/public/offer/answer", body)).data,
    onSuccess: (_r, vars) => {
      toast.success(
        vars.accept
          ? "Place accepted. The school will be in touch about enrolment."
          : "Thank you for letting the school know.",
      );
    },
    onError: (e) => toast.error(errorMessage(e, "Could not record your answer")),
  });
}

export function useSubmitApplication() {
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post("/admissions/public/applications", body)).data as {
        reference: string;
        id: string;
      },
    onError: (e) => toast.error(errorMessage(e, "Could not send that application")),
  });
}
