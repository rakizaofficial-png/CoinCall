import fs from 'node:fs';
import path from 'node:path';

// Agora RTC/RTM can omit `buffers` when Iris supplies null. RN 0.86's typed
// bridge expects an array, so always emit an empty array for that case.
const oldEventBridge = `    if (buffers != null) {
      WritableArray array = Arguments.createArray();
      for (byte[] buffer : buffers) {
        String base64 = Base64.encodeToString(buffer, Base64.DEFAULT);
        array.pushString(base64);
      }
      map.putArray("buffers", array);
    }`;
const fixedEventBridge = `    WritableArray array = Arguments.createArray();
    if (buffers != null) {
      for (byte[] buffer : buffers) {
        String base64 = Base64.encodeToString(buffer, Base64.DEFAULT);
        array.pushString(base64);
      }
    }
    map.putArray("buffers", array);`;

function patchAgoraBridge(label, modulePath) {
  const resolved = path.resolve(modulePath);
  if (!fs.existsSync(resolved)) {
    console.log(`[${label}] package is not installed; skipping patch.`);
    return;
  }

  const original = fs.readFileSync(resolved, 'utf8');
  const next = original.replace(oldEventBridge, fixedEventBridge);
  if (!next.includes(fixedEventBridge)) {
    throw new Error(`[${label}] Could not apply the RN 0.86 event bridge patch.`);
  }
  if (next !== original) {
    fs.writeFileSync(resolved, next);
    console.log(`[${label}] Patched null event buffers for the RN 0.86 bridge.`);
  } else {
    console.log(`[${label}] RN 0.86 event bridge is already patched.`);
  }
}

patchAgoraBridge(
  'Agora',
  'node_modules/react-native-agora/android/src/main/java/io/agora/rtc/ng/react/AgoraRtcNgModule.java',
);
patchAgoraBridge(
  'Agora RTM',
  'node_modules/agora-react-native-rtm/android/src/main/java/io/agora/agora_rtm/AgoraRtmNgModule.java',
);
