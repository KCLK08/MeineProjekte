import { useRouter, type Href } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Panel, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { useSecurityStore } from '@/store/securityStore';

export default function TransferHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isLocked = useSecurityStore((s) => s.isLocked);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <Text className="mb-2 font-display text-3xl text-ink dark:text-[#e7f2ec]">Geräteübertragung</Text>
        <Text className="mb-6 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Übertrage deine FamilyData-Daten sicher auf ein neues Gerät. Deine Daten verlassen niemals deine Geräte.
        </Text>

        <SectionTitle>Was möchtest du tun?</SectionTitle>
        <Panel className="mb-4 px-4 py-4">
          <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Neues Gerät verbinden</Text>
          <Text className="mt-1 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
            Dieses Gerät enthält deine Daten und sendet sie an ein neues Gerät.
          </Text>
          <View className="mt-4">
            <PrimaryButton
              label="Übertragung starten"
              icon="phone-portrait-outline"
              disabled={isLocked}
              onPress={() => {
                void TransferSessionManager.clear().then(() =>
                  router.push('/settings/transfer/host' as Href)
                );
              }}
            />
          </View>
        </Panel>

        <Panel className="mb-5 px-4 py-4">
          <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Daten übernehmen</Text>
          <Text className="mt-1 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
            Übernimm deine FamilyData-Vault von einem anderen Gerät.
          </Text>
          <View className="mt-4">
            <PrimaryButton
              label="Daten empfangen"
              tone="soft"
              icon="qr-code-outline"
              disabled={isLocked}
              onPress={() => {
                void TransferSessionManager.clear().then(() =>
                  router.push('/settings/transfer/join' as Href)
                );
              }}
            />
          </View>
        </Panel>

        <SectionTitle>Sicherheit</SectionTitle>
        <Panel className="px-4 py-4">
          <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
            Die Übertragung läuft nur zwischen deinen Geräten im gleichen WLAN. Dein Tresor-Schlüssel bleibt immer auf
            dem jeweiligen Gerät.
          </Text>
        </Panel>
      </ScrollView>
    </Screen>
  );
}
