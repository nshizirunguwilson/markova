import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, TextInput, RefreshControl,
} from 'react-native';
import { Search, Shield, GraduationCap, BookOpen, Users as UsersIcon, ChevronDown } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ErrorScreen } from '@/components/ErrorScreen';
import { getErrorType, getErrorMessage } from '@/hooks/useQueryError';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

type RoleFilter = '' | 'ADMIN' | 'TEACHER' | 'PARENT' | 'STUDENT' | 'LIBRARIAN';

interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: string;
  photoUrl?: string;
}

export default function UsersScreen() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-users', search, roleFilter, page],
    queryFn: () =>
      api.get('/users', {
        params: {
          search: search.trim() || undefined,
          role: roleFilter || undefined,
          page,
          limit: 30,
        },
      }).then((r) => r.data),
  });

  const users: UserItem[] = data?.data ?? data?.users ?? (Array.isArray(data) ? data : []);
  const total = data?.meta?.total ?? data?.total ?? users.length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const roleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN': return <Shield size={14} color={colors.danger} />;
      case 'TEACHER': return <UsersIcon size={14} color={colors.primary} />;
      case 'STUDENT': return <GraduationCap size={14} color={colors.success} />;
      case 'LIBRARIAN': return <BookOpen size={14} color={colors.warning} />;
      default: return <UsersIcon size={14} color={colors.muted} />;
    }
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return colors.dangerWash;
      case 'TEACHER': return colors.accentLight;
      case 'STUDENT': return colors.successWash;
      case 'LIBRARIAN': return colors.warningWash;
      default: return colors.surfaceMuted;
    }
  };

  const roles: { label: string; value: RoleFilter }[] = [
    { label: 'All', value: '' },
    { label: 'Admin', value: 'ADMIN' },
    { label: 'Teacher', value: 'TEACHER' },
    { label: 'Student', value: 'STUDENT' },
    { label: 'Parent', value: 'PARENT' },
    { label: 'Librarian', value: 'LIBRARIAN' },
  ];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Users" subtitle={`${total} total`} />

      {/* Search */}
      <View style={styles.searchBar}>
        <Search size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={(t) => { setSearch(t); setPage(1); }}
        />
      </View>

      {/* Role filter */}
      <View style={styles.filterRow}>
        {roles.map((r) => (
          <Pressable
            key={r.value}
            style={[styles.filterChip, roleFilter === r.value && styles.filterChipActive]}
            onPress={() => { setRoleFilter(r.value); setPage(1); }}
          >
            <Text style={[styles.filterText, roleFilter === r.value && styles.filterTextActive]}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* User list */}
      {isLoading ? (
        <LoadingScreen />
      ) : error ? (
        <ErrorScreen type={getErrorType(error)} message={getErrorMessage(error)} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          renderItem={({ item }) => (
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.firstName?.[0]}{item.lastName?.[0]}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.userEmail}>{item.email}</Text>
              </View>
              <View style={styles.userMeta}>
                <View style={[styles.roleBadge, { backgroundColor: roleColor(item.role) }]}>
                  {roleIcon(item.role)}
                  <Text style={styles.roleText}>{item.role}</Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: item.isActive ? colors.success : colors.muted }]} />
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.noData}>No users found.</Text>
          }
          contentContainerStyle={{ paddingBottom: spacing['5xl'] }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, height: 36, fontFamily: fontFamily.regular },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm,
    marginBottom: spacing.sm, flexWrap: 'wrap',
  },
  filterChip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: fontSize.xs, color: colors.foreground, fontFamily: fontFamily.medium },
  filterTextActive: { color: colors.white },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted,
    backgroundColor: colors.white,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize.sm, fontFamily: fontFamily.bold, color: colors.white },
  userInfo: { flex: 1 },
  userName: { fontSize: fontSize.base, fontFamily: fontFamily.medium, color: colors.foreground },
  userEmail: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1, fontFamily: fontFamily.regular },
  userMeta: { alignItems: 'flex-end', gap: spacing.xs },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  roleText: { fontSize: 10, fontFamily: fontFamily.semibold, color: colors.foreground },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  noData: { fontSize: fontSize.sm, color: colors.muted, textAlign: 'center', padding: spacing['3xl'], fontFamily: fontFamily.regular },
});
