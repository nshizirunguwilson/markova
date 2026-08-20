import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, Pressable, RefreshControl, Alert, Modal,
} from 'react-native';
import {
  Search, BookOpen, Clock, AlertCircle, CheckCircle, User, ArrowDownRight, ArrowUpRight, Plus, X, BarChart3,
} from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner-native';
import api from '@/lib/api';
import { useCheckoutBook, useReturnBook, useLibraryAnalytics } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/auth-store';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorScreen } from '@/components/ErrorScreen';
import { getErrorType, getErrorMessage } from '@/hooks/useQueryError';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

type Tab = 'catalog' | 'active' | 'overdue' | 'stats';

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
  const user = useAuthStore((s) => s.user);
  const isLibrarian = user?.role === 'LIBRARIAN' || user?.role === 'ADMIN';
  const [tab, setTab] = useState<Tab>('catalog');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Checkout modal
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [borrowerSearch, setBorrowerSearch] = useState('');
  const [borrowerResults, setBorrowerResults] = useState<{ id: string; firstName: string; lastName: string; role: string }[]>([]);
  const [selectedBorrower, setSelectedBorrower] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [searchingBorrowers, setSearchingBorrowers] = useState(false);

  const checkout = useCheckoutBook();
  const returnBook = useReturnBook();

  const { data: booksData, isLoading: loadingBooks, error: booksError, refetch: refetchBooks } = useQuery({
    queryKey: ['library-books', search],
    queryFn: () =>
      api.get('/library/books', { params: { search: search.trim() || undefined, limit: 50 } }).then((r) => r.data),
    enabled: tab === 'catalog',
  });

  const { data: activeLoans, isLoading: loadingActive, error: activeError, refetch: refetchActive } = useQuery<Loan[]>({
    queryKey: ['library-active-loans'],
    queryFn: () => api.get('/library/loans/active').then((r) => r.data),
    enabled: tab === 'active',
  });

  const { data: overdueLoans, isLoading: loadingOverdue, error: overdueError, refetch: refetchOverdue } = useQuery<Loan[]>({
    queryKey: ['library-overdue-loans'],
    queryFn: () => api.get('/library/loans/overdue').then((r) => r.data),
    enabled: tab === 'overdue',
  });

  const { data: analytics, isLoading: loadingStats, error: statsError, refetch: refetchStats } = useLibraryAnalytics();

  const currentError = tab === 'catalog' ? booksError : tab === 'active' ? activeError : tab === 'overdue' ? overdueError : statsError;
  const currentRefetch = tab === 'catalog' ? refetchBooks : tab === 'active' ? refetchActive : tab === 'overdue' ? refetchOverdue : refetchStats;

  const books: Book[] = booksData?.data ?? booksData ?? [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (tab === 'catalog') await refetchBooks();
    else if (tab === 'active') await refetchActive();
    else if (tab === 'overdue') await refetchOverdue();
    else await refetchStats();
    setRefreshing(false);
  }, [tab, refetchBooks, refetchActive, refetchOverdue, refetchStats]);

  const handleCheckoutPress = (book: Book) => {
    if (book.availableCopies <= 0) {
      toast.error('No copies available');
      return;
    }
    setSelectedBook(book);
    setSelectedBorrower(null);
    setBorrowerSearch('');
    setBorrowerResults([]);
    setCheckoutVisible(true);
  };

  const searchBorrowers = async (q: string) => {
    setBorrowerSearch(q);
    if (q.trim().length < 2) { setBorrowerResults([]); return; }
    setSearchingBorrowers(true);
    try {
      const res = await api.get('/users', { params: { search: q.trim(), limit: 10 } });
      setBorrowerResults(res.data?.users ?? res.data ?? []);
    } catch {
      setBorrowerResults([]);
    } finally {
      setSearchingBorrowers(false);
    }
  };

  const handleCheckout = async () => {
    if (!selectedBook || !selectedBorrower) return;
    try {
      await checkout.mutateAsync({ bookId: selectedBook.id, userId: selectedBorrower.id });
      toast.success(`Checked out "${selectedBook.title}" to ${selectedBorrower.firstName}`);
      setCheckoutVisible(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Checkout failed');
    }
  };

  const handleReturn = (loan: Loan) => {
    Alert.alert(
      'Return Book',
      `Return "${loan.book?.title ?? 'Book'}" from ${loan.user?.firstName} ${loan.user?.lastName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Return',
          onPress: async () => {
            try {
              await returnBook.mutateAsync(loan.id);
              toast.success('Book returned successfully');
            } catch (err: any) {
              toast.error(err?.response?.data?.message ?? 'Return failed');
            }
          },
        },
      ]
    );
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'catalog', label: 'Catalog' },
    { key: 'active', label: 'Active' },
    { key: 'overdue', label: 'Overdue' },
    ...(isLibrarian ? [{ key: 'stats' as Tab, label: 'Stats' }] : []),
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
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      )}

      {/* Error state */}
      {currentError && (
        <ErrorScreen type={getErrorType(currentError)} message={getErrorMessage(currentError)} onRetry={() => currentRefetch()} />
      )}

      {/* Catalog */}
      {tab === 'catalog' && !currentError && (
        loadingBooks ? <LoadingScreen /> : (
          <FlatList
            data={books}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            renderItem={({ item }) => (
              <Pressable
                style={styles.bookCard}
                onPress={isLibrarian ? () => handleCheckoutPress(item) : undefined}
                disabled={!isLibrarian}
              >
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
                {isLibrarian && item.availableCopies > 0 && (
                  <ArrowDownRight size={18} color={colors.primary} />
                )}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.noData}>No books found.</Text>}
            contentContainerStyle={{ paddingBottom: spacing['5xl'] }}
          />
        )
      )}

      {/* Active Loans */}
      {tab === 'active' && !currentError && (
        loadingActive ? <LoadingScreen /> : (
          <FlatList
            data={activeLoans ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            renderItem={({ item }) => (
              <LoanRow loan={item} onReturn={isLibrarian ? () => handleReturn(item) : undefined} />
            )}
            ListEmptyComponent={<Text style={styles.noData}>No active loans.</Text>}
            contentContainerStyle={{ paddingBottom: spacing['5xl'] }}
          />
        )
      )}

      {/* Overdue */}
      {tab === 'overdue' && !currentError && (
        loadingOverdue ? <LoadingScreen /> : (
          <FlatList
            data={overdueLoans ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
            renderItem={({ item }) => (
              <LoanRow loan={item} overdue onReturn={isLibrarian ? () => handleReturn(item) : undefined} />
            )}
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

      {/* Stats */}
      {tab === 'stats' && !currentError && (
        loadingStats ? <LoadingScreen /> : (
          <View style={styles.statsContainer}>
            <View style={styles.statsGrid}>
              <StatBox label="Total Books" value={analytics?.totalBooks ?? '--'} color={colors.primary} />
              <StatBox label="Total Copies" value={analytics?.totalCopies ?? '--'} color={colors.primaryLight} />
              <StatBox label="Active Loans" value={analytics?.activeLoans ?? '--'} color={colors.warning} />
              <StatBox label="Overdue" value={analytics?.overdueLoans ?? '--'} color={colors.danger} />
            </View>
            {(analytics?.popularBooks?.length ?? 0) > 0 && (
              <View style={styles.popularSection}>
                <Text style={styles.popularTitle}>Popular Books</Text>
                {analytics!.popularBooks.slice(0, 5).map((b: any, i: number) => (
                  <View key={i} style={styles.popularRow}>
                    <Text style={styles.popularRank}>#{i + 1}</Text>
                    <Text style={styles.popularName} numberOfLines={1}>{b.title ?? b.book?.title ?? 'Unknown'}</Text>
                    <Text style={styles.popularCount}>{b.borrowCount ?? b._count ?? '--'} loans</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )
      )}

      {/* Checkout Modal */}
      <Modal visible={checkoutVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Checkout Book</Text>
              <Pressable onPress={() => setCheckoutVisible(false)}>
                <X size={24} color={colors.muted} />
              </Pressable>
            </View>

            {selectedBook && (
              <View style={styles.selectedBookBox}>
                <BookOpen size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectedBookTitle}>{selectedBook.title}</Text>
                  <Text style={styles.selectedBookAuthor}>{selectedBook.author}</Text>
                </View>
              </View>
            )}

            <Input
              label="Search Borrower"
              placeholder="Type name or email..."
              value={borrowerSearch}
              onChangeText={searchBorrowers}
            />

            {borrowerResults.length > 0 && !selectedBorrower && (
              <View style={styles.borrowerList}>
                {borrowerResults.map((b) => (
                  <Pressable
                    key={b.id}
                    style={styles.borrowerRow}
                    onPress={() => { setSelectedBorrower(b); setBorrowerResults([]); }}
                  >
                    <User size={16} color={colors.primary} />
                    <Text style={styles.borrowerName}>{b.firstName} {b.lastName}</Text>
                    <Text style={styles.borrowerRole}>{b.role}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {selectedBorrower && (
              <View style={styles.selectedBorrowerBox}>
                <User size={18} color={colors.success} />
                <Text style={styles.selectedBorrowerName}>
                  {selectedBorrower.firstName} {selectedBorrower.lastName}
                </Text>
                <Pressable onPress={() => setSelectedBorrower(null)}>
                  <X size={16} color={colors.muted} />
                </Pressable>
              </View>
            )}

            <Button
              title="Checkout"
              onPress={handleCheckout}
              loading={checkout.isPending}
              disabled={!selectedBorrower}
              fullWidth
              icon={<ArrowDownRight size={18} color={colors.white} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LoanRow({ loan, overdue, onReturn }: { loan: Loan; overdue?: boolean; onReturn?: () => void }) {
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
      {onReturn && (
        <Pressable onPress={onReturn} style={styles.returnBtn}>
          <ArrowUpRight size={16} color={colors.white} />
        </Pressable>
      )}
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={[styles.statBox, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  tabText: { fontSize: fontSize.sm, color: colors.muted, fontFamily: fontFamily.medium },
  tabTextActive: { color: colors.primary, fontFamily: fontFamily.bold },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, height: 36, fontFamily: fontFamily.regular },
  bookCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
    backgroundColor: colors.white,
  },
  bookIcon: {
    width: 42, height: 42, borderRadius: radius.xl, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: fontSize.base, fontFamily: fontFamily.medium, color: colors.foreground },
  bookAuthor: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1, fontFamily: fontFamily.regular },
  bookCategory: { fontSize: 10, color: colors.primaryLight, marginTop: 2, fontFamily: fontFamily.regular },
  bookAvail: { alignItems: 'center' },
  availCount: { fontSize: fontSize.lg, fontFamily: fontFamily.bold },
  availLabel: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.regular },
  loanRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
    backgroundColor: colors.white,
  },
  loanOverdue: { backgroundColor: colors.dangerWash },
  loanBookInfo: { flex: 1 },
  loanTitle: { fontSize: fontSize.sm, fontFamily: fontFamily.medium, color: colors.foreground },
  loanUserRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 3 },
  loanUser: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.regular },
  loanDates: { alignItems: 'flex-end', marginRight: spacing.sm },
  loanDate: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.regular },
  loanDays: { fontSize: fontSize.xs, fontFamily: fontFamily.bold, marginTop: 2 },
  returnBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing['3xl'], fontFamily: fontFamily.regular },
  emptyState: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.lg, fontFamily: fontFamily.semibold, color: colors.foreground },

  // Stats
  statsContainer: { flex: 1, padding: spacing.lg },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  statBox: {
    width: '47%', backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg,
    borderLeftWidth: 4,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  statValue: { fontSize: fontSize['2xl'], fontFamily: fontFamily.bold, color: colors.foreground },
  statLabel: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs, fontFamily: fontFamily.regular },
  popularSection: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg },
  popularTitle: { fontSize: fontSize.base, fontFamily: fontFamily.semibold, color: colors.foreground, marginBottom: spacing.md },
  popularRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
  },
  popularRank: { fontSize: fontSize.sm, fontFamily: fontFamily.bold, color: colors.primary, width: 28 },
  popularName: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, fontFamily: fontFamily.regular },
  popularCount: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.regular },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.xl, paddingBottom: spacing['3xl'],
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl,
  },
  modalTitle: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, color: colors.foreground },
  selectedBookBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.accentLight, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.lg,
  },
  selectedBookTitle: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, color: colors.foreground },
  selectedBookAuthor: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.regular },
  borrowerList: {
    backgroundColor: colors.background, borderRadius: radius.xl, marginBottom: spacing.md, maxHeight: 200,
  },
  borrowerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
  },
  borrowerName: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, fontFamily: fontFamily.regular },
  borrowerRole: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.regular },
  selectedBorrowerBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.successWash, borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.lg,
  },
  selectedBorrowerName: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, color: colors.foreground, flex: 1 },
});
