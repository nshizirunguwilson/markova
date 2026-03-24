import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Smartphone, Radio, CreditCard, CheckCircle, XCircle, Clock, Phone } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { useInitiatePayment, usePaymentStatus } from '@/hooks/useApi';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, Input } from '@/components/ui';
import { colors, fontSize, fontWeight, spacing, radius } from '@/constants/theme';

type PaymentMethod = 'MOMO' | 'AIRTEL' | 'CARD';

const METHODS: { key: PaymentMethod; label: string; icon: React.ReactNode; description: string }[] = [
  {
    key: 'MOMO',
    label: 'MTN MoMo',
    icon: <Smartphone size={24} color={colors.warning} />,
    description: 'Pay via MTN Mobile Money',
  },
  {
    key: 'AIRTEL',
    label: 'Airtel Money',
    icon: <Radio size={24} color={colors.danger} />,
    description: 'Pay via Airtel Money',
  },
  {
    key: 'CARD',
    label: 'Card',
    icon: <CreditCard size={24} color={colors.primaryLight} />,
    description: 'Pay with Visa / Mastercard',
  },
];

export default function PayFeesScreen() {
  const router = useRouter();
  const { feeRecordId, balance: balanceParam, termName } = useLocalSearchParams<{
    feeRecordId: string;
    balance: string;
    termName: string;
  }>();

  const balanceNum = parseFloat(balanceParam ?? '0');

  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState(balanceParam ?? '0');
  const [paymentId, setPaymentId] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);

  const initiate = useInitiatePayment();
  const { data: paymentStatus } = usePaymentStatus(paymentId);

  const needsPhone = method === 'MOMO' || method === 'AIRTEL';
  const parsedAmount = parseFloat(amount) || 0;

  const handleSubmit = () => {
    if (!method) {
      toast.error('Please select a payment method');
      return;
    }
    if (parsedAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (parsedAmount > balanceNum) {
      toast.error('Amount cannot exceed the balance');
      return;
    }
    if (needsPhone && !phoneNumber.trim()) {
      toast.error('Phone number is required for mobile money');
      return;
    }

    initiate.mutate(
      {
        feeRecordId: feeRecordId!,
        amount: parsedAmount,
        method,
        phoneNumber: needsPhone ? phoneNumber.trim() : undefined,
      },
      {
        onSuccess: (data) => {
          setPaymentId(data.paymentId);
          setSubmitted(true);
          toast.success('Payment initiated');
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message || err?.message || 'Payment failed';
          toast.error(typeof msg === 'string' ? msg : msg[0]);
        },
      },
    );
  };

  // After submission, show status screen
  if (submitted && paymentId) {
    const status = paymentStatus?.status ?? 'PENDING';

    return (
      <View style={styles.container}>
        <ScreenHeader title="Payment Status" onBack={() => router.back()} />
        <View style={styles.statusContainer}>
          {status === 'PENDING' && (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Clock size={48} color={colors.warning} style={styles.statusIcon} />
              <Text style={styles.statusTitle}>Processing Payment</Text>
              <Text style={styles.statusMessage}>
                Your payment is being processed. Please wait...
              </Text>
              <Text style={styles.referenceText}>
                Ref: {paymentStatus?.reference ?? '...'}
              </Text>
            </>
          )}
          {status === 'SUCCESS' && (
            <>
              <CheckCircle size={64} color={colors.success} />
              <Text style={[styles.statusTitle, { color: colors.success }]}>Payment Successful</Text>
              <Text style={styles.statusMessage}>
                {parsedAmount.toLocaleString()} RWF has been paid successfully.
              </Text>
              <Text style={styles.referenceText}>
                Ref: {paymentStatus?.reference}
              </Text>
              <View style={styles.statusActions}>
                <Button title="Back to Fees" onPress={() => router.back()} fullWidth />
              </View>
            </>
          )}
          {status === 'FAILED' && (
            <>
              <XCircle size={64} color={colors.danger} />
              <Text style={[styles.statusTitle, { color: colors.danger }]}>Payment Failed</Text>
              <Text style={styles.statusMessage}>
                The payment could not be completed. Please try again.
              </Text>
              <Text style={styles.referenceText}>
                Ref: {paymentStatus?.reference}
              </Text>
              <View style={styles.statusActions}>
                <Button
                  title="Try Again"
                  onPress={() => {
                    setSubmitted(false);
                    setPaymentId(undefined);
                  }}
                  fullWidth
                />
                <Button title="Go Back" variant="outline" onPress={() => router.back()} fullWidth />
              </View>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Pay Fees" subtitle={termName} onBack={() => router.back()} />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Fee details */}
        <View style={styles.feeInfoCard}>
          <Text style={styles.feeInfoLabel}>Outstanding Balance</Text>
          <Text style={styles.feeInfoAmount}>{balanceNum.toLocaleString()} RWF</Text>
          <Text style={styles.feeInfoTerm}>{termName}</Text>
        </View>

        {/* Payment method selector */}
        <Text style={styles.sectionTitle}>Payment Method</Text>
        <View style={styles.methodsRow}>
          {METHODS.map((m) => (
            <Pressable
              key={m.key}
              style={[
                styles.methodCard,
                method === m.key && styles.methodCardActive,
              ]}
              onPress={() => setMethod(m.key)}
            >
              {m.icon}
              <Text
                style={[
                  styles.methodLabel,
                  method === m.key && styles.methodLabelActive,
                ]}
              >
                {m.label}
              </Text>
              <Text style={styles.methodDesc}>{m.description}</Text>
            </Pressable>
          ))}
        </View>

        {/* Phone number (for mobile money) */}
        {needsPhone && (
          <Input
            label="Phone Number"
            placeholder="07X XXX XXXX"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            leftIcon={<Phone size={18} color={colors.muted} />}
          />
        )}

        {/* Amount input */}
        <Input
          label="Amount (RWF)"
          placeholder="Enter amount to pay"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          error={
            parsedAmount > balanceNum
              ? `Amount cannot exceed ${balanceNum.toLocaleString()} RWF`
              : undefined
          }
        />

        {/* Submit */}
        <Button
          title={`Pay ${parsedAmount > 0 ? parsedAmount.toLocaleString() + ' RWF' : ''}`}
          onPress={handleSubmit}
          loading={initiate.isPending}
          disabled={!method || parsedAmount <= 0 || parsedAmount > balanceNum}
          fullWidth
          size="lg"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  contentContainer: { padding: spacing.lg, paddingBottom: spacing['5xl'] },

  // Fee info card
  feeInfoCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  feeInfoLabel: { fontSize: fontSize.sm, color: colors.accent, marginBottom: spacing.xs },
  feeInfoAmount: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.white },
  feeInfoTerm: { fontSize: fontSize.sm, color: colors.accent, marginTop: spacing.xs },

  // Section
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginBottom: spacing.md,
  },

  // Methods
  methodsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl },
  methodCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  methodCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentLight,
  },
  methodLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.foreground,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  methodLabelActive: { color: colors.primary },
  methodDesc: {
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 2,
  },

  // Status screen
  statusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  statusIcon: { marginTop: spacing.lg },
  statusTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.foreground,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  statusMessage: {
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  referenceText: {
    fontSize: fontSize.xs,
    color: colors.mutedLight,
    marginTop: spacing.md,
    fontFamily: 'monospace',
  },
  statusActions: {
    width: '100%',
    gap: spacing.md,
    marginTop: spacing['2xl'],
  },
});
