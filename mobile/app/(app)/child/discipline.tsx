import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Alert, Modal } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CheckCircle, MapPin, Clock as ClockIcon, X, Send, FileText } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useStudentDiscipline, useAcknowledgeIncident, useCreateAppeal } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui/Input';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function ChildDisciplineScreen() {
  const router = useRouter();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useStudentDiscipline(studentId);
  const acknowledge = useAcknowledgeIncident();
  const createAppeal = useCreateAppeal();
  const [appealModalVisible, setAppealModalVisible] = useState(false);
  const [appealIncidentId, setAppealIncidentId] = useState('');
  const [appealReason, setAppealReason] = useState('');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleAcknowledge = (incidentId: string) => {
    Alert.alert(
      'Acknowledge Incident',
      'Are you sure you want to acknowledge this incident?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Acknowledge',
          onPress: () => acknowledge.mutate(incidentId, { onSuccess: () => refetch() }),
        },
      ]
    );
  };

  const actionColor = (action: string) => {
    if (action.includes('VERBAL')) return colors.warning;
    if (action.includes('WRITTEN')) return colors.warning;
    if (action.includes('DETENTION')) return colors.danger;
    if (action.includes('SUSPENSION')) return colors.danger;
    return colors.danger;
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Discipline" subtitle={name} onBack={() => router.back()} />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Summary */}
        {data && (
          <View style={styles.summaryCard}>
            <AlertTriangle size={24} color={colors.danger} />
            <View style={styles.summaryText}>
              <Text style={styles.summaryTitle}>{data.incidents?.length ?? 0} Incident(s)</Text>
              <Text style={styles.summarySubtitle}>
                Total points deducted: {data.totalPoints ?? 0}
              </Text>
            </View>
          </View>
        )}

        {/* Incidents */}
        {isLoading ? (
          <LoadingScreen />
        ) : data?.incidents && data.incidents.length > 0 ? (
          data.incidents.map((incident) => (
            <View key={incident.id} style={styles.incidentCard}>
              <View style={styles.incidentHeader}>
                <View style={[styles.actionBadge, { backgroundColor: actionColor(incident.actionTaken) + '20' }]}>
                  <Text style={[styles.actionText, { color: actionColor(incident.actionTaken) }]}>
                    {incident.actionTaken.replace(/_/g, ' ')}
                  </Text>
                </View>
                <Text style={styles.pointsBadge}>-{incident.pointsDeducted} pts</Text>
              </View>

              <Text style={styles.incidentDesc}>{incident.description}</Text>

              <View style={styles.incidentMeta}>
                <View style={styles.metaItem}>
                  <ClockIcon size={14} color={colors.muted} />
                  <Text style={styles.metaText}>
                    {new Date(incident.date).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                    {incident.time ? ` at ${incident.time}` : ''}
                  </Text>
                </View>
                {incident.location && (
                  <View style={styles.metaItem}>
                    <MapPin size={14} color={colors.muted} />
                    <Text style={styles.metaText}>{incident.location}</Text>
                  </View>
                )}
              </View>

              {/* Acknowledge + Appeal buttons for parent */}
              <View style={styles.incidentActions}>
                {!incident.isAcknowledged ? (
                  <Button
                    title="Acknowledge"
                    onPress={() => handleAcknowledge(incident.id)}
                    variant="outline"
                    size="sm"
                    loading={acknowledge.isPending}
                  />
                ) : (
                  <View style={styles.acknowledged}>
                    <CheckCircle size={16} color={colors.success} />
                    <Text style={styles.acknowledgedText}>Acknowledged</Text>
                  </View>
                )}
                <Pressable
                  style={styles.appealBtn}
                  onPress={() => {
                    setAppealIncidentId(incident.id);
                    setAppealReason('');
                    setAppealModalVisible(true);
                  }}
                >
                  <FileText size={14} color={colors.primary} />
                  <Text style={styles.appealBtnText}>Appeal</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.noData}>No discipline incidents on record.</Text>
        )}
      </ScrollView>

      {/* Appeal Modal */}
      <Modal visible={appealModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Submit Appeal</Text>
              <Pressable onPress={() => setAppealModalVisible(false)}>
                <X size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Explain why you believe this incident should be reviewed.
            </Text>
            <Input
              label="Reason for Appeal"
              placeholder="Describe your reason..."
              value={appealReason}
              onChangeText={setAppealReason}
              multiline
              numberOfLines={4}
            />
            <Button
              title="Submit Appeal"
              onPress={async () => {
                if (!appealReason.trim()) {
                  toast.error('Please provide a reason');
                  return;
                }
                try {
                  await createAppeal.mutateAsync({
                    incidentId: appealIncidentId,
                    reason: appealReason.trim(),
                  });
                  toast.success('Appeal submitted');
                  setAppealModalVisible(false);
                  refetch();
                } catch (err: any) {
                  toast.error(err?.response?.data?.message ?? 'Failed to submit appeal');
                }
              }}
              loading={createAppeal.isPending}
              fullWidth
              icon={<Send size={18} color={colors.white} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.dangerLight, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl,
  },
  summaryText: { flex: 1 },
  summaryTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.danger },
  summarySubtitle: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  incidentCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  incidentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  actionBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  actionText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  pointsBadge: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.danger },
  incidentDesc: { fontSize: fontSize.sm, color: colors.foreground, lineHeight: 20, marginBottom: spacing.md },
  incidentMeta: { gap: spacing.xs, marginBottom: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaText: { fontSize: fontSize.xs, color: colors.muted },
  incidentActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  acknowledged: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  acknowledgedText: { fontSize: fontSize.sm, color: colors.success, fontWeight: fontWeight.medium },
  appealBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.accentLight, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  appealBtnText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.xl, paddingBottom: spacing['3xl'],
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.foreground },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.muted, marginBottom: spacing.lg, lineHeight: 20 },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
