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
  assert.match(receiverSource, /const val CHANNEL_ID = "medicine-decoction-timer"/)
  assert.match(manifestSource, /android\.permission\.USE_EXACT_ALARM/)
  assert.doesNotMatch(manifestSource, /android\.permission\.SCHEDULE_EXACT_ALARM/)
})

test('main activity records foreground visibility for native alarm routing', () => {
  const mainActivitySource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/MainActivity.kt'
  )
  const foregroundTrackerSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AppForegroundTracker.kt'
  )

  assert.match(foregroundTrackerSource, /object AppForegroundTracker/)
  assert.match(foregroundTrackerSource, /@Volatile/)
  assert.match(foregroundTrackerSource, /var isMainActivityForeground: Boolean = false/)
  assert.match(mainActivitySource, /override fun onResume\(\)/)
  assert.match(mainActivitySource, /AppForegroundTracker\.isMainActivityForeground = true/)
  assert.match(mainActivitySource, /override fun onPause\(\)/)
  assert.match(mainActivitySource, /AppForegroundTracker\.isMainActivityForeground = false/)
})

test('native alarm receiver treats foreground app as a silent notification plus activity route', () => {
  const receiverSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt'
  )

  assert.match(receiverSource, /val appInForeground = AppForegroundTracker\.isMainActivityForeground/)
  assert.match(
    receiverSource,
    /val canAttachFullScreenIntent = !appInForeground && !canDrawOverlays && canUseFullScreenIntent\(context\)/
  )
  assert.match(
    receiverSource,
    /val shouldAlertNotification = !appInForeground && !openLockScreenAlarm && !canDrawOverlays/
  )
  assert.match(receiverSource, /notification-first-foreground-activity/)
  assert.match(
    receiverSource,
    /alertNotification = shouldAlertNotification/
  )
  assert.match(
    receiverSource,
    /if \(appInForeground\) \{[\s\S]*createAlarmActivityIntent\([\s\S]*AndroidAlarmReceiver\.LAUNCH_SOURCE_IN_APP/
  )
  assert.match(
    receiverSource,
    /if \(!appInForeground && !openLockScreenAlarm && canDrawOverlays\)/
  )
})

test('JavaScript does not start an immediate duplicate in-app native alarm', () => {
  const moduleSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmModule.kt'
  )

  assert.doesNotMatch(moduleSource, /fun presentAlarmNow\(/)
  assert.doesNotMatch(moduleSource, /immediate alarm activity start requested from app/)
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
  assert.match(activitySource, /dismissNotificationIfRequested\(intent\)/)
  assert.match(
    activitySource,
    /NotificationManagerCompat\.from\(this\)\.cancel\(AndroidAlarmReceiver\.NOTIFICATION_ID\)/
  )
  assert.match(activitySource, /shouldReturnToPreviousApp\(intent\)/)
  assert.match(
    activitySource,
    /intent\?\.getStringExtra\(AndroidAlarmReceiver\.EXTRA_LAUNCH_SOURCE\) !=[\s\S]*AndroidAlarmReceiver\.LAUNCH_SOURCE_IN_APP/
  )
  assert.match(
    activitySource,
    /val returnToPreviousApp = shouldReturnToPreviousApp\(intent\)[\s\S]*if \(returnToPreviousApp\) \{[\s\S]*moveTaskToBack\(true\)[\s\S]*\} else \{[\s\S]*returnToApp\(\)/
  )
  assert.match(
    activitySource,
    /private fun returnToApp\(\)[\s\S]*Intent\(this, MainActivity::class\.java\)[\s\S]*Intent\.FLAG_ACTIVITY_NEW_TASK[\s\S]*Intent\.FLAG_ACTIVITY_SINGLE_TOP[\s\S]*Intent\.FLAG_ACTIVITY_CLEAR_TOP/
  )
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
  assert.match(receiverSource, /notification-first-heads-up/)
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
  assert.match(
    receiverSource,
    /val notificationLaunchPendingIntent = createAlarmActivityPendingIntent\([\s\S]*context,[\s\S]*title,[\s\S]*body,[\s\S]*dismissNotificationOnOpen = true[\s\S]*\)/
  )
  assert.match(serviceSource, /setPriority\(NotificationCompat\.PRIORITY_DEFAULT\)/)
  assert.doesNotMatch(serviceSource, /setPriority\(NotificationCompat\.PRIORITY_MAX\)/)
  assert.doesNotMatch(serviceSource, /setCategory\(NotificationCompat\.CATEGORY_ALARM\)/)
})

test('native alarm notification channel explicitly enables vibration and logs actual channel settings', () => {
  const receiverSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt'
  )

  assert.match(receiverSource, /val alarmVibrationPattern = longArrayOf\(0, 700, 250, 700, 250, 700\)/)
  assert.match(
    receiverSource,
    /setVibrationPattern\(alarmVibrationPattern\)[\s\S]*enableVibration\(true\)[\s\S]*setSound/
  )
  assert.match(receiverSource, /val actualChannel = notificationManager\.getNotificationChannel\(CHANNEL_ID\)/)
  assert.match(receiverSource, /actualChannel\.shouldVibrate\(\)/)
  assert.match(receiverSource, /actualChannel\.vibrationPattern/)
  assert.match(receiverSource, /alarm notification channel ensured/)
})

test('native alarm signal marks direct vibrations with alarm usage for background delivery', () => {
  const signalSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmSignalController.kt'
  )

  assert.match(signalSource, /VibrationAttributes\.USAGE_ALARM/)
  assert.match(signalSource, /AudioAttributes\.USAGE_ALARM/)
  assert.match(
    signalSource,
    /vibrator\?\.vibrate\([\s\S]*effect,[\s\S]*VibrationAttributes\.createForUsage\(VibrationAttributes\.USAGE_ALARM\)[\s\S]*\)/
  )
  assert.match(
    signalSource,
    /vibrator\?\.vibrate\(effect, createAlarmAudioAttributes\(\)\)/
  )
  assert.match(
    signalSource,
    /vibrator\?\.vibrate\(pattern, 0, createAlarmAudioAttributes\(\)\)/
  )
})

