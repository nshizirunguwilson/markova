/** The rig itself: proof the runner, the path alias and the stubs all work. */
import { API_URL, ROLES } from '@/constants/config';

describe('the test rig', () => {
  it('resolves the @ alias', () => {
    expect(API_URL).toBe('http://localhost:3000/api');
  });

  it('sees the roles the phone allows', () => {
    expect(ROLES).toContain('MATRON');
  });
});
