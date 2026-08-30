"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ROLE_LABEL,
  ROLE_ORDER,
  STAFF_ROLES,
  type Role,
} from "@/types";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Modal, Button, Input, Spinner } from "@/components/ui";
import { NationalIdInput } from "@/components/ui/national-id-input";
import { useCreateUser } from "@/hooks/use-users";
import { useClassLevels, useSections } from "@/hooks/use-academic";
import {
  generatePassword,
  suggestEmail,
  validateNid,
} from "@/lib/person-form";
import api from "@/lib/api";
import {
  AlertTriangle,
  Check,
  Copy,
  ImageIcon,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { copyText } from "@/lib/clipboard";

// Real Rwandan mobiles: MTN 078/079, Airtel 072/073.
const PHONE_RE = /^\+250(78|79|72|73)\d{7}$/;

/** The API's own limit, checked here so it is caught before the account exists. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Exported so the role rules can be checked directly. They are the difference
 * between a parent who can sign in and one who cannot: parents log in by phone,
 * staff by email, and a student with no class is invisible to every roster in
 * the school. Reaching those branches through five wizard steps proved far more
 * fragile than reading them here.
 */
export const schema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    /* Every role the school has. This listed five of them, so a bursar, a
       nurse, a patron, a matron and the head teacher could not be created
       at all - the accounts existed only because the seed made them. */
    role: z.enum(ROLE_ORDER as [Role, ...Role[]]),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    phone: z
      .string()
      .regex(PHONE_RE, "Use a real Rwandan mobile: +250 then 78/79/72/73 and 7 digits")
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .min(8, "Min 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/,
        "Needs upper, lower, number and a symbol",
      ),
    // Student
    classSectionId: z.string().optional().or(z.literal("")),
    gender: z.enum(["MALE", "FEMALE"]).optional().or(z.literal("")),
    dateOfBirth: z.string().optional().or(z.literal("")),
    enrollmentDate: z.string().optional().or(z.literal("")),
    boarding: z.enum(["DAY", "BOARDER"]).optional().or(z.literal("")),
    previousSchool: z.string().optional().or(z.literal("")),
    nationalId: z.string().optional().or(z.literal("")),
    nationality: z.string().optional().or(z.literal("")),
    province: z.string().optional().or(z.literal("")),
    district: z.string().optional().or(z.literal("")),
    sector: z.string().optional().or(z.literal("")),
    cell: z.string().optional().or(z.literal("")),
    village: z.string().optional().or(z.literal("")),
    disability: z.string().optional().or(z.literal("")),
    religion: z.string().optional().or(z.literal("")),
    insuranceNumber: z.string().optional().or(z.literal("")),
    fatherName: z.string().optional().or(z.literal("")),
    motherName: z.string().optional().or(z.literal("")),
    bloodType: z.string().optional().or(z.literal("")),
    allergies: z.string().optional().or(z.literal("")),
    medicalConditions: z.string().optional().or(z.literal("")),
    // Teacher
    employmentStatus: z
      .enum(["FULL_TIME", "PART_TIME", "CONTRACT"])
      .optional()
      .or(z.literal("")),
    qualification: z.enum(["A0", "A1", "A2"]).optional().or(z.literal("")),
    rssbNumber: z.string().optional().or(z.literal("")),
    hireDate: z.string().optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (!v.email && !v.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Give an email or a phone so this user can log in",
      });
    }
    if (v.role === "STUDENT" && !v.classSectionId) {
      ctx.addIssue({
        code: "custom",
        path: ["classSectionId"],
        message: "A student must be placed in a class",
      });
    }
    if (v.role === "PARENT" && !v.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Parents log in by phone, so a phone number is required",
      });
    }
    /* Everybody on the staff signs in with an address: parents log in by
       phone, and a student's is issued by the school. */
    if (STAFF_ROLES.includes(v.role) && !v.email) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Staff log in with email, so an email address is required",
      });
    }
    const nidError = validateNid(
      v.nationalId || "",
      (v.gender || "") as "MALE" | "FEMALE" | "",
      v.dateOfBirth || undefined,
    );
    if (nidError) {
      ctx.addIssue({ code: "custom", path: ["nationalId"], message: nidError });
    }
  });

type FormData = z.infer<typeof schema>;

type ChildLink = {
  studentId: string;
  name: string;
  code: string;
  className: string;
  relationship: string;
};

