package com.medicinedecoction.app

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.WindowManager
import android.widget.TextView
import org.json.JSONObject

class AlarmAlertActivity : Activity() {
  private var alarmSignal: AlarmSignalController? = null
  private var titleTextView: TextView? = null
  private var bodyTextView: TextView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    logActivityEvent(
      "info",
      "alarm activity onCreate entered",
      JSONObject().apply {
        put("hasSavedInstanceState", savedInstanceState != null)
        put("intentAction", intent?.action ?: "")
      }
    )
    configureLockScreenWindow()
    super.onCreate(savedInstanceState)

    val title = getAlarmTitle(intent)
    val body = getAlarmBody(intent)

    AndroidAlarmDebugLog.append(
      this,
      "info",
      "alarm",
      "alarm activity opened over lock screen",
      JSONObject().apply {
        put("title", title)
        put("body", body)
      }
    )

    AlarmOverlayService.stop(this)
    updateAlarmContent(title, body)
    startAlarmSignal()
  }

  override fun onStart() {
    super.onStart()
    logActivityEvent("info", "alarm activity onStart entered", captureKeyguardState())
  }

  override fun onResume() {
    super.onResume()
    logActivityEvent("info", "alarm activity onResume entered", captureKeyguardState())
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    logActivityEvent(
      "info",
      "alarm activity onNewIntent received",
      JSONObject().apply {
        put("intentAction", intent?.action ?: "")
        put("hasTitle", intent?.hasExtra(AndroidAlarmReceiver.EXTRA_TITLE) == true)
        put("hasBody", intent?.hasExtra(AndroidAlarmReceiver.EXTRA_BODY) == true)
      }
    )
    configureLockScreenWindow()
    val title = getAlarmTitle(intent)
    val body = getAlarmBody(intent)
    AlarmOverlayService.stop(this)
    updateAlarmContent(title, body)
    startAlarmSignal()
  }

  override fun onDestroy() {
    logActivityEvent("info", "alarm activity onDestroy entered", captureKeyguardState())
    stopAlarmSignal()
    super.onDestroy()
  }

  private fun configureLockScreenWindow() {
    window.addFlags(
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }

    logActivityEvent(
      "info",
      "alarm activity window configured",
      JSONObject().apply {
        put("sdkInt", Build.VERSION.SDK_INT)
        put(
          "windowFlags",
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        )
      }
    )
    logActivityEvent("info", "alarm activity keyguard state captured", captureKeyguardState())
  }

  private fun getAlarmTitle(intent: Intent?): String =
    intent?.getStringExtra(AndroidAlarmReceiver.EXTRA_TITLE) ?: "熬中药提醒"

  private fun getAlarmBody(intent: Intent?): String =
    intent?.getStringExtra(AndroidAlarmReceiver.EXTRA_BODY) ?: "时间到了"

  private fun updateAlarmContent(title: String, body: String) {
    val titleView = titleTextView
    val bodyView = bodyTextView

    if (titleView == null || bodyView == null) {
      val presentationView = AlarmPresentationViewFactory.create(
        this,
        title,
        body,
        onDismiss = { dismissAlarm() },
        onOpenApp = { openApp() }
      )
      titleTextView = presentationView.titleView
      bodyTextView = presentationView.bodyView
      setContentView(presentationView.root)
      return
    }

    titleView.text = title
    bodyView.text = body
  }

  private fun dismissAlarm() {
    stopAlarmSignal()
    moveTaskToBack(true)
    finish()
  }

  private fun openApp() {
    stopAlarmSignal()
    startActivity(
      Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
    )
    finish()
  }

  private fun startAlarmSignal() {
    alarmSignal?.stop()
    alarmSignal = AlarmSignalController(this, "alarm activity").apply {
      start()
    }
  }

  private fun stopAlarmSignal() {
    alarmSignal?.stop()
    alarmSignal = null
  }

  private fun captureKeyguardState(): JSONObject {
    val keyguardManager = getSystemService(KeyguardManager::class.java)
    val powerManager = getSystemService(PowerManager::class.java)

    return JSONObject().apply {
      put("isKeyguardLocked", keyguardManager?.isKeyguardLocked == true)
      put("isDeviceLocked", keyguardManager?.isDeviceLocked == true)
      put("isInteractive", powerManager?.isInteractive == true)
      put("hasWindowFocus", hasWindowFocus())
      put("isFinishing", isFinishing)
      put("isChangingConfigurations", isChangingConfigurations)
    }
  }

  private fun logActivityEvent(level: String, message: String, details: JSONObject? = null) {
    AndroidAlarmDebugLog.append(this, level, "alarm", message, details)
  }
}
