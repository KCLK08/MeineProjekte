import QRCode from 'react-native-qrcode-svg';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

export function PairingQrDisplay({ value, label }: { value: string; label?: string }) {
  const { colors, scheme } = useAppTheme();
  return (
    <View className="items-center">
      {label ? (
        <Text className="mb-3 font-sansMedium text-sm text-mute dark:text-[#9bb0a6]">{label}</Text>
      ) : null}
      <View
        className="rounded-3xl border border-line bg-paper p-4 dark:border-[#2a3f35] dark:bg-[#15241d]"
        style={{ backgroundColor: scheme === 'dark' ? '#f7fbf8' : colors.paper }}
      >
        <QRCode
          value={value}
          size={220}
          color="#10241c"
          backgroundColor="#f7fbf8"
          ecl="M"
        />
      </View>
    </View>
  );
}
