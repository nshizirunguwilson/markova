import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CheckCircle, MapPin, Clock as ClockIcon } from 'lucide-react-native';
import { useStudentDiscipline, useAcknowledgeIncident } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Button } from '@/components/ui';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function ChildDisciplineScreen() {
  const router = useRouter();
  const { studentId, name } = useLocalSearchParams<{ studentId: string; name: string }>();
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useStudentDiscipline(studentId);
  const acknowledge = useAcknowledgeIncident();

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

              {/* Acknowledge button for parent */}
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
            </View>
          ))
        ) : (
          <Text style={styles.noData}>No discipline incidents on record.</Text>
        )}
      </ScrollView>
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
  acknowledged: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  acknowledgedText: { fontSize: fontSize.sm, color: colors.success, fontWeight: fontWeight.medium },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing.xl },
});
