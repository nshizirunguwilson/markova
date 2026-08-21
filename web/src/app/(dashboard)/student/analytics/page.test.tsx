import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  performance: vi.fn(() => <div data-testid="performance" />),
}));

vi.mock("@/components/student-performance", () => ({
  StudentPerformance: (props: { studentId: string }) => {
    h.performance(props);
    return <div data-testid="performance">performance for {props.studentId}</div>;
  },
}));

import { renderPage, screen } from "@/test/page";
import StudentAnalyticsPage from "./page";

describe("student analytics page", () => {
  it("shows the student's performance when their record is linked", () => {
    renderPage(StudentAnalyticsPage, {
      role: "STUDENT",
      user: { studentId: "student-1" },
    });
    expect(screen.getByRole("heading", { name: /my performance/i })).toBeInTheDocument();
    expect(screen.getByTestId("performance")).toHaveTextContent("student-1");
  });

  // A signed-in account with no student row is a real state: a parent or an
  // admin who reached the URL, or a student mid-enrolment.
  it("explains itself when there is no student record, instead of crashing", () => {
    renderPage(StudentAnalyticsPage, { role: "STUDENT", user: { studentId: undefined } });
    expect(screen.getByText(/student record could not be found/i)).toBeInTheDocument();
    expect(screen.queryByTestId("performance")).not.toBeInTheDocument();
  });
});
