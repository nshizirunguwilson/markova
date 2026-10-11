"use client";

import { useState } from "react";
import { classDisplayName } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import {
  ArrowLeft,
  Save,
  Mail,
  Phone,
  Calendar,
  Shield,
  GraduationCap,
} from "lucide-react";
import {
  Button,
  Card,
  CardTitle,
  Badge,
  Avatar,
  Input,
  PageSpinner,
} from "@/components/ui";
import { useUser, useUpdateUser } from "@/hooks/use-users";
import { NationalIdInput } from "@/components/ui/national-id-input";
import { formatNid, validateNid } from "@/lib/person-form";
import { labelForRole } from "@/types";
import { ResetSignIn } from "@/components/profile/reset-sign-in";
import { SafeguardingLead } from "@/components/people/safeguarding-lead";
import { StudentJourney } from "@/components/people/student-journey";
import { ParentPassedAway } from "@/components/people/parent-passed-away";
import { STANDING_LABEL } from "@/lib/standing";

const selectCls =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50";

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z
    .string()
    .regex(/^\+250(78|79|72|73)\d{7}$/, "Use +250 then 78/79/72/73 and 7 digits")
    .optional()
    .or(z.literal("")),
  isActive: z.boolean().optional(),
  nationalId: z.string().optional().or(z.literal("")),
  nationality: z.string().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE"]).optional().or(z.literal("")),
  dateOfBirth: z.string().optional().or(z.literal("")),
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
  previousSchool: z.string().optional().or(z.literal("")),
  boarding: z.enum(["DAY", "BOARDER"]).optional().or(z.literal("")),
  employmentStatus: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT"])
    .optional()
    .or(z.literal("")),
  qualification: z.enum(["A0", "A1", "A2"]).optional().or(z.literal("")),
  rssbNumber: z.string().optional().or(z.literal("")),
  hireDate: z.string().optional().or(z.literal("")),
}).superRefine((v, ctx) => {
  // The NIDA number encodes the birth year and a gender digit, so an ID that
  // disagrees with the profile it is being attached to is a typo, not a
  // record. This used to be shown as a hint the form was happy to save
  // through; now it stops the save, the way the Add User wizard already does.
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

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: user, isLoading } = useUser(id);
  const updateUser = useUpdateUser();
  const [editing, setEditing] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: user
      ? {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email || "",
          phone: user.phone || "",
          isActive: user.isActive,
          nationalId: user.nationalId || "",
          nationality: user.nationality || "",
          gender: user.student?.gender || user.gender || "",
          dateOfBirth: (user.student?.dateOfBirth || user.dateOfBirth || "").slice(0, 10),
          province: user.student?.province || "",
          district: user.student?.district || "",
          sector: user.student?.sector || "",
          cell: user.student?.cell || "",
          village: user.student?.village || "",
          disability: user.student?.disability || "",
          religion: user.student?.religion || "",
          insuranceNumber: user.student?.insuranceNumber || "",
          fatherName: user.student?.fatherName || "",
          motherName: user.student?.motherName || "",
          bloodType: user.student?.bloodType || "",
          allergies: user.student?.allergies || "",
          medicalConditions: user.student?.medicalConditions || "",
          previousSchool: user.student?.previousSchool || "",
          boarding: user.student ? (user.student.isBoarder ? "BOARDER" : "DAY") : "",
          employmentStatus: user.teacher?.employmentStatus || "",
          qualification: user.teacher?.qualification || "",
          rssbNumber: user.teacher?.rssbNumber || "",
          hireDate: (user.teacher?.hireDate || "").slice(0, 10),
        }
      : undefined,
  });
  const nid = watch("nationalId") || "";
  // A student's gender and date of birth live on the Student record; everyone
  // else's live on the User. `values` above already folds the two together,
  // so watching the form is enough to check the ID against both.
  const nidGender = (watch("gender") || "") as "MALE" | "FEMALE" | "";
  const nidDob = watch("dateOfBirth") || undefined;

  const onSubmit = async (data: FormData) => {
    // Empty strings stay untouched rather than wiping stored values.
    const opt = (v?: string) => (v ? v : undefined);
    await updateUser.mutateAsync({
      id,
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: opt(data.email),
        phone: opt(data.phone),
        isActive: data.isActive,
        nationalId: opt(data.nationalId),
        nationality: opt(data.nationality),
        gender: opt(data.gender),
        dateOfBirth: opt(data.dateOfBirth),
        ...(user?.student && {
          province: opt(data.province),
          district: opt(data.district),
          sector: opt(data.sector),
          cell: opt(data.cell),
          village: opt(data.village),
          disability: opt(data.disability),
          religion: opt(data.religion),
          insuranceNumber: opt(data.insuranceNumber),
          fatherName: opt(data.fatherName),
          motherName: opt(data.motherName),
          bloodType: opt(data.bloodType),
          allergies: opt(data.allergies),
          medicalConditions: opt(data.medicalConditions),
          previousSchool: opt(data.previousSchool),
          isBoarder: data.boarding ? data.boarding === "BOARDER" : undefined,
        }),
        ...(user?.teacher && {
          employmentStatus: opt(data.employmentStatus),
          qualification: opt(data.qualification),
          rssbNumber: opt(data.rssbNumber),
          hireDate: opt(data.hireDate),
        }),
      },
    });
    setEditing(false);
  };

  if (isLoading) return <PageSpinner />;
  if (!user) return <p className="text-muted p-8">User not found</p>;

  const roleBadge: Record<string, "info" | "success" | "default" | "warning"> =
    {
      ADMIN: "info",
      TEACHER: "success",
      STUDENT: "default",
      PARENT: "warning",
      LIBRARIAN: "info",
    };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button aria-label="Go back"
            variant="ghost"
            size="sm"
            onClick={() => router.push("/admin/users")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-4">
            <Avatar
              src={user.photoUrl}
              fallback={`${user.firstName[0]}${user.lastName[0]}`}
              size="lg"
            />
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">
                {user.firstName} {user.lastName}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={roleBadge[user.role]}>{labelForRole(user.role)}</Badge>
                <Badge variant={user.isActive ? "success" : "danger"}>
                  {user.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          {editing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit(onSubmit)}
                isLoading={updateUser.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)}>Edit User</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Main info */}
        <div className="col-span-2 space-y-5">
          <Card>
            <CardTitle>Basic Information</CardTitle>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {editing ? (
                <>
                  <Input
                    id="firstName"
                    label="First Name"
                    error={errors.firstName?.message}
                    {...register("firstName")}
                  />
                  <Input
                    id="lastName"
                    label="Last Name"
                    error={errors.lastName?.message}
                    {...register("lastName")}
                  />
                  <Input
                    id="email"
                    label="Contact email"
                    error={errors.email?.message}
                    {...register("email")}
                  />
                  <Input
                    id="phone"
                    label="Contact phone"
                    error={errors.phone?.message}
                    {...register("phone")}
                  />
                  <NationalIdInput
                    value={nid}
                    onChange={(d) => setValue("nationalId", d)}
                    error={
                      errors.nationalId?.message ??
                      validateNid(nid, nidGender, nidDob)
                    }
                  />
                  <Input
                    id="nationality"
                    label="Nationality"
                    {...register("nationality")}
                  />
                  {!user.student && (
                    <>
                      <div>
                        <label htmlFor="f-gender" className="mb-1.5 block text-sm font-medium text-foreground">Gender</label>
                        <select id="f-gender" {...register("gender")} className={selectCls}>
                          <option value="">Select...</option>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                        </select>
                      </div>
                      <Input
                        id="dateOfBirth"
                        label="Date of Birth"
                        type="date"
                        {...register("dateOfBirth")}
                      />
                    </>
                  )}
                </>
              ) : (
                <>
                  <InfoField
                    icon={Mail}
                    label="Email"
                    value={user.email || "-"}
                  />
                  <InfoField
                    icon={Phone}
                    label="Phone"
                    value={user.phone || "-"}
                  />
                  <InfoField
                    icon={Shield}
                    label="National ID"
                    value={user.nationalId ? formatNid(user.nationalId) : "-"}
                  />
                  <InfoField
                    label="Nationality"
                    value={user.nationality || "-"}
                  />
                  {!user.student && (
                    <>
                      <InfoField label="Gender" value={user.gender || "-"} />
                      <InfoField
                        label="Date of Birth"
                        value={
                          user.dateOfBirth
                            ? new Date(user.dateOfBirth).toLocaleDateString()
                            : "-"
                        }
                      />
                    </>
                  )}
                  <InfoField
                    icon={Calendar}
                    label="Joined"
                    value={new Date(user.createdAt).toLocaleDateString()}
                  />
                </>
              )}
            </div>
          </Card>

          {/* Student info */}
          {user.student && (
            <Card>
              <CardTitle>Student Details</CardTitle>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <InfoField
                  icon={GraduationCap}
                  label="Student ID"
                  value={user.student.studentIdNumber}
                />
                <InfoField
                  icon={GraduationCap}
                  label="Class"
                  value={classDisplayName(user.student.classSection)}
                />
                <InfoField
                  label="Gender"
                  value={user.student.gender || "-"}
                />
                <InfoField
                  label="Status"
                  value={
                    STANDING_LABEL[
                      user.student.status as keyof typeof STANDING_LABEL
                    ] ?? user.student.status
                  }
                />
                <InfoField
                  label="Discipline Points"
                  value={String(user.student.disciplinePoints)}
                />
                <InfoField
                  label="Date of Birth"
                  value={
                    user.student.dateOfBirth
                      ? new Date(
                          user.student.dateOfBirth
                        ).toLocaleDateString()
                      : "-"
                  }
                />
                <InfoField
                  label="Enrolled"
                  value={
                    user.student.enrollmentDate
                      ? new Date(user.student.enrollmentDate).toLocaleDateString()
                      : "-"
                  }
                />
              </div>
            </Card>
          )}

          {/* Residence & family - the SDMS side of the record */}
          {user.student && (
            <Card>
              <CardTitle>Residence, Family & Health</CardTitle>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {editing ? (
                  <>
                    <Input id="province" label="Province" {...register("province")} />
                    <Input id="district" label="District" {...register("district")} />
                    <Input id="sector" label="Sector" {...register("sector")} />
                    <Input id="cell" label="Cell" {...register("cell")} />
                    <Input id="village" label="Village" {...register("village")} />
                    <div>
                      <label htmlFor="f-boarding" className="mb-1.5 block text-sm font-medium text-foreground">Boarding</label>
                      <select id="f-boarding" {...register("boarding")} className={selectCls}>
                        <option value="DAY">Day student</option>
                        <option value="BOARDER">Boarder</option>
                      </select>
                    </div>
                    <Input id="fatherName" label="Father's Names" {...register("fatherName")} />
                    <Input id="motherName" label="Mother's Names" {...register("motherName")} />
                    <div>
                      <label htmlFor="f-disability" className="mb-1.5 block text-sm font-medium text-foreground">Disability</label>
                      <select id="f-disability" {...register("disability")} className={selectCls}>
                        <option value="">None</option>
                        <option value="Visual impairment">Visual impairment</option>
                        <option value="Hearing impairment">Hearing impairment</option>
                        <option value="Physical disability">Physical disability</option>
                        <option value="Learning difficulty">Learning difficulty</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <Input id="religion" label="Religion" {...register("religion")} />
                    <Input id="insuranceNumber" label="Insurance (Mutuelle) No" {...register("insuranceNumber")} />
                    <Input id="previousSchool" label="Previous School" {...register("previousSchool")} />
                    <div>
                      <label htmlFor="f-blood-type" className="mb-1.5 block text-sm font-medium text-foreground">Blood Type</label>
                      <select id="f-blood-type" {...register("bloodType")} className={selectCls}>
                        <option value="">Unknown</option>
                        {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <Input id="allergies" label="Allergies" {...register("allergies")} />
                    <Input id="medicalConditions" label="Medical Conditions" {...register("medicalConditions")} />
                  </>
                ) : (
                  <>
                    <InfoField
                      label="Residence"
                      value={
                        [user.student.province, user.student.district, user.student.sector, user.student.cell, user.student.village]
                          .filter(Boolean)
                          .join(" · ") || "-"
                      }
                    />
                    <InfoField
                      label="Boarding"
                      value={user.student.isBoarder ? "Boarder" : "Day student"}
                    />
                    <InfoField label="Father" value={user.student.fatherName || "-"} />
                    <InfoField label="Mother" value={user.student.motherName || "-"} />
                    <InfoField label="Disability" value={user.student.disability || "None"} />
                    <InfoField label="Religion" value={user.student.religion || "-"} />
                    <InfoField label="Insurance (Mutuelle)" value={user.student.insuranceNumber || "-"} />
                    <InfoField label="Previous School" value={user.student.previousSchool || "-"} />
                    <InfoField label="Blood Type" value={user.student.bloodType || "-"} />
                    <InfoField label="Allergies" value={user.student.allergies || "None"} />
                    <InfoField label="Medical Conditions" value={user.student.medicalConditions || "None"} />
                  </>
                )}
              </div>
            </Card>
          )}

          {/* Teacher info */}
          {user.teacher && (
            <Card>
              <CardTitle>Teacher Details</CardTitle>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {editing ? (
                  <>
                    <div>
                      <label htmlFor="f-employment" className="mb-1.5 block text-sm font-medium text-foreground">Employment</label>
                      <select id="f-employment" {...register("employmentStatus")} className={selectCls}>
                        <option value="FULL_TIME">Full Time</option>
                        <option value="PART_TIME">Part Time</option>
                        <option value="CONTRACT">Contract</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="f-qualification" className="mb-1.5 block text-sm font-medium text-foreground">Qualification</label>
                      <select id="f-qualification" {...register("qualification")} className={selectCls}>
                        <option value="">Select...</option>
                        <option value="A0">A0 - Bachelor&apos;s degree</option>
                        <option value="A1">A1 - Diploma</option>
                        <option value="A2">A2 - Secondary certificate</option>
                      </select>
                    </div>
                    <Input id="rssbNumber" label="RSSB Number" {...register("rssbNumber")} />
                    <Input id="hireDate" label="Hire Date" type="date" {...register("hireDate")} />
                  </>
                ) : (
                  <>
                    <InfoField
                      label="Employment"
                      value={user.teacher.employmentStatus}
                    />
                    <InfoField
                      label="Qualification"
                      value={user.teacher.qualification || "-"}
                    />
                    <InfoField
                      label="RSSB Number"
                      value={user.teacher.rssbNumber || "-"}
                    />
                    <InfoField
                      label="Hired"
                      value={
                        user.teacher.hireDate
                          ? new Date(user.teacher.hireDate).toLocaleDateString()
                          : "-"
                      }
                    />
                  </>
                )}
                {user.teacher.roles?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted mb-1">
                      Special Roles
                    </p>
                    <div className="flex gap-2">
                      {user.teacher.roles.map((r: any) => (
                        <Badge key={r.id} variant="info">
                          {r.role}
                          {r.department ? ` - ${r.department}` : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Parent links */}
          {user.parentStudents?.length > 0 && (
            <Card>
              <CardTitle>Linked Children</CardTitle>
              <div className="mt-4 space-y-3">
                {user.parentStudents.map((ps: any) => (
                  <div
                    key={ps.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {ps.student?.user?.firstName} {ps.student?.user?.lastName}
                      </p>
                      <p className="text-sm text-muted">
                        {classDisplayName(ps.student.classSection)} - {ps.relationship}
                      </p>
                    </div>
                    <Badge>{ps.student.studentIdNumber || "-"}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card>
            <CardTitle>Account</CardTitle>
            <div className="mt-4 space-y-3">
              <InfoField
                label="Status"
                value={user.isActive ? "Active" : "Inactive"}
              />
              {/* How they sign in: the same at every school they belong
                  to, so it is shown here and changed only by them, or
                  through the reset below when this is their only school. */}
              <InfoField
                label="Signs in with"
                value={
                  [user.login?.email, user.login?.phone]
                    .filter(Boolean)
                    .join(" or ") || "Nothing yet"
                }
              />
              <InfoField
                label="Force Password Change"
                value={user.forcePasswordChange ? "Yes" : "No"}
              />
              <InfoField
                label="Last Login"
                value={
                  user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString()
                    : "Never"
                }
              />
              <ResetSignIn
                userId={user.id}
                name={`${user.firstName} ${user.lastName}`}
              />
            </div>
          </Card>
          <SafeguardingLead
            userId={user.id}
            role={user.role}
            isActive={!!user.isActive}
            lead={!!user.safeguardingLead}
          />
          {user.student?.id && (
            <StudentJourney
              studentId={user.student.id}
              userId={user.id}
              name={`${user.firstName} ${user.lastName}`}
            />
          )}
          {user.role === "PARENT" && (
            <ParentPassedAway
              userId={user.id}
              name={`${user.firstName} ${user.lastName}`}
              passedAwayOn={user.passedAwayOn ?? null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function InfoField({
  icon: Icon,
  label,
  value,
}: {
  icon?: any;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted mb-0.5">{label}</p>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted" />}
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}
