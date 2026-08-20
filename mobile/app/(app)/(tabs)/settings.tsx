import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Settings as SettingsIcon, School, Globe, Mail, Phone, Image, Shield, LogOut,
  ChevronRight, Database, Bell,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Logo } from '@/components/Logo';
import { useBrandStore } from '@/stores/brand-store';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

interface ConfigItem {
  id: string;
  key: string;
  value: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [refreshing, setRefreshing] = useState(false);

  const { data: configs, isLoading, refetch } = useQuery<ConfigItem[]>({
    queryKey: ['school-config'],
    queryFn: () => api.get('/school-config').then((r) => r.data?.configs ?? r.data),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const getConfig = (key: string) => configs?.find((c) => c.key === key)?.value ?? '--';

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

  const sections = [
    {
      title: 'School Information',
      items: [
        { icon: <School size={20} color={colors.primary} />, label: 'School Name', value: getConfig('school_name') },
        { icon: <Globe size={20} color={colors.primary} />, label: 'Motto', value: getConfig('school_motto') },
        { icon: <Mail size={20} color={colors.primary} />, label: 'Email', value: getConfig('school_email') },
        { icon: <Phone size={20} color={colors.primary} />, label: 'Phone', value: getConfig('school_phone') },
        { icon: <Globe size={20} color={colors.primary} />, label: 'Address', value: getConfig('school_address') },
      ],
    },
    {
      title: 'System',
      items: [
        { icon: <Image size={20} color={colors.primary} />, label: 'Logo', value: getConfig('logo_url') ? 'Configured' : 'Not set' },
        { icon: <Shield size={20} color={colors.primary} />, label: 'Stamp', value: getConfig('stamp_url') ? 'Configured' : 'Not set' },
        { icon: <Database size={20} color={colors.primary} />, label: 'Grading System', value: getConfig('grading_system') },
      ],
    },
  ];

  const schoolName = useBrandStore((s) => s.schoolName);
  const schoolMotto = useBrandStore((s) => s.schoolMotto);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Settings" />
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* The school's actual identity, not just a "Configured" label */}
        <View style={styles.brandCard}>
          <Logo size={64} />
          <Text style={styles.brandName}>{schoolName}</Text>
          {schoolMotto ? <Text style={styles.brandMotto}>{schoolMotto}</Text> : null}
        </View>

        {isLoading ? (
          <LoadingScreen />
        ) : (
          sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionCard}>
                {section.items.map((item, i) => (
                  <View
                    key={item.label}
                    style={[styles.settingRow, i < section.items.length - 1 && styles.settingRowBorder]}
                  >
                    {item.icon}
                    <View style={styles.settingContent}>
                      <Text style={styles.settingLabel}>{item.label}</Text>
                      <Text style={styles.settingValue} numberOfLines={1}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        <Text style={styles.hint}>
          School settings can be managed from the web dashboard.
        </Text>

        {/* Logout */}
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <LogOut size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  brandCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brandName: {
    fontSize: fontSize.lg,
    fontFamily: fontFamily.bold,
    color: colors.foreground,
  },
  brandMotto: {
    fontSize: fontSize.sm,
    color: colors.muted,
    fontStyle: 'italic',
    fontFamily: fontFamily.regular,
  },
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  section: { marginBottom: spacing.xl },
  sectionTitle: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, color: colors.muted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCard: {
    backgroundColor: colors.white, borderRadius: radius['2xl'],
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg,
  },
  settingRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: fontSize.sm, color: colors.muted, fontFamily: fontFamily.regular },
  settingValue: { fontSize: fontSize.base, color: colors.foreground, fontFamily: fontFamily.medium, marginTop: 2 },
  hint: { fontSize: fontSize.xs, color: colors.muted, textAlign: 'center', marginVertical: spacing.xl, lineHeight: 18, fontFamily: fontFamily.regular },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.dangerWash, borderRadius: radius.xl,
    padding: spacing.lg, gap: spacing.sm,
  },
  logoutText: { fontSize: fontSize.base, fontFamily: fontFamily.semibold, color: colors.danger },
});
