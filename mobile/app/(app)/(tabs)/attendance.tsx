import { View, Text, StyleSheet } from 'react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, fontSize, fontWeight, spacing } from '@/constants/theme';
import { ClipboardList } from 'lucide-react-native';

export default function AttendanceScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader title="Attendance" />
      <View style={styles.empty}>
        <ClipboardList size={48} color={colors.mutedLight} />
        <Text style={styles.emptyTitle}>Attendance</Text>
        <Text style={styles.emptyText}>NFC + Manual attendance coming in Sprint 2</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginTop: spacing.lg },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm },
});
