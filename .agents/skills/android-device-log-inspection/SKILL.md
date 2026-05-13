---
name: android-device-log-inspection
description: Use when inspecting logs or runtime state from a connected Android device or emulator for this project, especially React Native, Expo, native Android alarms, notifications, SharedPreferences, AsyncStorage, or NotificationChannel behavior.
---

# Android Device Log Inspection

## Purpose

Use the attached Android device as evidence. Prefer direct device state over guesses when debugging notifications, alarms, background behavior, React Native logs, or native/JS log persistence.

## Workflow

1. Confirm ADB and device:

```bash
which adb || true
adb devices -l
```

If no device is listed as `device`, ask the user to connect, unlock, and authorize USB debugging.

2. Identify the package name from local project files:

```bash
rg -n '"package"|applicationId|bundleIdentifier' app.json android/app/build.gradle android/app/src/main/AndroidManifest.xml
```

For this project, the Android package is usually `com.medicinedecoction.app`.

3. Check whether the app is running:

```bash
adb shell pidof <package> || true
```

4. Use the right evidence source:

- **logcat** for live platform/native logs:

```bash
adb logcat -d --pid="$(adb shell pidof <package> | tr -d '\r')" 2>/dev/null | tail -200
adb logcat -d | rg -i '<package>|alarm|notification|vibrat|channel|reactnative|expo'
```

- **App private files** for persisted native logs and state:

```bash
adb shell run-as <package> find . -maxdepth 4 -type f | sort
adb shell run-as <package> cat shared_prefs/<name>.xml
```

- **React Native AsyncStorage SQLite** (`RKStorage`) when logs are stored through AsyncStorage:

```bash
adb exec-out run-as <package> cat databases/RKStorage > /tmp/<package>-RKStorage
sqlite3 /tmp/<package>-RKStorage '.tables'
sqlite3 /tmp/<package>-RKStorage '.schema'
sqlite3 /tmp/<package>-RKStorage "select key, length(value) from catalystLocalStorage;"
sqlite3 /tmp/<package>-RKStorage "select value from catalystLocalStorage where key='<storage-key>';" > /tmp/<package>-logs.json
```

For this project, the App log list key is `medicine-decoction-runtime-logs`.

Filter the exported JSON with `node`:

```bash
node - <<'NODE'
const fs = require('fs')
const logs = JSON.parse(fs.readFileSync('/tmp/<package>-logs.json', 'utf8'))
for (const log of logs) {
  const text = `${log.module || ''} ${log.message || ''} ${JSON.stringify(log.details || {})}`
  if (/alarm|notification|channel|vibrat|error/i.test(text)) {
    console.log(`[${log.timestamp}] ${String(log.level).toUpperCase()} ${log.module} - ${log.message}`)
    if (log.details) console.log(JSON.stringify(log.details, null, 2))
    console.log('')
  }
}
NODE
```

- **Notification channels and posted notifications**:

```bash
adb shell dumpsys notification --noredact | awk '/AppSettings: <package> /{flag=1; c=0} flag{print; c++} flag && c>80{exit}'
adb shell dumpsys notification --noredact | rg -n -C 8 '<package>|<channel-id>|vibrat|sound|importance'
```

Look for `mImportance`, `mSound`, `mVibration`, `mVibrationEnabled`, `mUserLockedFields`, `effectiveNotificationChannel`, and current `NotificationRecord`.

5. If direct copy to `/sdcard` fails, use stdout export:

```bash
adb exec-out run-as <package> cat <private-file> > /tmp/<local-copy>
```

## Interpretation Rules

- Distinguish **channel configuration** from **actual alert playback**. A channel can show `mVibrationEnabled=true` while a vendor ROM still suppresses notification vibration.
- Distinguish **persisted app logs** from **live logcat**. React Native app logs often live in AsyncStorage, not logcat.
- Distinguish **native SharedPreferences logs** from **JS-synced logs**. A native prefs file may be empty while AsyncStorage has copied entries.
- Prefer exact quoted evidence in the final answer: package, channel ID, key fields, and command-derived result.
- Do not assume build changes are installed on the device. Check package state, timestamps, logs, or rebuild/install if the user asks.

## Common Finds

- React Native AsyncStorage database: `databases/RKStorage`
- AsyncStorage table: `catalystLocalStorage`
- SharedPreferences directory: `shared_prefs/`
- Notification channel source of truth: `adb shell dumpsys notification --noredact`
- MIUI and other vendor ROMs may display or play notification alerts differently from AOSP even when channel fields are enabled.
