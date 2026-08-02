import { useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { toast } from 'sonner-native';

import { useSaveBook } from '@/hooks/useApi';
import { space } from '@/design/tokens';
import { Screen, Section, Text, Field, Button } from '@/ui';

/**
 * Adding a title.
 *
 * Quantity is the field people get wrong, so it says what it means: how many
 * physical copies are being added, not how many are on the shelf right now.
 * The available count is derived and never typed, because a librarian entering
 * both is a librarian who will eventually enter two numbers that disagree.
 */
export default function NewBook() {
  const router = useRouter();
  const save = useSaveBook();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [shelf, setShelf] = useState('');
  const [cost, setCost] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Needed';
    if (!author.trim()) next.author = 'Needed';
    if (!Number(quantity) || Number(quantity) < 1) next.quantity = 'At least one copy';
    setErrors(next);
    if (Object.keys(next).length) return;

    save.mutate(
      {
        title: title.trim(),
        author: author.trim(),
        isbn: isbn.trim() || undefined,
        category: category.trim() || undefined,
        quantity: Number(quantity),
        shelfLocation: shelf.trim() || undefined,
        replacementCost: cost ? Number(cost) : undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${title.trim()} added`);
          router.back();
        },
        onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not add that'),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Add a book' }} />
      <Screen contentContainerStyle={{ gap: space.xxl }}>
        <Section title="The book">
          <View style={{ gap: space.lg }}>
            <Field label="Title" value={title} onChangeText={setTitle} error={errors.title} required />
            <Field label="Author" value={author} onChangeText={setAuthor} error={errors.author} required />
            <Field label="Category" value={category} onChangeText={setCategory} placeholder="Fiction, Science, Kinyarwanda" />
          </View>
        </Section>

        <Section title="The copies">
          <View style={{ gap: space.lg }}>
            <Field
              label="How many copies"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              error={errors.quantity}
              hint="Physical copies being added. What is on the shelf is worked out from loans."
            />
            <Field label="Shelf" value={shelf} onChangeText={setShelf} placeholder="B3, upper" />
            <Field
              label="Replacement cost"
              value={cost}
              onChangeText={setCost}
              keyboardType="numeric"
              hint="Charged if a copy is reported lost"
            />
          </View>
        </Section>

        <Section title="Identifiers">
          <Field label="ISBN" value={isbn} onChangeText={setIsbn} mono autoCapitalize="none" />
        </Section>

        <Button label="Add it" kind="primary" block loading={save.isPending} onPress={submit} />
      </Screen>
    </>
  );
}
