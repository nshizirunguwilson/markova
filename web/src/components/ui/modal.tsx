"use client";

import { useEffect, useCallback, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  // Capture the triggering element before modal opens
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleEscape]);

  // Focus the first focusable element ONLY when the modal opens. This must
  // not depend on handleEscape: an inline onClose prop changes identity on
  // every parent render, and re-running this on each keystroke would keep
  // yanking focus to the close button while the user types.
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (dialog) {
        const first = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (first) first.focus();
      }
    });
  }, [isOpen]);

  // Return focus to trigger on close
  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      const el = triggerRef.current as HTMLElement;
      if (typeof el.focus === "function") el.focus();
      triggerRef.current = null;
    }
  }, [isOpen]);

  // Focus trap: Tab and Shift+Tab cycle within modal
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  if (!isOpen) return null;

  // Deliberately wider than the Tailwind name suggests. A "lg" form modal at
  // max-w-lg took up a third of a laptop screen and made two-column fields
  // stack for no reason; every size here is shifted up so a form modal reads
  // as roughly two thirds of the viewport. `sm` stays narrow — it is the
  // confirm dialog, and a wide "are you sure?" looks broken.
  const sizes = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-3xl",
    xl: "max-w-4xl",
    "2xl": "max-w-5xl",
    "3xl": "max-w-6xl",
    "4xl": "max-w-7xl",
    "5xl": "max-w-[88rem]",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={title || "Dialog"}
        aria-modal="true"
        onKeyDown={handleKeyDown}
        className={cn(
          // The wider sizes make tall content likely, so the sheet caps its
          // own height and scrolls rather than running off the viewport.
          "relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-modal",
          sizes[size]
        )}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-lg p-1 text-muted hover:bg-accent-light hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
