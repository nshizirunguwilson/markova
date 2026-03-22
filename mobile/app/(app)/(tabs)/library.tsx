import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, Pressable, RefreshControl,
} from 'react-native';
import { Search, BookOpen, Clock, AlertCircle, CheckCircle, User } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

type Tab = 'catalog' | 'active' | 'overdue';

interface Book {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  category?: string;
  totalCopies: number;
  availableCopies: number;
}

interface Loan {
  id: string;
  bookId: string;
  userId: string;
  borrowDate: string;
  dueDate: string;
  returnDate?: string;
  book?: Book;
  user?: { firstName: string; lastName: string; role: string };
}

export default function LibraryScreen() {
  const [tab, setTab] = useState<Tab>('catalog');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: booksData, isLoading: loadingBooks, refetch: refetchBooks } = useQuery({
    queryKey: ['library-books', search],
    queryFn: () =>
      api.get('/library/books', { params: { search: search.trim() || undefined, limit: 50 } }).then((r) => r.data),
    enabled: tab === 'catalog',
  });

  const { data: activeLoans, isLoading: loadingActive, refetch: refetchActive } = useQuery<Loan[]>({
    queryKey: ['library-active-loans'],
    queryFn: () => api.get('/library/loans/active').then((r) => r.data),
    enabled: tab === 'active',
  });

  const { data: overdueLoans, isLoading: loadingOverdue, refetch: refetchOverdue } = useQuery<Loan[]>({
    queryKey: ['library-overdue-loans'],
    queryFn: () => api.get('/library/loans/overdue').then((r) => r.data),
    enabled: tab === 'overdue',
  });

  const books: Book[] = booksData?.data ?? booksData ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (tab === 'catalog') await refetchBooks();
    else if (tab === 'active') await refetchActive();
    else await refetchOverdue();
    setRefreshing(false);
  }, [tab, refetchBooks, refetchActive, refetchOverdue]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'catalog', label: 'Catalog', icon: <BookOpen size={16} /> },
    { key: 'active', label: 'Active Loans', icon: <Clock size={16} /> },
    { key: 'overdue', label: 'Overdue', icon: <AlertCircle size={16} /> },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Library" />

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Search (catalog only) */}
      {tab === 'catalog' && (
        <View style={styles.searchBar}>
          <Search size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search books..."
            placeholderTextColor={colors.mutedLight}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      )}

      {/* Content */}
      {tab === 'catalog' && (
        loadingBooks ? <LoadingScreen /> : (
          <FlatList
            data={books}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            renderItem={({ item }) => (
              <View style={styles.bookCard}>
                <View style={styles.bookIcon}>
                  <BookOpen size={22} color={colors.primary} />
                </View>
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.bookAuthor}>{item.author}</Text>
                  {item.category && <Text style={styles.bookCategory}>{item.category}</Text>}
                </View>
                <View style={styles.bookAvail}>
                  <Text style={[styles.availCount, { color: item.availableCopies > 0 ? colors.success : colors.danger }]}>
                    {item.availableCopies}
                  </Text>
                  <Text style={styles.availLabel}>/{item.totalCopies}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.noData}>No books found.</Text>}
            contentContainerStyle={{ paddingBottom: spacing['5xl'] }}
          />
        )
      )}

      {tab === 'active' && (
        loadingActive ? <LoadingScreen /> : (
          <FlatList
            data={activeLoans ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            renderItem={({ item }) => <LoanRow loan={item} />}
            ListEmptyComponent={<Text style={styles.noData}>No active loans.</Text>}
            contentContainerStyle={{ paddingBottom: spacing['5xl'] }}
          />
        )
      )}

      {tab === 'overdue' && (
        loadingOverdue ? <LoadingScreen /> : (
          <FlatList
            data={overdueLoans ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            renderItem={({ item }) => <LoanRow loan={item} overdue />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <CheckCircle size={40} color={colors.success} />
                <Text style={styles.emptyTitle}>No Overdue Books</Text>
                <Text style={styles.noData}>All loans are within their due dates.</Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: spacing['5xl'] }}
          />
        )
      )}
    </View>
  );
}

function LoanRow({ loan, overdue }: { loan: Loan; overdue?: boolean }) {
  const daysLeft = Math.ceil(
    (new Date(loan.dueDate).getTime() - Date.now()) / 86400000
  );

  return (
    <View style={[styles.loanRow, overdue && styles.loanOverdue]}>
      <View style={styles.loanBookInfo}>
        <Text style={styles.loanTitle} numberOfLines={1}>{loan.book?.title ?? 'Book'}</Text>
        <View style={styles.loanUserRow}>
          <User size={12} color={colors.muted} />
          <Text style={styles.loanUser}>
            {loan.user?.firstName} {loan.user?.lastName}
          </Text>
        </View>
      </View>
      <View style={styles.loanDates}>
        <Text style={styles.loanDate}>
          Due: {new Date(loan.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </Text>
        <Text style={[styles.loanDays, { color: daysLeft < 0 ? colors.danger : daysLeft <= 3 ? colors.warning : colors.muted }]}>
          {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: fontSize.sm, color: colors.muted, fontWeight: fontWeight.medium },
  tabTextActive: { color: colors.primary, fontWeight: fontWeight.bold },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, height: 36 },
  bookCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    backgroundColor: colors.white,
  },
  bookIcon: {
    width: 42, height: 42, borderRadius: radius.lg, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.foreground },
  bookAuthor: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  bookCategory: { fontSize: 10, color: colors.primaryLight, marginTop: 2 },
  bookAvail: { alignItems: 'center' },
  availCount: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  availLabel: { fontSize: fontSize.xs, color: colors.muted },
  loanRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    backgroundColor: colors.white,
  },
  loanOverdue: { backgroundColor: colors.dangerLight },
  loanBookInfo: { flex: 1 },
  loanTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.foreground },
  loanUserRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 3 },
  loanUser: { fontSize: fontSize.xs, color: colors.muted },
  loanDates: { alignItems: 'flex-end' },
  loanDate: { fontSize: fontSize.xs, color: colors.muted },
  loanDays: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, marginTop: 2 },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing['3xl'] },
  emptyState: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground },
});
