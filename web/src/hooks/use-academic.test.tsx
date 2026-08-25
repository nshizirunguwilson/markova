import { beforeEach, describe, it, vi } from "vitest";

import {
  assertMutation,
  assertQuery,
  makeApiMock,
  type MutationCase,
  type QueryCase,
} from "@/test/hooks";

const h = vi.hoisted(() => {
  const make = () => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  });
  return { api: make() };
});

vi.mock("@/lib/api", () => ({ default: h.api }));
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import * as academic from "./use-academic";

const api = h.api as ReturnType<typeof makeApiMock>;

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset();
});

const queries: QueryCase[] = [
  { name: "useAcademicYears", hook: () => academic.useAcademicYears(), url: "/academic/years" },
  { name: "useTerms (all)", hook: () => academic.useTerms(), url: "/academic/terms" },
  { name: "useTerms (by year)", hook: () => academic.useTerms("year-1"), url: "academicYearId=year-1" },
  { name: "useClassLevels", hook: () => academic.useClassLevels(), url: "/academic/class-levels" },
  { name: "useTrades", hook: () => academic.useTrades(), url: "/academic/trades" },
  { name: "useSections (all)", hook: () => academic.useSections(), url: "/academic/sections" },
  { name: "useSections (by level)", hook: () => academic.useSections("level-1"), url: "level-1" },
  { name: "useSubjects", hook: () => academic.useSubjects(), url: "/academic/subjects" },
  { name: "useAssessmentTypes", hook: () => academic.useAssessmentTypes(), url: "/academic/assessment-types" },
  { name: "useAssignments", hook: () => academic.useAssignments({ teacherId: "teacher-1" }), url: "/academic/assignments" },
  // The filters are optional and each is set separately, so a call carrying
  // all of them is the only one that proves none is dropped on the way.
  {
    name: "useAssignments (every filter)",
    hook: () =>
      academic.useAssignments({
        teacherId: "teacher-1",
        classSectionId: "section-1",
        academicYearId: "year-1",
      }),
    url: "classSectionId=section-1",
  },
  { name: "useTimetable", hook: () => academic.useTimetable("section-1"), url: "/academic/timetable" },
  {
    name: "useTimetable (a teacher's own week)",
    hook: () => academic.useTimetable("section-1", "teacher-1"),
    url: "teacherId=teacher-1",
  },
  { name: "useSchoolConfig", hook: () => academic.useSchoolConfig(), url: "/school-config" },
];

const mutations: MutationCase[] = [
  { name: "useCreateAcademicYear", hook: () => academic.useCreateAcademicYear(), method: "post", url: "/academic/years" },
  { name: "useCreateTerm", hook: () => academic.useCreateTerm(), method: "post", url: "/academic/terms" },
  { name: "useCloseTerm", hook: () => academic.useCloseTerm(), arg: "term-1", method: "post", url: "/academic/terms/term-1/close" },
  { name: "useReopenTerm", hook: () => academic.useReopenTerm(), arg: "term-1", method: "post", url: "/academic/terms/term-1/reopen" },
  { name: "usePromoteStudents", hook: () => academic.usePromoteStudents(), method: "post", url: "/academic/promote" },
  { name: "usePromotionPreview", hook: () => academic.usePromotionPreview(), method: "post", url: "/academic/promote/preview" },
  { name: "useCommitPromotion", hook: () => academic.useCommitPromotion(), method: "post", url: "/academic/promote/commit" },
  { name: "useCreateClassLevel", hook: () => academic.useCreateClassLevel(), method: "post", url: "/academic/class-levels" },
  { name: "useUpdateClassLevel", hook: () => academic.useUpdateClassLevel(), method: "put", url: "/academic/class-levels/id-1" },
  { name: "useDeleteClassLevel", hook: () => academic.useDeleteClassLevel(), arg: "id-1", method: "delete", url: "/academic/class-levels/id-1" },
  { name: "useCreateTrade", hook: () => academic.useCreateTrade(), method: "post", url: "/academic/trades" },
  { name: "useUpdateTrade", hook: () => academic.useUpdateTrade(), method: "put", url: "/academic/trades/id-1" },
  { name: "useDeleteTrade", hook: () => academic.useDeleteTrade(), arg: "id-1", method: "delete", url: "/academic/trades/id-1" },
  { name: "useCreateSection", hook: () => academic.useCreateSection(), method: "post", url: "/academic/sections" },
  { name: "useUpdateSection", hook: () => academic.useUpdateSection(), method: "put", url: "/academic/sections/id-1" },
  { name: "useDeleteSection", hook: () => academic.useDeleteSection(), arg: "id-1", method: "delete", url: "/academic/sections/id-1" },
  { name: "useCreateSubject", hook: () => academic.useCreateSubject(), method: "post", url: "/academic/subjects" },
  { name: "useUpdateSubject", hook: () => academic.useUpdateSubject(), method: "put", url: "/academic/subjects/id-1" },
  { name: "useDeleteSubject", hook: () => academic.useDeleteSubject(), arg: "id-1", method: "delete", url: "/academic/subjects/id-1" },
  { name: "useCreateAssessmentType", hook: () => academic.useCreateAssessmentType(), method: "post", url: "/academic/assessment-types" },
  { name: "useCreateAssignment", hook: () => academic.useCreateAssignment(), method: "post", url: "/academic/assignments" },
  { name: "useBulkAssignments", hook: () => academic.useBulkAssignments(), method: "post", url: "/academic/assignments/bulk" },
  { name: "useDeleteAssignment", hook: () => academic.useDeleteAssignment(), arg: "id-1", method: "delete", url: "/academic/assignments/id-1" },
  { name: "useCreateTimetable", hook: () => academic.useCreateTimetable(), method: "post", url: "/academic/timetable" },
  { name: "useUpdateTimetable", hook: () => academic.useUpdateTimetable(), method: "put", url: "/academic/timetable/id-1" },
  { name: "useDeleteTimetable", hook: () => academic.useDeleteTimetable(), arg: "id-1", method: "delete", url: "/academic/timetable/id-1" },
  { name: "useBulkUpsertConfig", hook: () => academic.useBulkUpsertConfig(), arg: [{ key: "a", value: "b" }], method: "post", url: "/school-config/bulk" },
  { name: "useUpdateOnboarding", hook: () => academic.useUpdateOnboarding(), method: "put", url: "/school-config/onboarding" },
];

describe("use-academic queries", () => {
  it.each(queries)("$name reads its endpoint and reports failure", async (c) => {
    await assertQuery(api, c);
  });
});

describe("use-academic mutations", () => {
  it.each(mutations)("$name writes its endpoint and reports failure", async (c) => {
    await assertMutation(api, c);
  });
});
