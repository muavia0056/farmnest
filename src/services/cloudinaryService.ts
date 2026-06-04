import {CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET} from '../config/cloudinary';
import {Platform} from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// URI / filename helpers
// ─────────────────────────────────────────────────────────────────────────────

const getFileNameFromUri = (uri: string): string => {
  if (typeof uri !== 'string' || !uri.trim()) return `upload_${Date.now()}.jpg`;
  const parts = uri.split('/');
  return parts[parts.length - 1] || `upload_${Date.now()}.jpg`;
};

const getMimeTypeFromUri = (uri: string): string => {
  if (typeof uri !== 'string' || !uri.trim()) return 'image/jpeg';
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png'))  return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.gif'))  return 'image/gif';
  if (lower.endsWith('.jpeg') || lower.endsWith('.jpg')) return 'image/jpeg';
  return 'image/jpeg';
};

/** Returns correct video/* MIME type for Cloudinary video uploads */
const getVideoMimeTypeFromUri = (uri: string): string => {
  if (typeof uri !== 'string' || !uri.trim()) return 'video/mp4';
  const lower = uri.toLowerCase();
  if (lower.endsWith('.mp4'))  return 'video/mp4';
  if (lower.endsWith('.mov'))  return 'video/quicktime';
  if (lower.endsWith('.avi'))  return 'video/avi';
  if (lower.endsWith('.mkv'))  return 'video/x-matroska';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.3gp'))  return 'video/3gpp';
  return 'video/mp4';
};

const getAudioMimeTypeFromUri = (uri: string): string => {
  if (typeof uri !== 'string' || !uri.trim()) return 'audio/mp4';
  const lower = uri.toLowerCase();
  if (lower.endsWith('.m4a'))  return 'audio/mp4';
  if (lower.endsWith('.mp4'))  return 'audio/mp4';
  if (lower.endsWith('.aac'))  return 'audio/aac';
  if (lower.endsWith('.mp3'))  return 'audio/mpeg';
  if (lower.endsWith('.wav'))  return 'audio/wav';
  if (lower.endsWith('.ogg'))  return 'audio/ogg';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'audio/mp4';
};

const normalizeFileUri = (uri: string): string => {
  if (!uri) return '';
  let normalized = uri.trim();
  // Already a remote URL — return as-is
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  // content:// URIs — React Native's XMLHttpRequest handles these natively on Android
  if (normalized.startsWith('content://')) return normalized;
  // ph:// (iOS Photos)
  if (normalized.startsWith('ph://')) return normalized;
  // Already has file:// prefix
  if (normalized.startsWith('file://')) return normalized;
  // Raw absolute path — add file://
  if (normalized.startsWith('/')) return 'file://' + normalized;
  return normalized;
};

export const isRemoteUrl = (value?: string | null): boolean => {
  if (!value) return false;
  return value.startsWith('http://') || value.startsWith('https://');
};

// ─────────────────────────────────────────────────────────────────────────────
// Image Upload  (Cloudinary /image/upload)
// ─────────────────────────────────────────────────────────────────────────────
export const uploadImageToCloudinary = (uri: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!uri) { reject(new Error('NO_IMAGE_URI')); return; }
    if (isRemoteUrl(uri)) { resolve(uri); return; }
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      reject(new Error('CLOUDINARY_CONFIG_MISSING')); return;
    }

    const normalizedUri = normalizeFileUri(uri);
    const fileName      = getFileNameFromUri(normalizedUri);
    const mimeType      = getMimeTypeFromUri(normalizedUri);

    console.log('[Cloudinary Image] Uploading:', fileName, mimeType);

    const formData = new FormData();
    formData.append('file', { uri: normalizedUri, type: mimeType, name: fileName } as any);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);
    xhr.timeout = 60000;

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data?.secure_url) {
          console.log('[Cloudinary Image] ✅ Done:', data.secure_url.substring(0, 60));
          resolve(data.secure_url as string);
        } else {
          console.error('[Cloudinary Image] ❌ Failed:', data?.error?.message);
          reject(new Error(data?.error?.message || `HTTP_${xhr.status}`));
        }
      } catch { reject(new Error('CLOUDINARY_UPLOAD_FAILED')); }
    };
    xhr.onerror   = () => reject(new Error('CLOUDINARY_NETWORK_ERROR'));
    xhr.ontimeout = () => reject(new Error('CLOUDINARY_TIMEOUT'));
    xhr.send(formData);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Video Upload  (Cloudinary /video/upload  —  used for liveness videos)
