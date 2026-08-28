import {
  attachmentKind,
  humanSize,
  maxBytesFor,
  tooLargeMessage,
  MAX_ANY_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_BYTES,
} from './attachment-limits';

const MB = 1024 * 1024;

describe('what kind of attachment this is', () => {
  it('sorts a type into one of the four', () => {
    expect(attachmentKind('image/png')).toBe('image');
    expect(attachmentKind('video/mp4')).toBe('video');
    expect(attachmentKind('audio/webm')).toBe('audio');
    expect(attachmentKind('application/pdf')).toBe('document');
  });

  it('ignores the case the type arrives in', () => {
    expect(attachmentKind('IMAGE/PNG')).toBe('image');
  });

  it('answers nothing for nothing', () => {
    expect(attachmentKind('')).toBeNull();
  });

  // A browser recording announces itself as `audio/webm;codecs=opus`.
  it('reads past the codec a recording arrives with', () => {
    expect(attachmentKind('audio/webm;codecs=opus')).toBe('audio');
    expect(maxBytesFor('audio/webm;codecs=opus')).toBe(16 * MB);
  });
});

/**
 * A video may be larger than a photograph because even a short clip filmed on
 * a phone clears the photograph cap, and a teacher filming a demonstration is
 * a real thing this system should allow.
 */
describe('how large each kind may be', () => {
  it('gives video the most room', () => {
    expect(MAX_ATTACHMENT_BYTES.video).toBeGreaterThan(
      MAX_ATTACHMENT_BYTES.image,
    );
    expect(MAX_ATTACHMENT_BYTES.video).toBeGreaterThan(
      MAX_ATTACHMENT_BYTES.document,
    );
  });

  it('applies the right cap to a type', () => {
    expect(maxBytesFor('image/png')).toBe(10 * MB);
    expect(maxBytesFor('video/mp4')).toBe(50 * MB);
    expect(maxBytesFor('audio/webm')).toBe(16 * MB);
    expect(maxBytesFor('application/pdf')).toBe(25 * MB);
  });

  // Multer takes a single number, so it must be given the largest of the four
  // and the per-kind cap applied afterwards.
  it('knows the largest cap of all', () => {
    expect(MAX_ANY_ATTACHMENT_BYTES).toBe(
      Math.max(...Object.values(MAX_ATTACHMENT_BYTES)),
    );
  });

  it('falls back to the document cap for a type it does not know', () => {
    expect(maxBytesFor('')).toBe(MAX_ATTACHMENT_BYTES.document);
  });
});

describe('a size in words', () => {
  it('writes bytes, kilobytes and megabytes', () => {
    expect(humanSize(512)).toBe('512 B');
    expect(humanSize(2048)).toBe('2 KB');
    expect(humanSize(10 * MB)).toBe('10 MB');
  });

  // 10 MB rather than 10.0 MB, but 1.5 MB rather than 2 MB.
  it('keeps a decimal only where it says something', () => {
    expect(humanSize(1.5 * MB)).toBe('1.5 MB');
    expect(humanSize(3 * MB)).toBe('3 MB');
    expect(humanSize(24.7 * MB)).toBe('25 MB');
  });
});

/**
 * "Too large" leaves a person guessing at what would fit. The refusal has to
 * say both the ceiling and what they actually sent.
 */
describe('why a file was too large', () => {
  it('names the ceiling and the file', () => {
    const said = tooLargeMessage('image/png', 12 * MB);
    expect(said).toContain('10 MB');
    expect(said).toContain('12 MB');
    expect(said).toContain('image');
  });

  it('calls a document a document rather than an application', () => {
    expect(tooLargeMessage('application/pdf', 30 * MB)).toContain('A document');
  });
});
