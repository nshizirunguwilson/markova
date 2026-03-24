import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react-native';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <AlertTriangle size={48} color={colors.danger} />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            An unexpected error occurred. Please try again.
          </Text>
          {__DEV__ && this.state.error && (
            <ScrollView style={styles.errorBox} contentContainerStyle={styles.errorBoxContent}>
              <Text style={styles.errorText}>{this.state.error.message}</Text>
            </ScrollView>
          )}
          <Pressable onPress={this.handleRetry} style={styles.retryButton}>
            <RefreshCw size={18} color={colors.white} />
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  iconContainer: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.dangerLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xl, fontWeight: fontWeight.bold,
    color: colors.foreground, marginBottom: spacing.sm,
  },
  message: {
    fontSize: fontSize.base, color: colors.muted,
    textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl,
  },
  errorBox: {
    maxHeight: 120, width: '100%', backgroundColor: colors.borderLight,
    borderRadius: radius.lg, marginBottom: spacing.xl,
  },
  errorBoxContent: { padding: spacing.md },
  errorText: { fontSize: fontSize.xs, color: colors.danger, fontFamily: 'monospace' },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  retryText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.white },
});
