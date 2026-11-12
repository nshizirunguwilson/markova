import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

import { DeliveryQueue } from '../../jobs/delivery.queue';
import { PrismaService } from '../../prisma/prisma.service';
import { withPlatform } from '../../prisma/request-context';
import { labelForRole } from '../../common/role-labels';

/** The login a new school record will belong to. */
export interface LoginFor {
  accountId: string;
  /** True when nobody signs in with this email or phone yet. */
  isNew: boolean;
}

/**
 * Logins, as a school adding a person sees them.
 *
 * One person has one login for every school they belong to (see
 * docs/MULTI-SCHOOL-DESIGN.md). When a school adds somebody, the email or
 * phone it types may already sign in to Markova through another school. Then
 * the new school record joins that login, the person keeps their password,
 * and they are told which school added them.
 *
 * The school adding them is never told which case it was. It sees the same
 * answer either way, or any school could type phone numbers in to find out
 * who uses Markova elsewhere.
 */
@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryQueue,
  ) {}

  /**
   * The login this email or phone already signs in with, or a new one.
   *
   * Looked up above the wall between schools, because the login it finds may
   * belong only to other schools. It reads ids and nothing else, and nothing
   * it finds reaches the school that asked.
   *
   * Call it before the transaction that creates the school record, and pass
   * the answer to `attach` inside it.
   */
  async loginFor(
    email?: string | null,
    phone?: string | null,
  ): Promise<LoginFor> {
    const either = [
      ...(email ? [{ email }] : []),
      ...(phone ? [{ phone }] : []),
    ];
    const found = either.length
      ? await withPlatform(() =>
          this.prisma.account.findMany({
            where: { OR: either },
            select: { id: true },
            take: 2,
          }),
        )
      : [];

    /*
      The one case that has to be refused out loud. Both belong to somebody,
      but to two different people, and joining the record to either login
      would hand the other person's details to the wrong one.
    */
    if (found.length > 1) {
      throw new ConflictException(
        'That email and that phone number cannot be used together. Use one of them.',
      );
    }
    return found.length
      ? { accountId: found[0].id, isNew: false }
      : { accountId: randomUUID(), isNew: true };
  }

  /**
   * Refuse to join a login that belongs to somebody else.
   *
   * Every school writes addresses as initial.lastname@markova.edu, so two
   * different people collide by construction: a new nurse, Vestine
   * Mukantwari, was given the address of a parent, Valentine Mukantwari, and
   * joining it handed the parent the nurse's access while the nurse could not
   * sign in at all. A login is joined only when it is plainly the same
   * person: the same names, in any order and with or without a middle name,
   * or the same national ID.
   *
   * Inside one school the answer names who holds the address, because the
   * school already knows its own people. For a login known only to other
   * schools it says no more than that the address is taken: less than
   * joining would give away, and nothing about who holds it.
   */
  async refuseSomebodyElse(
    login: LoginFor,
    person: { firstName: string; lastName: string; nationalId?: string | null },
    row?: number,
  ): Promise<void> {
    if (login.isNew) return;
    const schoolId = await this.prisma.currentSchoolId();
    const holders = await withPlatform(() =>
      this.prisma.user.findMany({
        where: { accountId: login.accountId },
        select: {
          firstName: true,
          lastName: true,
          nationalId: true,
          schoolId: true,
        },
      }),
    );
    const words = (s: string) =>
      new Set(
        s
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .split(/[^a-z]+/)
          .filter(Boolean),
      );
    const theirs = words(`${person.firstName} ${person.lastName}`);
    const samePerson = holders.some((h) => {
      if (person.nationalId && h.nationalId === person.nationalId) return true;
      const held = words(`${h.firstName} ${h.lastName}`);
      const within = (a: Set<string>, b: Set<string>) =>
        [...a].every((w) => b.has(w));
      return within(theirs, held) || within(held, theirs);
    });
    if (samePerson) return;

    const prefix = row ? `Row ${row}: ` : '';
    const here = holders.find((h) => h.schoolId === schoolId);
    throw new ConflictException(
      here
        ? `${prefix}That email or phone number already belongs to ${here.firstName} ${here.lastName}. Give ${person.firstName} their own.`
        : `${prefix}That email or phone number is already used by somebody else. Give ${person.firstName} their own.`,
    );
  }

  /**
   * Write the new login, when there is one, inside the school's transaction.
   *
   * Runs after the school record is created with `accountId` set: the
   * database checks the record's link to its login at commit, and the school
   * can see the login it is writing only once it holds a record for it. So
   * no platform pass is needed to add somebody new.
   */
  async attach(
    tx: Prisma.TransactionClient,
    login: LoginFor,
    details: {
      email?: string | null;
      phone?: string | null;
      passwordHash?: string | null;
    },
  ): Promise<void> {
    if (!login.isNew) return;
    try {
      await tx.account.create({
        data: {
          id: login.accountId,
          email: details.email || null,
          phone: details.phone || null,
          passwordHash: details.passwordHash ?? null,
          forcePasswordChange: true,
        },
      });
    } catch (error) {
      /* Somebody else claimed the same email or phone a moment ago. */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'That email or phone number was just used. Please try again.',
        );
      }
      throw error;
    }
  }

  /**
   * Tell somebody who already uses Markova that another school added them.
   *
   * Their password does not change and the school does not know it, so the
   * message says to sign in as usual. Sent after the record is saved, and
   * never fails the save: the person is added either way.
   */
  async tellAdded(accountId: string, role: Role): Promise<void> {
    try {
      const schoolId = await this.prisma.currentSchoolId();
      const [school, account] = await withPlatform(() =>
        Promise.all([
          this.prisma.school.findUnique({
            where: { id: schoolId },
            select: { name: true },
          }),
          this.prisma.account.findUnique({
            where: { id: accountId },
            select: { email: true, phone: true },
          }),
        ]),
      );
      if (!school || !account) return;

      const what = `${school.name} has added you as ${withArticle(labelForRole(role))} on Markova.`;
      const how =
        'Sign in with your usual phone or email and password, then choose the school from your list.';
      if (account.email) {
        await this.delivery.email({
          to: account.email,
          subject: `${school.name} added you on Markova`,
          body: `<p>${what}</p><p>${how}</p>`,
        });
      } else if (account.phone) {
        await this.delivery.sms({
          phone: account.phone,
          message: `${what} ${how}`,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Could not tell login ${accountId} it was added: ${String(error)}`,
      );
    }
  }
}

const withArticle = (label: string) =>
  `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label.toLowerCase()}`;
