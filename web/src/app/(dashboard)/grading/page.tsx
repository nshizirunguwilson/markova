"use client";

import { Card, CardTitle, PageSpinner } from "@/components/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useGradingScale } from "@/hooks/use-academic";

/**
 * How a mark becomes a grade.
 *
 * This was a legend at the foot of every report card, which is a strange
 * place for it: the scale is identical on every card the school will ever
 * issue, so a fifth of each sheet went on something that never changes, and
 * a parent wanting to look it up had to find a card first.
 *
 * As a page it can also do what a legend never could. A legend has room for
 * a grid of numbers; the actual question a family arrives with is "why is 68%
 * a B", and answering that needs the weights, the two scales and the reason
 * there are two of them. So the order here is the order somebody asks: what
 * the term mark is made of, then what letter it earns, then the two words -
 * competence and aggregate - that a Rwandan report card uses and nowhere
 * else explains.
 *
 * Everything comes from the API, which reads it off the same constants the
 * marks are computed with. There is no second copy to drift.
 */

type Row = { range: string; letter: string; points: number; remark: string };
type Scale = { name: string; appliesTo: string; rows: Row[] };
type Weight = {
  scope: string;
  name: string;
  parts: { assessment: string; percent: number }[];
};

/** The letter's own colour, so a reader finds their band before reading it. */
const toneOf = (points: number) =>
  points >= 5
    ? "text-success"
    : points >= 3
      ? "text-foreground"
      : points >= 1
        ? "text-warning"
        : "text-danger";

