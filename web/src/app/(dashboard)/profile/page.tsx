"use client";



import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, Button, PhotoPicker } from "@/components/ui";
import { User, Mail, Phone, Shield, Lock, PenLine, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { resolveUploadUrl } from "@/lib/assets";
import { labelForRole } from "@/types";

/**
 * Roles that put their name under a document the school issues.
 *
 * A parent belongs here, though what they sign means something different
 * from the two staff signatures above theirs on a report card: the school is
 * not certifying anything by it, the family is acknowledging they have seen
 * the term. That line is normally signed in ink at home, and a card printed
 * with it empty is still a finished card - so this is an offer rather than
 * an obligation, and the copy on the page says so.
 */
const SIGNS_SOMETHING = ["ADMIN", "HEAD_TEACHER", "TEACHER", "PARENT"];

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    phone: user?.phone || "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  /**
   * The photograph, which is the one thing on this page other people see.
   *
   * The store is updated on success rather than waiting for a refetch: the
   * topbar draws from the same user, and an avatar that stays stale until
   * the next navigation reads as an upload that did not work.
   */
  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("photo", file);
      return (
        await api.post(`/users/${user?.id}/photo`, body, {
          headers: { "Content-Type": "multipart/form-data" },
        })
      ).data as { photoUrl: string };
    },
    onSuccess: (data) => {
      setUser({ ...user!, photoUrl: data.photoUrl });
      toast.success("Photo updated");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "Could not save the photo"),
  });

  const removePhoto = useMutation({
    mutationFn: async () => (await api.delete(`/users/${user?.id}/photo`)).data,
    onSuccess: () => {
      setUser({ ...user!, photoUrl: null });
      toast.success("Photo removed - your initials are shown instead");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "Could not remove the photo"),
  });

  const updateProfile = useMutation({
    mutationFn: async (data: typeof form) =>
      (await api.patch("/auth/profile", data)).data,
    onSuccess: (data) => {
      setUser({ ...user!, ...data });
      setIsEditing(false);
      toast.success("Profile updated");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "Failed to update profile"),
  });

  /**
   * The person's own signature.
   *
   * Only ever their own: the API refuses it from anybody else, including an
   * administrator, and it is worth saying why on the page rather than only in
   * an error. A signature uploaded by somebody else is not a signature, it is
   * the school's name written in another person's hand, and a report card is
   * countersigned on exactly that distinction.
   */
  const uploadSignature = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("signature", file);
      return (
        await api.post(`/users/${user?.id}/signature`, body, {
          headers: { "Content-Type": "multipart/form-data" },
        })
      ).data as { signatureUrl: string };
    },
    onSuccess: (data) => {
      setUser({ ...user!, signatureUrl: data.signatureUrl });
      toast.success("Signature saved");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "Could not save the signature"),
  });

  const removeSignature = useMutation({
    mutationFn: async () =>
      (await api.delete(`/users/${user?.id}/signature`)).data,
    onSuccess: () => {
      setUser({ ...user!, signatureUrl: null });
      toast.success("Signature removed");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "Could not remove the signature"),
  });

  const changePassword = useMutation({
    mutationFn: async (data: typeof passwordForm) =>
      (
        await api.post("/auth/change-password", {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        })
      ).data,
    onSuccess: () => {
      setShowPassword(false);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success("Password changed successfully");
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.message || "Failed to change password"),
  });

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return toast.error("Name fields are required");
    }
    updateProfile.mutate(form);
  };

  const handleChangePassword = () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      return toast.error("Fill in all password fields");
    }
    if (passwordForm.newPassword.length < 8) {
      return toast.error("New password must be at least 8 characters");
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error("Passwords do not match");
    }
    changePassword.mutate(passwordForm);
  };

  if (!user) return null;

  const initials =
    `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title="My Profile"
        description="Manage your account details"
      />

      {/* Who this is, and the one thing on the page other people see. */}
      <Card className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {user.firstName} {user.lastName}
          </h2>
          <span className="inline-block mt-1 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
            {labelForRole(user.role)}
          </span>
        </div>
        <PhotoPicker
          photoUrl={user.photoUrl}
          initials={initials}
          name={`${user.firstName} ${user.lastName}`.trim()}
          saving={uploadPhoto.isPending}
          removing={removePhoto.isPending}
          /* `mutateAsync` rather than `mutate`: the picker settles back to
             its resting state on success and holds the chosen file on
             failure, and it can only tell the two apart from the promise. */
          onSave={(file) => uploadPhoto.mutateAsync(file)}
          onRemove={() => removePhoto.mutate()}
          onRefuse={(why) => toast.error(why)}
        />
      </Card>

      {/* Profile Details */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            Personal Information
          </h3>
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setForm({
                    firstName: user.firstName,
                    lastName: user.lastName,
                    phone: user.phone || "",
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                isLoading={updateProfile.isPending}
              >
                Save
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground-muted">
              <User className="inline h-4 w-4 mr-1" /> First Name
            </label>
            {isEditing ? (
              <input
                className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
                aria-label="First Name"
              />
            ) : (
              <p className="text-sm text-foreground">{user.firstName}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground-muted">
              <User className="inline h-4 w-4 mr-1" /> Last Name
            </label>
            {isEditing ? (
              <input
                className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                aria-label="Last Name"
              />
            ) : (
              <p className="text-sm text-foreground">{user.lastName}</p>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">
            <Mail className="inline h-4 w-4 mr-1" /> Email
          </label>
          <p className="text-sm text-foreground">{user.email || "Not set"}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">
            <Phone className="inline h-4 w-4 mr-1" /> Phone
          </label>
          {isEditing ? (
            <input
              className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+250..."
              aria-label="+250..."
            />
          ) : (
            <p className="text-sm text-foreground">{user.phone || "Not set"}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground-muted">
            <Shield className="inline h-4 w-4 mr-1" /> Role
          </label>
          <p className="text-sm text-foreground">{labelForRole(user.role)}</p>
        </div>
      </Card>

      {/* Change Password */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            <Lock className="inline h-4 w-4 mr-1" /> Security
          </h3>
          {!showPassword && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPassword(true)}
            >
              Change Password
            </Button>
          )}
        </div>

        {showPassword && (
          <div className="space-y-3">
            <div>
              <label htmlFor="f-current-password" className="mb-1 block text-sm font-medium text-foreground-muted">
                Current Password
              </label>
              <input id="f-current-password"
                type="password"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    currentPassword: e.target.value,
                  })
                }
                aria-label="Current Password"
              />
            </div>
            <div>
              <label htmlFor="f-new-password" className="mb-1 block text-sm font-medium text-foreground-muted">
                New Password
              </label>
              <input id="f-new-password"
                type="password"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    newPassword: e.target.value,
                  })
                }
                placeholder="Min 8 characters"
                aria-label="New Password"
              />
            </div>
            <div>
              <label htmlFor="f-confirm-new-password" className="mb-1 block text-sm font-medium text-foreground-muted">
                Confirm New Password
              </label>
              <input id="f-confirm-new-password"
                type="password"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    confirmPassword: e.target.value,
                  })
                }
                aria-label="Confirm New Password"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowPassword(false);
                  setPasswordForm({
                    currentPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleChangePassword}
                isLoading={changePassword.isPending}
              >
                Update Password
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/*
        Offered only to the people who sign something. A parent or a student
        has nothing to countersign, and a control that does nothing is a
        control that teaches people to ignore controls.
      */}
      {SIGNS_SOMETHING.includes(user.role) && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                My signature
              </h3>
              <p className="mt-0.5 text-sm text-muted">
                {user.role === "PARENT"
                  ? "Printed where you sign your child's report card, so the school holds a record of the terms you have seen. Yours alone: nobody else can upload or remove it."
                  : "Printed where you sign a report card. Yours alone: nobody else can upload or remove it, not even an administrator."}
              </p>
            </div>
          </div>

          {user.signatureUrl ? (
            <div className="flex flex-wrap items-end gap-4">
              <div className="rounded-lg border border-border bg-surface p-3">
                <img
                  src={resolveUploadUrl(user.signatureUrl) ?? undefined}
                  alt="Your signature"
                  className="h-16 w-auto max-w-[260px] object-contain"
                />
              </div>
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label="Replace my signature"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadSignature.mutate(f);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-flex items-center rounded-lg border border-input px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted">
                    <PenLine className="mr-1.5 h-4 w-4" /> Replace
                  </span>
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeSignature.mutate()}
                  isLoading={removeSignature.isPending}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted">
                No signature yet. Documents will print your name over a line
                for you to sign by hand.
              </p>
              <label className="mt-3 inline-block cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Upload my signature"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadSignature.mutate(f);
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-dark">
                  <PenLine className="mr-1.5 h-4 w-4" /> Upload a signature
                </span>
              </label>
              <p className="mt-3 text-xs text-muted">
                A photograph or scan of your signature on white paper. PNG with
                a transparent background prints best.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
