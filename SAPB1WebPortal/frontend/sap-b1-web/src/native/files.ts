import { isNative } from './platform';

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * A WebView cannot "download" a blob the way a browser tab does. In the app the file is written to the app's cache and handed to the
 * system share sheet (save to Files, WhatsApp, email, open in Excel / a PDF viewer). Returns true when handled natively; false on the
 * website, where the caller keeps its normal browser download.
 */
export async function shareFile(filename: string, data: Blob, title?: string): Promise<boolean> {
  if (!isNative) return false;
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const safeName = filename.replace(/[^\w.\- ]+/g, '_');
  const written = await Filesystem.writeFile({ path: safeName, data: await toBase64(data), directory: Directory.Cache });
  await Share.share({ title: title ?? safeName, url: written.uri, dialogTitle: title ?? safeName });
  return true;
}
