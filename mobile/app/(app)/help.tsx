import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { toast } from 'sonner-native';
import { Search, ChevronDown, ChevronUp } from 'lucide-react-native';

import { useFaqs, useMyTickets, useCreateTicket } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { useTheme } from '@/design';
import { space } from '@/design/tokens';
import {
  Screen, Section, Row, RowGroup, Text, Field, Button, Badge,
  Segmented, Empty, LoadingRows, statusTone, humanise,
} from '@/ui';

/**
 * Help, and asking for help.
 *
 * These were two screens, help and support, for one job. Somebody with a
 * problem does not know in advance whether it is a question with an answer or
 * a fault that needs reporting, and making them choose a screen first is
 * making them do the triage.
 *
 * So: search the answers, and if none of them fit, raise a ticket from the
 * same place, with what you searched for already in the box.
 */
export default function Help() {
  const t = useTheme();
  const [tab, setTab] = useState<'answers' | 'tickets'>('answers');
  const [query, setQuery] = useState('');
  const search = useDebounce(query, 300);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: faqs, isPending: faqsPending } = useFaqs(search || undefined);
  const { data: tickets, isPending: ticketsPending } = useMyTickets();
  const createTicket = useCreateTicket();

  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [raising, setRaising] = useState(false);

  const submit = () => {
    if (title.trim().length < 5) {
      toast.error('Give it a short title so somebody can pick it up');
      return;
    }
    createTicket.mutate(
      { title: title.trim(), description: detail.trim() } as never,
      {
        onSuccess: () => {
          toast.success('Sent. The office can see it now.');
          setTitle('');
          setDetail('');
          setRaising(false);
          setTab('tickets');
        },
        onError: () => toast.error('Could not send that'),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Help' }} />
      <Screen contentContainerStyle={{ gap: space.xl }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'answers', label: 'Answers' },
            { value: 'tickets', label: `Your questions ${tickets?.length ? tickets.length : ''}`.trim() },
          ]}
        />

        {tab === 'answers' ? (
          <>
            <Field
              label="What are you stuck on?"
              value={query}
              onChangeText={setQuery}
              placeholder="Marks, attendance, signing in"
              accessory={<Search size={18} color={t.fg.tertiary} strokeWidth={2} />}
            />

            {faqsPending ? (
              <LoadingRows count={5} />
            ) : !faqs?.length ? (
              <Empty
                title={search ? 'No answer for that yet' : 'Nothing published yet'}
                body="Ask the office directly and the answer may end up here for the next person."
                action={{ label: 'Ask a question', onPress: () => { setTitle(search); setRaising(true); setTab('tickets'); } }}
              />
            ) : (
              <Section title={`${faqs.length} answer${faqs.length === 1 ? '' : 's'}`}>
                <View style={{ gap: space.md }}>
                  {faqs.map((faq: any) => {
                    const open = openId === faq.id;
                    return (
                      <View key={faq.id} style={{ gap: space.sm }}>
                        <Row
                          title={faq.title}
                          value={
                            open ? (
                              <ChevronUp size={18} color={t.fg.tertiary} strokeWidth={2} />
                            ) : (
                              <ChevronDown size={18} color={t.fg.tertiary} strokeWidth={2} />
                            )
                          }
                          chevron={false}
                          inset={false}
                          onPress={() => setOpenId(open ? null : faq.id)}
                          last={!open}
                        />
                        {open ? (
                          <Text variant="body" tone="secondary" selectable style={{ paddingBottom: space.md }}>
                            {faq.content}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </Section>
            )}
          </>
        ) : (
          <>
            {raising ? (
              <Section title="Ask the office">
                <View style={{ gap: space.lg }}>
                  <Field label="In one line, what is wrong?" value={title} onChangeText={setTitle} required />
                  <Field
                    label="Anything else that would help"
                    hint="What you were doing, and what happened instead"
                    value={detail}
                    onChangeText={setDetail}
                    multiline
                    minHeight={120}
                  />
                  <View style={{ flexDirection: 'row', gap: space.md }}>
                    <Button label="Send it" kind="primary" loading={createTicket.isPending} onPress={submit} />
                    <Button label="Cancel" kind="quiet" onPress={() => setRaising(false)} />
                  </View>
                </View>
              </Section>
            ) : (
              <Button label="Ask the office something" kind="primary" block onPress={() => setRaising(true)} />
            )}

            {ticketsPending ? (
              <LoadingRows count={3} />
            ) : !tickets?.length ? (
              <Empty
                title="You have not asked anything yet"
                body="Anything you send goes straight to the office, and you can follow it here."
                action={{ label: 'Ask the office something', onPress: () => setRaising(true) }}
              />
            ) : (
              <Section title="What you have asked">
                <RowGroup>
                  {tickets.map((ticket: any, i: number) => (
                    <Row
                      key={ticket.id}
                      title={ticket.title}
                      subtitle={new Date(ticket.createdAt).toLocaleDateString()}
                      value={<Badge label={humanise(ticket.status)} tone={statusTone[ticket.status] ?? 'neutral'} />}
                      chevron={false}
                      last={i === tickets.length - 1}
                    />
                  ))}
                </RowGroup>
              </Section>
            )}
          </>
        )}
      </Screen>
    </>
  );
}
