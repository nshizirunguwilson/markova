import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * What the reader asked the audit trail for.
 *
 * A class rather than an interface, and not only for the decorator metadata:
 * the global validation pipe runs with `forbidNonWhitelisted`, so a query
 * parameter no DTO declares is rejected outright. An interface would have made
 * every filter on this page a 400.
 */
export class QueryAuditDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /* Capped, because this is the one page that can ask for the whole history
     of the school in a single request. */
  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Everything one person did' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Marks, attendance, users, and so on' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional({ enum: ['POST', 'PUT', 'PATCH', 'DELETE'] })
  @IsOptional()
  @IsIn(['POST', 'PUT', 'PATCH', 'DELETE'])
  action?: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
