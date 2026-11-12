import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty } from 'class-validator';

/**
 * Text that has to say something: trimmed, then refused when nothing is left.
 * IsString alone let an empty help ticket, a push token of nothing and a
 * subject with no name through.
 */
export function NotBlank() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsNotEmpty({ message: '$property cannot be empty' }),
  );
}
