import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { toast } from 'sonner-native';

import { useNfcScan, useBooks, useCheckoutBook } from '@/hooks/useApi';
import { useTheme } from '@/design';
import { curve, radius, space } from '@/design/tokens';
import { Screen, Text, Button, Empty } from '@/ui';

/**
 * The camera.
 *
 * One screen for two jobs, because it is the same gesture: point the phone at
 * a code. What the code means depends on where you came from, which arrives as
 * a param rather than as a mode switch the person has to set.
 *
 * It is a sheet rather than a page. Scanning is something you do and dismiss,
 * not somewhere you navigate to, and a sheet keeps the screen underneath
 * visible so it is obvious what you are scanning into.
 *
 * The camera stops the moment a code is read. Leaving it live means the next
 * accidental frame fires a second request, and at a library desk that is a
 * double checkout.
 */
export default function Scan() {
  const t = useTheme();
  const router = useRouter();
  const { mode, classSectionId } = useLocalSearchParams<{ mode?: string; classSectionId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);

  const nfcScan = useNfcScan();
  const checkout = useCheckoutBook();
  const { data: books } = useBooks();

  const forAttendance = mode === 'attendance';

  const onScan = ({ data }: { data: string }) => {
    if (handled) return;
    setHandled(true);
    if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (forAttendance && classSectionId) {
      nfcScan.mutate(
        { nfcCardId: data, classSectionId },
        {
          onSuccess: (res: any) => {
            toast.success(`${res?.studentName ?? 'Student'} marked ${res?.status?.toLowerCase() ?? 'present'}`);
            setTimeout(() => setHandled(false), 900);
          },
          onError: (e: any) => {
            toast.error(e?.response?.data?.message ?? 'That card is not registered');
            setTimeout(() => setHandled(false), 1200);
          },
        },
      );
      return;
    }

    const book = (books ?? []).find((b) => b.barcode === data || b.isbn === data);
    if (!book) {
      toast.error('No book with that code');
      setTimeout(() => setHandled(false), 1200);
      return;
    }
    toast.success(book.title);
    router.replace(`/(app)/books/${book.id}`);
  };

  if (!permission)
    return (
      <>
        <Stack.Screen options={{ title: 'Scan' }} />
        <Screen><Text variant="body">Checking the camera</Text></Screen>
      </>
    );

  if (!permission.granted)
    return (
      <>
        <Stack.Screen options={{ title: 'Scan' }} />
        <Screen>
          <Empty
            title="The camera is off for this app"
            body="Scanning a card or a barcode needs it. Nothing is recorded or uploaded, the code is read on the phone."
            action={{ label: 'Turn the camera on', onPress: () => void requestPermission() }}
          />
        </Screen>
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: forAttendance ? 'Scan a card' : 'Scan a book' }} />
      <View style={{ flex: 1, backgroundColor: t.bg.page, gap: space.lg, padding: space.xl }}>
        <View
          style={{
            flex: 1,
            overflow: 'hidden',
            borderRadius: radius.lg,
            backgroundColor: t.bg.fill,
            ...curve,
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39'],
            }}
            onBarcodeScanned={handled ? undefined : onScan}
          />
        </View>

        <Text variant="callout" tone="secondary" align="center">
          {forAttendance
            ? 'Hold a student card in front of the camera. It marks them present and waits for the next one.'
            : 'Point at the barcode on the back of the book.'}
        </Text>

        <Button label="Done" kind="secondary" block onPress={() => router.back()} />
      </View>
    </>
  );
}
