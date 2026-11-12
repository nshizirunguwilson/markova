"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/stores/auth-store";
import {
  usePlatformSchools,
  useCreateSchool,
  type SchoolTakenOn,
} from "@/hooks/use-schools";
import { KeyRound, Plus, School } from "lucide-react";

/**
 * The schools on Markova itself, for the one login that owns the platform.
 *
 * Until this page a school could only come from the seed: taking a real
 * school on needed a developer at a keyboard. Now the owner names the school
 * and its first principal, hands over the temporary password this page shows
 * once, and the principal is walked through the rest (year, terms, classes)
 * by the app's own onboarding.
 *
 * An ordinary admin who types the URL sees a refusal, and the API behind it
 * refuses them too: the menu entry only ever existed for the owner.
 */

/* What the slug field suggests from the name: the API's own shape,
   lowercase words joined by single hyphens. */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const emptyForm = {
  name: "",
  slug: "",
  slugEdited: false,
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

export default function PlatformSchoolsPage() {
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.platformRole === "OWNER";
  const { data: schools, isLoading } = usePlatformSchools(isOwner);
  const createSchool = useCreateSchool();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  /* The handover note: kept on screen until dismissed, because the password
     in it is shown this once and never again. */
  const [takenOn, setTakenOn] = useState<SchoolTakenOn | null>(null);

  if (!isOwner) {
    return (
      <Card>
        <div className="py-12 text-center text-muted">
          <School className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="font-medium">Only the owner of Markova can do this</p>
          <p className="mt-1 text-xs">
            Schools are taken on by whoever runs the platform itself.
          </p>
        </div>
      </Card>
    );
  }

  const close = () => {
    setOpen(false);
    setForm(emptyForm);
    setTakenOn(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createSchool.mutate(
      {
        name: form.name.trim(),
        slug: form.slug.trim(),
        admin: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
        },
      },
      { onSuccess: (result) => setTakenOn(result) },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schools"
        description="Every school on Markova"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Take a school on
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <Card>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Schools table, scrolls horizontally"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Short name</TableHead>
                  <TableHead>People</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(schools ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs">{s.slug}</TableCell>
                    <TableCell>{s.people}</TableCell>
                    <TableCell>{s.students}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(s.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {s.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge>Inactive</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(schools ?? []).length === 0 && (
              <p className="py-8 text-center text-muted">
                No schools yet. Take the first one on.
              </p>
            )}
          </div>
        </Card>
      )}

      <Modal isOpen={open} onClose={close} title="Take a school on" size="lg">
        {takenOn ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              <span className="font-medium">{takenOn.school.name}</span> is on
              Markova. {takenOn.principal.name} is its principal.
            </p>
            {takenOn.tempPassword ? (
              <div className="rounded-xl border border-warning/30 bg-warning-wash px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <KeyRound className="h-4 w-4" /> Temporary password
                </p>
                <p className="mt-2 font-mono text-lg font-bold text-foreground">
                  {takenOn.tempPassword}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Hand this to {takenOn.principal.name} yourself. It is shown
                  this once, and they choose their own at first sign in.
                </p>
              </div>
            ) : (
              <p className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
                {takenOn.principal.name} already signs in to another school on
                Markova, so their own password carries over.
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Input
              label="School name"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  name: e.target.value,
                  slug: f.slugEdited ? f.slug : suggestSlug(e.target.value),
                }))
              }
              placeholder="G.S. Nyamirambo"
              required
              minLength={3}
            />
            <Input
              label="Short name (in links and on public pages)"
              value={form.slug}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  slug: e.target.value,
                  slugEdited: true,
                }))
              }
              placeholder="gs-nyamirambo"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Lowercase words joined by hyphens"
              required
            />
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium text-foreground">
                The first principal
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="First name"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, firstName: e.target.value }))
                  }
                  required
                />
                <Input
                  label="Last name"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, lastName: e.target.value }))
                  }
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="principal@school.rw"
                />
                <Input
                  label="Phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  placeholder="+250788000000"
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                They sign in with the email or phone, so give at least one.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createSchool.isPending}>
                Take it on
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
