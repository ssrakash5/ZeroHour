const String kApiBase = 'http://172.20.10.2:8001';
// const String kApiBase = 'http://10.0.2.2:8000'; // Android emulator
// For deployed backend:
// const String kApiBase = 'https://your-backend.railway.app';

// Path where the Gemma model .bin file lives on the Android device.
// Push it with: adb push gemma.bin /sdcard/Download/gemma.bin
const String kModelFileName = 'gemma.bin';
const String kModelDownloadDir = '/sdcard/Download';

const String kVictimCodeKey = 'victim_code';
