const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')

const readAndroidSource = relativePath =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('Android alarm activity pending intents opt in to background activity launch', () => {
  const moduleSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmModule.kt'
  )
  const receiverSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt'
  )
  const manifestSource = readAndroidSource(
    'android/app/src/main/AndroidManifest.xml'
  )

  assert.match(
    moduleSource,
    /pendingIntentCreatorBackgroundActivityStartMode|setPendingIntentCreatorBackgroundActivityStartMode/
  )
  assert.match(
    receiverSource,
    /pendingIntentCreatorBackgroundActivityStartMode|setPendingIntentCreatorBackgroundActivityStartMode/
  )
  assert.match(moduleSource, /createVendorPermissionIntents/)
  assert.match(moduleSource, /PermissionsEditorActivity/)
  assert.match(moduleSource, /StartupAppListActivity|BgStartUpManagerActivity|AddAutoStartupActivity/)
  assert.match(moduleSource, /fun presentAlarmNow\(/)
  assert.match(moduleSource, /immediate alarm activity start requested from app/)
  assert.match(receiverSource, /const val CHANNEL_ID = "medicine-decoction-timer"/)
  assert.match(manifestSource, /android\.permission\.USE_EXACT_ALARM/)
  assert.doesNotMatch(manifestSource, /android\.permission\.SCHEDULE_EXACT_ALARM/)
})

test('native alarm flow keeps explicit diagnostics for lock-screen activity lifecycle', () => {
  const activitySource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmAlertActivity.kt'
  )

  assert.match(activitySource, /alarm activity onCreate entered/)
  assert.match(activitySource, /alarm activity onResume entered/)
  assert.match(activitySource, /alarm activity onStart entered/)
  assert.match(activitySource, /alarm activity onNewIntent received/)
  assert.match(activitySource, /alarm activity window configured/)
  assert.match(activitySource, /alarm activity keyguard state captured/)
  assert.match(activitySource, /AlarmSignalController\(this, "alarm activity"/)
  assert.match(activitySource, /AlarmOverlayService\.stop\(this\)/)
  assert.doesNotMatch(activitySource, /AndroidAlarmReceiver\.postAlarmNotification\(this, title, body\)/)
})

test('native alarm flow keeps explicit diagnostics for overlay service startup', () => {
  const serviceSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmOverlayService.kt'
  )
  const receiverSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt'
  )

  assert.match(serviceSource, /alarm overlay service onStartCommand entered/)
  assert.match(serviceSource, /alarm overlay lock screen mode evaluated/)
  assert.match(serviceSource, /alarm overlay foreground notification started/)
  assert.match(serviceSource, /alarm overlay service start issued/)
  assert.match(serviceSource, /alarm overlay lock screen fallback sound and vibration kept while waiting for lock-screen activity/)
  assert.match(receiverSource, /alarm overlay skipped because lock-screen activity is the primary route/)
  assert.match(receiverSource, /alarm overlay skipped because background activity is the primary route/)
  assert.match(receiverSource, /background full-screen pending intent send requested/)
  assert.match(receiverSource, /background alarm activity start requested/)
  assert.match(receiverSource, /notification-first-background-activity/)
  assert.doesNotMatch(receiverSource, /notification-first-lock-screen-overlay-activity/)
})
