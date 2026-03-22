import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { DollarSign, CheckCircle, AlertCircle, Clock } from 'lucide-react-native';
import { useStudentFees } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function ChildFeesScreen() {
  const router = useRouter();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const { data: fees, isLoading, refetch } = useStudentFees(studentId);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const totalDue = fees?.reduce((s, f) => s + f.amountDue, 0) ?? 0;
  const totalPaid = fees?.reduce((s, f) => s + f.amountPaid, 0) ?? 0;
  const totalBalance = totalDue - totalPaid;

  const statusIcon = (status: string) => {
    if (status === 'PAID') return <CheckCircle size={18} color={colors.success} />;
    if (status === 'PARTIAL') return <Clock size={18} color={colors.warning} />;
    return <AlertCircle size={18} color={colors.danger} />;
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Fee Records" subtitle={name} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Due</Text>
            <Text style={styles.summaryValue}>{totalDue.toLocaleString()} RWF</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>{totalPaid.toLocaleString()} RWF</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Balance</Text>
            <Text style={[styles.summaryValue, { color: totalBalance > 0 ? colors.danger : colors.success }]}>
              {totalBalance.toLocaleString()} RWF
            </Text>
          </View>
        </View>

        {/* Fee records */}
        <Text style={styles.sectionTitle}>Payment History</Text>
        {isLoading ? (
          <LoadingScreen />
        ) : fees && fees.length > 0 ? (
          fees.map((fee) => (
            <View key={fee.id} style={styles.feeCard}>
              <View style={styles.feeHeader}>
                {statusIcon(fee.status)}
                <Text style={styles.feeTerm}>{fee.term?.name ?? 'Term'}</Text>
                <View style={[styles.statusBadge, {
                  backgroundColor: fee.status === 'PAID' ? colors.successLight : fee.status === 'PARTIAL' ? colors.warningLight : colors.dangerLight,
                }]}>
                  <Text style={[styles.statusText, {
                    color: fee.status === 'PAID' ? colors.success : fee.status === 'PARTIAL' ? colors.warning : colors.danger,
                  }]}>
                    {fee.status}
                  </Text>
                </View>
              </View>
              <View style={styles.feeDetails}>
                <FeeRow label="Amount Due" value={`${fee.amountDue.toLocaleString()} RWF`} />
                <FeeRow label="Amount Paid" value={`${fee.amountPaid.toLocaleString()} RWF`} />
                <FeeRow
                  label="Balance"
                  value={`${(fee.amountDue - fee.amountPaid).toLocaleString()} RWF`}
                  bold
                />
                {fee.paymentMethod && (
                  <FeeRow label="Method" value={fee.paymentMethod} />
                )}
                {fee.paymentDate && (
                  <FeeRow label="Date" value={new Date(fee.paymentDate).toLocaleDateString()} />
                )}
                {fee.receiptNumber && (
                  <FeeRow label="Receipt #" value={fee.receiptNumber} />
                )}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.noData}>No fee records found.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function FeeRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.feeRow}>
      <Text style={styles.feeLabel}>{label}</Text>
      <Text style={[styles.feeValue, bold && { fontWeight: fontWeight.bold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  summaryCard: {
    flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg,
    marginBottom: spacing.xl,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: colors.muted, marginBottom: spacing.xs },
  summaryValue: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.foreground, textAlign: 'center' },
  summaryDivider: { width: 1, backgroundColor: colors.border },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginBottom: spacing.md },
  feeCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  feeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  feeTerm: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.foreground },
  statusBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  feeDetails: { gap: spacing.xs },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  feeLabel: { fontSize: fontSize.sm, color: colors.muted },
  feeValue: { fontSize: fontSize.sm, color: colors.foreground, fontWeight: fontWeight.medium },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
