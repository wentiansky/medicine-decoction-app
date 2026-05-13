package com.medicinedecoction.app

import android.app.ActivityOptions
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.roundToLong

class AndroidAlarmModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val BACKUP_ALARM_REQUEST_CODE_OFFSET = 10000
  }

  override fun getName(): String = "AndroidAlarmScheduler"

  @ReactMethod
  fun getNativeAlarmDebugEvents(promise: Promise) {
    try {
      promise.resolve(AndroidAlarmDebugLog.read(reactContext).toString())
    } catch (error: Exception) {
      promise.reject("ERR_ANDROID_ALARM_DEBUG_READ", error)
    }
  }

  @ReactMethod
  fun clearNativeAlarmDebugEvents(promise: Promise) {
    try {
      AndroidAlarmDebugLog.clear(reactContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("ERR_ANDROID_ALARM_DEBUG_CLEAR", error)
    }
  }

  @ReactMethod
  fun getAlarmPermissionState(promise: Promise) {
    try {
      val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val notificationManager = reactContext.getSystemService(NotificationManager::class.java)
      val state = Arguments.createMap().apply {
        putBoolean(
          "canScheduleExactAlarms",
          Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            alarmManager.canScheduleExactAlarms()
        )
        putBoolean(
          "canUseFullScreenIntent",
          Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
            notificationManager.canUseFullScreenIntent()
        )
        putBoolean(
          "notificationsEnabled",
          NotificationManagerCompat.from(reactContext).areNotificationsEnabled()
        )
        putBoolean(
          "canDrawOverlays",
          Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            Settings.canDrawOverlays(reactContext)
        )
      }

      promise.resolve(state)
    } catch (error: Exception) {
      promise.reject("ERR_ANDROID_ALARM_PERMISSION_STATE", error)
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      promise.resolve(false)
      return
    }

    openPackageSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, promise)
  }

  @ReactMethod
  fun openFullScreenIntentSettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      promise.resolve(false)
      return
    }

    openPackageSettings(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, promise)
  }

  @ReactMethod
  fun openNotificationSettings(promise: Promise) {
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
    }

    openSettingsWithFallback(intent, promise)
  }

  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(false)
      return
    }

    val packageName = reactContext.packageName
    val intents = createVendorPermissionIntents(packageName).toMutableList()
    intents.add(
      Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
        data = Uri.parse("package:$packageName")
      }
    )
    intents.add(createApplicationDetailsIntent())

    openFirstAvailableSetting(intents, promise)
  }

  @ReactMethod
  fun scheduleAlarm(
    requestCode: Double,
    seconds: Double,
    title: String,
    body: String,
    promise: Promise
  ) {
    try {
      AndroidAlarmReceiver.ensureNotificationChannel(reactContext)

      val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
        !alarmManager.canScheduleExactAlarms()
      ) {
        promise.reject(
          "ERR_ANDROID_EXACT_ALARM_PERMISSION",
          "Exact alarm permission is not enabled for this app."
        )
        AndroidAlarmDebugLog.append(
          reactContext,
          "error",
          "alarm",
          "schedule blocked by exact alarm permission"
        )
        return
      }

      val safeRequestCode = requestCode.toInt()
      val triggerAtMillis = System.currentTimeMillis() + max(1, seconds.roundToLong()) * 1000L
      val alarmIntent = createAlarmPendingIntent(safeRequestCode, title, body)
      val showIntent = createAlarmActivityPendingIntent(
        safeRequestCode + BACKUP_ALARM_REQUEST_CODE_OFFSET,
        title,
        body
      )

      alarmManager.setAlarmClock(
        AlarmManager.AlarmClockInfo(triggerAtMillis, showIntent),
        alarmIntent
      )

      AndroidAlarmDebugLog.append(
        reactContext,
        "info",
        "alarm",
        "native setAlarmClock scheduled",
        JSONObject().apply {
          put("requestCode", safeRequestCode)
          put("seconds", max(1, seconds.roundToLong()))
          put("triggerAtMillis", triggerAtMillis)
          put("operation", "broadcast")
          put("showIntent", "alarm-activity")
        }
      )

      promise.resolve(triggerAtMillis.toDouble())
    } catch (error: Exception) {
      promise.reject("ERR_ANDROID_ALARM_SCHEDULE", error)
    }
  }

  @ReactMethod
  fun cancelAlarm(requestCode: Double, promise: Promise) {
    try {
      val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.cancel(createAlarmPendingIntent(
        requestCode.toInt() + BACKUP_ALARM_REQUEST_CODE_OFFSET,
        "",
        ""
      ))
      alarmManager.cancel(createAlarmPendingIntent(requestCode.toInt(), "", ""))
      alarmManager.cancel(createAlarmActivityPendingIntent(requestCode.toInt(), "", ""))
      alarmManager.cancel(createAlarmActivityPendingIntent(
        requestCode.toInt() + BACKUP_ALARM_REQUEST_CODE_OFFSET,
        "",
        ""
      ))
      alarmManager.cancel(createMainActivityPendingIntent(requestCode.toInt()))
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("ERR_ANDROID_ALARM_CANCEL", error)
    }
  }

  private fun createAlarmActivityPendingIntent(
    requestCode: Int,
    title: String,
    body: String
  ): PendingIntent {
    val intent = Intent(reactContext, AlarmAlertActivity::class.java).apply {
      action = AndroidAlarmReceiver.ACTION_FIRE
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_SINGLE_TOP or
        Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtra(AndroidAlarmReceiver.EXTRA_TITLE, title)
      putExtra(AndroidAlarmReceiver.EXTRA_BODY, body)
      putExtra(
        AndroidAlarmReceiver.EXTRA_LAUNCH_SOURCE,
        AndroidAlarmReceiver.LAUNCH_SOURCE_EXTERNAL
      )
    }

    return PendingIntent.getActivity(
      reactContext,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or AndroidAlarmReceiver.pendingIntentImmutableFlag(),
      createAlarmActivityPendingIntentOptions()
    )
  }

  private fun createMainActivityPendingIntent(requestCode: Int): PendingIntent {
    val intent = Intent(reactContext, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_SINGLE_TOP or
        Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    return PendingIntent.getActivity(
      reactContext,
      requestCode + 3,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or AndroidAlarmReceiver.pendingIntentImmutableFlag()
    )
  }

  private fun createAlarmPendingIntent(
    requestCode: Int,
    title: String,
    body: String
  ): PendingIntent {
    val intent = Intent(reactContext, AndroidAlarmReceiver::class.java).apply {
      action = AndroidAlarmReceiver.ACTION_FIRE
      putExtra(AndroidAlarmReceiver.EXTRA_TITLE, title)
      putExtra(AndroidAlarmReceiver.EXTRA_BODY, body)
    }

    return PendingIntent.getBroadcast(
      reactContext,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or AndroidAlarmReceiver.pendingIntentImmutableFlag()
    )
  }

  private fun openPackageSettings(action: String, promise: Promise) {
    val intent = Intent(action).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      data = Uri.parse("package:${reactContext.packageName}")
    }

    openSettingsWithFallback(intent, promise)
  }

  private fun createVendorPermissionIntents(packageName: String): List<Intent> {
    val intents = mutableListOf<Intent>()

    if (isXiaomiDevice()) {
      intents.addAll(createXiaomiPermissionIntents(packageName))
    }

    if (isOppoFamilyDevice()) {
      intents.addAll(createOppoPermissionIntents(packageName))
    }

    if (isVivoFamilyDevice()) {
      intents.addAll(createVivoPermissionIntents(packageName))
    }

    if (isHuaweiFamilyDevice()) {
      intents.addAll(createHuaweiPermissionIntents(packageName))
    }

    return intents
  }

  private fun createXiaomiPermissionIntents(packageName: String): List<Intent> = listOf(
    Intent("miui.intent.action.APP_PERM_EDITOR").apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setClassName(
        "com.miui.securitycenter",
        "com.miui.permcenter.permissions.PermissionsEditorActivity"
      )
      putExtra("extra_pkgname", packageName)
    },
    Intent("miui.intent.action.APP_PERM_EDITOR").apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setClassName(
        "com.miui.securitycenter",
        "com.miui.permcenter.permissions.AppPermissionsEditorActivity"
      )
      putExtra("extra_pkgname", packageName)
    },
    Intent("miui.intent.action.APP_PERM_EDITOR").apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setPackage("com.miui.securitycenter")
      putExtra("extra_pkgname", packageName)
    }
  )

  private fun createOppoPermissionIntents(packageName: String): List<Intent> = listOf(
    Intent().apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setClassName(
        "com.coloros.safecenter",
        "com.coloros.safecenter.permission.PermissionAppAllPermissionActivity"
      )
      putExtra("packageName", packageName)
    },
    Intent().apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setClassName(
        "com.oplus.safecenter",
        "com.oplus.safecenter.permission.PermissionAppAllPermissionActivity"
      )
      putExtra("packageName", packageName)
    },
    Intent().apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setClassName(
        "com.coloros.safecenter",
        "com.coloros.safecenter.startupapp.StartupAppListActivity"
      )
    }
  )

  private fun createVivoPermissionIntents(packageName: String): List<Intent> = listOf(
    Intent().apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setClassName(
        "com.vivo.permissionmanager",
        "com.vivo.permissionmanager.activity.SoftPermissionDetailActivity"
      )
      putExtra("packagename", packageName)
    },
    Intent().apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setClassName(
        "com.iqoo.secure",
        "com.iqoo.secure.ui.phoneoptimize.BgStartUpManagerActivity"
      )
    }
  )

  private fun createHuaweiPermissionIntents(packageName: String): List<Intent> = listOf(
    Intent().apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setClassName(
        "com.huawei.systemmanager",
        "com.huawei.permissionmanager.ui.MainActivity"
      )
      putExtra("packageName", packageName)
    },
    Intent().apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      setClassName(
        "com.huawei.systemmanager",
        "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
      )
    }
  )

  private fun isXiaomiDevice(): Boolean {
    val manufacturer = Build.MANUFACTURER.lowercase()
    val brand = Build.BRAND.lowercase()
    return manufacturer.contains("xiaomi") ||
      manufacturer.contains("redmi") ||
      manufacturer.contains("poco") ||
      brand.contains("xiaomi") ||
      brand.contains("redmi") ||
      brand.contains("poco")
  }

  private fun isOppoFamilyDevice(): Boolean {
    val manufacturer = Build.MANUFACTURER.lowercase()
    val brand = Build.BRAND.lowercase()
    return manufacturer.contains("oppo") ||
      manufacturer.contains("oneplus") ||
      manufacturer.contains("realme") ||
      brand.contains("oppo") ||
      brand.contains("oneplus") ||
      brand.contains("realme")
  }

  private fun isVivoFamilyDevice(): Boolean {
    val manufacturer = Build.MANUFACTURER.lowercase()
    val brand = Build.BRAND.lowercase()
    return manufacturer.contains("vivo") ||
      manufacturer.contains("iqoo") ||
      brand.contains("vivo") ||
      brand.contains("iqoo")
  }

  private fun isHuaweiFamilyDevice(): Boolean {
    val manufacturer = Build.MANUFACTURER.lowercase()
    val brand = Build.BRAND.lowercase()
    return manufacturer.contains("huawei") ||
      manufacturer.contains("honor") ||
      brand.contains("huawei") ||
      brand.contains("honor")
  }

  private fun createApplicationDetailsIntent(): Intent =
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      data = Uri.parse("package:${reactContext.packageName}")
    }

  private fun openFirstAvailableSetting(intents: List<Intent>, promise: Promise) {
    var lastError: Exception? = null
    for (intent in intents) {
      try {
        reactContext.startActivity(intent)
        AndroidAlarmDebugLog.append(
          reactContext,
          "info",
          "permissions",
          "opened Android setting",
          JSONObject().apply {
            put("action", intent.action ?: "")
            put("package", intent.`package` ?: "")
            put("component", intent.component?.flattenToShortString() ?: "")
          }
        )
        promise.resolve(true)
        return
      } catch (error: Exception) {
        lastError = error
      }
    }

    promise.reject("ERR_ANDROID_ALARM_OPEN_SETTINGS", lastError)
  }

  private fun openSettingsWithFallback(intent: Intent, promise: Promise) {
    try {
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      try {
        val fallbackIntent = createApplicationDetailsIntent()
        reactContext.startActivity(fallbackIntent)
        promise.resolve(true)
      } catch (fallbackError: Exception) {
        promise.reject("ERR_ANDROID_ALARM_OPEN_SETTINGS", fallbackError)
      }
    }
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
