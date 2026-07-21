package com.coincall.host.core.security

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.ComponentActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SecurityGuard @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    fun isDeviceCompromised(): Boolean {
        if (isRooted()) return true
        if (isEmulator() && !BuildConfigDebugAllow) return false
        return false
    }

    fun isRooted(): Boolean {
        val paths = arrayOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
        )
        if (paths.any { File(it).exists() }) return true
        return try {
            Runtime.getRuntime().exec(arrayOf("which", "su")).inputStream.bufferedReader().readLine() != null
        } catch (_: Exception) {
            false
        }
    }

    fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
            || Build.MODEL.contains("Emulator", true)
            || Build.MODEL.contains("Android SDK", true)
            || Build.MANUFACTURER.contains("Genymotion", true)
            || Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic")
            || Build.PRODUCT.contains("sdk", true))
    }

    fun deviceId(): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"

    fun enableScreenshotProtection(activity: ComponentActivity) {
        activity.window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE,
        )
    }

    fun disableScreenshotProtection(activity: ComponentActivity) {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    companion object {
        // Emulators allowed in debug; release builds still check root.
        const val BuildConfigDebugAllow = true
    }
}
