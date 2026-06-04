package com.farmnest

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.graphics.Color
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createNotificationChannels()
  }

  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

      // Create both channel IDs so old + new registrations both work
      val channelIds = listOf(
        "farmnest_notifications",
        "farmnest_default"
      )

      for (channelId in channelIds) {
        // Delete old channel first to reset any user-changed settings
        // (only matters on re-installs where importance may have been lowered)
        try { nm.deleteNotificationChannel(channelId) } catch (_: Exception) {}

        val channel = NotificationChannel(
          channelId,
          "Farmnest Notifications",
          NotificationManager.IMPORTANCE_HIGH
        ).apply {
          description = "Bid updates, orders, investments and account activity"
          enableLights(true)
          lightColor = Color.parseColor("#2E7D32")
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 300, 200, 300)
          setShowBadge(true)
          lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(channel)
      }
    }
  }
}
