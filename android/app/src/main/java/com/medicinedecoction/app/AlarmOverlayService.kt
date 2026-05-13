package com.medicinedecoction.app

import android.app.Notification
import android.app.Service
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

class AlarmOverlayService : Service() {
  private var overlayView: View? = null
  private var alarmSignal: AlarmSignalController? = null
  private var windowManager: WindowManager? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(AndroidAlarmReceiver.EXTRA_TITLE) ?: "熬中药提醒"
    val body = intent?.getStringExtra(AndroidAlarmReceiver.EXTRA_BODY) ?: "时间到了"
    val lockScreenMode = shouldAvoidOverlayOnLockScreen()

    AndroidAlarmDebugLog.append(
      this,
      "info",
      "alarm",
      "alarm overlay service onStartCommand entered",
      JSONObject().apply {
        put("startId", startId)
        put("flags", flags)
        put("intentAction", intent?.action ?: "")
        put("hasTitle", intent?.hasExtra(AndroidAlarmReceiver.EXTRA_TITLE) == true)
        put("hasBody", intent?.hasExtra(AndroidAlarmReceiver.EXTRA_BODY) == true)
      }
    )
    AndroidAlarmDebugLog.append(
      this,
      "info",
      "alarm",
      "alarm overlay lock screen mode evaluated",
      JSONObject().apply {
        put("lockScreenMode", lockScreenMode)
        put("canDrawOverlays", canDrawOverlays(this@AlarmOverlayService))
      }
    )

    AndroidAlarmReceiver.ensureNotificationChannel(this)
    startForeground(OVERLAY_NOTIFICATION_ID, createForegroundNotification(title, body))
    AndroidAlarmDebugLog.append(
      this,
      "info",
      "alarm",
      "alarm overlay foreground notification started"
    )
    startAlarmSignal()

    if (lockScreenMode) {
      AndroidAlarmDebugLog.append(
        this,
        "info",
        "alarm",
        "alarm overlay lock screen fallback sound and vibration kept while waiting for lock-screen activity"
      )
      return START_NOT_STICKY
    }

    if (!canDrawOverlays(this)) {
      AndroidAlarmDebugLog.append(
        this,
        "error",
        "alarm",
        "alarm overlay blocked by overlay permission",
        JSONObject().apply {
          put("title", title)
          put("body", body)
        }
      )
      return START_NOT_STICKY
    }

    showOverlay(title, body)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    removeOverlay()
    stopAlarmSignal()
    super.onDestroy()
  }

  private fun shouldAvoidOverlayOnLockScreen(): Boolean {
    val keyguardManager = getSystemService(KeyguardManager::class.java)
    val powerManager = getSystemService(PowerManager::class.java)
    val locked = keyguardManager?.isKeyguardLocked == true
    val interactive = powerManager?.isInteractive == true
    return locked || !interactive
  }

  private fun showOverlay(title: String, body: String) {
    removeOverlay()

    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    overlayView = createOverlayView(title, body)

    val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      overlayType,
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.CENTER
    }

    try {
      windowManager?.addView(overlayView, params)
      AndroidAlarmDebugLog.append(
        this,
        "info",
        "alarm",
        "alarm overlay shown",
        JSONObject().apply {
          put("title", title)
          put("body", body)
        }
      )
    } catch (error: Exception) {
      AndroidAlarmDebugLog.append(
        this,
        "error",
        "alarm",
        "alarm overlay show failed",
        JSONObject().apply {
          put("error", error.message ?: error.javaClass.simpleName)
        }
      )
    }
  }

  private fun createOverlayView(title: String, body: String): LinearLayout {
    val density = resources.displayMetrics.density
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.rgb(38, 29, 18))
      setPadding(
        (28 * density).toInt(),
        (28 * density).toInt(),
        (28 * density).toInt(),
        (28 * density).toInt()
      )
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    }

    val titleView = TextView(this).apply {
      text = title
      setTextColor(Color.WHITE)
      textSize = 30f
      gravity = Gravity.CENTER
    }

    val bodyView = TextView(this).apply {
      text = body
      setTextColor(Color.rgb(255, 232, 199))
      textSize = 24f
      gravity = Gravity.CENTER
      setPadding(0, (18 * density).toInt(), 0, (34 * density).toInt())
    }

    val dismissButton = Button(this).apply {
      text = "我知道了"
      textSize = 20f
      setOnClickListener { stopSelf() }
    }

    val openAppButton = Button(this).apply {
      text = "打开应用"
      textSize = 18f
      setOnClickListener {
        startActivity(
          Intent(this@AlarmOverlayService, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_SINGLE_TOP or
              Intent.FLAG_ACTIVITY_CLEAR_TOP
          }
        )
        stopSelf()
      }
    }

    val buttonParams = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      (56 * density).toInt()
    ).apply {
      topMargin = (12 * density).toInt()
    }

    root.addView(titleView)
    root.addView(bodyView)
    root.addView(dismissButton, buttonParams)
    root.addView(openAppButton, buttonParams)

    return root
  }

  private fun createForegroundNotification(title: String, body: String): Notification {
    return NotificationCompat.Builder(this, AndroidAlarmReceiver.CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle(title)
      .setContentText(body)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setContentIntent(AndroidAlarmReceiver.createAppLaunchPendingIntent(this))
      .build()
  }

  private fun removeOverlay() {
    val view = overlayView ?: return
    try {
      windowManager?.removeView(view)
    } catch (_: Exception) {
      // The overlay is already gone.
    }
    overlayView = null
  }

  private fun startAlarmSignal() {
    alarmSignal?.stop()
    alarmSignal = AlarmSignalController(this, "alarm overlay").apply {
      start()
    }
  }

  private fun stopAlarmSignal() {
    alarmSignal?.stop()
    alarmSignal = null
  }

  companion object {
    private const val OVERLAY_NOTIFICATION_ID = 2002

    fun canDrawOverlays(context: Context): Boolean =
      Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    fun start(context: Context, title: String, body: String) {
      val intent = Intent(context, AlarmOverlayService::class.java).apply {
        putExtra(AndroidAlarmReceiver.EXTRA_TITLE, title)
        putExtra(AndroidAlarmReceiver.EXTRA_BODY, body)
      }

      AndroidAlarmDebugLog.append(
        context,
        "info",
        "alarm",
        "alarm overlay service start issued",
        JSONObject().apply {
          put("sdkInt", Build.VERSION.SDK_INT)
          put("title", title)
          put("body", body)
        }
      )

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(context, intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      val intent = Intent(context, AlarmOverlayService::class.java)
      context.stopService(intent)
    }
  }
}
