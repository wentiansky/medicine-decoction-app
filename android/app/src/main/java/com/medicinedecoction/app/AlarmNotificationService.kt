package com.medicinedecoction.app

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

class AlarmNotificationService : Service() {
  private var alarmSignal: AlarmSignalController? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(AndroidAlarmReceiver.EXTRA_TITLE) ?: "熬中药提醒"
    val body = intent?.getStringExtra(AndroidAlarmReceiver.EXTRA_BODY) ?: "时间到了"

    AndroidAlarmDebugLog.append(
      this,
      "info",
      "alarm",
      "alarm notification service start requested",
      JSONObject().apply {
        put("title", title)
        put("body", body)
      }
    )

    AndroidAlarmReceiver.ensureNotificationChannel(this)
    startForeground(
      AndroidAlarmReceiver.NOTIFICATION_ID,
      createOngoingAlarmNotification(title, body)
    )
    AndroidAlarmDebugLog.append(
      this,
      "info",
      "alarm",
      "alarm notification service foreground started"
    )
    startAlarmSignal()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopAlarmSignal()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    AndroidAlarmDebugLog.append(
      this,
      "info",
      "alarm",
      "alarm notification service destroyed"
    )
    super.onDestroy()
  }

  private fun createOngoingAlarmNotification(title: String, body: String): Notification {
    val launchPendingIntent = AndroidAlarmReceiver.createAlarmActivityPendingIntent(
      this,
      title,
      body,
      launchSource = AndroidAlarmReceiver.LAUNCH_SOURCE_EXTERNAL,
      dismissNotificationOnOpen = true
    )

    val stopIntent = Intent(this, AlarmNotificationActionReceiver::class.java).apply {
      action = ACTION_STOP_NOTIFICATION_ALARM
    }
    val stopPendingIntent = PendingIntent.getBroadcast(
      this,
      AndroidAlarmReceiver.REQUEST_CODE + 6,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or AndroidAlarmReceiver.pendingIntentImmutableFlag()
    )

    return NotificationCompat.Builder(
      this,
      AndroidAlarmReceiver.CHANNEL_ID_SILENT_NOTIFICATION_SERVICE
    )
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setContentIntent(launchPendingIntent)
      .addAction(0, "停止", stopPendingIntent)
      .build()
  }

  private fun startAlarmSignal() {
    alarmSignal?.stop()
    alarmSignal = AlarmSignalController(this, "alarm notification service").apply {
      start()
    }
    AndroidAlarmDebugLog.append(
      this,
      "info",
      "alarm",
      "alarm notification service signal started"
    )
  }

  private fun stopAlarmSignal() {
    alarmSignal?.stop()
    alarmSignal = null
  }

  companion object {
    const val ACTION_STOP_NOTIFICATION_ALARM = "com.medicinedecoction.app.ACTION_STOP_NOTIFICATION_ALARM"

    fun start(context: Context, title: String, body: String) {
      if (AlarmOverlayService.canDrawOverlays(context)) {
        AndroidAlarmDebugLog.append(
          context,
          "info",
          "alarm",
          "alarm notification service skipped because overlay route is active"
        )
        return
      }

      val intent = Intent(context, AlarmNotificationService::class.java).apply {
        putExtra(AndroidAlarmReceiver.EXTRA_TITLE, title)
        putExtra(AndroidAlarmReceiver.EXTRA_BODY, body)
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(context, intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, AlarmNotificationService::class.java))
    }
  }
}
