import { Stack } from 'expo-router';

import { AccountLayout, Addresses } from '../../src/screens/account';

export default function Page() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountLayout title="Alamat Tersimpan">
        <Addresses />
      </AccountLayout>
    </>
  );
}
