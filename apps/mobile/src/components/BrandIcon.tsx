import { Image } from 'expo-image';
import { View } from 'react-native';

const WA_URL = 'https://jasabersih.com/wp-content/uploads/2026/04/WhatsApp.svg.webp';
const MAPS_URL = 'https://jasabersih.com/wp-content/uploads/2026/04/lg-66d5b131d7951-Google-Maps-Icon.webp';

export function WaIcon({ size = 22 }: { size?: number }) {
  return <Image source={WA_URL} style={{ width: size, height: size }} contentFit="contain" />;
}

export function MapsIcon({ size = 22 }: { size?: number }) {
  return <Image source={MAPS_URL} style={{ width: size, height: size }} contentFit="contain" />;
}

/** Wraps icon in a colored circle background — useful for buttons. */
export function BrandIconCircle({
  type,
  size = 40,
  iconSize = 22,
  bg = 'white',
}: {
  type: 'wa' | 'maps';
  size?: number;
  iconSize?: number;
  bg?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {type === 'wa' ? <WaIcon size={iconSize} /> : <MapsIcon size={iconSize} />}
    </View>
  );
}
