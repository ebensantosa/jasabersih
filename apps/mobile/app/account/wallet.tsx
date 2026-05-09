import { Stack } from 'expo-router';

import { AccountLayout, WalletScreen } from '../../src/screens/account';
import { withAuth } from '../../src/components/AuthGate';

function Page() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountLayout title="Wallet & Pembayaran">
        <WalletScreen />
      </AccountLayout>
    </>
  );
}


export default withAuth(Page, 'customer');
