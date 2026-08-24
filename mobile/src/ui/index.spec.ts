import * as ui from './index';
import * as design from '@/design';

/**
 * The two front doors.
 *
 * Every screen imports from '@/ui' and '@/design' rather than from the files
 * behind them, so a name dropped from either barrel is an import that fails
 * at runtime in whichever screen happened to use it.
 */

describe('the UI barrel', () => {
  it.each([
    'Text',
    'Screen',
    'Section',
    'Row',
    'RowGroup',
    'Button',
    'Field',
    'Badge',
    'Avatar',
    'Skeleton',
    'LoadingRows',
    'Empty',
    'Failed',
    'Stat',
    'StatRow',
    'Meter',
    'Segmented',
    'Fact',
  ])('hands out %s', (name) => {
    expect(ui[name as keyof typeof ui]).toBeDefined();
  });

  it('hands out the shared status vocabulary too', () => {
    expect(ui.statusTone.PRESENT).toBe('positive');
    expect(ui.humanise('WRITTEN_WARNING')).toBe('Written warning');
  });
});

describe('the design barrel', () => {
  it.each([
    'type',
    'font',
    'tabular',
    'neutral',
    'status',
    'space',
    'gutter',
    'radius',
    'curve',
    'depth',
    'hairline',
    'touch',
    'duration',
    'easing',
    'useReducedMotion',
    'withReducedMotion',
    'buildTheme',
    'defaultTheme',
    'deriveBrand',
    'DesignProvider',
    'useTheme',
    'contrast',
    'oklch',
    'hexToOklch',
    'oklchToHex',
    'atLightness',
    'MIN_LC',
  ])('hands out %s', (name) => {
    expect(design[name as keyof typeof design]).toBeDefined();
  });
});
