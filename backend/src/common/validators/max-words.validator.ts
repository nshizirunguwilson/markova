import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { countWords } from '../report-comments';

/**
 * A limit in words rather than characters.
 *
 * `@MaxLength` counts characters, which is the wrong unit for something a
 * person writes and a printed box has to hold: "Excellent" and "A" cost the
 * same one line on a report card, and forty short words overflow it while
 * two hundred characters of long ones may not.
 *
 * The message names the count as well as the limit, because somebody who has
 * written twenty-four words needs to know they are four over, not that they
 * are over.
 */
export function MaxWords(limit: number, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxWords',
      target: object.constructor,
      propertyName,
      constraints: [limit],
      options,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return true;
          return countWords(value) <= limit;
        },
        defaultMessage(args: ValidationArguments) {
          const [max] = args.constraints as [number];
          const n = countWords(String(args.value ?? ''));
          return `${args.property} is ${n} words. The most a comment may run to is ${max}.`;
        },
      },
    });
  };
}
