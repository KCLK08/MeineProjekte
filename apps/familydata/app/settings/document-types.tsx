import { useState } from 'react';
import { Alert, FlatList, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, PrimaryButton, Screen } from '@/components/ui';
import { useFamilyStore } from '@/store/familyStore';

export default function DocumentTypesScreen() {
  const insets = useSafeAreaInsets();
  const documentTypes = useFamilyStore((s) => s.documentTypes);
  const addDocumentType = useFamilyStore((s) => s.addDocumentType);
  const removeDocumentType = useFamilyStore((s) => s.removeDocumentType);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState(false);

  async function onAdd() {
    if (!name.trim()) {
      Alert.alert('Name fehlt');
      return;
    }
    try {
      await addDocumentType(name.trim(), expiry);
      setName('');
      setExpiry(false);
    } catch (e) {
      Alert.alert('Fehler', (e as Error).message);
    }
  }

  return (
    <Screen>
      <FlatList
        data={documentTypes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
        ListHeaderComponent={
          <View className="mb-5">
            <Text className="text-base text-mist">Systemtypen bleiben erhalten. Eigene Typen sind danach auswählbar.</Text>
            <Card className="mt-4">
              <Text className="mb-2 text-sm font-bold text-ink">Neuer Dokumenttyp</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="z. B. Impfausweis"
                placeholderTextColor="#6b7c74"
                className="mb-3 min-h-[48px] rounded-xl border border-line bg-sand px-3 text-base text-ink"
              />
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-sm text-ink">Ablaufdatum relevant</Text>
                <Switch value={expiry} onValueChange={setExpiry} />
              </View>
              <PrimaryButton label="Hinzufügen" onPress={onAdd} />
            </Card>
          </View>
        }
        renderItem={({ item }) => (
          <Card className="mb-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-base font-bold text-ink">{item.name}</Text>
                <Text className="mt-1 text-sm text-mist">
                  {item.isSystem ? 'System' : 'Eigen'} · Ablauf {item.expiryDateRelevant ? 'ja' : 'nein'}
                </Text>
              </View>
              {!item.isSystem ? (
                <PrimaryButton
                  label="Löschen"
                  tone="danger"
                  onPress={() =>
                    Alert.alert('Typ löschen?', item.name, [
                      { text: 'Abbrechen', style: 'cancel' },
                      {
                        text: 'Löschen',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await removeDocumentType(item.id);
                          } catch (e) {
                            Alert.alert('Nicht möglich', (e as Error).message);
                          }
                        },
                      },
                    ])
                  }
                />
              ) : null}
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
