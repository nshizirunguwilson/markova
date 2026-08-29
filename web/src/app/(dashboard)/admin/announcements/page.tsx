"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, CardTitle, Input } from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useClassLevels, useSections } from "@/hooks/use-academic";
import {
  useBroadcast,
  usePreviewAudience,
  useUploadAttachment,
  type AudienceSpec,
  type BroadcastAudience,
} from "@/hooks/use-messaging";
import { Megaphone, Paperclip, Send, Users, X } from "lucide-react";

const AUDIENCES: { value: BroadcastAudience; label: string; hint: string }[] = [
  {
    value: "PARENTS_OF_LEVELS",
    label: "Parents of certain year levels",
    hint: "The one a school needs most: everyone in Senior 1's family.",
  },
  {
    value: "PARENTS_OF_CLASSES",
    label: "Parents of certain classes",
    hint: "Narrower, for one class trip or one class meeting.",
  },
  { value: "ALL_PARENTS", label: "Every parent", hint: "The whole school's families." },
  {
    value: "STUDENTS_OF_LEVELS",
    label: "Students in certain year levels",
    hint: "For the students themselves, not their families.",
  },
  { value: "STUDENTS_OF_CLASSES", label: "Students in certain classes", hint: "" },
  { value: "ALL_STUDENTS", label: "Every student", hint: "" },
  { value: "ALL_TEACHERS", label: "Every teacher", hint: "" },
  {
    value: "ALL_STAFF",
    label: "All staff",
    hint: "Teachers, the librarian, boarding staff and the nurse.",
  },
];

const NEEDS_LEVELS: BroadcastAudience[] = [
  "PARENTS_OF_LEVELS",
  "STUDENTS_OF_LEVELS",
];
const NEEDS_CLASSES: BroadcastAudience[] = [
  "PARENTS_OF_CLASSES",
  "STUDENTS_OF_CLASSES",
];

/**
 * Telling everyone at once.
 *
 * "Everyone in Senior 1's family needs to know by Friday" is the single most
 * common thing a school has to say, and until now the only tool for it was a
 * photocopied letter handed to a child. Two things make this usable: the
 * audience is described in the school's own terms rather than as a list of
 * people, and the count is shown before the send rather than after it.
 */
