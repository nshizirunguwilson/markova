import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { toast } from 'sonner-native';
import { Camera } from 'lucide-react-native';

import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Text, Field, Button, Avatar, Fact, Badge } from '@/ui';

/**
 * Your own record.
 *
 * A person can change three things about themselves here: their name, their
 * phone number and their photo. Everything else on the screen is shown but not
 * editable, because a role, a national ID and a staff code are facts the
 * school owns, and letting somebody edit their own role in an app is how you
 * end up with a school full of administrators.
 *
 * The read only facts are still on screen rather than hidden, because "what is
 * my staff code again" is a real question this answers.
 */
export default function Profile() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const loadProfile = useAuthStore((s) => s.loadProfile);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setPhone(user?.phone ?? '');
  }, [user]);

  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const dirty =
    firstName !== (user?.firstName ?? '') ||
    lastName !== (user?.lastName ?? '') ||
    phone !== (user?.phone ?? '');

  const save = async () => {
    setBusy(true);
    try {
      await api.patch('/auth/profile', { firstName, lastName, phone: phone || undefined });
      await loadProfile();
      toast.success('Saved');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not save that');
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Photo access is off for this app');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (picked.canceled || !picked.assets?.[0] || !user?.id) return;

    setUploading(true);
    try {
      const asset = picked.assets[0];
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as never);
      await api.post(`/users/${user.id}/photo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadProfile();
      toast.success('Photo updated');
    } catch {
      toast.error('Could not upload that photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Your profile' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Avatar name={name || 'You'} photoUrl={user?.photoUrl} size="xl" />
          <Button
            label={uploading ? 'Uploading' : 'Change photo'}
            kind="quiet"
            loading={uploading}
            icon={<Camera size={16} color={t.brand.text} strokeWidth={2} />}
            onPress={changePhoto}
          />
        </View>

        <Section title="What you can change">
          <View style={{ gap: space.lg }}>
            <Field label="First name" value={firstName} onChangeText={setFirstName} />
            <Field label="Last name" value={lastName} onChangeText={setLastName} />
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              hint="The number the school reaches you on"
            />
            <Button
              label="Save changes"
              kind="primary"
              block
              disabled={!dirty}
              loading={busy}
              onPress={save}
            />
          </View>
        </Section>

        <Section title="What the school holds">
          <View>
            <Fact label="Role" value={<Badge label={(user?.role ?? '').charAt(0) + (user?.role ?? '').slice(1).toLowerCase()} tone="brand" />} />
            {user?.email ? <Fact label="Email" value={user.email} /> : null}
            <Fact label="Account" value={user?.isActive ? 'Active' : 'Turned off'} last />
          </View>
          <Text variant="footnote" tone="tertiary">
            Ask the office if any of this is wrong. It cannot be changed from here on purpose.
          </Text>
        </Section>
      </Screen>
    </>
  );
}
