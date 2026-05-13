package com.medicinedecoction.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object AndroidAlarmDebugLog {
  private const val PREFS_NAME = "medicine_decoction_native_alarm_debug"
  private const val EVENTS_KEY = "events"
  private const val MAX_EVENTS = 100

  fun append(
    context: Context,
    level: String,
    module: String,
    message: String,
    details: JSONObject? = null
  ) {
    try {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val events = JSONArray(prefs.getString(EVENTS_KEY, "[]") ?: "[]")
      val nextEvents = JSONArray()
      nextEvents.put(
        JSONObject().apply {
          put("id", "native-${System.currentTimeMillis()}-${events.length()}")
          put("timestamp", utcTimestamp())
          put("level", level)
          put("module", "native:$module")
          put("message", message)
          if (details != null) put("details", details)
        }
      )

      for (index in 0 until minOf(events.length(), MAX_EVENTS - 1)) {
        nextEvents.put(events.getJSONObject(index))
      }

      prefs.edit().putString(EVENTS_KEY, nextEvents.toString()).apply()
    } catch (_: Exception) {
      // Native diagnostics must never break the alarm path.
    }
  }

  fun read(context: Context): JSONArray {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    return JSONArray(prefs.getString(EVENTS_KEY, "[]") ?: "[]")
  }

  fun clear(context: Context) {
    context
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .remove(EVENTS_KEY)
      .apply()
  }

  private fun utcTimestamp(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(Date())
  }
}
