import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { beginAutoLockSuppress, endAutoLockSuppress } from '@/security/autoLockSuppress';
import { useSecurityStore } from '@/store/securityStore';

export default function TransferHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isLocked = useSecurityStore((s) => s.isLocked);

  useEffect(() => {
    beginAutoLockSuppress();
    return () => endAutoLockSuppress();
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <Text className="mb-2 font-display text-3xl text-ink dark:text-[#e7f2ec]">Geräteübertragung</Text>
        <Text className="mb-6 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Phase 2–4A: Pairing, sicherer Kanal und Metadaten-Staging. Es werden noch keine Vault-Daten, Dokumente oder der
          Master Key übertragen.
        </Text>

        <SectionTitle>Optionen</SectionTitle>
        <Panel className="mb-4 px-4 py-4">
          <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Neues Gerät verbinden</Text>
          <Text className="mt-1 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
            Auf dem alten Gerät: Sitzung starten und QR-Code anzeigen. Danach Antwort-QR vom neuen Gerät
            scannen.
          </Text>
          <View className="mt-4">
            <PrimaryButton
              label="Neues Gerät verbinden"
              icon="phone-portrait-outline"
              disabled={isLocked}
              onPress={() => {
                TransferSessionManager.clear();
                router.push('/settings/transfer/host' as Href);
              }}
            />
          </View>
        </Panel>

        <Panel className="mb-5 px-4 py-4">
          <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Dieses Gerät einrichten</Text>
          <Text className="mt-1 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
            Auf dem neuen Gerät: QR-Code vom alten Gerät scannen und Antwort-QR zurückzeigen.
          </Text>
          <View className="mt-4">
            <PrimaryButton
              label="Daten übernehmen"
              tone="soft"
              icon="qr-code-outline"
              disabled={isLocked}
              onPress={() => {
                TransferSessionManager.clear();
                router.push('/settings/transfer/join' as Href);
              }}
            />
          </View>
        </Panel>

        <SectionTitle>Hinweis</SectionTitle>
        <Panel className="px-4 py-4">
          <View className="mb-2 flex-row">
            <StatusBadge label="Nur Pairing" tone="warn" />
          </View>
          <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
            Der gerätegebundene Master Key verlässt dieses Gerät nicht. Private Pairing-Schlüssel bleiben nur
            im Arbeitsspeicher und werden nach Abbruch oder Ablauf gelöscht.
          </Text>
        </Panel>
      </ScrollView>
    </Screen>
  );
}
