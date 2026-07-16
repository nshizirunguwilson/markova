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

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
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
        }
      : undefined,
  });

  const onSubmit = async (data: FormData) => {
    await updateUser.mutateAsync({
      id,
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        phone: data.phone || undefined,
        isActive: data.isActive,
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
          <Button
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
                <Badge variant={roleBadge[user.role]}>{user.role}</Badge>
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
                    label="Email"
                    error={errors.email?.message}
                    {...register("email")}
                  />
                  <Input
                    id="phone"
                    label="Phone"
                    error={errors.phone?.message}
                    {...register("phone")}
                  />
                </>
              ) : (
                <>
                  <InfoField
                    icon={Mail}
                    label="Email"
                    value={user.email || "—"}
                  />
                  <InfoField
                    icon={Phone}
                    label="Phone"
                    value={user.phone || "—"}
                  />
                  <InfoField
                    icon={Shield}
                    label="Role"
                    value={user.role}
                  />
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
                  value={user.student.gender || "—"}
                />
                <InfoField
                  label="Status"
                  value={user.student.status}
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
                      : "—"
                  }
                />
              </div>
            </Card>
          )}

          {/* Teacher info */}
          {user.teacher && (
            <Card>
              <CardTitle>Teacher Details</CardTitle>
              <div className="mt-4 space-y-3">
                <InfoField
                  label="Employment"
                  value={user.teacher.employmentStatus}
                />
                {user.teacher.roles?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-muted mb-1">
                      Special Roles
                    </p>
                    <div className="flex gap-2">
                      {user.teacher.roles.map((r: any) => (
                        <Badge key={r.id} variant="info">
                          {r.role}
                          {r.department ? ` — ${r.department}` : ""}
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
                        {ps.student.user.firstName} {ps.student.user.lastName}
                      </p>
                      <p className="text-sm text-muted">
                        {classDisplayName(ps.student.classSection)} — {ps.relationship}
                      </p>
                    </div>
                    <Badge>{ps.student.studentIdNumber || "—"}</Badge>
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
            </div>
          </Card>
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