function ScaleTable({ scale }: { scale: Scale }) {
  return (
    <div>
      <CardTitle className="text-base">{scale.name}</CardTitle>
      <p className="mb-3 mt-1 text-sm text-muted">{scale.appliesTo}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
              <th className="py-2 pr-4 font-medium">Mark</th>
              <th className="py-2 pr-4 font-medium">Grade</th>
              <th className="py-2 pr-4 font-medium">Points</th>
              <th className="py-2 font-medium">Means</th>
            </tr>
          </thead>
          <tbody>
            {scale.rows.map((r) => (
              <tr key={r.letter} className="border-b border-border last:border-0">
                <td className="py-2 pr-4 font-mono tabular-nums">{r.range}%</td>
                <td className={`py-2 pr-4 font-bold ${toneOf(r.points)}`}>
                  {r.letter}
                </td>
                <td className="py-2 pr-4 tabular-nums text-muted">{r.points}</td>
                <td className="py-2 text-foreground-muted">{r.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * What a term mark is made of, drawn as the bar it actually is.
 *
 * A family who can see that the exam is 60% of the total reads a poor CAT
 * differently from one who cannot, and the proportions say that faster than
 * the numbers do.
 */
/**
 * Kinds of subject that are weighted identically, shown once.
 *
 * Three of the four scopes are 20/20/60, and drawing three identical bars
 * beside each other says "these are different" three times over. Grouping
 * them says the true thing instead: most subjects are weighted alike, and
 * the trade modules are the exception worth looking at.
 */
function groupByWeighting(weights: Weight[]) {
  const groups = new Map<string, { names: string[]; parts: Weight["parts"] }>();
  for (const w of weights) {
    const key = w.parts.map((p) => `${p.assessment}:${p.percent}`).join("|");
    const found = groups.get(key);
    if (found) found.names.push(w.name);
    else groups.set(key, { names: [w.name], parts: w.parts });
  }
  return [...groups.values()];
}

function WeightBar({
  names,
  parts,
}: {
  names: string[];
  parts: Weight["parts"];
}) {
  /*
    Solid hues rather than one colour faded, because these segments carry
    their own percentage in white. A faded navy at 25% is a 1.5:1 background
    for white text - the label disappears, and axe says so. These four are
    from the categorical chart palette, which `scripts/check-contrast.mjs`
    already asserts clears 4.5:1 under a white label.
  */
  const shades = [
    "bg-[#1B4F72]",
    "bg-[#1A5276]",
    "bg-[#117A65]",
    "bg-[#7D3C98]",
  ];
  return (
    <div>
      {/* One row per kind, not one comma-separated sentence: three names run
          together read as one long label rather than as three things that
          happen to be weighted alike. */}
      <div className="mb-2 flex flex-wrap gap-x-2 gap-y-1">
        {names.map((n) => (
          <span
            key={n}
            className="rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground-muted"
          >
            {n}
          </span>
        ))}
      </div>
      <div className="flex h-7 w-full overflow-hidden rounded-md">
        {parts.map((p, i) => (
          <div
            key={p.assessment}
            className={`flex items-center justify-center ${shades[i % shades.length]}`}
            style={{ width: `${p.percent}%` }}
            title={`${p.assessment}: ${p.percent}%`}
          >
            <span className="px-1 text-[10px] font-semibold text-white">
              {p.percent}%
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {parts.map((p) => p.assessment).join(" · ")}
      </p>
    </div>
  );
}

export default function GradingPage() {
  const { data, isLoading, isError } = useGradingScale();

  if (isLoading) return <PageSpinner />;

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="How marks are graded" />
        <Card>
          <p className="py-10 text-center text-sm text-muted">
            The grading scale could not be loaded. Try again in a moment.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="How marks are graded"
        description="What a term mark is made of, what letter it earns, and what the words on a report card mean"
      />

      <Card>
        <CardTitle className="text-base">What makes up a term mark</CardTitle>
        <p className="mb-4 mt-1 text-sm text-muted">
          Each subject&apos;s total is its assessments at these weights. Most
          subjects are weighted alike; a trade module is not, because it is
          examined in a workshop as well as on paper.
        </p>
        <div className="space-y-5">
          {groupByWeighting(data.weights as Weight[]).map((g) => (
            <WeightBar key={g.names.join()} names={g.names} parts={g.parts} />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(data.scales as Scale[]).map((s) => (
          <Card key={s.name}>
            <ScaleTable scale={s} />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Competent, or not yet</CardTitle>
          <p className="mb-3 mt-1 text-sm text-muted">
            A different question from the grade. Not how well, but whether the
            learner can do the thing.
          </p>
          <ul className="space-y-2 text-sm text-foreground-muted">
            <li className="flex gap-2">
              <span className="font-semibold text-success">Competent</span>
              <span>{data.competence.competent}</span>
            </li>
            <li className="flex gap-2">
              <span className="whitespace-nowrap font-semibold text-warning">
                Not yet
              </span>
              <span>{data.competence.notYet}</span>
            </li>
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
            {data.competence.certificate}
          </p>
        </Card>

        <Card>
          <CardTitle className="text-base">The aggregate</CardTitle>
          <p className="mb-3 mt-1 text-sm text-muted">
            Points rather than percentages, which is how national examinations
            are read. A subject is worth at most{" "}
            {data.aggregate.maxPerSubject} points.
          </p>
          <div className="space-y-3 text-sm text-foreground-muted">
            <p>{data.aggregate.oLevel}</p>
            <p>{data.aggregate.aLevel}</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle className="text-base">Conduct</CardTitle>
        <p className="mb-4 mt-1 text-sm text-muted">
          {data.conduct.explanation}
        </p>
        <div className="flex flex-wrap gap-2">
          {(data.conduct.bands as { from: number; remark: string }[]).map(
            (b, i, all) => (
              <div
                key={b.remark}
                className="rounded-lg border border-border px-3 py-2"
              >
                <p className="text-sm font-medium text-foreground">
                  {b.remark}
                </p>
                {/* The last band is everything under the one above it.
                    "0% and above" is true and says nothing. */}
                <p className="font-mono text-xs tabular-nums text-muted">
                  {i === all.length - 1
                    ? `below ${all[i - 1]?.from ?? 0}%`
                    : `${b.from}% and above`}
                </p>
              </div>
            ),
          )}
        </div>
      </Card>
    </div>
  );
}
