const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')

const readAndroidSource = relativePath =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')

test('native alarm presentation reuses one view factory for activity and overlay', () => {
  const activitySource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmAlertActivity.kt'
  )
  const serviceSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmOverlayService.kt'
  )
  const factorySource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmPresentationViewFactory.kt'
  )

  assert.match(factorySource, /object AlarmPresentationViewFactory/)
  assert.match(factorySource, /data class AlarmPresentationView/)
  assert.match(activitySource, /AlarmPresentationViewFactory\.create/)
  assert.match(serviceSource, /AlarmPresentationViewFactory\.create/)
  assert.doesNotMatch(activitySource, /setBackgroundColor\(Color\.rgb\(38, 29, 18\)\)/)
  assert.doesNotMatch(serviceSource, /setBackgroundColor\(Color\.rgb\(38, 29, 18\)\)/)
})

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

test('immediate in-app alarm starts activity directly without a full-screen notification launch', () => {
  const moduleSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmModule.kt'
  )
  const presentAlarmNowSection =
    moduleSource.match(/fun presentAlarmNow\([\s\S]*?\n  private fun createAlarmActivityPendingIntent/)?.[0] || ''

  assert.match(
    presentAlarmNowSection,
    /AndroidAlarmReceiver\.postAlarmNotification\(\s*reactContext,\s*title,\s*body\s*\)/
  )
  assert.match(presentAlarmNowSection, /reactContext\.startActivity/)
  assert.doesNotMatch(presentAlarmNowSection, /fullScreenPendingIntent/)
  assert.doesNotMatch(presentAlarmNowSection, /createAlarmActivityPendingIntent\(reactContext, title, body\)/)
})

test('native alarm flow keeps explicit diagnostics for lock-screen activity lifecycle', () => {
  const activitySource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmAlertActivity.kt'
  )
  const manifestSource = readAndroidSource(
    'android/app/src/main/AndroidManifest.xml'
  )
  const stylesSource = readAndroidSource(
    'android/app/src/main/res/values/styles.xml'
  )

  assert.match(activitySource, /alarm activity onCreate entered/)
  assert.match(activitySource, /alarm activity onResume entered/)
  assert.match(activitySource, /alarm activity onStart entered/)
  assert.match(activitySource, /alarm activity onNewIntent received/)
  assert.match(activitySource, /private var titleTextView: TextView\? = null/)
  assert.match(activitySource, /private var bodyTextView: TextView\? = null/)
  assert.match(activitySource, /updateAlarmContent\(title, body\)/)
  assert.match(activitySource, /titleView\.text = title/)
  assert.match(activitySource, /bodyView\.text = body/)
  assert.match(manifestSource, /android:theme="@style\/AlarmAlertTheme"/)
  assert.match(stylesSource, /android:windowAnimationStyle/)
  assert.match(activitySource, /alarm activity window configured/)
  assert.match(activitySource, /alarm activity keyguard state captured/)
  assert.match(activitySource, /AlarmSignalController\(this, "alarm activity"/)
  assert.match(activitySource, /AlarmOverlayService\.stop\(this\)/)
  assert.match(activitySource, /moveTaskToBack\(true\)/)
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
  assert.match(receiverSource, /alarm overlay skipped because notification tap is the primary route/)
  assert.match(receiverSource, /notification-first-background-activity/)
  assert.doesNotMatch(receiverSource, /notification-first-lock-screen-overlay-activity/)
  assert.doesNotMatch(receiverSource, /background full-screen pending intent send requested/)
  assert.doesNotMatch(receiverSource, /background alarm activity start requested/)
})

test('native alarm flow keeps heads-up notifications even when overlay permission is enabled', () => {
  const serviceSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmOverlayService.kt'
  )
  const receiverSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt'
  )

  assert.match(
    receiverSource,
    /postAlarmNotification\([\s\S]*notificationLaunchPendingIntent[\s\S]*fullScreenPendingIntent[\s\S]*\)/
  )
  assert.doesNotMatch(receiverSource, /alarm notification skipped because overlay permission is enabled/)
  assert.match(receiverSource, /val notificationLaunchPendingIntent = createAlarmActivityPendingIntent\(context, title, body\)/)
  assert.match(serviceSource, /setPriority\(NotificationCompat\.PRIORITY_DEFAULT\)/)
  assert.doesNotMatch(serviceSource, /setPriority\(NotificationCompat\.PRIORITY_MAX\)/)
  assert.doesNotMatch(serviceSource, /setCategory\(NotificationCompat\.CATEGORY_ALARM\)/)
})

test('background alarm notifications without overlay permission open the alarm activity from the notification tap', () => {
  const receiverSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt'
  )

  assert.match(receiverSource, /val notificationLaunchPendingIntent = createAlarmActivityPendingIntent\(context, title, body\)/)
  assert.match(
    receiverSource,
    /val canAttachFullScreenIntent = !canDrawOverlays && canUseFullScreenIntent\(context\)[\s\S]*val fullScreenPendingIntent = if \(canAttachFullScreenIntent\) \{[\s\S]*createAlarmActivityPendingIntent\(context, title, body\)/
  )
  assert.match(receiverSource, /\.setContentIntent\(launchPendingIntent\)/)
  assert.doesNotMatch(
    receiverSource,
    /if \(!openLockScreenAlarm && !canDrawOverlays && fullScreenPendingIntent != null\)/
  )
  assert.doesNotMatch(
    receiverSource,
    /if \(openLockScreenAlarm \|\| !canDrawOverlays\)/
  )
})

test('formal alarm notification is one-shot and dismisses itself after the user taps it', () => {
  const receiverSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt'
  )
  const serviceSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmOverlayService.kt'
  )

  assert.match(receiverSource, /\.setOngoing\(false\)/)
  assert.match(receiverSource, /\.setAutoCancel\(true\)/)
  assert.match(serviceSource, /\.setOngoing\(true\)/)
  assert.match(serviceSource, /\.setSilent\(true\)/)
})

test('overlay foreground service reuses the same notification id so only one notification stays visible', () => {
  const serviceSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmOverlayService.kt'
  )

  assert.match(
    serviceSource,
    /startForeground\([\s\S]*AndroidAlarmReceiver\.NOTIFICATION_ID,[\s\S]*createForegroundNotification\(title, body\)[\s\S]*\)/
  )
  assert.doesNotMatch(serviceSource, /private const val OVERLAY_NOTIFICATION_ID = 2002/)
})
