import { useMemo } from 'react';
import { SectionList, View } from 'react-native';
import { BellOff, Check } from 'lucide-react-native';

import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/useApi';
import { useTheme } from '@/design';
import { gutter, space } from '@/design/tokens';
import { Row, Text, Empty, LoadingRows, Failed, Button } from '@/ui';
import type { Notification } from '@/types';

/**
 * Alerts.
 *
 * Grouped by when rather than by kind. A parent does not think "show me my
 * discipline notifications", they think "what happened while I was not
 * looking", so the sections are Today, This week, and Earlier.
 *
 * Unread is marked with a dot on the left rather than by tinting the whole
 * row. A tinted row in a list of tinted rows stops meaning anything, and the
 * dot survives being colour blind because it is a shape appearing rather than
 * a hue changing.
 */

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export default function Alerts() {
  const t = useTheme();
  const { data, isPending, isError, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const sections = useMemo(() => {
    const today = startOfToday();
    const week = today - 6 * 86_400_000;
    const buckets: Record<string, Notification[]> = { Today: [], 'This week': [], Earlier: [] };

    for (const n of data ?? []) {
      const at = new Date(n.createdAt).getTime();
      if (at >= today) buckets.Today.push(n);
      else if (at >= week) buckets['This week'].push(n);
      else buckets.Earlier.push(n);
    }

    return Object.entries(buckets)
      .filter(([, items]) => items.length > 0)
      .map(([title, items]) => ({ title, data: items }));
  }, [data]);

  const unread = (data ?? []).filter((n) => !n.isRead).length;

  if (isPending)
    return (
      <View style={{ flex: 1, backgroundColor: t.bg.page }}>
        <LoadingRows count={7} />
      </View>
    );

  if (isError)
    return (
      <View style={{ flex: 1, backgroundColor: t.bg.page }}>
        <Failed onRetry={refetch} />
      </View>
    );

  if (!data?.length)
    return (
      <View style={{ flex: 1, backgroundColor: t.bg.page }}>
        <Empty
          icon={<BellOff size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
          title="Nothing yet"
          body="Marks being published, attendance concerns and discipline notes all arrive here."
        />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.page }}>
      {unread > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: gutter,
            paddingVertical: space.md,
          }}
        >
          <Text variant="subhead" tone="secondary" numeric>
            {unread} unread
          </Text>
          <Button
            label="Mark all read"
            kind="quiet"
            icon={<Check size={16} color={t.brand.text} strokeWidth={2} />}
            onPress={() => markAll.mutate()}
          />
        </View>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={refetch}
        refreshing={isRefetching}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: space.huge }}
        renderSectionHeader={({ section }) => (
          <Text
            variant="caption"
            tone="tertiary"
            caps
            style={{ paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.sm }}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => (
          <Row
            title={item.title}
            subtitle={item.message}
            lead={
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: item.isRead ? 'transparent' : t.brand.solid,
                }}
              />
            }
            value={new Date(item.createdAt).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            })}
            chevron={false}
            onPress={item.isRead ? undefined : () => markRead.mutate(item.id)}
            last={index === section.data.length - 1}
          />
        )}
      />
    </View>
  );
}
