import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { toast } from 'sonner-native';

import { usePerson, useDeactivateUser } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Text, Avatar, Badge, Button, Fact, LoadingRows, Failed, Row, RowGroup } from '@/ui';
import { useState } from 'react';

/**
 * One person's record.
 *
 * Deliberately read mostly. Editing a person properly means the full
 * enrollment form with the five level address, guardians, medical notes and a
 * NIDA number, and that is a desk job on the web. What a phone is good for is
 * looking somebody up in a corridor and finding their class, their ID or their
 * parent's phone number.
 *
 * The one write action here is turning an account off, which is the thing that
 * genuinely cannot wait for somebody to get back to a computer.
 */
export default function Person() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, isError, refetch } = usePerson(id);
  const deactivate = useDeactivateUser();
  const [confirming, setConfirming] = useState(false);

  if (isPending)
    return (
      <>
        <Stack.Screen options={{ title: 'Person' }} />
        <Screen><LoadingRows count={6} /></Screen>
      </>
    );

  if (isError || !data)
    return (
      <>
        <Stack.Screen options={{ title: 'Person' }} />
        <Screen><Failed onRetry={refetch} /></Screen>
      </>
    );

  const name = `${data.firstName} ${data.lastName}`.trim();
  const role = data.role.charAt(0) + data.role.slice(1).toLowerCase();

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Avatar name={name} photoUrl={data.photoUrl} size="xl" />
          <View style={{ alignItems: 'center', gap: space.xs }}>
            <Text variant="title2">{name}</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Badge label={role} tone="brand" />
              {!data.isActive ? <Badge label="Turned off" tone="neutral" /> : null}
            </View>
          </View>
        </View>

        <Section title="How to reach them">
          <View>
            {data.phone ? <Fact label="Phone" value={data.phone} /> : null}
            {data.email ? <Fact label="Email" value={data.email} /> : null}
            {!data.phone && !data.email ? <Fact label="Contact" value="Nothing on file" last /> : null}
            {data.phone || data.email ? <Fact label="Account" value={data.isActive ? 'Active' : 'Turned off'} last /> : null}
          </View>
        </Section>

        {data.student ? (
          <Section title="As a student">
            <View>
              <Fact label="Student number" value={data.student.studentIdNumber} mono />
              <Fact label="Class" value={data.student.classSection?.name ?? 'Not set'} last />
            </View>
          </Section>
        ) : null}

        <Section title="On file">
          <View>
            {data.code ? <Fact label="Role code" value={data.code} mono /> : null}
            {data.nationalId ? <Fact label="National ID" value={data.nationalId} mono /> : null}
            <Fact label="Full record" value="On the web dashboard" last />
          </View>
        </Section>

        <Section title="Talk to them">
          <RowGroup>
            <Row
              title="Send a message"
              onPress={() => router.push('/(app)/messages/new')}
              last
            />
          </RowGroup>
        </Section>

        {data.isActive ? (
          <Section title="Access">
            {confirming ? (
              <View style={{ gap: space.md, padding: space.lg, backgroundColor: t.bg.fill, borderRadius: 12 }}>
                <Text variant="bodyMedium">Turn off {name}'s account?</Text>
                <Text variant="callout" tone="secondary">
                  They will be signed out on their next request, not whenever their token happens to
                  expire. Their record stays; only the way in closes.
                </Text>
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <Button
                    label="Turn it off"
                    kind="destructive"
                    loading={deactivate.isPending}
                    onPress={() =>
                      deactivate.mutate(data.id, {
                        onSuccess: () => {
                          toast.success('Account turned off');
                          setConfirming(false);
                          void refetch();
                        },
                        onError: () => toast.error('Could not do that'),
                      })
                    }
                  />
                  <Button label="Leave it" kind="quiet" onPress={() => setConfirming(false)} />
                </View>
              </View>
            ) : (
              <Button label="Turn off this account" kind="quiet" onPress={() => setConfirming(true)} />
            )}
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
