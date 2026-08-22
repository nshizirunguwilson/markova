"use client";



import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, Button } from "@/components/ui";
import { User, Mail, Phone, Shield, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { resolveUploadUrl } from "@/lib/assets";

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

      {/* Avatar & Name Header */}
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            {user.photoUrl ? (
              <img
                src={resolveUploadUrl(user.photoUrl) ?? undefined}
                alt={user.firstName}
                className="h-20 w-20 rounded-full object-cover border-2 border-primary/20"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold">
                {initials}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {user.firstName} {user.lastName}
            </h2>
            <span className="inline-block mt-1 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
              {user.role}
            </span>
          </div>
        </div>
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
          <p className="text-sm text-foreground">{user.role}</p>
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
    </div>
  );
}
