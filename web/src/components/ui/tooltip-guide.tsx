"use client";

import { useState, useEffect, useRef } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";

interface TooltipStep {
  target: string; // CSS selector
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

interface TooltipGuideProps {
  id: string; // unique ID to track if user has seen this guide
  steps: TooltipStep[];
  onComplete?: () => void;
}

export function TooltipGuide({ id, steps, onComplete }: TooltipGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const storageKey = `markova-guide-${id}`;

  useEffect(() => {
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      // Small delay to let the page render
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!visible || !steps[currentStep]) return;

    const el = document.querySelector(steps[currentStep].target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const position = steps[currentStep].position || "bottom";

    let top = 0;
    let left = 0;

    switch (position) {
      case "bottom":
        top = rect.bottom + window.scrollY + 12;
        left = rect.left + window.scrollX + rect.width / 2 - 150;
        break;
      case "top":
        top = rect.top + window.scrollY - 120;
        left = rect.left + window.scrollX + rect.width / 2 - 150;
        break;
      case "right":
        top = rect.top + window.scrollY + rect.height / 2 - 40;
        left = rect.right + window.scrollX + 12;
        break;
      case "left":
        top = rect.top + window.scrollY + rect.height / 2 - 40;
        left = rect.left + window.scrollX - 312;
        break;
    }

    // Keep within viewport
    left = Math.max(8, Math.min(left, window.innerWidth - 320));
    top = Math.max(8, top);

    // Position depends on the target's laid-out rect, which does not exist
    // until after paint - it genuinely cannot be derived during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPos({ top, left });

    // Highlight the target element
    el.classList.add("ring-2", "ring-primary-light", "ring-offset-2", "rounded-lg", "relative", "z-50");

    return () => {
      el.classList.remove("ring-2", "ring-primary-light", "ring-offset-2", "rounded-lg", "relative", "z-50");
    };
  }, [visible, currentStep, steps]);

  const dismiss = () => {
    localStorage.setItem(storageKey, "true");
    setVisible(false);
    onComplete?.();
  };

  const next = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      dismiss();
    }
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  if (!visible || !steps[currentStep]) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={dismiss} />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-50 w-[300px] bg-surface rounded-xl shadow-popover border border-accent p-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
        style={{ top: pos.top, left: pos.left }}
      >
        <button
          onClick={dismiss}
          aria-label="Dismiss this tip"
          className="absolute top-2 right-2 text-muted hover:text-foreground-muted"
        >
          <X className="h-4 w-4" />
        </button>

        <h4 className="font-semibold text-primary text-sm mb-1">
          {steps[currentStep].title}
        </h4>
        <p className="text-sm text-foreground-muted mb-3">
          {steps[currentStep].content}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {currentStep + 1} of {steps.length}
          </span>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={prev}
                className="flex items-center text-xs text-primary-light hover:text-primary font-medium"
              >
                <ChevronLeft className="h-3 w-3 mr-0.5" /> Back
              </button>
            )}
            <button aria-label="Next"
              onClick={next}
              className="flex items-center text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-light font-medium"
            >
              {currentStep < steps.length - 1 ? (
                <>Next <ChevronRight className="h-3 w-3 ml-0.5" /></>
              ) : (
                "Got it!"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
