import type { RefObject } from 'react';
import type { View } from 'react-native';

/**
 * Day recap card as a picture: capture it (react-native-view-shot), share it (expo-sharing,
 * the phone's share sheet) or save it to the gallery (expo-media-library). The modules are
 * loaded only when tapped, so an older build without them shows a message instead of crashing.
 */

/** Stories size (9:16). */
export const STORY_PX = { width: 1080, height: 1920 };

export const NEEDS_BUILD = 'Sharing needs the latest TripTrail build. Install the new development build and try again.';

export class NeedsBuildError extends Error {
  constructor() {
    super(NEEDS_BUILD);
  }
}

function load<T>(get: () => T): T {
  try {
    return get();
  } catch {
    throw new NeedsBuildError();
  }
}

/** The card as a PNG file on the phone (a temporary file uri). */
export async function captureCard(ref: RefObject<View | null>): Promise<string> {
  const { captureRef } = load(() => require('react-native-view-shot') as typeof import('react-native-view-shot'));
  try {
    return await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile', ...STORY_PX });
  } catch (e) {
    if (e instanceof Error && /RNViewShot|TurboModule|native module/i.test(e.message)) throw new NeedsBuildError();
    throw e;
  }
}

/** Opens the share sheet (Instagram, WhatsApp…) with the picture. */
export async function sharePicture(uri: string): Promise<void> {
  const Sharing = load(() => require('expo-sharing') as typeof import('expo-sharing'));
  if (!(await Sharing.isAvailableAsync())) throw new Error("This phone can't share pictures from TripTrail.");
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your day', UTI: 'public.png' });
}

const media = () => load(() => require('expo-media-library/legacy') as typeof import('expo-media-library/legacy'));

/** Gallery permission (add photos only): 'granted', 'ask' (we may ask) or 'blocked' (only in Settings). */
export async function galleryPermission(): Promise<'granted' | 'ask' | 'blocked'> {
  const p = await media().getPermissionsAsync(true, ['photo']);
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'ask' : 'blocked';
}

export async function askGalleryPermission(): Promise<boolean> {
  return (await media().requestPermissionsAsync(true, ['photo'])).granted;
}

/** Saves the picture to the phone's gallery. */
export async function savePicture(uri: string): Promise<void> {
  await media().saveToLibraryAsync(uri);
}