test('background alarm notifications without overlay permission open the alarm activity from the notification tap', () => {
  const receiverSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt'
  )

  assert.match(
    receiverSource,
    /val notificationLaunchPendingIntent = createAlarmActivityPendingIntent\([\s\S]*context,[\s\S]*title,[\s\S]*body,[\s\S]*dismissNotificationOnOpen = true[\s\S]*\)/
  )
  assert.match(receiverSource, /const val EXTRA_LAUNCH_SOURCE = "launch_source"/)
  assert.match(receiverSource, /const val EXTRA_DISMISS_NOTIFICATION_ON_OPEN = "dismiss_notification_on_open"/)
  assert.match(receiverSource, /const val LAUNCH_SOURCE_EXTERNAL = "external"/)
  assert.match(
    receiverSource,
    /val canAttachFullScreenIntent = !appInForeground && !canDrawOverlays && canUseFullScreenIntent\(context\)[\s\S]*val fullScreenPendingIntent = if \(canAttachFullScreenIntent\) \{[\s\S]*requestCode = REQUEST_CODE \+ 5/
  )
  assert.match(receiverSource, /dismissNotificationOnOpen = true/)
  assert.match(receiverSource, /\.setContentIntent\(launchPendingIntent\)/)
  assert.match(receiverSource, /putExtra\(EXTRA_DISMISS_NOTIFICATION_ON_OPEN, dismissNotificationOnOpen\)/)
  assert.match(receiverSource, /if \(alertNotification\) \{[\s\S]*NotificationCompat\.DEFAULT_ALL/)
  assert.match(receiverSource, /else \{[\s\S]*notificationBuilder\.setSilent\(true\)/)
  assert.doesNotMatch(
    receiverSource,
    /if \(!openLockScreenAlarm && !canDrawOverlays && fullScreenPendingIntent != null\)/
  )
  assert.doesNotMatch(
    receiverSource,
    /if \(openLockScreenAlarm \|\| !canDrawOverlays\)/
  )
})

test('notification taps preserve the in-app return path when the alarm was raised in the foreground', () => {
  const receiverSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AndroidAlarmReceiver.kt'
  )
  const activitySource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmAlertActivity.kt'
  )

  assert.match(
    receiverSource,
    /val notificationLaunchSource = if \(appInForeground\) \{[\s\S]*LAUNCH_SOURCE_IN_APP[\s\S]*\} else \{[\s\S]*LAUNCH_SOURCE_EXTERNAL[\s\S]*\}/
  )
  assert.match(
    receiverSource,
    /val notificationLaunchPendingIntent = createAlarmActivityPendingIntent\([\s\S]*launchSource = notificationLaunchSource[\s\S]*dismissNotificationOnOpen = true[\s\S]*\)/
  )
  assert.match(
    activitySource,
    /intent\?\.getStringExtra\(AndroidAlarmReceiver\.EXTRA_LAUNCH_SOURCE\) !=[\s\S]*AndroidAlarmReceiver\.LAUNCH_SOURCE_IN_APP/
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
  assert.match(serviceSource, /\.setOngoing\(false\)/)
  assert.match(serviceSource, /\.setAutoCancel\(true\)/)
  assert.match(serviceSource, /\.setSilent\(true\)/)
})

test('overlay foreground service reuses one notification and keeps it after overlay dismissal', () => {
  const serviceSource = readAndroidSource(
    'android/app/src/main/java/com/medicinedecoction/app/AlarmOverlayService.kt'
  )

  assert.match(
    serviceSource,
    /startForeground\([\s\S]*AndroidAlarmReceiver\.NOTIFICATION_ID,[\s\S]*createForegroundNotification\(title, body\)[\s\S]*\)/
  )
  assert.match(serviceSource, /onDismiss = \{ dismissOverlayButKeepNotification\(\) \}/)
  assert.match(serviceSource, /onOpenApp = \{ openAppButKeepNotification\(\) \}/)
  assert.match(serviceSource, /detachForegroundNotification\(\)/)
  assert.match(serviceSource, /STOP_FOREGROUND_DETACH/)
  assert.match(serviceSource, /stopForeground\(false\)/)
  assert.match(serviceSource, /dismissNotificationOnOpen = true/)
  assert.match(serviceSource, /launchSource = AndroidAlarmReceiver\.LAUNCH_SOURCE_IN_APP/)
  assert.match(
    serviceSource,
    /private fun openAppButKeepNotification\(\)[\s\S]*detachForegroundNotification\(\)[\s\S]*startActivity/
  )
  assert.doesNotMatch(serviceSource, /private const val OVERLAY_NOTIFICATION_ID = 2002/)
})
