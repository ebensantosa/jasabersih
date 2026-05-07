import { Stack } from 'expo-router';

import { AccountLayout, SettingsView } from '../../src/screens/account';

export default function Page() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountLayout title="Pengaturan">
        <SettingsView />
      </AccountLayout>
    </>
  );
}
