import { useCallback, useRef, useState, type RefObject } from 'react';
import { Alert, Linking, type View } from 'react-native';

import { askGalleryPermission, captureCard, galleryPermission, NeedsBuildError, savePicture, sharePicture } from '../shareImage';

type Busy = 'share' | 'save' | null;

const messageOf = (e: unknown, fallback: string) => (e instanceof NeedsBuildError ? e.message : fallback);

/** Ask before the system prompt, so people know why: only this picture is added. */
function explainGallery(): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      'Save to your gallery?',
      "TripTrail needs your OK to add this picture to your photos. It won't look at your other photos.",
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

function openSettingsAlert() {
  Alert.alert('Photos are off for TripTrail', 'To save your recap, allow Photos for TripTrail in your phone settings.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => {}) },
  ]);
}

/** "Share your day" (share sheet) and "Download" (gallery) for the recap card behind `card`. */
export function useRecapShare(card: RefObject<View | null>) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const running = useRef(false);

  const run = useCallback(async (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(kind);
    setError(null);
    try {
      await work();
    } finally {
      running.current = false;
      setBusy(null);
    }
  }, []);

  const share = useCallback(
    () =>
      run('share', async () => {
        try {
          await sharePicture(await captureCard(card));
        } catch (e) {
          console.warn('Sharing the recap failed:', e instanceof Error ? e.message : e);
          setError(messageOf(e, "Couldn't share the picture. Try again."));
        }
      }),
    [card, run],
  );

  const download = useCallback(
    () =>
      run('save', async () => {
        setSaved(false);
        try {
          const permission = await galleryPermission();
          if (permission === 'blocked') return openSettingsAlert();
          if (permission === 'ask') {
            if (!(await explainGallery())) return;
            if (!(await askGalleryPermission())) {
              setError('Not saved: TripTrail needs your OK to add it to your photos.');
              return;
            }
          }
          await savePicture(await captureCard(card));
          setSaved(true);
        } catch (e) {
          console.warn('Saving the recap failed:', e instanceof Error ? e.message : e);
          setError(messageOf(e, "Couldn't save the picture. Try again."));
        }
      }),
    [card, run],
  );

  return { share, download, busy, error, saved };
}
