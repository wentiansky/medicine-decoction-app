package com.medicinedecoction.app

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

data class AlarmPresentationView(
  val root: LinearLayout,
  val titleView: TextView,
  val bodyView: TextView
)

object AlarmPresentationViewFactory {
  fun create(
    context: Context,
    title: String,
    body: String,
    onDismiss: () -> Unit,
    onOpenApp: () -> Unit
  ): AlarmPresentationView {
    val density = context.resources.displayMetrics.density
    val root = LinearLayout(context).apply {
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

    val titleView = TextView(context).apply {
      text = title
      setTextColor(Color.WHITE)
      textSize = 30f
      gravity = Gravity.CENTER
    }

    val bodyView = TextView(context).apply {
      text = body
      setTextColor(Color.rgb(255, 232, 199))
      textSize = 24f
      gravity = Gravity.CENTER
      setPadding(0, (18 * density).toInt(), 0, (34 * density).toInt())
    }

    val dismissButton = Button(context).apply {
      text = "我知道了"
      textSize = 20f
      setOnClickListener { onDismiss() }
    }

    val openAppButton = Button(context).apply {
      text = "打开应用"
      textSize = 18f
      setOnClickListener { onOpenApp() }
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

    return AlarmPresentationView(root, titleView, bodyView)
  }
}
