import { View, Image, StyleSheet } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import { useBrandStore, mediaUrl } from '@/stores/brand-store';
import { colors, radius } from '@/constants/theme';

/**
 * The Markova monogram. Geometry is identical to design/logo-mark.svg — the
 * middle vertex runs to the baseline so the mark still reads as an M at icon
 * sizes. Change one, change the other, then rerun
 * `node scripts/build-brand-assets.mjs`.
 */
function MarkovaMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect width={48} height={48} rx={11} fill={color} />
      <Path
        d="M12.5 33V15L24 33L35.5 15V33"
        fill="none"
        stroke={colors.white}
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface LogoProps {
  size?: number;
}

/**
 * Renders the school's uploaded crest when one exists and the Markova mark
 * when it does not — the same contract as `<Logo />` on web, so both clients
 * show the same thing to the same school.
 */
export function Logo({ size = 56 }: LogoProps) {
  const logoUrl = useBrandStore((s) => s.logoUrl);
  const primaryColor = useBrandStore((s) => s.primaryColor);
  const resolved = mediaUrl(logoUrl);

  if (resolved) {
    return (
      <View style={[styles.frame, { width: size, height: size }]}>
        <Image
          source={{ uri: resolved }}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  return <MarkovaMark size={size} color={primaryColor} />;
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
});
