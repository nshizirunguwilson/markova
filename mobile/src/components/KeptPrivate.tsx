import { EyeOff } from 'lucide-react-native';
import { useTheme } from '@/design';
import { Empty } from '@/ui';

/**
 * Something an adult child keeps from their parents (A8). Said as a choice,
 * in the API's own sentence, so a parent does not read it as "nothing
 * recorded" or as something broken.
 */
export function KeptPrivate({ message }: { message: string }) {
  const t = useTheme();
  return (
    <Empty
      icon={<EyeOff size={30} color={t.fg.placeholder} strokeWidth={1.6} />}
      title={message}
      body="From 18, a student decides what their parents see. Fees are always shared with whoever pays them."
    />
  );
}
