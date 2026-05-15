const String kApiBase = 'http://localhost:8001';
// const String kApiBase = 'http://10.0.2.2:8000'; // Android emulator
// For deployed backend:
// const String kApiBase = 'https://your-backend.railway.app';

// Path where the Gemma model .litertlm file lives on the Android device.
// Push it with: adb push gemma-4-e2b-it.litertlm /sdcard/Download/gemma.litertlm
const String kModelFileName = 'gemma.litertlm';
const String kModelDownloadDir = '/sdcard/Android/data/com.zerohour.zerohour_victim/files';

const String kVictimCodeKey = 'victim_code';
const String kLastSosKey = 'last_sos_result';
