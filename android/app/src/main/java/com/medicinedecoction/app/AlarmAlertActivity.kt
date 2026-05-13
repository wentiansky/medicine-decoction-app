package com.medicinedecoction.app

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

class AlarmAlertActivity : Activity() {
  private var alarmSignal: AlarmSignalController? = null

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

    val title = intent.getStringExtra(AndroidAlarmReceiver.EXTRA_TITLE) ?: "熬中药提醒"
    val body = intent.getStringExtra(AndroidAlarmReceiver.EXTRA_BODY) ?: "时间到了"

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
    setContentView(createContentView(title, body))
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

  private fun createContentView(title: String, body: String): LinearLayout {
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
      setOnClickListener { dismissAlarm() }
    }

    val openAppButton = Button(this).apply {
      text = "打开应用"
      textSize = 18f
      setOnClickListener { openApp() }
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

  private fun dismissAlarm() {
    stopAlarmSignal()
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
