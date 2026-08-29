"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";

import { useDebounce } from "@/hooks/use-debounce";
import { useUsers } from "@/hooks/use-users";
import { classDisplayName } from "@/lib/utils";

interface Props {
  /** Selected Student record id (not the user id). */
  value: string;
  onChange: (studentId: string) => void;
  label?: string;
}

interface Option {
  studentId: string;
  name: string;
  idNumber: string;
  className: string;
}

/** How many results to show before asking the user to narrow the search. */
const MAX_RESULTS = 8;

/**
 * Find one student by typing.
 *
 * This used to be three dependent dropdowns - Level, then Section, then
 * Student - which meant that finding Keza required knowing which class she is
 * in before you could look her up, and cost three interactions and two
 * network round trips whichever way you went. Anyone who knew the name
 * outright still had to walk the hierarchy to reach it.
 *
 * The search behind this accepts a name, a student id (`STD-2026-14`) or a
 * class ("Senior 2 A") in the one box, so a person who knows any one of those
 * things can type it. Results name the class alongside each student, which is
 * what disambiguates two students who share a name - the thing the cascade
 * was really there to do.
 */
export function StudentPicker({ value, onChange, label = "Student" }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // The highlighted row is remembered against the search it belongs to, so a
  // new set of results starts at the top without an effect having to reset it.
  const [highlight, setHighlight] = useState({ search: "", index: 0 });
  const [picked, setPicked] = useState<Option | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useDebounce(query.trim(), 250);

  // Nothing typed yet: show the first page of students rather than an empty
  // box, so the control is usable by someone browsing as well as searching.
  const { data, isFetching } = useUsers({
    role: "STUDENT",
    studentStatus: "ACTIVE",
    search: search || undefined,
    limit: MAX_RESULTS,
  });

  const options: Option[] = useMemo(
    () =>
      (data?.data ?? [])
        .filter((u: any) => u.student?.id)
        .map((u: any) => ({
          studentId: u.student.id,
          name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "Unnamed",
          idNumber: u.student.studentIdNumber ?? "",
          className: classDisplayName(u.student.classSection),
        })),
    [data],
  );

  // What was picked is kept rather than looked up again, because the next
  // search will not contain them. A `value` that arrived from the parent -
  // a form being reset, or a saved choice - is matched against the results
  // instead.
  const chosen: Option | null = !value
    ? null
    : picked?.studentId === value
      ? picked
      : (options.find((o) => o.studentId === value) ?? null);

  const active = highlight.search === search ? highlight.index : 0;
  const setActive = (next: number | ((i: number) => number)) =>
    setHighlight((h) => {
      const from = h.search === search ? h.index : 0;
      return { search, index: typeof next === "function" ? next(from) : next };
    });

  // Clicking away closes the list without choosing anything.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (option: Option) => {
    setPicked(option);
    onChange(option.studentId);
    setQuery("");
    setOpen(false);
  };

  const clear = () => {
    setPicked(null);
    onChange("");
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (options.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === "Enter") {
      if (!open || !options[active]) return;
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const listId = "student-picker-list";

  return (
    <div ref={rootRef}>
      <label
        htmlFor="student-picker-input"
        className="mb-1 block text-sm font-medium text-foreground"
      >
        {label}
      </label>

      {chosen ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="min-w-0 truncate text-sm text-foreground">
            <span className="font-medium">{chosen.name}</span>
            {chosen.className && (
              <span className="text-muted"> · {chosen.className}</span>
            )}
            {chosen.idNumber && (
              <span className="text-muted"> · {chosen.idNumber}</span>
            )}
          </span>
          <button
            type="button"
            aria-label={`Clear ${chosen.name}`}
            onClick={clear}
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-muted hover:bg-muted/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            id="student-picker-input"
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Search by name, student ID or class"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
          />

          {open && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Students"
              className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-modal"
            >
              {options.length === 0 ? (
                <li className="px-3 py-3 text-sm text-muted">
                  {isFetching
                    ? "Searching…"
                    : search
                      ? `No student matches "${search}"`
                      : "No active students"}
                </li>
              ) : (
                options.map((option, i) => (
                  <li key={option.studentId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(option)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                        i === active ? "bg-accent-light" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {option.name}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {[option.className, option.idNumber]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {option.studentId === value && (
                        <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
