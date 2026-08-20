import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, RefreshControl, Modal,
} from 'react-native';
import {
  LifeBuoy, Plus, Clock, CheckCircle, AlertCircle, X, Send,
} from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useMyTickets, useCreateTicket } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: string;
  category?: string;
  createdAt: string;
}

export default function SupportScreen() {
  const { data: tickets, isLoading, refetch } = useMyTickets();
  const createTicket = useCreateTicket();
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error('Subject and description are required');
      return;
    }
    try {
      await createTicket.mutateAsync({
        subject: subject.trim(),
        description: description.trim(),
        category: category.trim() || undefined,
      });
      toast.success('Ticket submitted');
      setModalVisible(false);
      setSubject('');
      setDescription('');
      setCategory('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to submit ticket');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'OPEN': return <AlertCircle size={16} color={colors.warning} />;
      case 'IN_PROGRESS': return <Clock size={16} color={colors.primary} />;
      case 'RESOLVED': case 'CLOSED': return <CheckCircle size={16} color={colors.success} />;
      default: return <Clock size={16} color={colors.muted} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return colors.warning;
      case 'IN_PROGRESS': return colors.primary;
      case 'RESOLVED': case 'CLOSED': return colors.success;
      default: return colors.muted;
    }
  };

  const ticketList: Ticket[] = tickets ?? [];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Support Tickets" subtitle="Get help from admin" />

      <Pressable style={styles.newTicketBtn} onPress={() => setModalVisible(true)}>
        <Plus size={18} color={colors.white} />
        <Text style={styles.newTicketText}>New Ticket</Text>
      </Pressable>

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <FlatList
          data={ticketList}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          renderItem={({ item }) => (
            <View style={styles.ticketRow}>
              {getStatusIcon(item.status)}
              <View style={styles.ticketInfo}>
                <Text style={styles.ticketSubject} numberOfLines={1}>{item.subject}</Text>
                <Text style={styles.ticketDesc} numberOfLines={2}>{item.description}</Text>
                <Text style={styles.ticketDate}>
                  {new Date(item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                  {item.status.replace('_', ' ')}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <LifeBuoy size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>No Tickets Yet</Text>
              <Text style={styles.emptyText}>Submit a ticket if you need help.</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: spacing['5xl'] }}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Support Ticket</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <X size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Input
              label="Subject"
              placeholder="Brief summary of your issue"
              value={subject}
              onChangeText={setSubject}
            />
            <Input
              label="Description"
              placeholder="Describe the issue in detail..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />
            <Input
              label="Category (optional)"
              placeholder="e.g. Technical, Account, Billing"
              value={category}
              onChangeText={setCategory}
            />
            <Button
              title="Submit Ticket"
              onPress={handleSubmit}
              loading={createTicket.isPending}
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
  newTicketBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, marginHorizontal: spacing.lg, marginVertical: spacing.md,
    borderRadius: radius.xl, paddingVertical: spacing.md,
  },
  newTicketText: { fontSize: fontSize.base, fontFamily: fontFamily.semibold, color: colors.white },
  ticketRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted, backgroundColor: colors.white,
  },
  ticketInfo: { flex: 1 },
  ticketSubject: { fontSize: fontSize.base, fontFamily: fontFamily.medium, color: colors.foreground },
  ticketDesc: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2, lineHeight: 18, fontFamily: fontFamily.regular },
  ticketDate: { fontSize: fontSize.xs, color: colors.muted, marginTop: 4, fontFamily: fontFamily.regular },
  statusBadge: { borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { fontSize: 10, fontFamily: fontFamily.semibold, textTransform: 'uppercase' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semibold, color: colors.foreground, marginTop: spacing.lg },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm, fontFamily: fontFamily.regular },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.xl, paddingBottom: spacing['3xl'],
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl,
  },
  modalTitle: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, color: colors.foreground },
});
