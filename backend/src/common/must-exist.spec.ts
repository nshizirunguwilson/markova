import { NotFoundException } from '@nestjs/common';
import { mustExist } from './must-exist';

describe('mustExist', () => {
  it('lets a real id through', async () => {
    const table = { findFirst: jest.fn().mockResolvedValue({ id: 's-1' }) };
    await expect(mustExist(table, 's-1', 'Student')).resolves.toBeUndefined();
    expect(table.findFirst).toHaveBeenCalledWith({
      where: { id: 's-1' },
      select: { id: true },
    });
  });

  it('refuses an id that names nothing, saying what was looked for', async () => {
    const table = { findFirst: jest.fn().mockResolvedValue(null) };
    await expect(mustExist(table, 'nope', 'Class')).rejects.toThrow(
      new NotFoundException('Class not found'),
    );
  });
});
