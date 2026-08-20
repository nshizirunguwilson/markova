import { View, Text, StyleSheet, Pressable } from 'react-native';
import { WifiOff, RefreshCw, ServerCrash } from 'lucide-react-native';
import { colors, fontSize, spacing, radius, fontFamily } from '@/constants/theme';

interface ErrorScreenProps {
  message?: string;
  onRetry?: () => void;
  type?: 'network' | 'server' | 'generic';
}

export function ErrorScreen({ message, onRetry, type = 'generic' }: ErrorScreenProps) {
  const Icon = type === 'network' ? WifiOff : type === 'server' ? ServerCrash : ServerCrash;
  const title = type === 'network'
    ? 'No Connection'
    : type === 'server'
      ? 'Server Error'
      : 'Something went wrong';

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Icon size={40} color={colors.muted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>
        {message ?? 'Please check your connection and try again.'}
      </Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.retryButton}>
          <RefreshCw size={16} color={colors.primary} />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  iconContainer: {
    width: 70, height: 70, borderRadius: 35, backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg, fontFamily: fontFamily.semibold,
    color: colors.foreground, marginBottom: spacing.sm,
  },
  message: {
    fontSize: fontSize.sm, color: colors.muted,
    textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl, fontFamily: fontFamily.regular },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.primary, borderRadius: radius.xl,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  retryText: { fontSize: fontSize.sm, fontFamily: fontFamily.semibold, color: colors.primary },
});
