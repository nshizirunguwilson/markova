import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Copy, ExternalLink } from 'lucide-react-native';
import { toast } from 'sonner-native';

import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/design';
import { radius, space, touch, curve } from '@/design/tokens';
import { duration, useReducedMotion, withReducedMotion } from '@/design/motion';
import { Screen, Text, Button } from '@/ui';

/**
 * What a student sees after signing in correctly on a phone.
 *
 * The instruction this was built to: do not treat it as an error. Nothing went
 * wrong. Their password was right, their account is fine, and they are being
 * turned away by a product decision rather than by a mistake they made. A red
 * toast saying "access denied" would be both unkind and untrue.
 *
 * So the screen greets them by name, says the one thing they need to know in
 * plain words, gives them the address, and makes that address easy to act on:
 * open it, or copy it if the phone they are holding is not the device they
 * will use. Then it gets out of the way.
 */

type Branding = { schoolName: string; logoUrl: string; webUrl: string };

export default function Blocked() {
  const t = useTheme();
  const router = useRouter();
  const name = useAuthStore((s) => s.blockedName);
  const clearBlock = useAuthStore((s) => s.clearBlock);
  const reduced = useReducedMotion();

  const { data } = useQuery({
    queryKey: ['branding'],
    queryFn: async () => (await api.get<Branding>('/school-config/public')).data,
    staleTime: 1000 * 60 * 60,
  });

  const school = data?.schoolName ?? 'your school';
  const webUrl = data?.webUrl?.replace(/\/$/, '') ?? '';
  const shown = webUrl.replace(/^https?:\/\//, '');

  const leave = async () => {
    await clearBlock();
    router.replace('/(auth)/login');
  };

  const copy = async () => {
    await Clipboard.setStringAsync(webUrl);
    toast.success('Address copied');
  };

  return (
    <Screen>
      <Animated.View
        entering={FadeInDown.duration(withReducedMotion(reduced, duration.screen))}
        style={{ gap: space.xl, paddingTop: space.huge }}
      >
        <View style={{ gap: space.md }}>
          <Text variant="title1">
            {name ? `Hello ${name},` : 'Hello,'}
          </Text>
          <Text variant="body" tone="secondary" style={{ maxWidth: 420 }}>
            Your sign in worked. Student accounts just do not run in this app.
          </Text>
          <Text variant="body" tone="secondary" style={{ maxWidth: 420 }}>
            Everything of yours lives on the {school} dashboard in a browser:
            your marks, your report card, your homework, your attendance and the
            library. This app is the version built for teachers, parents and
            staff.
          </Text>
        </View>

        {webUrl ? (
          <View style={{ gap: space.md }}>
            <Text variant="caption" tone="tertiary" caps>
              Open this on any device
            </Text>

            <Pressable
              onPress={copy}
              accessibilityRole="button"
              accessibilityLabel={`Copy ${shown}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space.md,
                minHeight: touch.comfortable,
                paddingHorizontal: space.lg,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: t.line.border,
                backgroundColor: pressed ? t.bg.fill : t.bg.page,
                ...curve,
              })}
            >
              <Text variant="code" selectable numberOfLines={1} style={{ flex: 1 }}>
                {shown}
              </Text>
              <Copy size={18} color={t.fg.tertiary} strokeWidth={2} />
            </Pressable>

            <Button
              label="Open the dashboard"
              kind="primary"
              block
              icon={<ExternalLink size={18} color={t.brand.onSolid} strokeWidth={2} />}
              onPress={() => WebBrowser.openBrowserAsync(webUrl)}
            />
          </View>
        ) : (
          <Text variant="callout" tone="secondary">
            Ask your class teacher for the dashboard address.
          </Text>
        )}

        <View style={{ paddingTop: space.md }}>
          <Button label="Use a different account" kind="quiet" onPress={leave} />
        </View>
      </Animated.View>
    </Screen>
  );
}
