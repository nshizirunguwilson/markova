import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma, Role, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DOCUMENT_LABEL,
  completeness,
  nextReference,
  placesLeft,
  refuseMove,
  type ApplicationState,
  type DocumentKind,
  type EntryPoint,
} from '../../common/admissions';
import { TERM_CONDUCT_MARK } from '../../common/conduct';
import { buildStudentId, studentIdSecret } from '../../common/student-id';
import type {
  AdmissionQueryDto,
  DecideDto,
  MakeOfferDto,
  RequestInfoDto,
  SubmitApplicationDto,
} from './dto';

/**
 * Admissions: from a family's application to a student on the roll.
 *
 * Two rules run through everything here, and both come from the same place -
 * an admissions record is evidence. A family turned away will ask why,
 * sometimes a year later, and the school has to be able to answer.
 *
 *   **Nothing is deleted.** A rejection is a state with a reason and a name
 *   against it. Every move is written to `ApplicationEvent` first, so the
 *   trail is what actually happened rather than what the last edit left.
 *
 *   **The school's clock and the family's are different.** Reviewing belongs
 *   to the school; answering an offer belongs to the family. The offer is its
 *   own record so neither can overwrite the other.
 *
 * The state machine itself lives in `common/admissions.ts`, apart from the
 * database, because it decides whether a child gets a place.
 */
