/**
 * An admissions desk to test against.
 *
 * Shaped the way the API shapes it, completeness included, so a test cannot
 * assert against a queue row that could never come back.
 */

export const intake = {
  id: "intake-1",
  name: "Senior 1 intake, 2026",
  entryPoint: "SENIOR_ONE" as const,
  places: 80,
  placesLeft: 57,
  opensAt: "2026-06-01T00:00:00.000Z",
  closesAt: "2026-08-15T00:00:00.000Z",
  isOpen: true,
  total: 120,
  counts: { SUBMITTED: 44, OFFERED: 21 },
  classLevel: { id: "level-1", name: "Senior 1" },
  academicYear: { id: "year-1", name: "2026-2027" },
};

export const closedIntake = {
  ...intake,
  id: "intake-0",
  name: "Transfers, 2025",
  entryPoint: "TRANSFER" as const,
  isOpen: false,
  /* A places figure of its own, so a test can tell a closed round's card from
     an open one's rather than matching on the name, which also appears in the
     intake picker. */
  places: 12,
  placesLeft: 0,
  total: 14,
};

const complete = {
  required: [
    "BIRTH_CERTIFICATE",
    "NATIONAL_EXAM_RESULT",
    "PREVIOUS_REPORT_CARD",
    "PASSPORT_PHOTO",
    "PARENT_ID",
  ],
  present: [
    "BIRTH_CERTIFICATE",
    "NATIONAL_EXAM_RESULT",
    "PREVIOUS_REPORT_CARD",
    "PASSPORT_PHOTO",
    "PARENT_ID",
  ],
  missing: [],
  unverified: [],
  complete: true,
  fraction: 1,
};

const partial = {
  ...complete,
  present: ["BIRTH_CERTIFICATE", "NATIONAL_EXAM_RESULT"],
  missing: ["PREVIOUS_REPORT_CARD", "PASSPORT_PHOTO", "PARENT_ID"],
  complete: false,
  fraction: 0.4,
};

export const queueRows = [
  {
    id: "app-1",
    reference: "APP-2026-0417",
    status: "SUBMITTED",
    firstName: "Aline",
    lastName: "Uwase",
    dateOfBirth: "2013-04-02T00:00:00.000Z",
    gender: "FEMALE",
    isBoarder: true,
    funding: "FAMILY",
    district: "Gasabo",
    province: "Kigali City",
    examMark: 68,
    examTotal: 100,
    previousSchool: "EP Kacyiru",
    submittedAt: "2026-06-01T00:00:00.000Z",
    sinceAt: "2026-06-01T00:00:00.000Z",
    offerExpiresAt: null,
    completeness: complete,
    intake: {
      id: "intake-1",
      name: "Senior 1 intake, 2026",
      entryPoint: "SENIOR_ONE",
      classLevel: { id: "level-1", name: "Senior 1" },
    },
    trade: null,
  },
  {
    id: "app-2",
    reference: "APP-2026-0418",
    status: "INFO_REQUESTED",
    firstName: "Jean Bosco",
    lastName: "Habimana",
    dateOfBirth: "2010-02-11T00:00:00.000Z",
    gender: "MALE",
    isBoarder: false,
    funding: "DISTRICT_BURSARY",
    district: "Huye",
    province: "Southern Province",
    examMark: 54,
    examTotal: 100,
    previousSchool: "GS Huye",
    submittedAt: "2026-06-03T00:00:00.000Z",
    sinceAt: "2026-06-10T00:00:00.000Z",
    offerExpiresAt: null,
    completeness: partial,
    intake: {
      id: "intake-1",
      name: "Senior 1 intake, 2026",
      entryPoint: "SENIOR_ONE",
      classLevel: { id: "level-1", name: "Senior 1" },
    },
    trade: { code: "SWD", name: "Software Development" },
  },
  {
    id: "app-3",
    reference: "APP-2026-0421",
    status: "OFFERED",
    firstName: "Rose",
    lastName: "Mukamana",
    dateOfBirth: "2013-09-20T00:00:00.000Z",
    gender: "FEMALE",
    isBoarder: true,
    funding: "FAMILY",
    district: "Musanze",
    province: "Northern Province",
    examMark: 74,
    examTotal: 100,
    previousSchool: "EP Musanze",
    submittedAt: "2026-06-05T00:00:00.000Z",
    sinceAt: "2026-06-12T00:00:00.000Z",
    offerExpiresAt: "2099-01-01T00:00:00.000Z",
    completeness: complete,
    intake: {
      id: "intake-1",
      name: "Senior 1 intake, 2026",
      entryPoint: "SENIOR_ONE",
      classLevel: { id: "level-1", name: "Senior 1" },
    },
    trade: null,
  },
];

export const queue = {
  data: queueRows,
  total: queueRows.length,
  page: 1,
  limit: 25,
  buckets: { TO_DECIDE: 1, WAITING: 1, OFFERED: 1 },
};

