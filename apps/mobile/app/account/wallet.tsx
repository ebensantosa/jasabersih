import { Stack } from 'expo-router';

import { AccountLayout, WalletScreen } from '../../src/screens/account';

export default function Page() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountLayout title="Wallet & Pembayaran">
        <WalletScreen />
      </AccountLayout>
    </>
  );
}