//
// KEY FIX: MIME type must be  video/mp4  not  audio/mp4.
// Timeout raised to 180s to handle 30-second recordings on slow connections.
// ─────────────────────────────────────────────────────────────────────────────
export const uploadVideoToCloudinary = (uri: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!uri) { reject(new Error('NO_VIDEO_URI')); return; }
    if (isRemoteUrl(uri)) { resolve(uri); return; }
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      reject(new Error('CLOUDINARY_CONFIG_MISSING')); return;
    }

    const normalizedUri = normalizeFileUri(uri);
    let   fileName      = getFileNameFromUri(normalizedUri);
    const mimeType      = getVideoMimeTypeFromUri(normalizedUri);

    if (!fileName.includes('.')) fileName = `${fileName}.mp4`;

    console.log('[Cloudinary Video] Starting upload...');
    console.log('[Cloudinary Video] URI type:', normalizedUri.startsWith('content://') ? 'content' : normalizedUri.startsWith('file://') ? 'file' : 'other');
    console.log('[Cloudinary Video] File:', fileName, '| MIME:', mimeType);
    console.log('[Cloudinary Video] Cloud:', CLOUDINARY_CLOUD_NAME, '| Preset:', CLOUDINARY_UPLOAD_PRESET);

    const formData = new FormData();
    formData.append('file', { uri: normalizedUri, type: mimeType, name: fileName } as any);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`);
    xhr.timeout = 180000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        console.log(`[Cloudinary Video] Upload progress: ${pct}%`);
      }
    };

    xhr.onload = () => {
      try {
        console.log('[Cloudinary Video] HTTP status:', xhr.status);
        console.log('[Cloudinary Video] Raw response:', xhr.responseText?.substring(0, 300));
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data?.secure_url) {
          console.log('[Cloudinary Video] ✅ Upload success:', data.secure_url.substring(0, 80));
          resolve(data.secure_url as string);
        } else {
          const errMsg = data?.error?.message || `HTTP_${xhr.status}`;
          console.error('[Cloudinary Video] ❌ Upload failed:', errMsg);
          reject(new Error(errMsg));
        }
      } catch (parseErr) {
        console.error('[Cloudinary Video] ❌ Response parse error:', parseErr);
        reject(new Error('CLOUDINARY_VIDEO_UPLOAD_FAILED'));
      }
    };
    xhr.onerror   = (e) => { console.error('[Cloudinary Video] ❌ Network error:', e); reject(new Error('CLOUDINARY_NETWORK_ERROR')); };
    xhr.ontimeout = ()  => { console.error('[Cloudinary Video] ❌ Timeout after 180s');    reject(new Error('CLOUDINARY_TIMEOUT')); };
    xhr.send(formData);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Audio Upload  (Cloudinary /video/upload — Cloudinary treats audio as video)
// ─────────────────────────────────────────────────────────────────────────────
export const uploadAudioToCloudinary = (uri: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!uri) { reject(new Error('NO_AUDIO_URI')); return; }
    if (isRemoteUrl(uri)) { resolve(uri); return; }
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      reject(new Error('CLOUDINARY_CONFIG_MISSING')); return;
    }

    const normalizedUri = normalizeFileUri(uri);
    let   fileName      = getFileNameFromUri(normalizedUri);
    const mimeType      = getAudioMimeTypeFromUri(normalizedUri);

    if (!fileName.includes('.')) fileName = `${fileName}.mp4`;

    console.log('[Cloudinary Audio] Uploading:', fileName, mimeType, Platform.OS);

    const formData = new FormData();
    formData.append('file', { uri: normalizedUri, type: mimeType, name: fileName } as any);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('resource_type', 'video');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`);
    xhr.timeout = 90000;

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data?.secure_url) {
          console.log('[Cloudinary Audio] ✅ Done:', data.secure_url.substring(0, 60));
          resolve(data.secure_url as string);
        } else {
          console.error('[Cloudinary Audio] ❌ Failed:', data?.error?.message);
          reject(new Error('CLOUDINARY_AUDIO_UPLOAD_FAILED'));
        }
      } catch { reject(new Error('CLOUDINARY_AUDIO_UPLOAD_FAILED')); }
    };
    xhr.onerror   = () => reject(new Error('CLOUDINARY_NETWORK_ERROR'));
    xhr.ontimeout = () => reject(new Error('CLOUDINARY_TIMEOUT'));
    xhr.send(formData);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Multiple Images Upload
// ─────────────────────────────────────────────────────────────────────────────
export const uploadMultipleImagesToCloudinary = async (uris: string[]): Promise<string[]> => {
  if (!Array.isArray(uris) || uris.length === 0) return [];
  const uploadedUrls: string[] = [];
  for (const uri of uris) {
    try {
      uploadedUrls.push(await uploadImageToCloudinary(uri));
    } catch (err) {
      console.warn('[Cloudinary] One image failed, continuing:', err);
    }
  }
  return uploadedUrls;
};
