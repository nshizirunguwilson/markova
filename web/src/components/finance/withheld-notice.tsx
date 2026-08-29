"use client";

import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { money } from "@/lib/fees";
import { Lock } from "lucide-react";

/** What the API sends back in place of a held term's results. */
export interface Withheld {
  balance: number;
  message: string;
}

/**
 * Why this term's results are not here.
 *
 * A school withholding a report card over unpaid fees is a normal thing in
 * Rwanda, and the page has to read that way — a held term explained, not an
 * error. The three things a family needs are all here: that it is the fees,
 * how much, and where to go next. A padlock and "access denied" would have
 * them phoning the school to find out which of those it is.
 *
 * The message comes from the API rather than being written here, because the
 * same sentence has to hold whether it arrives as a page, as a refused
 * download, or in a notification.
 */
export function WithheldNotice({
  withheld,
  feesHref,
  /** What is being withheld, in the words of the page it replaces. */
  what = "results",
}: {
  withheld: Withheld;
  feesHref: string;
  what?: string;
}) {
  return (
    <Card className="border-warning/30 bg-warning-wash">
      <div className="flex flex-col gap-4 sm:flex-row">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-warning/15">
          <Lock className="h-5 w-5 text-warning" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-warning">
            These {what} are held until the school fees are settled
          </h2>
          <p className="mt-1 text-sm text-warning/90">
            {money(withheld.balance)} is still outstanding for this term. The{" "}
            {what} open as soon as the balance reaches nil — nothing else is
            needed, and nothing has been lost.
          </p>
          <p className="mt-2 text-sm text-warning/90">
            If a payment you have made is not showing, the school office can
            find it from your deposit slip or transaction number.
          </p>
          <Link href={feesHref} className="mt-4 inline-block">
            <Button variant="secondary">See what is owed</Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
