"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  School,
  Palette,
  CalendarDays,
  CalendarRange,
  Layers,
  BookOpen,
  UserPlus,
  GraduationCap,
  Link2,
  ClipboardCheck,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useUpdateOnboarding } from "@/hooks/use-academic";
import { toast } from "sonner";

import { StepSchoolInfo } from "./steps/step-school-info";
import { StepBranding } from "./steps/step-branding";
import { StepAcademicYear } from "./steps/step-academic-year";
import { StepTerms } from "./steps/step-terms";
import { StepClasses } from "./steps/step-classes";
import { StepSubjects } from "./steps/step-subjects";
import { StepImportTeachers } from "./steps/step-import-teachers";
import { StepImportStudents } from "./steps/step-import-students";
import { StepAssignTeachers } from "./steps/step-assign-teachers";
import { StepReview } from "./steps/step-review";
import { PageHeader } from "@/components/layout/page-header";

const STEPS = [
  { label: "School Info", icon: School },
  { label: "Branding", icon: Palette },
  { label: "Academic Year", icon: CalendarDays },
  { label: "Terms", icon: CalendarRange },
  { label: "Classes", icon: Layers },
  { label: "Subjects", icon: BookOpen },
  { label: "Import Teachers", icon: UserPlus },
  { label: "Import Students", icon: GraduationCap },
  { label: "Assign Teachers", icon: Link2 },
  { label: "Review", icon: ClipboardCheck },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const updateOnboarding = useUpdateOnboarding();

  const goNext = () => {
    if (currentStep < STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      updateOnboarding.mutate({ currentStep: String(next) });
    }
  };

  const goBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleComplete = () => {
    updateOnboarding.mutate(
      { currentStep: "10", completed: "true" },
      {
        onSuccess: () => {
          toast.success("School setup complete!");
          router.push("/admin");
        },
      }
    );
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: return <StepSchoolInfo />;
      case 1: return <StepBranding />;
      case 2: return <StepAcademicYear />;
      case 3: return <StepTerms />;
      case 4: return <StepClasses />;
      case 5: return <StepSubjects />;
      case 6: return <StepImportTeachers />;
      case 7: return <StepImportStudents />;
      case 8: return <StepAssignTeachers />;
      case 9: return <StepReview onComplete={handleComplete} />;
      default: return null;
    }
  };

  return (
    <div>
      <div className="mb-6">
        <PageHeader
          title="School Setup Wizard"
          description={<>Configure your school in {STEPS.length} easy steps</>}
        />
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => (
            <div key={i} className="flex flex-1 items-center">
              <button
                onClick={() => i <= currentStep && setCurrentStep(i)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                  i < currentStep && "text-success cursor-pointer",
                  i === currentStep && "text-primary font-semibold",
                  i > currentStep && "text-muted cursor-default"
                )}
              >
                {i < currentStep ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <step.icon className="h-4 w-4" />
                )}
                <span className="hidden xl:inline">{step.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-1 h-0.5 flex-1",
                    i < currentStep ? "bg-success" : "bg-border"
                  )}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-sm text-muted">
          Step {currentStep + 1} of {STEPS.length}: <span className="font-medium text-foreground">{STEPS[currentStep].label}</span>
        </div>
      </div>

      {/* Step content */}
      <Card padding="lg" className="mb-6">
        {renderStep()}
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>

        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() => router.push("/admin")}
          >
            Skip for now
          </Button>
          {currentStep < STEPS.length - 1 && (
            <Button onClick={goNext}>
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
