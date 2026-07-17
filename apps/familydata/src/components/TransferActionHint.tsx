import { Text, View } from 'react-native';

/**
 * Small status line under the transfer timeline (act vs wait).
 */
export function TransferActionHint({ hint }: { hint: string | null | undefined }) {
  if (!hint) return null;
  return (
    <View className="mt-3 rounded-2xl border border-line bg-paper px-4 py-3 dark:border-[#2a3f35] dark:bg-[#15241d]">
      <Text className="font-sans text-[14px] leading-5 text-ink dark:text-[#e7f2ec]">{hint}</Text>
    </View>
  );
}
