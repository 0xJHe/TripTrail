import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Keeps everything in app.json and adds the Android Google Maps key for react-native-maps.
 * The key comes from the EAS environment variable GOOGLE_MAPS_ANDROID_KEY (preview
 * environment, used by the development and preview builds); it is never in git.
 * Expo Go ignores this (it has its own Maps key), so it keeps working without a key.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY;
  if (!mapsKey && process.env.EAS_BUILD) {
    console.warn('GOOGLE_MAPS_ANDROID_KEY is not set: the map will be blank in this build.');
  }
  return {
    ...config,
    name: config.name ?? 'TripTrail',
    slug: config.slug ?? 'triptrail',
    plugins: [...(config.plugins ?? []), ['react-native-maps', mapsKey ? { androidGoogleMapsApiKey: mapsKey } : {}]],
  };
};
