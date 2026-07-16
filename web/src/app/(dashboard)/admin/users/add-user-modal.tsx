"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Modal, Button, Input } from "@/components/ui";
import { useCreateUser } from "@/hooks/use-users";
import { useClassLevels, useSections } from "@/hooks/use-academic";

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  password: z.string().min(8, "Min 8 characters"),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT", "PARENT", "LIBRARIAN"]),
  classSectionId: z.string().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  dateOfBirth: z.string().optional().or(z.literal("")),
  employmentStatus: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT"])
    .optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AddUserModal({ isOpen, onClose }: Props) {
  const createUser = useCreateUser();
  const [selectedLevel, setSelectedLevel] = useState("");
  const { data: classLevels } = useClassLevels();
  const { data: sections } = useSections(selectedLevel || undefined);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: "STUDENT",
      password: "",
    },
  });

  const role = watch("role");

  const onSubmit = async (data: FormData) => {
    const payload: any = {
      firstName: data.firstName,
      lastName: data.lastName,
      password: data.password,
      role: data.role,
    };

    if (data.email) payload.email = data.email;
    if (data.phone) payload.phone = data.phone;
    if (data.classSectionId) payload.classSectionId = data.classSectionId;
    if (data.gender) payload.gender = data.gender;
    if (data.dateOfBirth) payload.dateOfBirth = data.dateOfBirth;
    if (data.employmentStatus) payload.employmentStatus = data.employmentStatus;

    await createUser.mutateAsync(payload);
    reset();
    setSelectedLevel("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New User" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="firstName"
            label={<>First Name <span className="text-red-500">*</span></>}
            error={errors.firstName?.message}
            {...register("firstName")}
          />
          <Input
            id="lastName"
            label={<>Last Name <span className="text-red-500">*</span></>}
            error={errors.lastName?.message}
            {...register("lastName")}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="Optional"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            id="phone"
            label="Phone"
            placeholder="Optional"
            error={errors.phone?.message}
            {...register("phone")}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              {...register("role")}
              className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="STUDENT">Student</option>
              <option value="TEACHER">Teacher</option>
              <option value="PARENT">Parent</option>
              <option value="ADMIN">Admin</option>
              <option value="LIBRARIAN">Librarian</option>
            </select>
          </div>
          <div>
            <Input
              id="password"
              label={<>Password <span className="text-red-500">*</span></>}
              type="password"
              placeholder="Min 8 characters"
              error={errors.password?.message}
              {...register("password")}
            />
            <p className="mt-1 text-xs text-muted">Leave blank is not allowed. Set a secure password for the user.</p>
          </div>
        </div>

        {/* Student-specific fields */}
        {role === "STUDENT" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Class Level
                </label>
                <select
                  value={selectedLevel}
                  onChange={(e) => {
                    setSelectedLevel(e.target.value);
                    setValue("classSectionId", "");
                  }}
                  className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select level...</option>
                  {classLevels?.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Class Section
                </label>
                <select
                  {...register("classSectionId")}
                  disabled={!selectedLevel}
                  className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-muted/10 disabled:text-muted"
                >
                  <option value="">{selectedLevel ? "Select section..." : "Pick a level first"}</option>
                  {sections?.map((s: any) => (
                    <option key={s.id} value={s.id}>{[s.trade?.code, s.name].filter(Boolean).join(" ")}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Gender
              </label>
              <select
                {...register("gender")}
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select...</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
          </>
        )}

        {role === "STUDENT" && (
          <Input
            id="dateOfBirth"
            label="Date of Birth"
            type="date"
            {...register("dateOfBirth")}
          />
        )}

        {/* Teacher-specific */}
        {role === "TEACHER" && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Employment Status
            </label>
            <select
              {...register("employmentStatus")}
              className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              setSelectedLevel("");
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={createUser.isPending}>
            Create User
          </Button>
        </div>
      </form>
    </Modal>
  );
}
