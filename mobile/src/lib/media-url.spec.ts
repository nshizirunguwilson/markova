import { mediaUrl } from './media-url';

/**
 * Photos and crests come back from the API as server paths. On a phone those
 * load nothing at all, which is why every avatar in the app was an empty
 * circle until this existed.
 */
describe('mediaUrl', () => {
  const api = 'http://10.0.2.2:3010/api';

  it('puts a server path on the API origin, without the /api prefix', () => {
    expect(mediaUrl('/uploads/photos/a.png', api)).toBe(
      'http://10.0.2.2:3010/uploads/photos/a.png',
    );
  });

  it('copes with a path that has no leading slash', () => {
    expect(mediaUrl('uploads/branding/logo.png', api)).toBe(
      'http://10.0.2.2:3010/uploads/branding/logo.png',
    );
  });

  it('copes with an API address that ends in a slash', () => {
    expect(mediaUrl('/uploads/x.png', 'https://api.school.rw/api/')).toBe(
      'https://api.school.rw/uploads/x.png',
    );
  });

  it('leaves a full address alone', () => {
    expect(mediaUrl('https://cdn.example.com/a.png', api)).toBe(
      'https://cdn.example.com/a.png',
    );
  });

  it('leaves a photo picked on the phone alone', () => {
    expect(mediaUrl('file:///data/user/0/x.jpg', api)).toBe(
      'file:///data/user/0/x.jpg',
    );
    expect(mediaUrl('content://media/external/images/1', api)).toBe(
      'content://media/external/images/1',
    );
  });

  it('leaves a data URI alone', () => {
    expect(mediaUrl('data:image/png;base64,AAAA', api)).toBe(
      'data:image/png;base64,AAAA',
    );
  });

  it('has nothing to load when there is no path', () => {
    expect(mediaUrl(null, api)).toBeNull();
    expect(mediaUrl(undefined, api)).toBeNull();
    expect(mediaUrl('', api)).toBeNull();
  });

  it('defaults to the configured API address', () => {
    expect(mediaUrl('/uploads/x.png')).toMatch(/^https?:\/\/[^/]+\/uploads\/x\.png$/);
  });
});