const STEP_FIELDS: Record<string, (keyof FormData)[]> = {
  Account: ["firstName", "lastName", "email", "phone", "password"],
  Academic: ["classSectionId", "gender", "dateOfBirth", "enrollmentDate"],
  "Identity & residence": ["nationalId", "nationality"],
  "Family & health": ["fatherName", "motherName"],
  Employment: ["employmentStatus", "qualification", "hireDate", "nationalId"],
  Children: ["phone"],
};

const selectCls =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      {/*
        The control is nested inside the label so the two are associated
        without every caller having to invent an id. A bare sibling <label>
        announces nothing to a screen reader and does not focus its field
        when clicked.
      */}
      <label className="block text-sm font-medium text-foreground">
        <span className="mb-1.5 block">{label}</span>
        {children}
      </label>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function AddUserWizard({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const createUser = useCreateUser();
  const [selectedLevel, setSelectedLevel] = useState("");
  const { data: classLevels } = useClassLevels();
  const { data: sections } = useSections(selectedLevel || undefined);

  const [step, setStep] = useState(0);
  // Which way the last step change went, so the incoming step can slide in
  // from the side it came from. Forward and Back look identical otherwise,
  // and on a four-step form that is the one thing worth saying.
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [children, setChildren] = useState<ChildLink[]>([]);
  const [childQuery, setChildQuery] = useState("");
  const [childResults, setChildResults] = useState<any[]>([]);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  // Object URL for the chosen file, so the admin sees the face they picked in
  // the shape it will actually be shown in (round, on the profile and the ID
  // card) rather than a filename.
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setFocus,
    getFieldState,
    trigger,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: "STUDENT", password: "", nationality: "Rwandan", boarding: "DAY" },
  });

  const role = watch("role");
  const firstName = watch("firstName");
  const lastName = watch("lastName");
  const gender = watch("gender");
  const dateOfBirth = watch("dateOfBirth");
  const nationalId = watch("nationalId") || "";

  const steps = useMemo(() => {
    if (role === "STUDENT")
      return ["Account", "Academic", "Identity & residence", "Family & health"];
    if (role === "TEACHER") return ["Account", "Employment"];
    if (role === "PARENT") return ["Account", "Children"];
    return ["Account"];
  }, [role]);
  const stepName = steps[Math.min(step, steps.length - 1)];
  const isLast = step >= steps.length - 1;

  // Same-name warning, non-blocking (the school may truly have two).
  useEffect(() => {
    const first = firstName?.trim();
    const last = lastName?.trim();
    if (!first || !last || first.length < 2 || last.length < 2) {
      setDupWarning(null);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await api.get("/users", {
          params: { search: `${first} ${last}`, searchIn: "name", limit: 1 },
        });
        setDupWarning(
          res.data?.meta?.total > 0
            ? `${first} ${last} already exists in the system. Continue only if this is truly a different person.`
            : null,
        );
      } catch {
        setDupWarning(null);
      }
    }, 450);
    return () => clearTimeout(id);
  }, [firstName, lastName]);

  // Child search for parents.
  useEffect(() => {
    if (role !== "PARENT" || childQuery.trim().length < 2) {
      setChildResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await api.get("/users", {
          params: {
            role: "STUDENT",
            studentStatus: "ACTIVE",
            search: childQuery.trim(),
            limit: 8,
          },
        });
        setChildResults(res.data?.data ?? []);
      } catch {
        setChildResults([]);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [childQuery, role]);

  const studentAge = useMemo(() => {
    if (!dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) return null;
    return Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
  }, [dateOfBirth]);

  const handleSuggestEmail = async () => {
    const base = suggestEmail(firstName || "", lastName || "");
    if (!base) return toast.error("Fill in the names first");
    setCheckingEmail(true);
    try {
      const [local, domain] = base.split("@");
      let candidate = base;
      for (let n = 2; n < 10; n++) {
        const res = await api.get("/users", {
          params: { search: candidate, searchIn: "email", limit: 1 },
        });
        if (!res.data?.meta?.total) break;
        candidate = `${local}${n}@${domain}`;
      }
      setValue("email", candidate, { shouldValidate: true });
    } catch {
      setValue("email", base, { shouldValidate: true });
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleGeneratePassword = () => {
    setValue("password", generatePassword(), { shouldValidate: true });
    setShowPassword(true);
  };

  const copyPassword = async () => {
    // There is no clipboard on plain http, which is how this runs on a school
    // LAN. Telling someone their password is copied when it is not would be
    // worse than telling them to write it down.
    const copied = await copyText(watch("password") || "");
    if (copied) {
      toast.success("Password copied, share it safely");
    } else {
      toast.error("Could not copy. Write the password down before continuing.");
    }
  };

  const addChild = (u: any) => {
    if (!u.student?.id) return;
    if (children.some((c) => c.studentId === u.student.id)) return;
    setChildren((c) => [
      ...c,
      {
        studentId: u.student.id,
        name: `${u.firstName} ${u.lastName}`,
        code: u.student.studentIdNumber,
        className: [
          u.student.classSection?.classLevel?.name,
          u.student.classSection?.trade?.code,
          u.student.classSection?.name,
        ]
          .filter(Boolean)
          .join(" "),
        relationship: "Father",
      },
    ]);
    setChildrenError(null);
    setChildQuery("");
    setChildResults([]);
  };

  const closeAndReset = () => {
    reset();
    setSelectedLevel("");
    setStep(0);
    setChildren([]);
    setChildQuery("");
    setChildrenError(null);
    setDupWarning(null);
    choosePhoto(null);
    setShowPassword(false);
    onClose();
  };

  const choosePhoto = (file: File | null) => {
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  // A blob URL is a document-lifetime handle. Revoking the one we are leaving
  // behind keeps a wizard that is opened and closed all afternoon from holding
  // every photo ever previewed in memory.
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  /**
   * Move to the next step, or put the cursor on what is stopping it.
   *
   * A step that refuses to advance in silence is indistinguishable from a
   * dead button. The field at fault is on this step by construction - that
   * is what was validated - so it is already showing its own message, and
   * focusing it is what turns "nothing happened" into "this one".
   *
   * Read through `getFieldState` rather than the `errors` object: `errors`
   * is the one captured when this render began, from before `trigger` ran,
   * so it still describes the previous attempt.
   */
  const next = async () => {
    const fields = STEP_FIELDS[stepName] ?? [];
    if (await trigger(fields)) {
      setDirection("forward");
      setStep((s) => s + 1);
      return;
    }
    const firstBad = fields.find((f) => getFieldState(f).error);
    if (firstBad) setFocus(firstBad);
  };

  /**
   * Enter in any text field submits the form, and the browser does that no
   * matter which step is on screen. Left alone it runs `onSubmit` from step
   * two and creates a half-filled user, so a submit that arrives before the
   * last step is treated as a press of Continue instead.
   */
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!isLast) {
      e.preventDefault();
      void next();
      return;
    }
    void handleSubmit(onSubmit)(e);
  };

  const onSubmit = async (data: FormData) => {
    if (data.role === "PARENT" && children.length === 0) {
      setChildrenError("Link at least one child, otherwise this parent sees nothing");
      return;
    }
    const payload: any = {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      password: data.password,
      role: data.role,
    };
    const put = (key: string, val: any) => {
      if (val !== undefined && val !== "" && val !== null) payload[key] = val;
    };
    put("email", data.email);
    put("phone", data.phone);
    put("nationalId", data.nationalId);
    put("nationality", data.nationality);
    if (data.role === "STUDENT") {
      put("classSectionId", data.classSectionId);
      put("gender", data.gender);
      put("dateOfBirth", data.dateOfBirth);
      put("enrollmentDate", data.enrollmentDate);
      payload.isBoarder = data.boarding === "BOARDER";
      put("previousSchool", data.previousSchool);
      put("province", data.province);
      put("district", data.district);
      put("sector", data.sector);
      put("cell", data.cell);
      put("village", data.village);
      put("disability", data.disability);
      put("religion", data.religion);
      put("insuranceNumber", data.insuranceNumber);
      put("fatherName", data.fatherName);
      put("motherName", data.motherName);
      put("bloodType", data.bloodType);
      put("allergies", data.allergies);
      put("medicalConditions", data.medicalConditions);
    }
    if (data.role === "TEACHER") {
      put("gender", data.gender);
      put("dateOfBirth", data.dateOfBirth);
      put("employmentStatus", data.employmentStatus);
      put("qualification", data.qualification);
      put("rssbNumber", data.rssbNumber);
      put("hireDate", data.hireDate);
    }
    if (data.role === "PARENT") {
      payload.children = children.map((c) => ({
        studentId: c.studentId,
        relationship: c.relationship,
      }));
    }

    const created = await createUser.mutateAsync(payload);
    if (photo && created?.id) {
      try {
        const form = new FormData();
        form.append("photo", photo);
        await api.post(`/users/${created.id}/photo`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } catch {
        toast.error("User created, but the photo failed to upload");
      }
    }
    closeAndReset();
  };

  return (
    <Modal isOpen={isOpen} onClose={closeAndReset} title="Add New User" size="4xl">
      {/* Step rail */}
      {steps.length > 1 && (
        <div className="mb-5 flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step
                    ? "bg-primary text-white"
                    : i === step
                      ? "border-2 border-primary text-primary"
                      : "border border-border text-muted"
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`text-xs font-medium ${i === step ? "text-foreground" : "text-muted"}`}>
                {s}
              </span>
              {i < steps.length - 1 && <span className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        {/*
          The step that is on screen, re-mounted on every change so the
          animation replays - and sliding in from the side it came from, so
          Continue and Back look like the different things they are.

          The footer sits outside: its buttons stay put while the fields
          move, which is what makes the movement read as the content
          changing rather than the whole dialog lurching.
        */}
        <div
          key={step}
          className={direction === "forward" ? "motion-step-forward" : "motion-step-back"}
        >
          {/* ── Account ── */}
          {stepName === "Account" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id="firstName"
                  label={<>First Name <span className="text-danger">*</span></>}
                  error={errors.firstName?.message}
                  {...register("firstName")}
                />
                <Input
                  id="lastName"
                  label={<>Last Name <span className="text-danger">*</span></>}
                  error={errors.lastName?.message}
                  {...register("lastName")}
                />
              </div>
              {dupWarning && (
                <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  {dupWarning}
                </p>
              )}
              <Field label="User type">
                <select {...register("role")} className={selectCls} disabled={step > 0}>
                  {ROLE_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        id="email"
                        label={
                          role === "PARENT" ? (
                            "Email (optional)"
                          ) : role === "STUDENT" ? (
                            "Email"
                          ) : (
                            <>Email <span className="text-danger">*</span></>
                          )
                        }
                        type="email"
                        placeholder="name@markova.edu"
                        error={errors.email?.message}
                        {...register("email")}
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" className="mb-0.5" onClick={handleSuggestEmail} disabled={checkingEmail}>
                      {checkingEmail ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                      <span className="ml-1">Suggest</span>
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted">School style: k.ineza@markova.edu, checked for availability</p>
                </div>
                <Input
                  id="phone"
                  label={role === "PARENT" ? <>Phone <span className="text-danger">*</span></> : "Phone"}
                  placeholder="+2507XXXXXXXX"
                  error={errors.phone?.message}
                  {...register("phone")}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input
                        id="password"
                        label={<>Password <span className="text-danger">*</span></>}
                        type={showPassword ? "text" : "password"}
                        placeholder="Min 8 characters"
                        error={errors.password?.message}
                        {...register("password")}
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" className="mb-0.5" onClick={handleGeneratePassword}>
                      Generate
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="mb-0.5" onClick={copyPassword} aria-label="Copy password">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    They will be asked to change it on first login
                  </p>
                </div>
                <Field label="Photo (optional)" hint="Shown on the profile and the ID card">
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-accent-light/50">
                      {photoPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoPreview}
                          alt="Selected photo"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-7 w-7 text-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        type="file"
                        // The API stores jpeg/png/gif/webp only. `image/*` also
                        // offers HEIC and SVG, which were accepted here and then
                        // refused by the server after the account was made.
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        aria-label="Photo"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (file && file.size > MAX_PHOTO_BYTES) {
                            toast.error("Photo must be 5MB or smaller");
                            e.target.value = "";
                            return;
                          }
                          choosePhoto(file);
                        }}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
                      />
                      {photo && (
                        <button
                          type="button"
                          onClick={() => choosePhoto(null)}
                          className="mt-1.5 text-xs font-medium text-danger hover:underline"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>
                  </div>
                </Field>
              </div>
            </>
          )}

          {/* ── Student: Academic ── */}
          {stepName === "Academic" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Class Level *">
                  <select
                    value={selectedLevel}
                    onChange={(e) => {
                      setSelectedLevel(e.target.value);
                      setValue("classSectionId", "");
                    }}
                    className={selectCls}
                  >
                    <option value="">Select level...</option>
                    {classLevels?.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </Field>
                <div>
                  <Field label="Class *">
                    <select {...register("classSectionId")} disabled={!selectedLevel} className={`${selectCls} disabled:bg-muted/10 disabled:text-muted`}>
                      <option value="">{selectedLevel ? "Select class..." : "Pick a level first"}</option>
                      {sections?.map((s: any) => (
                        <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>
                      ))}
                    </select>
                  </Field>
                  {errors.classSectionId && (
                    <p className="mt-1 text-sm text-danger">{errors.classSectionId.message}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Gender">
                  <select {...register("gender")} className={selectCls}>
                    <option value="">Select...</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </Field>
                <div>
                  <Input id="dateOfBirth" label="Date of Birth" type="date" {...register("dateOfBirth")} />
                  {studentAge !== null && (studentAge < 10 || studentAge > 25) && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {studentAge} years old is unusual for secondary school; double-check the date
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id="enrollmentDate"
                  label="Enrollment Date"
                  type="date"
                  {...register("enrollmentDate")}
                />
                <Field label="Boarding">
                  <select {...register("boarding")} className={selectCls}>
                    <option value="DAY">Day student</option>
                    <option value="BOARDER">Boarder</option>
                  </select>
                </Field>
              </div>
              <Input
                id="previousSchool"
                label="Previous School"
                placeholder="For transfers, e.g. GS Kacyiru"
                {...register("previousSchool")}
              />
            </>
          )}

          {/* ── Student: Identity & residence ── */}
          {stepName === "Identity & residence" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NationalIdInput
                  value={nationalId}
                  onChange={(d) => setValue("nationalId", d, { shouldValidate: false })}
                  onBlur={() => trigger("nationalId")}
                  error={errors.nationalId?.message ?? validateNid(nationalId, (gender || "") as any, dateOfBirth || undefined)}
                  label="National ID (optional)"
                />
                <Input id="nationality" label="Nationality" {...register("nationality")} />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Input id="province" label="Province" placeholder="Kigali City" {...register("province")} />
                <Input id="district" label="District" placeholder="Gasabo" {...register("district")} />
                <Input id="sector" label="Sector" placeholder="Kacyiru" {...register("sector")} />
                <Input id="cell" label="Cell" {...register("cell")} />
                <Input id="village" label="Village" {...register("village")} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Disability / special needs">
                  <select {...register("disability")} className={selectCls}>
                    <option value="">None</option>
                    <option value="Visual impairment">Visual impairment</option>
                    <option value="Hearing impairment">Hearing impairment</option>
                    <option value="Physical disability">Physical disability</option>
                    <option value="Learning difficulty">Learning difficulty</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
                <Input id="religion" label="Religion" placeholder="Optional" {...register("religion")} />
                <Input
                  id="insuranceNumber"
                  label="Insurance (Mutuelle) No"
                  placeholder="Optional"
                  {...register("insuranceNumber")}
                />
              </div>
            </>
          )}

          {/* ── Student: Family & health ── */}
          {stepName === "Family & health" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input id="fatherName" label="Father's Names" placeholder="As on records" {...register("fatherName")} />
                <Input id="motherName" label="Mother's Names" placeholder="As on records" {...register("motherName")} />
              </div>
              <p className="text-xs text-muted">
                Parent login accounts are created separately under the Parent type and linked to this student there.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Blood Type">
                  <select {...register("bloodType")} className={selectCls}>
                    <option value="">Unknown</option>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </Field>
                <Input id="allergies" label="Allergies" placeholder="e.g. penicillin" {...register("allergies")} />
                <Input
                  id="medicalConditions"
                  label="Medical Conditions"
                  placeholder="e.g. asthma"
                  {...register("medicalConditions")}
                />
              </div>
            </>
          )}

          {/* ── Teacher: Employment ── */}
          {stepName === "Employment" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Employment Status">
                  <select {...register("employmentStatus")} className={selectCls}>
                    <option value="FULL_TIME">Full Time</option>
                    <option value="PART_TIME">Part Time</option>
                    <option value="CONTRACT">Contract</option>
                  </select>
                </Field>
                <Field label="Qualification">
                  <select {...register("qualification")} className={selectCls}>
                    <option value="">Select...</option>
                    <option value="A0">A0 - Bachelor&apos;s degree</option>
                    <option value="A1">A1 - Diploma</option>
                    <option value="A2">A2 - Secondary certificate</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input id="hireDate" label="Hire Date" type="date" {...register("hireDate")} />
                <Input id="rssbNumber" label="RSSB Number" placeholder="Optional" {...register("rssbNumber")} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Gender">
                  <select {...register("gender")} className={selectCls}>
                    <option value="">Select...</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </Field>
                <Input id="dateOfBirth" label="Date of Birth" type="date" {...register("dateOfBirth")} />
              </div>
              <NationalIdInput
                value={nationalId}
                onChange={(d) => setValue("nationalId", d, { shouldValidate: false })}
                onBlur={() => trigger("nationalId")}
                error={
                  errors.nationalId?.message ??
                  validateNid(
                    nationalId,
                    (gender || "") as "MALE" | "FEMALE" | "",
                    dateOfBirth || undefined,
                  )
                }
                label="National ID (optional)"
              />
            </>
          )}

          {/* ── Parent: Children ── */}
          {stepName === "Children" && (
            <>
              <Field label="Find their children *" hint="Search by name or student code, then add each child">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    value={childQuery}
                    onChange={(e) => setChildQuery(e.target.value)}
                    placeholder="e.g. Keza or STD-2026-0042"
                    className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </Field>
              {childResults.length > 0 && (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                  {childResults.map((u: any) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => addChild(u)}
                      className="flex w-full items-baseline justify-between px-3 py-2 text-left text-sm hover:bg-accent-light"
                    >
                      <span className="font-medium">{u.firstName} {u.lastName}</span>
                      <span className="text-xs text-muted">
                        {u.student?.studentIdNumber} · {[u.student?.classSection?.classLevel?.name, u.student?.classSection?.trade?.code, u.student?.classSection?.name].filter(Boolean).join(" ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {children.length > 0 && (
                <ul className="space-y-2">
                  {children.map((c) => (
                    <li key={c.studentId} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted">{c.code} · {c.className}</p>
                      </div>
                      <select
                        value={c.relationship}
                        onChange={(e) =>
                          setChildren((list) =>
                            list.map((x) =>
                              x.studentId === c.studentId ? { ...x, relationship: e.target.value } : x,
                            ),
                          )
                        }
                        className="rounded-lg border border-border px-2 py-1.5 text-sm"
                      >
                        <option value="Father">Father</option>
                        <option value="Mother">Mother</option>
                        <option value="Guardian">Guardian</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setChildren((list) => list.filter((x) => x.studentId !== c.studentId))}
                        aria-label={`Remove ${c.name}`}
                        className="rounded p-1 text-muted hover:bg-accent-light hover:text-danger"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {childrenError && <p className="text-sm text-danger">{childrenError}</p>}
              <NationalIdInput
                value={nationalId}
                onChange={(d) => setValue("nationalId", d, { shouldValidate: false })}
                onBlur={() => trigger("nationalId")}
                error={
                  errors.nationalId?.message ??
                  validateNid(
                    nationalId,
                    (gender || "") as "MALE" | "FEMALE" | "",
                    dateOfBirth || undefined,
                  )
                }
                label="National ID (optional)"
              />
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {step > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDirection("back");
                  setStep((s) => s - 1);
                }}
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={closeAndReset}>
              Cancel
            </Button>
            {/*
              One button that is never a submit button.

              These were two: a `type="button"` Continue and a `type="submit"`
              Create User, in the same place in the tree. React reuses the DOM
              node between them and only swaps the props - so clicking
              Continue on the second-to-last step ran `next`, React flushed
              the step change synchronously, `type` became "submit" on the
              very element being clicked, and the browser then submitted the
              form it had just been handed. A student was created from the
              Identity step and the wizard closed, without Family & health
              ever being shown.

              jsdom does not carry a click through to a form submission that
              way, which is why the tests were happy throughout.
            */}
            <Button
              type="button"
              onClick={isLast ? () => void handleSubmit(onSubmit)() : next}
              isLoading={isLast && createUser.isPending}
            >
              {isLast ? "Create User" : "Continue"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
