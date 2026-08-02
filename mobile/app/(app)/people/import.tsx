import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { toast } from 'sonner-native';
import { FileUp, FileDown } from 'lucide-react-native';

import api from '@/lib/api';
import { API_URL } from '@/constants/config';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import { Screen, Section, Row, RowGroup, Text, Button, Segmented, Badge } from '@/ui';

/**
 * Bringing a spreadsheet in.
 *
 * The template comes first, deliberately. Importing against the wrong column
 * order is the single most common way this goes wrong, and downloading the
 * template is cheaper than explaining the format.
 *
 * Errors come back per row and are shown per row. A single "import failed"
 * against a file of four hundred students is useless, because the person then
 * has to find which line broke it themselves.
 */

const ROLES = [
  { value: 'STUDENT', label: 'Students' },
  { value: 'TEACHER', label: 'Teachers' },
  { value: 'PARENT', label: 'Parents' },
];

type RowError = { row: number; message: string };

export default function ImportPeople() {
  const t = useTheme();
  const [role, setRole] = useState('STUDENT');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<number | null>(null);
  const [failures, setFailures] = useState<RowError[]>([]);

  const pick = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    setBusy(true);
    setCreated(null);
    setFailures([]);

    try {
      const asset = picked.assets[0];
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.name ?? 'import.csv',
        type: asset.mimeType ?? 'text/csv',
      } as never);
      form.append('role', role);

      const { data } = await api.post('/users/bulk-import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setCreated(data?.created ?? data?.imported ?? 0);
      setFailures(data?.errors ?? data?.failed ?? []);

      if (!data?.errors?.length) toast.success(`${data?.created ?? 0} added`);
      else toast.error(`${data?.errors.length} rows could not be added`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Could not read that file');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Import' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <Section title="Who is in the file">
          <Segmented value={role} onChange={setRole} options={ROLES} />
        </Section>

        <Section title="1. Start from the template">
          <View style={{ gap: space.md }}>
            <Button
              label="Download the template"
              kind="secondary"
              block
              icon={<FileDown size={18} color={t.fg.primary} strokeWidth={2} />}
              onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/users/import-template/${role}`)}
            />
            <Text variant="footnote" tone="tertiary">
              Importing against the wrong column order is the usual way this goes wrong, so it is
              worth the extra step.
            </Text>
          </View>
        </Section>

        <Section title="2. Send it">
          <Button
            label={busy ? 'Reading the file' : 'Choose a CSV'}
            kind="primary"
            block
            loading={busy}
            icon={<FileUp size={18} color={t.brand.onSolid} strokeWidth={2} />}
            onPress={pick}
          />
        </Section>

        {created !== null ? (
          <Section title="What happened">
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Badge label={`${created} added`} tone="positive" numeric />
                {failures.length ? (
                  <Badge label={`${failures.length} skipped`} tone="critical" numeric />
                ) : null}
              </View>

              {failures.length ? (
                <RowGroup>
                  {failures.map((failure, i) => (
                    <Row
                      key={`${failure.row}-${i}`}
                      title={`Row ${failure.row}`}
                      subtitle={failure.message}
                      chevron={false}
                      last={i === failures.length - 1}
                    />
                  ))}
                </RowGroup>
              ) : (
                <Text variant="callout" tone="positive">
                  Every row went in cleanly.
                </Text>
              )}
            </View>
          </Section>
        ) : null}

        <Text variant="footnote" tone="tertiary">
          Everybody imported gets a temporary password and is asked to change it the first time they
          sign in.
        </Text>
      </Screen>
    </>
  );
}
