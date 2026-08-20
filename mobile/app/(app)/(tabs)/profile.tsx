import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Alert, Modal, RefreshControl, Image, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  User, Mail, Phone, Shield, LogOut, Edit3, Lock, Camera, X, Check,
  HelpCircle, LifeBuoy, FileText,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { toast } from 'sonner-native';
import { useAuthStore } from '@/stores/auth-store';
import api from '@/lib/api';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const [refreshing, setRefreshing] = useState(false);

  // Edit profile modal
  const [editVisible, setEditVisible] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Change password modal
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }, [loadProfile]);

  const handlePhotoUpload = async () => {
    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      toast.error('Permission to access photos is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingPhoto(true);
    try {
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append('photo', {
        uri: asset.uri,
        name: 'profile.jpg',
        type: 'image/jpeg',
      } as any);
      await api.post(`/users/${user?.id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadProfile();
      toast.success('Profile photo updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openEditProfile = () => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setPhone(user?.phone ?? '');
    setEditVisible(true);
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First and last name are required');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/auth/profile`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      });
      await loadProfile();
      setEditVisible(false);
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error('All fields are required');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setPasswordVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

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
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Pressable style={styles.avatarContainer} onPress={handlePhotoUpload} disabled={uploadingPhoto}>
            <View style={styles.avatar}>
              {user?.photoUrl ? (
                <Image source={{ uri: user.photoUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </Text>
              )}
            </View>
            <View style={styles.cameraBtn}>
              <Camera size={14} color={colors.white} />
            </View>
          </Pressable>
          <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{user?.role}</Text>
          </View>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        {/* Info cards */}
        <View style={styles.infoCard}>
          <InfoRow icon={<Mail size={20} color={colors.primary} />} label="Email" value={user?.email ?? '-'} />
          <InfoRow icon={<Phone size={20} color={colors.primary} />} label="Phone" value={user?.phone ?? 'Not set'} />
          <InfoRow icon={<Shield size={20} color={colors.primary} />} label="Role" value={user?.role ?? '-'} />
          <InfoRow icon={<User size={20} color={colors.primary} />} label="Status" value={user?.isActive ? 'Active' : 'Inactive'} last />
        </View>

        {/* Action buttons */}
        <View style={styles.actionsCard}>
          <Pressable onPress={openEditProfile} style={styles.actionRow}>
            <Edit3 size={20} color={colors.primary} />
            <Text style={styles.actionText}>Edit Profile</Text>
          </Pressable>
          <View style={styles.actionDivider} />
          <Pressable onPress={() => setPasswordVisible(true)} style={styles.actionRow}>
            <Lock size={20} color={colors.primary} />
            <Text style={styles.actionText}>Change Password</Text>
          </Pressable>
        </View>

        {/* Help & Support */}
        <View style={styles.actionsCard}>
          <Pressable onPress={() => router.push('/(app)/help')} style={styles.actionRow}>
            <HelpCircle size={20} color={colors.primary} />
            <Text style={styles.actionText}>FAQ & Help</Text>
          </Pressable>
          <View style={styles.actionDivider} />
          <Pressable onPress={() => router.push('/(app)/support')} style={styles.actionRow}>
            <LifeBuoy size={20} color={colors.primary} />
            <Text style={styles.actionText}>Support Tickets</Text>
          </Pressable>
        </View>

        {/* Logout */}
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <LogOut size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <Pressable onPress={() => setEditVisible(false)}>
                <X size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Input
              label="First Name"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
            />
            <Input
              label="Last Name"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
            />
            <Input
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              keyboardType="phone-pad"
            />
            <Button
              title="Save Changes"
              onPress={handleSaveProfile}
              loading={saving}
              fullWidth
              icon={<Check size={18} color={colors.white} />}
            />
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={passwordVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <Pressable onPress={() => { setPasswordVisible(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}>
                <X size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Input
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
              secureTextEntry
            />
            <Input
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password (min. 8 chars)"
              secureTextEntry
            />
            <Input
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              secureTextEntry
            />
            <Button
              title="Change Password"
              onPress={handleChangePassword}
              loading={changingPassword}
              fullWidth
              icon={<Lock size={18} color={colors.white} />}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
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
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },
  avatarSection: { alignItems: 'center', marginBottom: spacing['2xl'] },
  avatarContainer: { position: 'relative' },
  avatar: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 90, height: 90, borderRadius: 45 },
  avatarText: { fontSize: fontSize['2xl'], fontFamily: fontFamily.bold, color: colors.white },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
  },
  name: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, color: colors.foreground, marginTop: spacing.md },
  roleBadge: {
    backgroundColor: colors.accent, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginTop: spacing.sm,
  },
  roleText: { fontSize: fontSize.xs, fontFamily: fontFamily.semibold, color: colors.primary },
  email: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs, fontFamily: fontFamily.regular },
  infoCard: {
    backgroundColor: colors.white, borderRadius: radius['2xl'],
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.surfaceMuted },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: fontSize.xs, color: colors.muted, fontFamily: fontFamily.regular },
  infoValue: { fontSize: fontSize.base, color: colors.foreground, fontFamily: fontFamily.medium, marginTop: 2 },
  actionsCard: {
    backgroundColor: colors.white, borderRadius: radius['2xl'],
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    marginBottom: spacing.xl,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg,
  },
  actionDivider: { height: 1, backgroundColor: colors.surfaceMuted },
  actionText: { fontSize: fontSize.base, color: colors.foreground, fontFamily: fontFamily.medium },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.dangerWash, borderRadius: radius.xl,
    padding: spacing.lg, gap: spacing.sm,
  },
  logoutText: { fontSize: fontSize.base, fontFamily: fontFamily.semibold, color: colors.danger },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.xl, paddingBottom: spacing['3xl'],
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: { fontSize: fontSize.xl, fontFamily: fontFamily.bold, color: colors.foreground },
});