export default function AnnouncementsPage() {
  const [audience, setAudience] = useState<BroadcastAudience>(
    "PARENTS_OF_LEVELS",
  );
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [levelForClasses, setLevelForClasses] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<{ fileUrl: string; fileName: string } | null>(
    null,
  );

  const { data: levels } = useClassLevels();
  const { data: sections } = useSections(levelForClasses || undefined);
  const upload = useUploadAttachment();
  const send = useBroadcast();

  const needsLevels = NEEDS_LEVELS.includes(audience);
  const needsClasses = NEEDS_CLASSES.includes(audience);

  // Only ask the API for a count once the audience is fully described.
  const spec: AudienceSpec | null = useMemo(() => {
    if (needsLevels && levelIds.length === 0) return null;
    if (needsClasses && sectionIds.length === 0) return null;
    return {
      audience,
      ...(needsLevels && { classLevelIds: levelIds }),
      ...(needsClasses && { classSectionIds: sectionIds }),
    };
  }, [audience, levelIds, sectionIds, needsLevels, needsClasses]);

  const { data: preview, isFetching } = usePreviewAudience(spec);

  const ready = !!spec && !!title.trim() && !!message.trim();

  const submit = () => {
    if (!ready) return;
    send.mutate(
      {
        ...spec,
        title: title.trim(),
        message: message.trim(),
        ...(file && { fileUrl: file.fileUrl, fileName: file.fileName }),
      },
      {
        onSuccess: () => {
          setTitle("");
          setMessage("");
          setFile(null);
        },
      },
    );
  };

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Announcements"
        description="Tell a whole year, a class, or the school at once"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardTitle>Who needs to know</CardTitle>
            <div className="mt-3">
              <label htmlFor="b-audience" className="sr-only">
                Audience
              </label>
              <select
                id="b-audience"
                className="w-full rounded-lg border border-input px-3 py-2 text-sm"
                value={audience}
                onChange={(e) => {
                  // Clearing here rather than in an effect: a level chosen for
                  // "parents of Senior 1" means nothing once the audience is
                  // "every teacher", and carrying it over would count the
                  // wrong people.
                  setAudience(e.target.value as BroadcastAudience);
                  setLevelIds([]);
                  setSectionIds([]);
                }}
                aria-label="Audience"
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
              {AUDIENCES.find((a) => a.value === audience)?.hint && (
                <p className="mt-1 text-xs text-muted">
                  {AUDIENCES.find((a) => a.value === audience)!.hint}
                </p>
              )}
            </div>

            {needsLevels && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Year levels</p>
                <div className="flex flex-wrap gap-3">
                  {levels?.map((l: any) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={levelIds.includes(l.id)}
                        onChange={() => setLevelIds((v) => toggle(v, l.id))}
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {needsClasses && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Classes</p>
                <select
                  className="mb-2 rounded-lg border border-input px-3 py-2 text-sm"
                  value={levelForClasses}
                  onChange={(e) => setLevelForClasses(e.target.value)}
                  aria-label="Level"
                >
                  <option value="">Level…</option>
                  {levels?.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-3">
                  {sections?.map((s: any) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={sectionIds.includes(s.id)}
                        onChange={() => setSectionIds((v) => toggle(v, s.id))}
                      />
                      {[s.trade?.code, s.name].filter(Boolean).join(" ")}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>What to say</CardTitle>
            <div className="mt-3 space-y-4">
              <Input
                id="b-title"
                label="Subject"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. School closes early on Friday"
              />
              <div>
                <label
                  htmlFor="b-message"
                  className="mb-1 block text-sm font-medium"
                >
                  Message
                </label>
                <textarea
                  id="b-message"
                  rows={6}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Buses leave at midday. Please collect day students by 12:30."
                />
              </div>

              <div>
                <label
                  htmlFor="b-file"
                  className="mb-1 block text-sm font-medium"
                >
                  Attach a file (optional)
                </label>
                {file ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <Paperclip className="h-4 w-4 text-muted" />
                    <span className="truncate">{file.fileName}</span>
                    <button
                      type="button"
                      aria-label="Remove the file"
                      className="ml-auto text-muted hover:text-danger"
                      onClick={() => setFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <input
                    id="b-file"
                    type="file"
                    className="block w-full text-sm"
                    onChange={(e) => {
                      const chosen = e.target.files?.[0];
                      if (!chosen) return;
                      upload.mutate({ file: chosen }, {
                        onSuccess: (res) =>
                          setFile({
                            fileUrl: res.fileUrl,
                            fileName: res.fileName,
                          }),
                      });
                    }}
                  />
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {/* Nobody should find out they addressed four hundred families by
              doing it. */}
          <Card>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent-light p-2 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted">This will reach</p>
                <p className="text-2xl font-bold">
                  {!spec
                    ? "-"
                    : isFetching
                      ? "…"
                      : (preview?.count ?? 0)}
                </p>
                <p className="text-xs text-muted">
                  {!spec ? "Finish choosing the audience" : "people"}
                </p>
              </div>
            </div>

            {spec && preview?.count === 0 && (
              <p className="mt-3 text-sm text-warning">
                Nobody matches that audience, so there is nobody to tell.
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>Before you send</CardTitle>
            <ul className="mt-2 space-y-2 text-sm text-muted">
              <li>
                This is an announcement, not a conversation. People cannot reply
                into it, so anyone with a question will message the school
                directly.
              </li>
              <li>
                Everyone is notified as well as written to, so it does not sit
                unread.
              </li>
              <li>It cannot be unsent.</li>
            </ul>

            <Button
              className="mt-4 w-full"
              onClick={submit}
              disabled={!ready || preview?.count === 0}
              isLoading={send.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              Send the announcement
            </Button>
          </Card>

          {(title || message) && (
            <Card>
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" />
                <Badge variant="info">How it will look</Badge>
              </div>
              <p className="mt-2 font-semibold">{title || "Subject"}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                {message}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
