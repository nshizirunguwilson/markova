import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AdmissionDocumentKind,
  AdmissionEntryPoint,
  AdmissionFunding,
  ApplicationStatus,
  Gender,
} from '@prisma/client';

/**
 * What a family sends from the public site.
 *
 * Mirrors the enrolment record on purpose: anything not asked here becomes a
 * data-entry job for the office on the day the student is accepted, which is
 * the work this feature exists to remove.
 */
export class SubmitApplicationDto {
  /**
   * A field no person ever fills in.
   *
   * The form renders it hidden and empty. A person cannot see it, so a person
   * cannot type in it; a commodity bot walks the DOM, finds an input called
   * something like a second address line, and fills it in because filling
   * everything in is what it does.
   *
   * Chosen over a CAPTCHA deliberately. This form is filled in by parents on
   * phones, often on a poor connection, and a CAPTCHA is a real barrier for
   * exactly the families a school most wants to reach. It would also mean
   * sending a request to a third party on every application, from a system
   * holding children's data in Rwanda, which is a decision worth not making
   * casually.
   *
   * It stops the naive majority for nothing, which is the right trade for a
   * form already limited to five submissions a minute per address. A targeted
   * attacker will read the page and leave it blank, and the rate limit is
   * what answers them.
   */
  @ApiPropertyOptional({
    description: 'Leave empty. Present to catch automated submissions.',
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty() @IsUUID() intakeId: string;

  // ── the applicant ─────────────────────────────────────────────────────
  @ApiProperty({ example: 'Aline' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @ApiProperty({ example: 'Uwase' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName: string;

  @ApiProperty({ example: '2013-04-02' })
  @IsString()
  dateOfBirth: string;

  @ApiProperty({ enum: Gender })
  @IsEnum(Gender)
  gender: Gender;

  @ApiPropertyOptional({ example: 'Rwandan' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  nationality?: string;

  @ApiPropertyOptional({ description: 'NIDA, for an applicant old enough' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nationalId?: string;

  // ── the standard five-level Rwandan address ───────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  province?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  district?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sector?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) cell?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  village?: string;

  // ── school history ────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'GS Kacyiru II' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  previousSchool?: string;

  @ApiPropertyOptional({ example: 68, description: 'National exam mark' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  examMark?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'What it is marked out of',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  examTotal?: number;

  @ApiPropertyOptional({ description: 'A-Level and TVET only' })
  @IsOptional()
  @IsUUID()
  tradeId?: string;

  @ApiPropertyOptional({ description: 'The fallback if the first is full' })
  @IsOptional()
  @IsUUID()
  secondChoiceTradeId?: string;

  // ── what they are asking for ──────────────────────────────────────────
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isBoarder?: boolean;

  @ApiPropertyOptional({
    enum: AdmissionFunding,
    default: AdmissionFunding.FAMILY,
  })
  @IsOptional()
  @IsEnum(AdmissionFunding)
  funding?: AdmissionFunding;

  @ApiPropertyOptional({ example: 'Gasabo district bursary, 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fundingDetail?: string;

  // ── welfare ───────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bloodType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  allergies?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  medicalConditions?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  disability?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  insuranceNumber?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  religion?: string;

  // ── who to talk to ────────────────────────────────────────────────────
  @ApiProperty({ example: 'Uwase Marie Claire' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  guardianName: string;

  @ApiProperty({ example: '+250788100000' })
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  guardianPhone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  guardianEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  guardianNationalId?: string;

  @ApiProperty({ example: 'Mother' })
  @IsString()
  @MaxLength(40)
  guardianRelation: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  secondGuardianName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  secondGuardianPhone?: string;

  @ApiPropertyOptional({
    description: 'Anything the family wants the school to know',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Which pile of the queue to show. */
export class AdmissionQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() intakeId?: string;

  @ApiPropertyOptional({ enum: ApplicationStatus })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({
    description: 'TO_DECIDE, WAITING, WAITLISTED, OFFERED or DECIDED',
  })
  @IsOptional()
  @IsString()
  bucket?: string;

  /** A reference, a name, or the guardian's phone. */
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/** Pick it up, waitlist it, turn it down, or record that a family pulled out. */
export class DecideDto {
  @ApiProperty({ enum: ApplicationStatus })
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;

  /**
   * Required for anything the family could be told about. An unexplained
   * decision cannot be answered when they ask about it a year later.
   */
  @ApiPropertyOptional({ example: 'Below the mark for this intake' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  reason?: string;
}

/** Ask the family for exactly what is missing. */
export class RequestInfoDto {
  @ApiProperty({ enum: AdmissionDocumentKind, isArray: true })
  @IsArray()
  @IsEnum(AdmissionDocumentKind, { each: true })
  documents: AdmissionDocumentKind[];

  @ApiPropertyOptional({ example: 'The photograph was too dark to read' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

export class MakeOfferDto {
  @ApiProperty() @IsUUID() classSectionId: string;

  @ApiPropertyOptional({ description: 'Defaults to what the family asked for' })
  @IsOptional()
  @IsBoolean()
  isBoarder?: boolean;

  @ApiPropertyOptional({
    example: 195000,
    description: 'What the term will cost',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  termFee?: number;

  @ApiPropertyOptional({ example: 'Subject to the original results slip' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  conditions?: string;

  @ApiProperty({ example: '2026-09-15' })
  @IsString()
  expiresAt: string;
}

export class RevokeOfferDto {
  @ApiProperty() @IsUUID() offerId: string;

  @ApiProperty({ example: 'The place went to a waitlisted family' })
  @IsString()
  @MaxLength(400)
  reason: string;
}

export class AddNoteDto {
  @ApiProperty({ example: 'Spoke to the mother; the slip is in the post' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}

export class AttachDocumentDto {
  @ApiProperty({ enum: AdmissionDocumentKind })
  @IsEnum(AdmissionDocumentKind)
  kind: AdmissionDocumentKind;
}

/** How a family reaches their own application without an account. */
export class StatusLookupDto {
  @ApiProperty({ example: 'APP-2026-0417' })
  @IsString()
  @MaxLength(30)
  reference: string;

  @ApiProperty({ example: '2013-04-02' })
  @IsString()
  dateOfBirth: string;
}

export class AnswerOfferDto extends StatusLookupDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  accept: boolean;

  @ApiPropertyOptional({ example: 'We have taken a place elsewhere' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  reason?: string;
}

export class SaveIntakeDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() id?: string;
  @ApiProperty() @IsUUID() academicYearId: string;
  @ApiProperty() @IsUUID() classLevelId: string;

  @ApiProperty({ enum: AdmissionEntryPoint })
  @IsEnum(AdmissionEntryPoint)
  entryPoint: AdmissionEntryPoint;

  @ApiProperty({ example: 'Senior 1 intake, 2026' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 80 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  places: number;

  @ApiProperty({ example: '2026-06-01' }) @IsString() opensAt: string;
  @ApiProperty({ example: '2026-08-15' }) @IsString() closesAt: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}
