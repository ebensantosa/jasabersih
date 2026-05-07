import { Stack } from 'expo-router';

import { AccountLayout, Security } from '../../src/screens/account';

export default function Page() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountLayout title="Keamanan & Privasi">
        <Security />
      </AccountLayout>
    </>
  );
}
