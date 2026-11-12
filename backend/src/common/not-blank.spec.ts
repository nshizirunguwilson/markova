import { plainToInstance } from 'class-transformer';
import { IsString, validateSync } from 'class-validator';
import { NotBlank } from './not-blank';

class Ticket {
  @IsString()
  @NotBlank()
  title: string;
}

const check = (title: unknown) =>
  validateSync(plainToInstance(Ticket, { title })).map((e) => e.constraints);

describe('NotBlank', () => {
  it('keeps words, trimmed', () => {
    expect(check('  Cannot open my report ')).toEqual([]);
    expect(plainToInstance(Ticket, { title: '  Help ' }).title).toBe('Help');
  });

  it('refuses nothing and only spaces', () => {
    expect(check('')).toEqual([{ isNotEmpty: 'title cannot be empty' }]);
    expect(check('   ')).toEqual([{ isNotEmpty: 'title cannot be empty' }]);
  });
});
