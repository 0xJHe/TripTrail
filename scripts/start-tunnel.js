// npm run start:tunnel
// Starts Expo on port 8081 with EXPO_PACKAGER_PROXY_URL set to the Cloudflare tunnel
// address that `npm run tunnel` saved, so the QR code works from any network.
// The project has expo-dev-client, so by default the QR code opens the TripTrail
// development build; add --go to open Expo Go instead. Run `npm run tunnel` first,
// in its own window. Extra flags go to expo, e.g.
//   npm run start:tunnel -- --clear
//   npm run start:tunnel -- --go

const { spawn } = require('child_process');
const { PORT, readTunnel } = require('./tunnel-url');

const url = readTunnel();
if (!url) {
  console.error('No Cloudflare tunnel is running.');
  console.error('First run  npm run tunnel  in another window, wait for "Tunnel ready", then run this again.');
  process.exit(1);
}

const args = process.argv.slice(2);
const expoGo = args.includes('--go');

console.log(`Expo will use the tunnel: ${url}`);
if (expoGo) {
  console.log('Scan the QR code below with Expo Go (Android) or the Camera app (iPhone).');
} else {
  console.log('Scan the QR code below with the phone camera: it opens the TripTrail development build.');
  console.log(`Or open the development build, tap "Enter URL manually" and type:  ${url}`);
  console.log('(For Expo Go instead, run:  npm run start:tunnel -- --go)');
}
console.log('');

const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--port', String(PORT), ...args], {
  stdio: 'inherit',
  env: { ...process.env, EXPO_PACKAGER_PROXY_URL: url },
});
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
