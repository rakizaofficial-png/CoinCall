package com.coincall.host.core.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.coincall.host.R

/**
 * Local / FCM-ready notification helper for host alerts.
 * Production wires FirebaseMessagingService → [notifyHost].
 */
object HostPush {
    const val CHANNEL_CALLS = "host_calls"
    const val CHANNEL_PAYOUTS = "host_payouts"
    const val CHANNEL_CHAT = "host_chat"
    const val CHANNEL_ADMIN = "host_admin"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        listOf(
            CHANNEL_CALLS to "Incoming calls",
            CHANNEL_PAYOUTS to "Withdrawals & earnings",
            CHANNEL_CHAT to "Messages",
            CHANNEL_ADMIN to "Admin & agency",
        ).forEach { (id, name) ->
            val ch = NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "CoinCall Host · $name"
                enableVibration(true)
            }
            mgr.createNotificationChannel(ch)
        }
    }

    fun notifyHost(
        context: Context,
        channelId: String,
        notificationId: Int,
        title: String,
        body: String,
        pushEnabled: Boolean = true,
    ) {
        if (!pushEnabled) return
        ensureChannels(context)
        val n = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        runCatching {
            NotificationManagerCompat.from(context).notify(notificationId, n)
        }
    }
}
