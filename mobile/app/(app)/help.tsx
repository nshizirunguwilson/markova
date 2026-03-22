import { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput, Pressable,
} from 'react-native';
import { Search, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useFaqs } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadingScreen } from '@/components/LoadingScreen';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

interface Faq {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export default function HelpScreen() {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useFaqs(search);

  const faqs: Faq[] = data ?? [];

  return (
    <View style={styles.container}>
      <ScreenHeader title="FAQ & Help" subtitle="Find answers to common questions" />

      <View style={styles.searchBar}>
        <Search size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search FAQs..."
          placeholderTextColor={colors.mutedLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <FlatList
          data={faqs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isExpanded = expandedId === item.id;
            return (
              <Pressable
                style={styles.faqCard}
                onPress={() => setExpandedId(isExpanded ? null : item.id)}
              >
                <View style={styles.faqHeader}>
                  <HelpCircle size={20} color={colors.primary} />
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  {isExpanded ? (
                    <ChevronUp size={20} color={colors.muted} />
                  ) : (
                    <ChevronDown size={20} color={colors.muted} />
                  )}
                </View>
                {isExpanded && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={styles.faqAnswer}>{item.answer}</Text>
                    {item.category && (
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryText}>{item.category}</Text>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <HelpCircle size={48} color={colors.mutedLight} />
              <Text style={styles.emptyTitle}>No FAQs Found</Text>
              <Text style={styles.emptyText}>
                {search.trim() ? 'Try a different search term.' : 'No FAQs available yet.'}
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['5xl'] }}
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
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.foreground, height: 36 },
  faqCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md,
    shadowColor: colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg,
  },
  faqQuestion: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.foreground },
  faqAnswerBox: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.md,
  },
  faqAnswer: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 22 },
  categoryBadge: {
    alignSelf: 'flex-start', marginTop: spacing.sm,
    backgroundColor: colors.accentLight, borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  categoryText: { fontSize: 10, color: colors.primary, fontWeight: fontWeight.semibold },
  empty: { alignItems: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.foreground, marginTop: spacing.lg },
  emptyText: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm, textAlign: 'center' },
});
