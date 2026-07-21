package com.coincall.host.domain.model

enum class HostPresenceStatus { ONLINE, OFFLINE, BUSY, AWAY, VACATION }

data class HostSession(
    val hostId: String,
    val name: String,
    val avatarUrl: String? = null,
    val email: String? = null,
    val verified: Boolean = false,
)

data class DashboardStats(
    val todayCoins: Int = 0,
    val weekCoins: Int = 0,
    val monthCoins: Int = 0,
    val totalCoins: Int = 0,
    val coinBalance: Int = 0,
    val pendingBalance: Int = 0,
    val withdrawableBalance: Int = 0,
    val callMinutes: Int = 0,
    val totalCalls: Int = 0,
    val missedCalls: Int = 0,
    val successRate: Float = 0f,
    val rating: Float = 4.8f,
    val dailyPoints: List<Float> = emptyList(),
)

data class CallHistoryItem(
    val id: String,
    val userName: String,
    val userAvatar: String?,
    val durationSec: Int,
    val coinsEarned: Int,
    val status: String,
    val startedAt: Long,
    val rating: Float? = null,
)

data class WithdrawalItem(
    val id: String,
    val amount: Int,
    val gateway: String,
    val status: String,
    val createdAt: Long,
)

data class ChatThread(
    val id: String,
    val peerId: String,
    val peerName: String,
    val peerAvatar: String?,
    val lastMessage: String,
    val updatedAt: Long,
)

data class HelpArticle(val id: String, val title: String, val category: String, val body: String)

data class SupportTicket(
    val id: String,
    val text: String,
    val status: String,
    val category: String,
    val adminReply: String?,
    val updatedAt: Long,
)

data class HostNotification(
    val id: String,
    val title: String,
    val body: String,
    val type: String,
    val at: Long,
    val read: Boolean,
)

data class AgencyInfo(
    val name: String,
    val manager: String,
    val contact: String,
    val commissionPercent: Int,
    val announcements: List<String>,
)

data class ReferralInfo(
    val code: String,
    val link: String,
    val earnings: Int,
    val invites: Int,
)
