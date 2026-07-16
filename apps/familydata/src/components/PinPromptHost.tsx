import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { registerPinAsker } from '@/security/access';
import { useAppTheme } from '@/theme/useAppTheme';

type Pending = {
  title: string;
  resolve: (value: string | null) => void;
};

export function PinPromptHost() {
  const { colors } = useAppTheme();
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState('');

  useEffect(() => {
    registerPinAsker((title) => {
      return new Promise<string | null>((resolve) => {
        setPin('');
        setPending({ title, resolve });
      });
    });
    return () => registerPinAsker(null);
  }, []);

  function finish(value: string | null) {
    pending?.resolve(value);
    setPending(null);
    setPin('');
  }

  return (
    <Modal visible={Boolean(pending)} transparent animationType="fade" onRequestClose={() => finish(null)}>
      <View className="flex-1 items-center justify-center bg-black/45 px-6">
        <View className="w-full max-w-sm rounded-2xl border border-line bg-paper p-5 dark:border-[#2a3f35] dark:bg-[#15241d]">
          <Text className="font-sansBold text-lg text-ink dark:text-[#e7f2ec]">{pending?.title}</Text>
          <Text className="mt-1 font-sans text-sm text-mute dark:text-[#9bb0a6]">PIN eingeben</Text>
          <TextInput
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            autoFocus
            placeholder="••••"
            placeholderTextColor={colors.placeholder}
            className="mt-4 rounded-xl border border-line px-3 py-3 font-sans text-base text-ink dark:border-[#2a3f35] dark:text-[#e7f2ec]"
          />
          <View className="mt-4 flex-row justify-end gap-3">
            <Pressable onPress={() => finish(null)} className="px-3 py-2">
              <Text className="font-sansBold text-mute">Abbrechen</Text>
            </Pressable>
            <Pressable onPress={() => finish(pin)} className="px-3 py-2">
              <Text className="font-sansBold text-pine-700 dark:text-pine-400">OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