@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(private prisma: PrismaService) {}

  // ── Intakes ─────────────────────────────────────────────────────────────

  /**
   * The rounds a school is running, each with how many places are left.
   *
   * An outstanding offer counts as a place spent. Counting only enrolled
   * students is how a school offers the same forty places twice and finds out
   * in January.
   */
  async intakes() {
    const rounds = await this.prisma.admissionIntake.findMany({
      include: {
        academicYear: { select: { id: true, name: true, isCurrent: true } },
        classLevel: { select: { id: true, name: true, order: true } },
      },
      orderBy: [{ opensAt: 'desc' }],
    });

    return Promise.all(
      rounds.map(async (intake) => {
        const grouped = await this.prisma.application.groupBy({
          by: ['status'],
          where: { intakeId: intake.id },
          _count: { _all: true },
        });
        const count = (status: string) =>
          grouped.find((g) => g.status === status)?._count._all ?? 0;

        return {
          ...intake,
          counts: Object.fromEntries(
            grouped.map((g) => [g.status, g._count._all]),
          ),
          total: grouped.reduce((sum, g) => sum + g._count._all, 0),
          placesLeft: placesLeft(intake.places, {
            offered: count('OFFERED'),
            accepted: count('ACCEPTED'),
            enrolled: count('ENROLLED'),
          }),
        };
      }),
    );
  }

  /** Open a round, change its places, or close it. */
  async saveIntake(dto: {
    id?: string;
    academicYearId: string;
    classLevelId: string;
    entryPoint: string;
    name: string;
    places: number;
    opensAt: string;
    closesAt: string;
    isOpen?: boolean;
  }) {
    const opensAt = new Date(dto.opensAt);
    const closesAt = new Date(dto.closesAt);
    if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) {
      throw new BadRequestException('Those dates cannot be read');
    }
    if (closesAt <= opensAt) {
      throw new BadRequestException('An intake cannot close before it opens');
    }

    const data = {
      academicYearId: dto.academicYearId,
      classLevelId: dto.classLevelId,
      entryPoint: dto.entryPoint as never,
      name: dto.name.trim(),
      places: dto.places,
      opensAt,
      closesAt,
      isOpen: dto.isOpen ?? true,
    };

    if (dto.id) {
      const existing = await this.prisma.admissionIntake.findUnique({
        where: { id: dto.id },
      });
      if (!existing) throw new NotFoundException('Intake not found');
      return this.prisma.admissionIntake.update({
        where: { id: dto.id },
        data,
      });
    }
    return this.prisma.admissionIntake.create({ data });
  }

  /** The rounds a family may apply to right now. Public. */
  async openIntakes() {
    const now = new Date();
    return this.prisma.admissionIntake.findMany({
      where: { isOpen: true, opensAt: { lte: now }, closesAt: { gte: now } },
      select: {
        id: true,
        name: true,
        entryPoint: true,
        closesAt: true,
        classLevel: { select: { id: true, name: true } },
      },
      orderBy: { classLevel: { order: 'asc' } },
    });
  }

  // ── A family applies ────────────────────────────────────────────────────

  /**
   * Take an application from the public site.
   *
   * The reference is drawn inside the write, so two families submitting at the
   * same moment cannot be handed the same one.
   */
  async submit(dto: SubmitApplicationDto) {
    /*
      The honeypot. A person cannot see this field, so a person cannot fill it
      in; a bot that walks the DOM and fills everything does.

      It answers as though the application were accepted, with a reference
      that is not real. Refusing plainly would tell whoever wrote the bot
      exactly which field gave them away, and they would remove it and try
      again. This way the submission goes nowhere and nothing says so.
    */
    if (dto.addressLine2 && dto.addressLine2.trim().length > 0) {
      this.logger.warn('Discarded an application that filled the honeypot');
      return {
        reference: `APP-${new Date().getFullYear()}-000000`,
        status: 'SUBMITTED',
      };
    }

    const intake = await this.prisma.admissionIntake.findUnique({
      where: { id: dto.intakeId },
    });
    if (!intake) throw new NotFoundException('That intake does not exist');

    const now = new Date();
    if (!intake.isOpen || intake.opensAt > now || intake.closesAt < now) {
      throw new BadRequestException(
        'That intake is closed. The school opens the next one on its admissions page.',
      );
    }

    const dateOfBirth = new Date(dto.dateOfBirth);
    if (Number.isNaN(dateOfBirth.getTime())) {
      throw new BadRequestException('That date of birth cannot be read');
    }
    if (dateOfBirth > now) {
      throw new BadRequestException('That date of birth is in the future');
    }

    return this.prisma.$transaction(async (tx) => {
      const year = now.getFullYear();
      const last = await tx.application.findFirst({
        where: { reference: { startsWith: `APP-${year}-` } },
        orderBy: { reference: 'desc' },
        select: { reference: true },
      });

      const application = await tx.application.create({
        data: {
          intakeId: intake.id,
          reference: nextReference(last?.reference, year),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          dateOfBirth,
          gender: dto.gender,
          nationality: dto.nationality?.trim() || 'Rwandan',
          nationalId: dto.nationalId?.trim() || null,
          province: dto.province?.trim() || null,
          district: dto.district?.trim() || null,
          sector: dto.sector?.trim() || null,
          cell: dto.cell?.trim() || null,
          village: dto.village?.trim() || null,
          previousSchool: dto.previousSchool?.trim() || null,
          examMark: dto.examMark ?? null,
          examTotal: dto.examTotal ?? null,
          tradeId: dto.tradeId || null,
          secondChoiceTradeId: dto.secondChoiceTradeId || null,
          isBoarder: dto.isBoarder ?? false,
          funding: dto.funding ?? 'FAMILY',
          fundingDetail: dto.fundingDetail?.trim() || null,
          bloodType: dto.bloodType?.trim() || null,
          allergies: dto.allergies?.trim() || null,
          medicalConditions: dto.medicalConditions?.trim() || null,
          disability: dto.disability?.trim() || null,
          insuranceNumber: dto.insuranceNumber?.trim() || null,
          religion: dto.religion?.trim() || null,
          guardianName: dto.guardianName.trim(),
          guardianPhone: dto.guardianPhone.trim(),
          guardianEmail: dto.guardianEmail?.trim() || null,
          guardianNationalId: dto.guardianNationalId?.trim() || null,
          guardianRelation: dto.guardianRelation.trim(),
          secondGuardianName: dto.secondGuardianName?.trim() || null,
          secondGuardianPhone: dto.secondGuardianPhone?.trim() || null,
          note: dto.note?.trim() || null,
        },
      });

      /* The trail starts with the application arriving. Without this row the
         first thing that ever happened has no record. */
      await tx.applicationEvent.create({
        data: {
          applicationId: application.id,
          toStatus: 'SUBMITTED',
          reason: 'Received from the admissions site',
        },
      });

      return { reference: application.reference, id: application.id };
    });
  }

  // ── The desk ────────────────────────────────────────────────────────────

  /**
   * The queue, ordered oldest-waiting first.
   *
   * Not alphabetical: the family who has waited longest is the one the school
   * owes an answer to. The same lesson the fee register learned.
   */
  async queue(query: AdmissionQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 25;
    const search = query.search?.trim();

    const rows = await this.prisma.application.findMany({
      where: {
        ...(query.intakeId ? { intakeId: query.intakeId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
        ...(search
          ? {
              OR: [
                { reference: { contains: search, mode: 'insensitive' } },
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { guardianPhone: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        intake: {
          select: {
            id: true,
            name: true,
            entryPoint: true,
            /* The level's id as well: the offer picker narrows the class list
               to the level the intake is for. */
            classLevel: { select: { id: true, name: true } },
          },
        },
        trade: { select: { code: true, name: true } },
        documents: { select: { kind: true, verifiedAt: true } },
        offers: {
          where: { revokedAt: null, declinedAt: null },
          orderBy: { offeredAt: 'desc' },
          take: 1,
          select: { expiresAt: true, acceptedAt: true },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true, toStatus: true },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const shaped = rows.map((row) => this.withStanding(row));

    /* "Needs a decision" and the rest are questions rather than states: a
       reviewer opening the page wants their pile, not a taxonomy. */
    const bucket = query.bucket;
    const matching = bucket
      ? shaped.filter((r) => this.bucketOf(r.status) === bucket)
      : shaped;

    return {
      data: matching.slice((page - 1) * limit, page * limit),
      total: matching.length,
      page,
      limit,
      buckets: shaped.reduce<Record<string, number>>((acc, r) => {
        const b = this.bucketOf(r.status);
        acc[b] = (acc[b] ?? 0) + 1;
        return acc;
      }, {}),
    };
  }

  /** Which pile a state belongs in, from the reviewer's point of view. */
  private bucketOf(status: string): string {
    if (status === 'SUBMITTED' || status === 'UNDER_REVIEW') return 'TO_DECIDE';
    if (status === 'INFO_REQUESTED') return 'WAITING';
    if (status === 'WAITLISTED') return 'WAITLISTED';
    if (status === 'OFFERED' || status === 'ACCEPTED') return 'OFFERED';
    return 'DECIDED';
  }

  /** A row with its completeness and the clock a reviewer needs. */
  private withStanding(row: any) {
    const docs = completeness(
      row.intake.entryPoint as EntryPoint,
      row.documents,
      { isBoarder: row.isBoarder, funded: row.funding !== 'FAMILY' },
    );
    const offer = row.offers?.[0];
    return {
      ...row,
      documents: undefined,
      offers: undefined,
      events: undefined,
      completeness: docs,
      /** When the state it is in last changed, for "asked 9 days ago". */
      sinceAt: row.events?.[0]?.createdAt ?? row.submittedAt,
      offerExpiresAt: offer?.expiresAt ?? null,
    };
  }

  /**
   * One application in full, with the trail and anything that looks like a
   * duplicate.
   */
  async one(id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        intake: {
          include: {
            classLevel: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true } },
          },
        },
        trade: { select: { id: true, code: true, name: true } },
        secondChoiceTrade: { select: { id: true, code: true, name: true } },
        documents: {
          orderBy: { uploadedAt: 'asc' },
          include: {
            verifiedBy: { select: { firstName: true, lastName: true } },
          },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { firstName: true, lastName: true } } },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { firstName: true, lastName: true } } },
        },
        offers: {
          orderBy: { offeredAt: 'desc' },
          include: {
            classSection: {
              select: {
                id: true,
                name: true,
                classLevel: { select: { name: true } },
                trade: { select: { code: true } },
              },
            },
            offeredBy: { select: { firstName: true, lastName: true } },
          },
        },
        student: { select: { id: true, studentIdNumber: true } },
      },
    });
    if (!application) throw new NotFoundException('Application not found');

    return {
      ...application,
      completeness: completeness(
        application.intake.entryPoint,
        application.documents,
        {
          isBoarder: application.isBoarder,
          funded: application.funding !== 'FAMILY',
        },
      ),
      duplicates: await this.duplicatesOf(application),
    };
  }

  /**
   * Anything that looks like the same family applying twice.
   *
   * Shown to the reviewer as they work rather than discovered at enrolment,
   * when the transaction would fail on a unique constraint with the family
   * already told they had a place.
   */
  private async duplicatesOf(application: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    guardianPhone: string;
  }) {
    const [sameChild, sameGuardian, alreadyStudent] = await Promise.all([
      this.prisma.application.findMany({
        where: {
          id: { not: application.id },
          firstName: { equals: application.firstName, mode: 'insensitive' },
          lastName: { equals: application.lastName, mode: 'insensitive' },
          dateOfBirth: application.dateOfBirth,
        },
        select: { id: true, reference: true, status: true, submittedAt: true },
      }),
      this.prisma.application.findMany({
        where: {
          id: { not: application.id },
          guardianPhone: application.guardianPhone,
        },
        select: {
          id: true,
          reference: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      }),
      this.prisma.student.findFirst({
        where: {
          user: {
            firstName: { equals: application.firstName, mode: 'insensitive' },
            lastName: { equals: application.lastName, mode: 'insensitive' },
          },
          dateOfBirth: application.dateOfBirth,
        },
        select: {
          id: true,
          studentIdNumber: true,
          status: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    return { sameChild, sameGuardian, alreadyStudent };
  }

  // ── Moving an application along ─────────────────────────────────────────

  /**
   * Every state change goes through here.
   *
   * One place, so the machine cannot be sidestepped by an endpoint that
   * happens to write `status` itself, and so the trail is never missing a row.
   */
  private async move(
    tx: Prisma.TransactionClient,
    application: { id: string; status: string },
    to: ApplicationState,
    reason: string | null | undefined,
    actorUserId: string | null,
  ) {
    const refusal = refuseMove(
      application.status as ApplicationState,
      to,
      reason,
    );
    if (refusal) throw new BadRequestException(refusal);

    await tx.applicationEvent.create({
      data: {
        applicationId: application.id,
        fromStatus: application.status as never,
        toStatus: to as never,
        reason: reason?.trim() || null,
        actorUserId,
      },
    });

    return tx.application.update({
      where: { id: application.id },
      data: {
        status: to as never,
        ...(to === 'REJECTED' || to === 'WITHDRAWN' || to === 'ENROLLED'
          ? { decidedAt: new Date() }
          : {}),
      },
    });
  }

  private async load(id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: { intake: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  /** Pick it up, waitlist it, turn it down, or record that a family pulled out. */
  async decide(id: string, dto: DecideDto, userId: string) {
    const application = await this.load(id);
    return this.prisma.$transaction((tx) =>
      this.move(tx, application, dto.status, dto.reason, userId),
    );
  }

  /**
   * Ask the family for exactly what is missing.
   *
   * A checklist rather than free text, because otherwise nobody on either side
   * can say what is still outstanding three weeks later. The list is written
   * into the reason so the trail carries it too.
   */
  async requestInfo(id: string, dto: RequestInfoDto, userId: string) {
    const application = await this.load(id);
    if (dto.documents.length === 0 && !dto.note?.trim()) {
      throw new BadRequestException(
        'Choose what is missing, or write what you need, so the family knows what to send.',
      );
    }

    const asked = dto.documents.map((k) => DOCUMENT_LABEL[k] ?? k).join(', ');
    const reason = [asked && `Asked for: ${asked}`, dto.note?.trim()]
      .filter(Boolean)
      .join('. ');

    return this.prisma.$transaction((tx) =>
      this.move(tx, application, 'INFO_REQUESTED', reason, userId),
    );
  }

  // ── Offers ──────────────────────────────────────────────────────────────

  /**
   * Hold a place for a family, with an expiry.
   *
   * Refused when the intake has none left, because an offer against no
   * capacity is a promise the school cannot keep.
   */
  async makeOffer(id: string, dto: MakeOfferDto, userId: string) {
    const application = await this.load(id);

    const section = await this.prisma.classSection.findUnique({
      where: { id: dto.classSectionId },
      select: { id: true, classLevelId: true },
    });
    if (!section) throw new NotFoundException('That class does not exist');
    if (section.classLevelId !== application.intake.classLevelId) {
      throw new BadRequestException(
        'That class is not in the level this intake is for.',
      );
    }

    const left = await this.placesLeftIn(application.intakeId);
    if (left <= 0) {
      throw new BadRequestException(
        'This intake has no places left. Withdraw an outstanding offer, or raise the number of places on the intake.',
      );
    }

    const expiresAt = new Date(dto.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('That expiry date cannot be read');
    }
    if (expiresAt <= new Date()) {
      throw new BadRequestException('An offer cannot expire in the past');
    }

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.admissionOffer.create({
        data: {
          applicationId: application.id,
          classSectionId: dto.classSectionId,
          isBoarder: dto.isBoarder ?? application.isBoarder,
          termFee: dto.termFee ?? null,
          conditions: dto.conditions?.trim() || null,
          expiresAt,
          offeredByUserId: userId,
        },
      });
      await this.move(
        tx,
        application,
        'OFFERED',
        `Place offered, expiring ${expiresAt.toLocaleDateString('en-GB')}`,
        userId,
      );
      return offer;
    });
  }

  /** How many places an intake has left, offers included. */
  private async placesLeftIn(intakeId: string): Promise<number> {
    const intake = await this.prisma.admissionIntake.findUnique({
      where: { id: intakeId },
      select: { places: true },
    });
    if (!intake) throw new NotFoundException('Intake not found');

    const grouped = await this.prisma.application.groupBy({
      by: ['status'],
      where: { intakeId },
      _count: { _all: true },
    });
    const count = (s: string) =>
      grouped.find((g) => g.status === s)?._count._all ?? 0;

    return placesLeft(intake.places, {
      offered: count('OFFERED'),
      accepted: count('ACCEPTED'),
      enrolled: count('ENROLLED'),
    });
  }

  /** Take a held place back, and put the application into the pile again. */
  async revokeOffer(offerId: string, reason: string, userId: string) {
    const offer = await this.prisma.admissionOffer.findUnique({
      where: { id: offerId },
      include: { application: { include: { intake: true } } },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.revokedAt) {
      throw new BadRequestException('That offer has already been withdrawn');
    }
    if (offer.acceptedAt) {
      throw new BadRequestException(
        'That offer has been accepted. Withdrawing a place a family has taken is a different conversation, and this is not it.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.admissionOffer.update({
        where: { id: offerId },
        data: {
          revokedAt: new Date(),
          revokeReason: reason.trim(),
        },
      });
      return this.move(tx, offer.application, 'UNDER_REVIEW', reason, userId);
    });
  }

  /**
   * The family's answer, from the status page.
   *
   * Reached without an account, so it is proved by the reference plus the
   * applicant's own date of birth rather than by a session.
   */
  async respondToOffer(
    reference: string,
    dateOfBirth: string,
    accept: boolean,
    reason?: string,
  ) {
    const application = await this.findByReference(reference, dateOfBirth);

    const offer = await this.prisma.admissionOffer.findFirst({
      where: {
        applicationId: application.id,
        revokedAt: null,
        acceptedAt: null,
        declinedAt: null,
      },
      orderBy: { offeredAt: 'desc' },
    });
    if (!offer) throw new BadRequestException('There is no offer to answer');
    if (offer.expiresAt < new Date()) {
      throw new BadRequestException(
        'That offer has expired. The school office can tell you whether the place is still open.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.admissionOffer.update({
        where: { id: offer.id },
        data: accept
          ? { acceptedAt: new Date() }
          : { declinedAt: new Date(), declineReason: reason?.trim() || null },
      });
      return this.move(
        tx,
        application,
        accept ? 'ACCEPTED' : 'WITHDRAWN',
        accept
          ? 'Place accepted by the family'
          : `Offer declined by the family${reason?.trim() ? `: ${reason.trim()}` : ''}`,
        null,
      );
    });
  }

  // ── The status page ─────────────────────────────────────────────────────

  /**
   * What a family sees without an account.
   *
   * Deliberately thin: where the application stands, what is still wanted, and
   * any offer. No internal notes, no reviewer names, and nothing about anybody
   * else's application.
   */
  async publicStatus(reference: string, dateOfBirth: string) {
    const application = await this.findByReference(reference, dateOfBirth);

    const full = await this.prisma.application.findUnique({
      where: { id: application.id },
      include: {
        intake: {
          select: {
            entryPoint: true,
            name: true,
            classLevel: { select: { name: true } },
          },
        },
        documents: { select: { kind: true, verifiedAt: true } },
        offers: {
          where: { revokedAt: null },
          orderBy: { offeredAt: 'desc' },
          take: 1,
          select: {
            expiresAt: true,
            isBoarder: true,
            termFee: true,
            conditions: true,
            acceptedAt: true,
            declinedAt: true,
            classSection: {
              select: {
                name: true,
                classLevel: { select: { name: true } },
                trade: { select: { code: true } },
              },
            },
          },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          select: { toStatus: true, createdAt: true, reason: true },
        },
      },
    });
    if (!full) throw new NotFoundException('Application not found');

    const docs = completeness(full.intake.entryPoint, full.documents, {
      isBoarder: full.isBoarder,
      funded: full.funding !== 'FAMILY',
    });

    return {
      reference: full.reference,
      status: full.status,
      applicant: `${full.firstName} ${full.lastName}`,
      intake: full.intake,
      submittedAt: full.submittedAt,
      /* Named in the words the family will use when they go looking for them. */
      stillNeeded: docs.missing.map((k) => DOCUMENT_LABEL[k]),
      offer: full.offers[0] ?? null,
      /* The reason is carried through: it is what a family is owed when they
         are turned away, and hiding it here just moves the phone call. */
      history: full.events.map((e) => ({
        status: e.toStatus,
        at: e.createdAt,
        reason: e.reason,
      })),
    };
  }

  private async findByReference(reference: string, dateOfBirth: string) {
    const dob = new Date(dateOfBirth);
    const application = await this.prisma.application.findUnique({
      where: { reference: reference.trim().toUpperCase() },
      include: { intake: true },
    });

    /*
      One message for a wrong reference and a wrong date of birth alike. Two
      different answers would let anybody with a reference number confirm a
      child's birthday by guessing.
    */
    const wrong = new ForbiddenException(
      'No application matches that reference and date of birth.',
    );
    if (!application) throw wrong;
    if (Number.isNaN(dob.getTime())) throw wrong;
    if (
      application.dateOfBirth.toISOString().slice(0, 10) !==
      dob.toISOString().slice(0, 10)
    ) {
      throw wrong;
    }
    return application;
  }

  // ── Documents and notes ─────────────────────────────────────────────────

  async attachDocument(
    id: string,
    kind: DocumentKind,
    fileUrl: string,
    fileName: string,
  ) {
    await this.load(id);
    return this.prisma.applicationDocument.create({
      data: { applicationId: id, kind: kind as never, fileUrl, fileName },
    });
  }

  /** The office has opened it and confirmed it is what it claims to be. */
  async verifyDocument(documentId: string, userId: string) {
    const doc = await this.prisma.applicationDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.verifiedAt) {
      throw new BadRequestException('That document has already been checked');
    }
    return this.prisma.applicationDocument.update({
      where: { id: documentId },
      data: { verifiedAt: new Date(), verifiedByUserId: userId },
    });
  }

  /** An internal remark. Never shown to the family. */
  async addNote(id: string, body: string, userId: string) {
    await this.load(id);
    if (!body.trim()) throw new BadRequestException('Write something first');
    return this.prisma.applicationNote.create({
      data: { applicationId: id, body: body.trim(), authorUserId: userId },
    });
  }

  // ── Becoming a student ──────────────────────────────────────────────────

  /**
   * Turn an accepted application into a student on the roll.
   *
   * The only thing in this feature that writes outside its own tables, so it
   * is one transaction or none of it. Every step already exists somewhere in
   * the system: this composes them rather than reinventing them.
   */
  async enrol(id: string, userId: string) {
    const application = await this.load(id);
    if (application.status !== 'ACCEPTED') {
      throw new BadRequestException(
        'Only a family that has accepted their place can be enrolled.',
      );
    }

    const offer = await this.prisma.admissionOffer.findFirst({
      where: { applicationId: id, revokedAt: null, acceptedAt: { not: null } },
      orderBy: { offeredAt: 'desc' },
    });
    if (!offer) {
      throw new BadRequestException(
        'There is no accepted offer on this application, so there is no class to enrol into.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const email = await this.freeEmail(
        tx,
        application.firstName,
        application.lastName,
      );

      const user = await tx.user.create({
        data: {
          email,
          role: Role.STUDENT,
          firstName: application.firstName,
          lastName: application.lastName,
          gender: application.gender,
          dateOfBirth: application.dateOfBirth,
          nationalId: application.nationalId,
          nationality: application.nationality,
          isActive: true,
          forcePasswordChange: true,
        },
      });

      const studentIdNumber = await this.mintStudentId(
        tx,
        `${application.firstName} ${application.lastName}`,
        user.id,
      );

      const student = await tx.student.create({
        data: {
          userId: user.id,
          studentIdNumber,
          classSectionId: offer.classSectionId,
          dateOfBirth: application.dateOfBirth,
          gender: application.gender,
          status: StudentStatus.ACTIVE,
          disciplinePoints: TERM_CONDUCT_MARK,
          isBoarder: offer.isBoarder,
          bloodType: application.bloodType,
          allergies: application.allergies,
          medicalConditions: application.medicalConditions,
          previousSchool: application.previousSchool,
          province: application.province,
          district: application.district,
          sector: application.sector,
          cell: application.cell,
          village: application.village,
          disability: application.disability,
          insuranceNumber: application.insuranceNumber,
          religion: application.religion,
          fatherName: application.guardianRelation
            .toLowerCase()
            .includes('father')
            ? application.guardianName
            : null,
          motherName: application.guardianRelation
            .toLowerCase()
            .includes('mother')
            ? application.guardianName
            : null,
        },
      });

      /*
        Matched on phone rather than created blindly, so a second child from
        the same family is linked to the parent who is already on the system
        rather than to a duplicate of them.
      */
      const parent = await tx.user.upsert({
        where: { phone: application.guardianPhone },
        update: {},
        create: {
          phone: application.guardianPhone,
          email: application.guardianEmail,
          role: Role.PARENT,
          firstName: application.guardianName.split(/\s+/)[0] ?? 'Parent',
          lastName:
            application.guardianName.split(/\s+/).slice(1).join(' ') ||
            application.lastName,
          nationalId: application.guardianNationalId,
          isActive: true,
          forcePasswordChange: true,
        },
      });
      await tx.parentStudent.create({
        data: {
          parentUserId: parent.id,
          studentId: student.id,
          relationship: application.guardianRelation,
        },
      });

      await this.move(tx, application, 'ENROLLED', 'Enrolled', userId);
      await tx.application.update({
        where: { id: application.id },
        data: { studentId: student.id },
      });

      return {
        studentId: student.id,
        studentIdNumber,
        email,
        parentId: parent.id,
        parentPhone: parent.phone,
      };
    });
  }

  /**
   * The house address, with a number appended only when it is taken.
   *
   * `<initial>.<lastname>@markova.edu`, the convention the whole school
   * already uses. Two students called J. Uwase get `j.uwase@` and `j.uwase2@`.
   */
  private async freeEmail(
    tx: Prisma.TransactionClient,
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const slug = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z]/g, '')
        .toLowerCase();
    const base = `${slug(firstName).charAt(0)}.${slug(lastName)}`;

    for (let n = 0; n < 200; n += 1) {
      const candidate = `${base}${n === 0 ? '' : n + 1}@markova.edu`;
      const taken = await tx.user.findUnique({
        where: { email: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException(
      'Could not find a free school address for that name',
    );
  }

  /** The permanent number, minted once and never recomputed. */
  private async mintStudentId(
    tx: Prisma.TransactionClient,
    fullName: string,
    userId: string,
  ): Promise<string> {
    const secret = studentIdSecret();
    const year = new Date().getFullYear();

    for (let nonce = 0; nonce < 50; nonce += 1) {
      const candidate = buildStudentId(secret, {
        fullName,
        year,
        studentKey: userId,
        nonce,
      });
      const taken = await tx.student.findUnique({
        where: { studentIdNumber: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException('Could not mint a free student number');
  }

  // ── Housekeeping ────────────────────────────────────────────────────────

  /**
   * Offers nobody answered.
   *
   * Run on a schedule. A place held by a family who stopped replying is a
   * place the school cannot give to the waitlist, so the expiry has to
   * actually do something rather than merely being a date on a screen.
   */
  async expireOffers() {
    const stale = await this.prisma.admissionOffer.findMany({
      where: {
        expiresAt: { lt: new Date() },
        acceptedAt: null,
        declinedAt: null,
        revokedAt: null,
      },
      include: { application: { include: { intake: true } } },
    });

    let expired = 0;
    for (const offer of stale) {
      if (offer.application.status !== 'OFFERED') continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.admissionOffer.update({
          where: { id: offer.id },
          data: {
            revokedAt: new Date(),
            revokeReason: 'The offer expired without an answer',
          },
        });
        await this.move(
          tx,
          offer.application,
          'UNDER_REVIEW',
          'The offer expired without an answer',
          null,
        );
      });
      expired += 1;
    }
    return { expired };
  }
}
