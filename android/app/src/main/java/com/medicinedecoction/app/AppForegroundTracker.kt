package com.medicinedecoction.app

object AppForegroundTracker {
  @Volatile
  var isMainActivityForeground: Boolean = false
}
