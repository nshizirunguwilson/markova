import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Image } from 'expo-image';
import { toast } from 'sonner-native';

import { useSchoolConfig, useSaveSchoolConfig } from '@/hooks/useApi';
import { mediaUrl } from '@/lib/media-url';
import { useTheme } from '@/design';
import { buildTheme } from '@/design/theme';
import { contrast } from '@/design/color';
import { curve, radius, space } from '@/design/tokens';
import { Screen, Section, Text, Field, Button, LoadingRows, Fact } from '@/ui';

/**
 * The screen that decides what every other screen looks like.
 *
 * The colour field is the interesting one. Whatever a school types here becomes
 * the brand across the whole app, and the app derives a readable set of roles
 * from it rather than using it raw. So this screen shows the derivation live:
 * you see the actual button colour you are going to get, not the swatch you
 * typed, and if the two differ the screen says why.
 *
 * That matters because a school that types a bright yellow gets a noticeably
 * darker button, and without an explanation that reads like a bug.
 */
export default function School() {
  const t = useTheme();
  const { data, isPending } = useSchoolConfig();
  const save = useSaveSchoolConfig();

  const [name, setName] = useState('');
  const [motto, setMotto] = useState('');
  const [colour, setColour] = useState('');

  useEffect(() => {
    setName(data?.school_name ?? '');
    setMotto(data?.school_motto ?? '');
    setColour(data?.primary_color ?? '');
  }, [data]);

  const valid = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colour.trim());
  const preview = buildTheme(valid ? colour.trim() : undefined);
  const adjusted =
    valid && preview.brand.solid.toLowerCase() !== `#${colour.trim().replace('#', '')}`.toLowerCase();

  const dirty =
    name !== (data?.school_name ?? '') ||
    motto !== (data?.school_motto ?? '') ||
    colour !== (data?.primary_color ?? '');

  const commit = async () => {
    const changes: { key: string; value: string }[] = [];
    if (name !== (data?.school_name ?? '')) changes.push({ key: 'school_name', value: name });
    if (motto !== (data?.school_motto ?? '')) changes.push({ key: 'school_motto', value: motto });
    if (colour !== (data?.primary_color ?? ''))
      changes.push({ key: 'primary_color', value: colour.startsWith('#') ? colour : `#${colour}` });

    try {
      for (const change of changes) await save.mutateAsync(change);
      toast.success('Saved. The app is wearing it now.');
    } catch {
      toast.error('Could not save that');
    }
  };

  if (isPending)
    return (
      <>
        <Stack.Screen options={{ title: 'School' }} />
        <Screen><LoadingRows count={5} /></Screen>
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: 'School settings' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <Section title="Identity">
          <View style={{ gap: space.lg }}>
            <Field label="School name" value={name} onChangeText={setName} />
            <Field label="Motto" value={motto} onChangeText={setMotto} optional />
          </View>
        </Section>

        <Section title="Colour">
          <View style={{ gap: space.lg }}>
            <Field
              label="Brand colour"
              value={colour}
              onChangeText={setColour}
              autoCapitalize="none"
              autoCorrect={false}
              mono
              placeholder="#1B4F72"
              error={colour && !valid ? 'That is not a hex colour' : undefined}
            />

            {valid ? (
              <View style={{ gap: space.md }}>
                <Text variant="caption" tone="tertiary" caps>
                  What you will actually get
                </Text>

                <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                  <View
                    style={{
                      flex: 1,
                      height: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radius.md,
                      backgroundColor: preview.brand.solid,
                      ...curve,
                    }}
                  >
                    <Text variant="bodyMedium" style={{ color: preview.brand.onSolid }}>
                      A button
                    </Text>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      height: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radius.md,
                      backgroundColor: preview.brand.tint,
                      ...curve,
                    }}
                  >
                    <Text variant="bodyMedium" style={{ color: preview.brand.text }}>
                      Selected
                    </Text>
                  </View>
                </View>

                {adjusted ? (
                  <Text variant="footnote" tone="tertiary">
                    Darkened from what you typed so the label on it stays readable. The hue you chose
                    is kept. White on your exact colour measures Lc{' '}
                    {Math.abs(contrast('#FFFFFF', colour.trim().startsWith('#') ? colour.trim() : `#${colour.trim()}`)).toFixed(0)}
                    , and a button label needs 75.
                  </Text>
                ) : (
                  <Text variant="footnote" tone="tertiary">
                    Your colour carries a white label as it is, so it is used exactly as typed.
                  </Text>
                )}
              </View>
            ) : null}
          </View>
        </Section>

        <Section title="Marks and stamps">
          <View>
            <Fact
              label="Logo"
              value={
                data?.logo_url ? (
                  <Image
                    source={{ uri: mediaUrl(data.logo_url)! }}
                    style={{ width: 40, height: 40, borderRadius: radius.sm }}
                    contentFit="contain"
                  />
                ) : (
                  'Not set'
                )
              }
            />
            <Fact label="Stamp" value={data?.stamp_url ? 'Uploaded' : 'Not set'} />
            <Fact label="Head teacher signature" value={data?.signature_url ? 'Uploaded' : 'Not set'} last />
          </View>
          <Text variant="footnote" tone="tertiary">
            Uploading the logo, stamp and signature stays on the web dashboard, where you can see them
            against the report card layout they print on.
          </Text>
        </Section>

        <Button label="Save" kind="primary" block disabled={!dirty} loading={save.isPending} onPress={commit} />
      </Screen>
    </>
  );
}
