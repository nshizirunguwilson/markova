import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { toast } from 'sonner-native';

import { useSaveUser, useClassSections } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Text, Field, Button, Segmented } from '@/ui';

/**
 * Adding one person.
 *
 * The form asks for the least it can and lets the server do the rest. A role
 * code, a temporary password and, for a student, an ID number are all
 * generated, so asking a human to invent them is asking for collisions.
 *
 * The fields that appear change with the role, because a librarian has no
 * class and a student has no staff number, and showing empty boxes that do not
 * apply is how a form teaches people to skip fields.
 */

const ROLES = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'TEACHER', label: 'Teacher' },
  { value: 'PARENT', label: 'Parent' },
  { value: 'LIBRARIAN', label: 'Librarian' },
  { value: 'ADMIN', label: 'Admin' },
];

export default function NewPerson() {
  const router = useRouter();
  const save = useSaveUser();
  const { data: sections } = useClassSections();

  const [role, setRole] = useState('STUDENT');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [classSectionId, setClassSectionId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Needed';
    if (!lastName.trim()) next.lastName = 'Needed';
    if (!email.trim() && !phone.trim()) next.email = 'An email or a phone number is needed to sign in';
    if (role === 'STUDENT' && !classSectionId) next.classSectionId = 'A student needs a class';
    if (nationalId && nationalId.replace(/\s/g, '').length !== 16)
      next.nationalId = 'A NIDA number is sixteen digits';
    setErrors(next);
    if (Object.keys(next).length) return;

    save.mutate(
      {
        role,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase() || undefined,
        phone: phone.replace(/\s/g, '') || undefined,
        nationalId: nationalId.replace(/\s/g, '') || undefined,
        classSectionId: role === 'STUDENT' ? classSectionId : undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${firstName} added. They get a temporary password to change on first sign in.`);
          router.back();
        },
        onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not add them'),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Add someone' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <Section title="What are they">
          <Segmented value={role} onChange={setRole} options={ROLES} />
        </Section>

        <Section title="Their name">
          <View style={{ gap: space.lg }}>
            <Field label="First name" value={firstName} onChangeText={setFirstName} error={errors.firstName} required />
            <Field label="Last name" value={lastName} onChangeText={setLastName} error={errors.lastName} required />
          </View>
        </Section>

        <Section title="How they sign in">
          <View style={{ gap: space.lg }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              autoCapitalize="none"
              keyboardType="email-address"
              hint={role === 'PARENT' ? 'Most parents use a phone number instead' : undefined}
            />
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+250…" />
          </View>
        </Section>

        {role === 'STUDENT' ? (
          <Section title="Which class">
            <View style={{ gap: space.sm }}>
              <Segmented
                value={classSectionId}
                onChange={setClassSectionId}
                options={((sections as any[]) ?? []).map((s) => ({ value: s.id, label: s.name }))}
              />
              {errors.classSectionId ? (
                <Text variant="footnote" tone="critical">{errors.classSectionId}</Text>
              ) : null}
            </View>
          </Section>
        ) : null}

        <Section title="Optional">
          <Field
            label="National ID"
            value={nationalId}
            onChangeText={setNationalId}
            error={errors.nationalId}
            keyboardType="number-pad"
            mono
            hint="Sixteen digits. Students under sixteen usually will not have one."
          />
        </Section>

        <View style={{ gap: space.md }}>
          <Button label="Add them" kind="primary" block loading={save.isPending} onPress={submit} />
          <Text variant="footnote" tone="tertiary" align="center">
            Their role code, temporary password and student number are generated automatically.
          </Text>
        </View>
      </Screen>
    </>
  );
}
