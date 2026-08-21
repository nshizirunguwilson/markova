import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View } from 'react-native';
import { errorReporter } from '@/lib/error-reporting';
import { defaultTheme } from '@/design/theme';
import { space, type as typeScale, radius, curve, touch } from '@/design/tokens';
import { Text as UiText } from '@/ui/text';

/**
 * The last line of defence.
 *
 * Deliberately does not use the theme hook or any component that reads
 * context. If a provider is what crashed, anything that consumes a provider
 * crashes with it, and an error screen that throws is worse than no error
 * screen. So it reads the default theme directly and builds its own text.
 *
 * The technical detail is kept and made selectable, because the person looking
 * at this is usually about to describe it to somebody else.
 */

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    errorReporter.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const t = defaultTheme;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: t.bg.page,
          justifyContent: 'center',
          padding: space.xl,
          gap: space.lg,
        }}
      >
        <UiText variant="title1">Something broke</UiText>
        <UiText variant="body" tone="secondary">
          Not your fault. Closing the app and opening it again usually clears it. If it keeps
          happening, the office can pass this on.
        </UiText>

        <View
          style={{
            padding: space.md,
            backgroundColor: t.bg.fill,
            borderRadius: radius.md,
            ...curve,
          }}
        >
          <UiText variant="codeSmall" tone="tertiary" selectable>
            {error.message || String(error)}
          </UiText>
        </View>

        <View
          onTouchEnd={() => this.setState({ error: null })}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={{
            minHeight: touch.comfortable,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.md,
            backgroundColor: t.brand.solid,
            ...curve,
          }}
        >
          <UiText variant="bodyMedium" style={{ color: t.brand.onSolid }}>
            Try again
          </UiText>
        </View>
      </View>
    );
  }
}
