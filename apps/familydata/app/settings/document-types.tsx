import { useState } from 'react';
import { Alert, FlatList, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListRow, Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
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
        contentContainerStyle={{ padding: 20, paddingBottom: 24 + insets.bottom }}
        ListHeaderComponent={
          <View className="mb-5">
            <Text className="mb-4 font-sans text-[15px] leading-5 text-mute">
              Systemtypen bleiben erhalten. Eigene Typen kannst du danach bei Dokumenten auswählen.
            </Text>
            <SectionTitle>Neuer Typ</SectionTitle>
            <Panel className="py-4">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="z. B. Impfausweis"
                placeholderTextColor="#7a9086"
                className="mb-3 min-h-[50px] rounded-2xl border border-line bg-canvas px-3.5 font-sans text-base text-ink"
              />
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="font-sansMedium text-sm text-ink">Ablaufdatum relevant</Text>
                <Switch value={expiry} onValueChange={setExpiry} trackColor={{ true: '#1f7a5c' }} />
              </View>
              <PrimaryButton label="Hinzufügen" icon="add" onPress={onAdd} />
            </Panel>
            <View className="mt-6">
              <SectionTitle>Vorhandene Typen</SectionTitle>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <ListRow
            index={index}
            title={item.name}
            subtitle={item.expiryDateRelevant ? 'Mit Ablaufdatum' : 'Ohne Ablaufdatum'}
            meta={
              <StatusBadge label={item.isSystem ? 'System' : 'Eigen'} tone={item.isSystem ? 'neutral' : 'ok'} />
            }
            trailing={
              item.isSystem ? undefined : (
                <PrimaryButton
                  compact
                  label="Löschen"
                  tone="ghost"
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
              )
            }
          />
        )}
      />
    </Screen>
  );
}
