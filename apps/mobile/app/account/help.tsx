import { Stack } from 'expo-router';

import { AccountLayout, Help } from '../../src/screens/account';

export default function Page() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountLayout title="Pusat Bantuan">
        <Help />
      </AccountLayout>
    </>
  );
}
