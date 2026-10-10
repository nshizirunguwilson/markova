import { identityColors } from '@/design/color';
import { renderScreen, resetHarness, styleOf } from '@/test/harness';

import { Avatar } from './avatar';

/**
 * A person. Where there is no photo the initials sit on a colour derived from
 * the name, so the same person is the same colour everywhere and a list of
 * people is scannable by shape before it is read.
 */

beforeEach(resetHarness);

describe('somebody with no photo', () => {
  it('is shown as their initials', async () => {
    const screen = await renderScreen(<Avatar name="Aline Uwase" />);

    expect(screen.getByText('AU')).toBeTruthy();
  });

  it('takes only the first two names, however many somebody has', async () => {
    const screen = await renderScreen(
      <Avatar name="Jean Baptiste Habimana Nshimiyimana" />,
    );

    expect(screen.getByText('JB')).toBeTruthy();
  });

  it('copes with a single name', async () => {
    const screen = await renderScreen(<Avatar name="Uwase" />);

    expect(screen.getByText('U')).toBeTruthy();
  });

  it('copes with the extra spaces a form leaves behind', async () => {
    const screen = await renderScreen(<Avatar name="  Aline   Uwase  " />);

    expect(screen.getByText('AU')).toBeTruthy();
  });

  // A record with no name is a bad record, not a crash.
  it('draws an empty disc rather than falling over on a missing name', async () => {
    const screen = await renderScreen(<Avatar name="" />);

    expect(screen.toJSON()).toBeTruthy();
    expect(screen.queryByText(/\w/)).toBeNull();
  });

  it('gets the colour its name always gets', async () => {
    const screen = await renderScreen(<Avatar name="Aline Uwase" />);

    expect(styleOf(screen.getByLabelText('Aline Uwase')).backgroundColor).toBe(
      identityColors('Aline Uwase').bg,
    );
  });

  it('is named for a screen reader, since initials read as nonsense', async () => {
    const screen = await renderScreen(<Avatar name="Aline Uwase" />);

    expect(screen.getByLabelText('Aline Uwase')).toBeTruthy();
  });
});

describe('somebody with a photo', () => {
  it('is shown as their photo instead', async () => {
    const screen = await renderScreen(
      <Avatar name="Aline Uwase" photoUrl="https://school.rw/aline.jpg" />,
    );

    expect(screen.queryByText('AU')).toBeNull();
    expect(screen.getByLabelText('Aline Uwase')).toBeTruthy();
  });

  // The API returns a server path. On a phone that loads nothing, which is
  // why every photo in the app was an empty circle.
  it('loads a server path from the API origin', async () => {
    const screen = await renderScreen(
      <Avatar name="Aline Uwase" photoUrl="/uploads/photos/aline.png" />,
    );

    // expo-image normalises a single source into a list.
    const { source } = screen.getByLabelText('Aline Uwase').props as {
      source: { uri: string }[];
    };
    expect(source[0].uri).toMatch(
      /^https?:\/\/[^/]+\/uploads\/photos\/aline\.png$/,
    );
  });

  it('falls back to initials when the record has no photo after all', async () => {
    const screen = await renderScreen(<Avatar name="Aline Uwase" photoUrl={null} />);

    expect(screen.getByText('AU')).toBeTruthy();
  });
});

describe('how big it is', () => {
  it.each([
    ['sm', 32],
    ['md', 40],
    ['lg', 56],
    ['xl', 88],
  ])('draws %s at %s points', async (size, px) => {
    const screen = await renderScreen(
      <Avatar name="Aline Uwase" size={size as 'sm'} />,
    );
    const style = styleOf(screen.getByLabelText('Aline Uwase'));

    expect(style.width).toBe(px);
    expect(style.height).toBe(px);
  });

  it('is a circle at every size', async () => {
    const screen = await renderScreen(<Avatar name="Aline Uwase" size="lg" />);

    expect(
      styleOf(screen.getByLabelText('Aline Uwase')).borderRadius,
    ).toBeGreaterThan(56);
  });

  // The initials have to grow with the disc, or a large avatar is a small
  // pair of letters floating in a lot of colour.
  it('sizes the initials to the disc', async () => {
    const big = await renderScreen(<Avatar name="Aline Uwase" size="xl" />);
    const small = await renderScreen(<Avatar name="Aline Uwase" size="sm" />);

    expect(styleOf(big.getByText('AU')).fontSize).toBeGreaterThan(
      styleOf(small.getByText('AU')).fontSize,
    );
  });
});
