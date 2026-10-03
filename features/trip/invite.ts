import * as Linking from 'expo-linking';

/** Deep link that opens the Join screen with the code filled in. */
export function inviteLink(code: string): string {
  return Linking.createURL(`j/${code}`);
}

export function inviteMessage(tripName: string, code: string): string {
  return [
    `Join "${tripName}" on TripTrail!`,
    `Open TripTrail, tap "Join with a code" and enter: ${code}`,
    `Or open: ${inviteLink(code)}`,
  ].join('\n');
}
