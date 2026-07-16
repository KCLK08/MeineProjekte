import { Alert, Platform } from 'react-native';

import type { AutoLockOption } from '@/security/types';
import { readAutoLockPromptPending, writeAutoLockPromptPending } from '@/security/settingsFlags';

function showExtendedDurations(setAutoLock: (option: AutoLockOption) => Promise<void>) {
  Alert.alert('Sperrdauer wählen', 'Wann soll Family Vault nach dem Verlassen sperren?', [
    {
      text: 'Nach 1 Minute',
      onPress: () => {
        void setAutoLock('1');
      },
    },
    {
      text: 'Nach 5 Minuten',
      onPress: () => {
        void setAutoLock('5');
      },
    },
    {
      text: 'Nach 15 Minuten',
      onPress: () => {
        void setAutoLock('15');
      },
    },
  ]);
}

/**
 * One-time prompt after vault activation: choose auto-lock delay.
 * Default remains "immediate" until the user picks an option.
 * Uses nested alerts on Android (max 3 buttons per dialog).
 */
export async function maybePromptAutoLockPreference(
  setAutoLock: (option: AutoLockOption) => Promise<void>
): Promise<void> {
  if (!(await readAutoLockPromptPending())) return;
  await writeAutoLockPromptPending(false);

  if (Platform.OS === 'ios') {
    Alert.alert(
      'Automatische Sperre',
      'Wie schnell soll Family Vault automatisch sperren?',
      [
        {
          text: 'Sofort (empfohlen)',
          style: 'default',
          onPress: () => {
            void setAutoLock('immediate');
          },
        },
        {
          text: 'Nach 1 Minute',
          onPress: () => {
            void setAutoLock('1');
          },
        },
        {
          text: 'Nach 5 Minuten',
          onPress: () => {
            void setAutoLock('5');
          },
        },
        {
          text: 'Nach 15 Minuten',
          onPress: () => {
            void setAutoLock('15');
          },
        },
      ],
      { cancelable: false }
    );
    return;
  }

  Alert.alert(
    'Automatische Sperre',
    'Wie schnell soll Family Vault automatisch sperren?',
    [
      {
        text: 'Sofort (empfohlen)',
        style: 'default',
        onPress: () => {
          void setAutoLock('immediate');
        },
      },
      {
        text: 'Andere Dauer…',
        onPress: () => showExtendedDurations(setAutoLock),
      },
    ],
    { cancelable: false }
  );
}
