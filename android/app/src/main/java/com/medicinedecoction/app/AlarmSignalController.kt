package com.medicinedecoction.app

import android.content.Context
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.VibrationAttributes
import android.os.Vibrator
import android.os.VibratorManager
import org.json.JSONObject

class AlarmSignalController(
  private val context: Context,
  private val logPrefix: String
) {
  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null

  fun start() {
    startRingtone()
    startVibration()
  }

  fun stop() {
    ringtone?.stop()
    ringtone = null
    vibrator?.cancel()
    vibrator = null
  }

  private fun startRingtone() {
    try {
      val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

      ringtone = RingtoneManager.getRingtone(context, alarmUri)?.apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          isLooping = true
        }
        play()
      }
      AndroidAlarmDebugLog.append(context, "info", "alarm", "$logPrefix sound started")
    } catch (error: Exception) {
      AndroidAlarmDebugLog.append(
        context,
        "error",
        "alarm",
        "$logPrefix sound failed",
        JSONObject().apply {
          put("error", error.message ?: error.javaClass.simpleName)
        }
      )
    }
  }

  private fun startVibration() {
    try {
      vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(VibratorManager::class.java).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }

      val pattern = longArrayOf(0, 900, 300, 900, 300, 900, 700)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val effect = VibrationEffect.createWaveform(pattern, 0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          vibrator?.vibrate(
            effect,
            VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM)
          )
        } else {
          @Suppress("DEPRECATION")
          vibrator?.vibrate(effect, createAlarmAudioAttributes())
        }
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(pattern, 0, createAlarmAudioAttributes())
      }
      AndroidAlarmDebugLog.append(context, "info", "alarm", "$logPrefix vibration started")
    } catch (error: Exception) {
      AndroidAlarmDebugLog.append(
        context,
        "error",
        "alarm",
        "$logPrefix vibration failed",
        JSONObject().apply {
          put("error", error.message ?: error.javaClass.simpleName)
        }
      )
    }
  }

  private fun createAlarmAudioAttributes(): AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
}
