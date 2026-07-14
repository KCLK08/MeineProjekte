import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function sharePdfBytes(bytes: Uint8Array, fileName: string): Promise<string> {
  const safeName = String(fileName || 'bautagebuch.pdf').replace(/[^\w.\-]+/g, '_');
  const path = `${FileSystem.cacheDirectory}${safeName}`;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  await FileSystem.writeAsStringAsync(path, btoa(binary), { encoding: FileSystem.EncodingType.Base64 });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(path, { mimeType: 'application/pdf', dialogTitle: 'PDF exportieren' });
  }
  return path;
}
