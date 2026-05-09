import { Stack } from 'expo-router';

import { AccountLayout, Addresses } from '../../src/screens/account';
import { withAuth } from '../../src/components/AuthGate';

function Page() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountLayout title="Alamat Tersimpan">
        <Addresses />
      </AccountLayout>
    </>
  );
}


export default withAuth(Page, 'customer');
