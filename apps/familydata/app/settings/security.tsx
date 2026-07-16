import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import {
  authenticateBiometric,
  clearPin,
  getBiometricSupport,
  getSecurityFlags,
  savePin,
  setBiometricsEnabled,
  setPinEnabled,
  verifyPin,
} from '@/security/lock';

export default function SecurityScreen() {
  const [pinEnabled, setPinEnabledState] = useState(false);
  const [bioEnabled, setBioEnabledState] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(false);
  const [bioSupport, setBioSupport] = useState({ hasHardware: false, enrolled: false });
  const [pinInput, setPinInput] = useState('');
  const [pinCheck, setPinCheck] = useState('');

  async function reload() {
    const flags = await getSecurityFlags();
    setPinEnabledState(flags.pinEnabled);
    setBioEnabledState(flags.biometricsEnabled);
    setPinConfigured(flags.pinConfigured);
    setBioSupport(await getBiometricSupport());
  }

  useEffect(() => {
    reload();
  }, []);

  async function onSavePin() {
    try {
      if (pinInput !== pinCheck) throw new Error('PINs stimmen nicht überein.');
      await savePin(pinInput);
      setPinInput('');
      setPinCheck('');
      await reload();
      Alert.alert('PIN gespeichert', 'Nur lokal auf diesem Gerät (Demo-Hash).');
    } catch (e) {
      Alert.alert('PIN', (e as Error).message);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute">
          Geräteschutz ohne Account. PIN und Biometrie bleiben auf diesem Handy – keine Cloud-Anmeldung.
        </Text>

        <SectionTitle>App-PIN</SectionTitle>
        <Panel className="mb-5 py-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-sansMedium text-base text-ink">PIN aktiv</Text>
            <Switch
              trackColor={{ true: '#1f7a5c' }}
              value={pinEnabled}
              onValueChange={async (v) => {
                if (v && !pinConfigured) {
                  Alert.alert('Zuerst PIN setzen');
                  return;
                }
                await setPinEnabled(v);
                setPinEnabledState(v);
              }}
            />
          </View>
          <View className="mb-3">
            <StatusBadge
              label={pinConfigured ? 'PIN konfiguriert' : 'Noch keine PIN'}
              tone={pinConfigured ? 'ok' : 'neutral'}
            />
          </View>
          <TextInput
            value={pinInput}
            onChangeText={setPinInput}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            placeholder="Neue PIN (4–8 Ziffern)"
            placeholderTextColor="#7a9086"
            className="mb-2 min-h-[50px] rounded-2xl border border-line bg-canvas px-3.5 font-sans text-base text-ink"
          />
          <TextInput
            value={pinCheck}
            onChangeText={setPinCheck}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            placeholder="PIN wiederholen"
            placeholderTextColor="#7a9086"
            className="mb-3 min-h-[50px] rounded-2xl border border-line bg-canvas px-3.5 font-sans text-base text-ink"
          />
          <PrimaryButton label="PIN speichern" icon="key-outline" onPress={onSavePin} />
          <View className="mt-2">
            <PrimaryButton
              label="PIN prüfen"
              tone="soft"
              onPress={async () => {
                const ok = await verifyPin(pinInput);
                Alert.alert(ok ? 'Korrekt' : 'Falsch');
              }}
            />
          </View>
          {pinConfigured ? (
            <View className="mt-2">
              <PrimaryButton
                label="PIN entfernen"
                tone="ghost"
                icon="trash-outline"
                onPress={async () => {
                  await clearPin();
                  await reload();
                }}
              />
            </View>
          ) : null}
        </Panel>

        <SectionTitle>Biometrie</SectionTitle>
        <Panel className="mb-5 py-4">
          <View className="mb-3 flex-row flex-wrap gap-2">
            <StatusBadge label={bioSupport.hasHardware ? 'Hardware ja' : 'Hardware nein'} tone={bioSupport.hasHardware ? 'ok' : 'neutral'} />
            <StatusBadge label={bioSupport.enrolled ? 'Eingerichtet' : 'Nicht eingerichtet'} tone={bioSupport.enrolled ? 'ok' : 'warn'} />
          </View>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-sansMedium text-base text-ink">Fingerabdruck / Face ID</Text>
            <Switch
              trackColor={{ true: '#1f7a5c' }}
              value={bioEnabled}
              onValueChange={async (v) => {
                if (v && !(bioSupport.hasHardware && bioSupport.enrolled)) {
                  Alert.alert('Biometrie', 'Auf diesem Gerät nicht verfügbar.');
                  return;
                }
                await setBiometricsEnabled(v);
                setBioEnabledState(v);
              }}
            />
          </View>
          <PrimaryButton
            label="Biometrie testen"
            tone="soft"
            icon="finger-print-outline"
            onPress={async () => {
              const result = await authenticateBiometric();
              Alert.alert(result.success ? 'Erfolg' : 'Abgebrochen', result.success ? undefined : result.error);
            }}
          />
        </Panel>

        <SectionTitle>Verschlüsselung</SectionTitle>
        <Panel className="py-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-sansBold text-base text-ink">Lokale Verschlüsselung</Text>
              <Text className="mt-1 font-sans text-sm leading-5 text-mute">
                Vorbereitet – SQLCipher / Dateiverschlüsselung folgt später.
              </Text>
            </View>
            <Switch value={false} disabled />
          </View>
        </Panel>
      </ScrollView>
    </Screen>
  );
}
