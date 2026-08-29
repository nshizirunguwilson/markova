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
function WeightBar({ weight }: { weight: Weight }) {
  const shades = [
    "bg-primary",
    "bg-primary/70",
    "bg-primary/45",
    "bg-primary/25",
  ];
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{weight.name}</p>
      <div className="mt-2 flex h-7 w-full overflow-hidden rounded-md">
        {weight.parts.map((p, i) => (
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
        {weight.parts.map((p) => p.assessment).join(" · ")}
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
          Each subject's total is its assessments at these weights. Different
          kinds of subject are weighted differently, because a trade module is
          examined in a workshop as well as on paper.
        </p>
        <div className="space-y-5">
          {(data.weights as Weight[]).map((w) => (
            <WeightBar key={w.scope} weight={w} />
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
            (b) => (
              <div
                key={b.remark}
                className="rounded-lg border border-border px-3 py-2"
              >
                <p className="text-sm font-medium text-foreground">
                  {b.remark}
                </p>
                <p className="font-mono text-xs tabular-nums text-muted">
                  {b.from}% and above
                </p>
              </div>
            ),
          )}
        </div>
      </Card>
    </div>
  );
}
