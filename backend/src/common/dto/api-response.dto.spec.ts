import { ApiResponse } from './api-response.dto';

/**
 * The success and failure envelope.
 *
 * The `success` flag is what a caller branches on, so it has to be right
 * whether or not there is data or a message alongside it.
 */
describe('ApiResponse', () => {
  it('wraps data as a success', () => {
    const response = ApiResponse.ok({ id: 'student-1' });
    expect(response.success).toBe(true);
    expect(response.data).toEqual({ id: 'student-1' });
  });

  it('carries a message alongside the data when one is given', () => {
    const response = ApiResponse.ok({ id: 'x' }, 'Saved');
    expect(response.message).toBe('Saved');
  });

  it('carries no message when none was given', () => {
    expect(ApiResponse.ok({ id: 'x' }).message).toBeUndefined();
  });

  // An empty list is a successful answer, not an absent one.
  it('treats an empty result as a success', () => {
    const response = ApiResponse.ok([]);
    expect(response.success).toBe(true);
    expect(response.data).toEqual([]);
  });

  it('marks a failure as one, with no data', () => {
    const response = ApiResponse.error('Student not found');
    expect(response.success).toBe(false);
    expect(response.message).toBe('Student not found');
    expect(response.data).toBeUndefined();
  });
});
