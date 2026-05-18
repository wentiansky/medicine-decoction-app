package com.medicinedecoction.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

class AlarmNotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == AlarmNotificationService.ACTION_STOP_NOTIFICATION_ALARM) {
      AndroidAlarmDebugLog.append(
        context,
        "info",
        "alarm",
        "alarm notification stop action received"
      )
      NotificationManagerCompat.from(context).cancel(AndroidAlarmReceiver.NOTIFICATION_ID)
      context.stopService(Intent(context, AlarmNotificationService::class.java))
    }
  }
}