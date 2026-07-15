import { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { Card, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="mb-4 text-base text-mist">
          Vorbereitung für Geräteschutz. Keine Server-Anmeldung. Verschlüsselung der DB folgt später.
        </Text>

        <SectionTitle>App-PIN</SectionTitle>
        <Card className="mb-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base text-ink">PIN aktiv</Text>
            <Switch
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
          <Text className="mb-2 text-sm text-mist">{pinConfigured ? 'PIN ist konfiguriert.' : 'Noch keine PIN gesetzt.'}</Text>
          <TextInput
            value={pinInput}
            onChangeText={setPinInput}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            placeholder="Neue PIN (4–8 Ziffern)"
            placeholderTextColor="#6b7c74"
            className="mb-2 min-h-[48px] rounded-xl border border-line bg-sand px-3 text-base text-ink"
          />
          <TextInput
            value={pinCheck}
            onChangeText={setPinCheck}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            placeholder="PIN wiederholen"
            placeholderTextColor="#6b7c74"
            className="mb-3 min-h-[48px] rounded-xl border border-line bg-sand px-3 text-base text-ink"
          />
          <PrimaryButton label="PIN speichern" onPress={onSavePin} />
          <View className="mt-2">
            <PrimaryButton
              label="PIN prüfen (Demo)"
              tone="ghost"
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
                tone="danger"
                onPress={async () => {
                  await clearPin();
                  await reload();
                }}
              />
            </View>
          ) : null}
        </Card>

        <SectionTitle>Biometrie</SectionTitle>
        <Card className="mb-4">
          <Text className="mb-3 text-sm text-mist">
            Hardware: {bioSupport.hasHardware ? 'ja' : 'nein'} · eingerichtet: {bioSupport.enrolled ? 'ja' : 'nein'}
          </Text>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base text-ink">Fingerabdruck / Face ID</Text>
            <Switch
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
            tone="ghost"
            onPress={async () => {
              const result = await authenticateBiometric();
              Alert.alert(result.success ? 'Erfolg' : 'Abgebrochen', result.success ? undefined : result.error);
            }}
          />
        </Card>

        <SectionTitle>Verschlüsselung</SectionTitle>
        <Card>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-base font-bold text-ink">Lokale Verschlüsselung</Text>
              <Text className="mt-1 text-sm text-mist">
                Vorbereitet – SQLCipher / File-Encryption kann später ergänzt werden.
              </Text>
            </View>
            <Switch value={false} disabled />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
