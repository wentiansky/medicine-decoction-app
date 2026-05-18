package com.medicinedecoction.app

import android.app.ActivityOptions
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

class AndroidAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    acquireWakeLock(context)

    val title = intent.getStringExtra(EXTRA_TITLE) ?: "熬中药提醒"
    val body = intent.getStringExtra(EXTRA_BODY) ?: "时间到了"

    AndroidAlarmDebugLog.append(
      context,
      "info",
      "alarm",
      "alarm broadcast received",
      JSONObject().apply {
        put("title", title)
        put("body", body)
      }
    )

    val appInForeground = AppForegroundTracker.isMainActivityForeground
    val openLockScreenAlarm = !appInForeground && shouldOpenLockScreenAlarm(context)
    val canDrawOverlays = AlarmOverlayService.canDrawOverlays(context)
    val canAttachFullScreenIntent = !appInForeground && !canDrawOverlays && canUseFullScreenIntent(context)
    val shouldUseFullScreenIntent = openLockScreenAlarm && canAttachFullScreenIntent
    val shouldAlertNotification = !appInForeground && !openLockScreenAlarm && !canDrawOverlays
    val fullScreenPendingIntent = if (canAttachFullScreenIntent) {
      createAlarmActivityPendingIntent(
        context,
        title,
        body,
        requestCode = REQUEST_CODE + 5
      )
    } else {
      null
    }
    val notificationLaunchSource = if (appInForeground) {
      LAUNCH_SOURCE_IN_APP
    } else {
      LAUNCH_SOURCE_EXTERNAL
    }
    val notificationLaunchPendingIntent = createAlarmActivityPendingIntent(
      context,
      title,
      body,
      launchSource = notificationLaunchSource,
      dismissNotificationOnOpen = true
    )

    AndroidAlarmDebugLog.append(
      context,
      "info",
      "alarm",
      "alarm display route selected",
      JSONObject().apply {
        put(
          "route",
          when {
            appInForeground -> "notification-first-foreground-activity"
            openLockScreenAlarm -> "notification-first-lock-screen-activity"
            canDrawOverlays -> "notification-first-overlay"
            else -> "notification-first-heads-up"
          }
        )
        put("appInForeground", appInForeground)
        put("openLockScreenAlarm", openLockScreenAlarm)
        put("canDrawOverlays", canDrawOverlays)
        put("canAttachFullScreenIntent", canAttachFullScreenIntent)
        put("shouldUseFullScreenIntent", shouldUseFullScreenIntent)
        put("shouldAlertNotification", shouldAlertNotification)
      }
    )

    // Activity/浮窗自己负责响铃；只有无浮窗且后台未锁屏时，让 heads-up 通知响铃和振动。
    postAlarmNotification(
      context,
      title,
      body,
      notificationLaunchPendingIntent,
      fullScreenPendingIntent,
      alertNotification = shouldAlertNotification
    )

    if (openLockScreenAlarm && !shouldUseFullScreenIntent && !canDrawOverlays) {
      AndroidAlarmDebugLog.append(
        context,
        "warn",
        "alarm",
        "full-screen notification intent skipped because permission is disabled"
      )
    }

    if (shouldAlertNotification) {
      try {
        AlarmNotificationService.start(context, title, body)
        AndroidAlarmDebugLog.append(
          context,
          "info",
          "alarm",
          "alarm notification service start requested"
        )
      } catch (error: Exception) {
        AndroidAlarmDebugLog.append(
          context,
          "error",
          "alarm",
          "alarm notification service start failed",
          JSONObject().apply {
            put("error", error.message ?: error.javaClass.simpleName)
          }
        )
      }
    }

    // 解锁状态下再用浮窗补充提醒，避免把 overlay 当成锁屏主路径。
    if (!appInForeground && !openLockScreenAlarm && canDrawOverlays) {
      try {
        AlarmOverlayService.start(context, title, body)
        AndroidAlarmDebugLog.append(
          context,
          "info",
          "alarm",
          "alarm overlay service start requested"
        )
      } catch (error: Exception) {
        AndroidAlarmDebugLog.append(
          context,
          "error",
          "alarm",
          "alarm overlay service start failed",
          JSONObject().apply {
            put("error", error.message ?: error.javaClass.simpleName)
          }
        )
      }
    } else if (appInForeground) {
      AndroidAlarmDebugLog.append(
        context,
        "info",
        "alarm",
        "alarm overlay skipped because foreground activity is the primary route"
      )
    } else if (!openLockScreenAlarm) {
      AndroidAlarmDebugLog.append(
        context,
        "info",
        "alarm",
        "alarm overlay skipped because notification tap is the primary route"
      )
    } else {
      AndroidAlarmDebugLog.append(
        context,
        "info",
        "alarm",
        "alarm overlay skipped because lock-screen activity is the primary route"
      )
    }

    // 前台应用内直接展示 Activity；后台未锁屏且无悬浮窗时只交给 heads-up 通知点击进入。
    if (appInForeground) {
      try {
        context.startActivity(
          createAlarmActivityIntent(
            context,
            title,
            body,
            AndroidAlarmReceiver.LAUNCH_SOURCE_IN_APP
          )
        )
        AndroidAlarmDebugLog.append(
          context,
          "info",
          "alarm",
          "foreground alarm activity start requested"
        )
      } catch (error: Exception) {
        AndroidAlarmDebugLog.append(
          context,
          "error",
          "alarm",
          "foreground alarm activity start failed",
          JSONObject().apply {
            put("error", error.message ?: error.javaClass.simpleName)
          }
        )
      }
    } else if (openLockScreenAlarm) {
      try {
        context.startActivity(createAlarmActivityIntent(context, title, body))
        AndroidAlarmDebugLog.append(
          context,
          "info",
          "alarm",
          "lock screen alarm activity start requested"
        )
      } catch (error: Exception) {
        AndroidAlarmDebugLog.append(
          context,
          "error",
          "alarm",
          "lock screen alarm activity start failed",
          JSONObject().apply {
            put("error", error.message ?: error.javaClass.simpleName)
          }
        )
      }
    }
  }

  companion object {
    const val ACTION_FIRE = "com.medicinedecoction.app.ACTION_ALARM_FIRE"
    const val CHANNEL_ID = "medicine-decoction-timer"
    const val CHANNEL_ID_SILENT_NOTIFICATION_SERVICE = "medicine-decoction-notification-service"
    const val REQUEST_CODE = 1001
    const val NOTIFICATION_ID = 2001
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_LAUNCH_SOURCE = "launch_source"
    const val EXTRA_DISMISS_NOTIFICATION_ON_OPEN = "dismiss_notification_on_open"
    const val LAUNCH_SOURCE_EXTERNAL = "external"
    const val LAUNCH_SOURCE_IN_APP = "in_app"

    private fun acquireWakeLock(context: Context) {
      try {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

        val wakeLock = powerManager.newWakeLock(
          PowerManager.FULL_WAKE_LOCK or
            PowerManager.ACQUIRE_CAUSES_WAKEUP or
            PowerManager.ON_AFTER_RELEASE,
          "medicine-decoction:alarm-wakelock"
        )

        wakeLock.acquire(15000)

        AndroidAlarmDebugLog.append(
          context,
          "info",
          "alarm",
          "wake lock acquired"
        )
      } catch (error: Exception) {
        AndroidAlarmDebugLog.append(
          context,
          "error",
          "alarm",
          "wake lock acquire failed",
          JSONObject().apply {
            put("error", error.message ?: error.javaClass.simpleName)
          }
        )
      }
    }

    fun postAlarmNotification(
      context: Context,
      title: String,
      body: String,
      launchPendingIntent: PendingIntent = createAppLaunchPendingIntent(context),
      fullScreenPendingIntent: PendingIntent? = null,
      alertNotification: Boolean = true
    ) {
      ensureNotificationChannel(context)

      val notificationBuilder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(false)
        .setAutoCancel(true)
        .setContentIntent(launchPendingIntent)

      if (alertNotification) {
        notificationBuilder
          .setDefaults(NotificationCompat.DEFAULT_ALL)
          .setVibrate(longArrayOf(0, 700, 250, 700, 250, 700))
      } else {
        notificationBuilder.setSilent(true)
      }

      if (fullScreenPendingIntent != null) {
        notificationBuilder.setFullScreenIntent(fullScreenPendingIntent, true)
        AndroidAlarmDebugLog.append(
          context,
          "info",
          "alarm",
          "full-screen notification intent attached"
        )
      }

      val notification = notificationBuilder.build()

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(
          context,
          android.Manifest.permission.POST_NOTIFICATIONS
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
      ) {
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        AndroidAlarmDebugLog.append(context, "info", "alarm", "alarm notification posted")
      } else {
        AndroidAlarmDebugLog.append(
          context,
          "error",
          "alarm",
          "alarm notification blocked by POST_NOTIFICATIONS permission"
        )
      }

      AndroidAlarmDebugLog.append(context, "info", "alarm", "alarm notification posted before overlay/activity")
    }

    fun pendingIntentImmutableFlag(): Int =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

    fun createAlarmActivityIntent(
      context: Context,
      title: String,
      body: String,
      launchSource: String = LAUNCH_SOURCE_EXTERNAL,
      dismissNotificationOnOpen: Boolean = false
    ): Intent =
      Intent(context, AlarmAlertActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(EXTRA_TITLE, title)
        putExtra(EXTRA_BODY, body)
        putExtra(EXTRA_LAUNCH_SOURCE, launchSource)
        putExtra(EXTRA_DISMISS_NOTIFICATION_ON_OPEN, dismissNotificationOnOpen)
      }

    fun shouldOpenLockScreenAlarm(context: Context): Boolean {
      val keyguardManager = context.getSystemService(KeyguardManager::class.java)
      val powerManager = context.getSystemService(PowerManager::class.java)
      val locked = keyguardManager?.isKeyguardLocked == true
      val interactive = powerManager?.isInteractive == true
      return locked || !interactive
    }

    fun canUseFullScreenIntent(context: Context): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        return true
      }

      return context
        .getSystemService(NotificationManager::class.java)
        .canUseFullScreenIntent()
    }

    fun createAppLaunchPendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
      }

      return PendingIntent.getActivity(
        context,
        REQUEST_CODE + 3,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag()
      )
    }

    fun createAlarmActivityPendingIntent(
      context: Context,
      title: String,
      body: String,
      launchSource: String = LAUNCH_SOURCE_EXTERNAL,
      dismissNotificationOnOpen: Boolean = false,
      requestCode: Int = REQUEST_CODE + 4
    ): PendingIntent {
      return PendingIntent.getActivity(
        context,
        requestCode,
        createAlarmActivityIntent(
          context,
          title,
          body,
          launchSource = launchSource,
          dismissNotificationOnOpen = dismissNotificationOnOpen
        ),
        PendingIntent.FLAG_UPDATE_CURRENT or pendingIntentImmutableFlag(),
        createAlarmActivityPendingIntentOptions()
      )
    }

    fun ensureNotificationChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

      val alarmVibrationPattern = longArrayOf(0, 700, 250, 700, 250, 700)
      val channel = NotificationChannel(
        CHANNEL_ID,
        "熬中药计时提醒",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "熬中药阶段完成提醒"
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        setVibrationPattern(alarmVibrationPattern)
        enableVibration(true)
        setSound(
          android.provider.Settings.System.DEFAULT_ALARM_ALERT_URI,
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
          )
      }
      val silentNotificationServiceChannel = NotificationChannel(
        CHANNEL_ID_SILENT_NOTIFICATION_SERVICE,
        "熬中药提醒进行中",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "熬中药提醒进行中的常驻通知"
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        enableVibration(false)
        setSound(null, null)
      }

      val notificationManager = context.getSystemService(NotificationManager::class.java)
      notificationManager.createNotificationChannel(channel)
      notificationManager.createNotificationChannel(silentNotificationServiceChannel)

      val actualChannel = notificationManager.getNotificationChannel(CHANNEL_ID)
      val actualSilentNotificationServiceChannel =
        notificationManager.getNotificationChannel(CHANNEL_ID_SILENT_NOTIFICATION_SERVICE)
      AndroidAlarmDebugLog.append(
        context,
        "info",
        "alarm",
        "alarm notification channel ensured",
        JSONObject().apply {
          if (actualChannel == null) {
            put("missing", true)
          } else {
            put("importance", actualChannel.importance)
            put("shouldVibrate", actualChannel.shouldVibrate())
            put(
              "vibrationPattern",
              actualChannel.vibrationPattern?.let { JSONArray(it.toList()) }
            )
            put("sound", actualChannel.sound?.toString())
            put(
              "silentNotificationServiceImportance",
              actualSilentNotificationServiceChannel?.importance
            )
            put(
              "silentNotificationServiceShouldVibrate",
              actualSilentNotificationServiceChannel?.shouldVibrate()
            )
            put(
              "silentNotificationServiceSound",
              actualSilentNotificationServiceChannel?.sound?.toString()
            )
          }
        }
      )
    }

    private fun createAlarmActivityPendingIntentOptions(): Bundle? {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        return null
      }

      return ActivityOptions.makeBasic()
        .setPendingIntentCreatorBackgroundActivityStartMode(
          ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOW_ALWAYS
        )
        .toBundle()
    }
  }
}
