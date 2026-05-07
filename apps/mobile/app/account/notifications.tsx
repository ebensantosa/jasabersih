import { Stack } from 'expo-router';

import { AccountLayout, Notifications } from '../../src/screens/account';

export default function Page() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountLayout title="Notifikasi">
        <Notifications />
      </AccountLayout>
    </>
  );
}
