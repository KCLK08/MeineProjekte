import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';

import * as AppFS from './fs-storage';

export async function sharePdfBytes(bytes: Uint8Array, fileName: string): Promise<string> {
  const safeName = String(fileName || 'bautagebuch.pdf').replace(/[^\w.\-]+/g, '_');

  if (Platform.OS === 'web') {
    AppFS.downloadBytesOnWeb(bytes, safeName, 'application/pdf');
    return `download://${safeName}`;
  }

  const path = `${AppFS.cacheDirectory}${safeName}`;
  await AppFS.writeAsStringAsync(path, AppFS.bytesToBase64(bytes), { encoding: AppFS.EncodingType.Base64 });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(path, { mimeType: 'application/pdf', dialogTitle: 'PDF exportieren' });
  }
  return path;
}
