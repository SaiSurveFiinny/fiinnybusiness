import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Uploads a file to Firebase Storage under a given folder and returns its
 * public download URL. Shared by every admin upload field (crop hero/gallery
 * images, guide PDFs/thumbnails, video thumbnails) so upload logic exists in
 * exactly one place rather than being reimplemented per field.
 */
export async function uploadFile(file: File, folder: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${folder}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
