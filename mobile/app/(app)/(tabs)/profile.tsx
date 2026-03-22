import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { User, Mail, Phone, Shield, LogOut } from 'lucide-react-native';
import { useAuthStore } from '@/stores/auth-store';
import { ScreenHeader } from '@/components/ScreenHeader';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Profile" />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </Text>
          </View>
          <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role}</Text>
          </View>
        </View>

        {/* Info cards */}
        <View style={styles.infoCard}>
          <InfoRow icon={<Mail size={20} color={colors.primary} />} label="Email" value={user?.email ?? '-'} />
          <InfoRow icon={<Phone size={20} color={colors.primary} />} label="Phone" value={user?.phone ?? 'Not set'} />
          <InfoRow icon={<Shield size={20} color={colors.primary} />} label="Status" value={user?.isActive ? 'Active' : 'Inactive'} />
        </View>

        {/* Logout */}
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <LogOut size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      {icon}
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg },
  avatarSection: { alignItems: 'center', marginBottom: spacing['2xl'] },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.white },
  name: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.foreground, marginTop: spacing.md },
  roleBadge: {
    backgroundColor: colors.accent, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginTop: spacing.sm,
  },
  roleText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.primary },
  infoCard: {
    backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    marginBottom: spacing.xl,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  infoContent: { marginLeft: spacing.md, flex: 1 },
  infoLabel: { fontSize: fontSize.xs, color: colors.muted },
  infoValue: { fontSize: fontSize.base, color: colors.foreground, fontWeight: fontWeight.medium, marginTop: 2 },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.dangerLight, borderRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm,
  },
  logoutText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.danger },
});