export const application = {
  ...queueRows[0],
  /* Agrees with the documents below: everything is in, and the results slip
     has been attached but not yet opened by the office. */
  completeness: { ...complete, unverified: ["NATIONAL_EXAM_RESULT"] },
  nationality: "Rwandan",
  nationalId: null,
  sector: "Kacyiru",
  cell: "Kamatamu",
  village: "Amahoro",
  fundingDetail: null,
  bloodType: "O+",
  allergies: "Peanuts",
  medicalConditions: null,
  disability: null,
  insuranceNumber: "MUT-123456",
  religion: "Catholic",
  guardianName: "Marie Claire Uwase",
  guardianPhone: "+250788100000",
  guardianEmail: "marie.uwase@gmail.com",
  guardianNationalId: "1198570123456789",
  guardianRelation: "Mother",
  secondGuardianName: null,
  secondGuardianPhone: null,
  note: "The child has a sibling already at the school.",
  secondChoiceTrade: null,
  documents: [
    {
      id: "doc-1",
      kind: "BIRTH_CERTIFICATE",
      fileUrl: "/uploads/admissions/birth.pdf",
      fileName: "birth-certificate.pdf",
      verifiedAt: "2026-06-02T00:00:00.000Z",
      uploadedAt: "2026-06-01T00:00:00.000Z",
      verifiedBy: { firstName: "Wilson", lastName: "Nshizirungu" },
    },
    {
      id: "doc-2",
      kind: "NATIONAL_EXAM_RESULT",
      fileUrl: "/uploads/admissions/exam.pdf",
      fileName: "exam.pdf",
      verifiedAt: null,
      uploadedAt: "2026-06-01T00:00:00.000Z",
      verifiedBy: null,
    },
    {
      id: "doc-3",
      kind: "PREVIOUS_REPORT_CARD",
      fileUrl: "/uploads/admissions/report.pdf",
      fileName: "report.pdf",
      verifiedAt: "2026-06-02T00:00:00.000Z",
      uploadedAt: "2026-06-01T00:00:00.000Z",
      verifiedBy: { firstName: "Wilson", lastName: "Nshizirungu" },
    },
    {
      id: "doc-4",
      kind: "PASSPORT_PHOTO",
      fileUrl: "/uploads/admissions/photo.png",
      fileName: "photo.png",
      verifiedAt: "2026-06-02T00:00:00.000Z",
      uploadedAt: "2026-06-01T00:00:00.000Z",
      verifiedBy: { firstName: "Wilson", lastName: "Nshizirungu" },
    },
    {
      id: "doc-5",
      kind: "PARENT_ID",
      fileUrl: "/uploads/admissions/id.png",
      fileName: "id.png",
      verifiedAt: "2026-06-02T00:00:00.000Z",
      uploadedAt: "2026-06-01T00:00:00.000Z",
      verifiedBy: { firstName: "Wilson", lastName: "Nshizirungu" },
    },
  ],
  events: [
    {
      id: "ev-1",
      fromStatus: null,
      toStatus: "SUBMITTED",
      reason: "Received from the admissions site",
      createdAt: "2026-06-01T00:00:00.000Z",
      actor: null,
    },
  ],
  notes: [
    {
      id: "note-1",
      body: "Spoke to the mother; the slip is in the post.",
      createdAt: "2026-06-03T00:00:00.000Z",
      author: { firstName: "Wilson", lastName: "Nshizirungu" },
    },
  ],
  offers: [],
  student: null,
  duplicates: { sameChild: [], sameGuardian: [], alreadyStudent: null },
};

export const liveOffer = {
  id: "offer-1",
  isBoarder: true,
  termFee: 195000,
  conditions: "Subject to the original results slip",
  expiresAt: "2099-01-01T00:00:00.000Z",
  offeredAt: "2026-06-10T00:00:00.000Z",
  acceptedAt: null,
  declinedAt: null,
  declineReason: null,
  revokedAt: null,
  revokeReason: null,
  classSection: {
    id: "section-1",
    name: "A",
    classLevel: { name: "Senior 1" },
    trade: null,
  },
  offeredBy: { firstName: "Wilson", lastName: "Nshizirungu" },
};

/** What a family sees on the public page. */
export const publicStatus = {
  reference: "APP-2026-0417",
  status: "OFFERED",
  applicant: "Aline Uwase",
  submittedAt: "2026-06-01T00:00:00.000Z",
  stillNeeded: ["Passport photograph"],
  intake: {
    name: "Senior 1 intake, 2026",
    entryPoint: "SENIOR_ONE",
    classLevel: { name: "Senior 1" },
  },
  offer: {
    expiresAt: "2099-01-01T00:00:00.000Z",
    isBoarder: true,
    termFee: 195000,
    conditions: "Subject to the original results slip",
    acceptedAt: null,
    declinedAt: null,
    classSection: {
      name: "A",
      classLevel: { name: "Senior 1" },
      trade: null,
    },
  },
  history: [
    {
      status: "SUBMITTED",
      at: "2026-06-01T00:00:00.000Z",
      reason: "Received from the admissions site",
    },
    {
      status: "OFFERED",
      at: "2026-06-10T00:00:00.000Z",
      reason: "Place offered in A",
    },
  ],
};

/** The routes every admissions screen reads, ready to spread over. */
export const admissionsRoutes = {
  "/admissions/intakes": [intake, closedIntake],
  "/admissions/applications": queue,
  "/admissions/applications/app-1": application,
  "/admissions/public/intakes": [
    {
      id: "intake-1",
      name: "Senior 1 intake, 2026",
      entryPoint: "SENIOR_ONE",
      closesAt: "2099-01-01T00:00:00.000Z",
      classLevel: { id: "level-1", name: "Senior 1" },
    },
  ],
  "/admissions/public/status": publicStatus,
};
