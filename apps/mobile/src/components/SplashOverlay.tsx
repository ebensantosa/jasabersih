import { Image } from 'expo-image';
import { View } from 'react-native';

export function SplashOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: '#FFFFFF',
      }}
    >
      <Image
        source={require('../../assets/splash-logo.png')}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
      />
    </View>
  );
}
