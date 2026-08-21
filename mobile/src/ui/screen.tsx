import { type ReactNode } from 'react';
import { ScrollView, View, RefreshControl, type ScrollViewProps } from 'react-native';
import { useTheme } from '@/design/provider';
import { gutter, space } from '@/design/tokens';
import { Text } from './text';

/**
 * The page. Every screen in the app starts with one of these.
 *
 * It exists so that safe area, the gutter and the scroll behaviour are decided
 * once. `contentInsetAdjustmentBehavior="automatic"` lets the platform work
 * out the top and bottom insets against whatever header and tab bar happen to
 * be present, which is more reliable than adding up insets by hand and is why
 * there is no SafeAreaView here.
 *
 * Padding lives on contentContainerStyle rather than on the ScrollView so that
 * content does not clip against the edge while it scrolls.
 */

interface ScreenProps extends Omit<ScrollViewProps, 'children'> {
  children: ReactNode;
  /** Turn off for screens that manage their own list, like a FlatList. */
  scroll?: boolean;
  /** Removes the horizontal gutter for full-bleed rows and dividers. */
  bleed?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  footer?: ReactNode;
}

export function Screen({
  children,
  scroll = true,
  bleed = false,
  onRefresh,
  refreshing = false,
  footer,
  contentContainerStyle,
  ...rest
}: ScreenProps) {
  const t = useTheme();

  const body = (
    <ScrollView
      {...rest}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        {
          paddingHorizontal: bleed ? 0 : gutter,
          paddingTop: space.lg,
          paddingBottom: space.huge,
          gap: space.xl,
        },
        contentContainerStyle,
      ]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.fg.tertiary}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.page }}>
      {scroll ? body : <View style={{ flex: 1 }}>{children}</View>}
      {footer}
    </View>
  );
}

/**
 * A group of related things under a quiet label.
 *
 * The label is the only place caps and wide tracking appear in the whole
 * system. Making it the single exception is what keeps it readable as a label
 * rather than as shouting.
 */
export function Section({
  title,
  action,
  children,
  gap = space.md,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  gap?: number;
}) {
  return (
    <View style={{ gap: space.md }}>
      {(title || action) && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space.md,
            paddingHorizontal: 2,
          }}
        >
          {title ? (
            <Text variant="caption" tone="tertiary" caps>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      )}
      <View style={{ gap }}>{children}</View>
    </View>
  );
}
