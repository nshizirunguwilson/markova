import { useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useBrandStore, mediaUrl } from '@/stores/brand-store';
import { colors, radius } from '@/constants/theme';

/**
 * Markova's own mark — the same graduation-cap artwork the web app and the app
 * icon use, bundled with the binary so it needs no network.
 */
const FALLBACK_MARK = require('../../assets/notification-icon.png');

interface LogoProps {
  size?: number;
  /** Ignore any school logo and always show Markova's own mark. */
  productOnly?: boolean;
}

/**
 * Renders the school's uploaded crest when it has one and Markova's mark when
 * it does not — the same contract as `<Logo />` on web, so both clients show
 * the same thing to the same school. A crest that fails to load falls back to
 * the mark rather than leaving a gap.
 */
export function Logo({ size = 56, productOnly = false }: LogoProps) {
  const logoUrl = useBrandStore((s) => s.logoUrl);
  const [failed, setFailed] = useState(false);

  const schoolLogo = productOnly || failed ? undefined : mediaUrl(logoUrl);

  if (schoolLogo) {
    return (
      <View style={[styles.frame, { width: size, height: size }]}>
        <Image
          source={{ uri: schoolLogo }}
          style={{ width: size, height: size }}
          resizeMode="contain"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }

  return (
    <Image
      source={FALLBACK_MARK}
      style={{ width: size, height: size, tintColor: colors.primary }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
});
