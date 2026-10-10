import { View } from 'react-native';
import { Image } from 'expo-image';
import { identityColors } from '@/design/color';
import { useTheme } from '@/design/provider';
import { radius } from '@/design/tokens';
import { mediaUrl } from '@/lib/media-url';
import { Text } from './text';

/**
 * A person.
 *
 * Where there is no photo, the initials sit on a tint derived from the name
 * itself, so the same person is the same colour everywhere in the app and a
 * list of people is scannable by shape and colour before it is read. The hue
 * is picked from a hash of the name; the lightness and chroma are fixed, which
 * is what stops the set looking like confetti and keeps every initial legible
 * against its own background.
 */

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

const SIZES = { sm: 32, md: 40, lg: 56, xl: 88 } as const;

export function Avatar({
  name,
  photoUrl,
  size = 'md',
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
}) {
  const t = useTheme();
  const px = SIZES[size];

  const src = mediaUrl(photoUrl);
  if (src) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: px, height: px, borderRadius: radius.full, backgroundColor: t.bg.fill }}
        contentFit="cover"
        transition={160}
        accessibilityLabel={name}
      />
    );
  }

  const { bg, fg } = identityColors(name);

  return (
    <View
      accessibilityLabel={name}
      style={{
        width: px,
        height: px,
        borderRadius: radius.full,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant={size === 'xl' ? 'title1' : size === 'lg' ? 'title3' : 'subhead'}
        style={{ color: fg }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

