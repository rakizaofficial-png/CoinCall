package com.coincall.host.data.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class LoginEventRequest(
    val id: String,
    val ip: String? = null,
    val device: String? = null,
    val platform: String = "android",
    val model: String? = null,
    val appVersion: String = "1.0.0",
)

@JsonClass(generateAdapter = true)
data class HostApplicationRequest(
    val id: String,
    val name: String,
    val email: String? = null,
    val country: String? = null,
    val bio: String? = null,
    val languages: List<String>? = null,
    val categories: List<String>? = null,
    val callPrice: Int? = null,
    val photoUrl: String? = null,
    val photoUrls: List<String>? = null,
    val videoUrl: String? = null,
    val idDocumentUrl: String? = null,
    val selfieUrl: String? = null,
)

@JsonClass(generateAdapter = true)
data class PresenceRequest(
    val id: String,
    val name: String,
    val avatarUrl: String? = null,
    val country: String? = null,
    val ratePerMinute: Int? = null,
    val isOnline: Boolean = false,
    val isLive: Boolean = false,
    val isOnCall: Boolean = false,
    val workspaceMode: String? = "waiting_1v1",
)

@JsonClass(generateAdapter = true)
data class PresenceResponse(val ok: Boolean = true, val host: Map<String, Any>? = null)

@JsonClass(generateAdapter = true)
data class HostOkResponse(val ok: Boolean = true, val host: Map<String, Any>? = null)

@JsonClass(generateAdapter = true)
data class HostProfileDto(
    val id: String? = null,
    val name: String? = null,
    val bio: String? = null,
    val country: String? = null,
    val photoUrl: String? = null,
    val avatarUrl: String? = null,
    val languages: List<String>? = null,
    val categories: List<String>? = null,
    val callPrice: Int? = null,
    val hostStatus: String? = null,
    val isVerified: Boolean? = null,
)

@JsonClass(generateAdapter = true)
data class UpdateProfileRequest(
    val name: String? = null,
    val bio: String? = null,
    val country: String? = null,
    val photoUrl: String? = null,
    val languages: List<String>? = null,
    val categories: List<String>? = null,
    val callPrice: Int? = null,
)

@JsonClass(generateAdapter = true)
data class WalletSyncRequest(val userId: String, val displayName: String? = null, val role: String = "host")

@JsonClass(generateAdapter = true)
data class WalletDto(val userId: String? = null, val coinBalance: Int = 0, val xp: Int = 0, val appId: String? = null, val displayName: String? = null)

@JsonClass(generateAdapter = true)
data class WalletResponse(val ok: Boolean = true, val wallet: WalletDto? = null)

@JsonClass(generateAdapter = true)
data class EarningsSummary(
    val callCoins: Int = 0,
    val giftCoins: Int = 0,
    val totalCoins: Int = 0,
    val totalCalls: Int = 0,
    val totalDurationSec: Int = 0,
    val totalGifts: Int = 0,
)

@JsonClass(generateAdapter = true)
data class EarningsBucket(val coins: Int = 0, val calls: Int = 0, val gifts: Int = 0, val minutes: Int = 0)

@JsonClass(generateAdapter = true)
data class EarningsResponse(
    val summary: EarningsSummary? = null,
    val today: EarningsBucket? = null,
    val month: EarningsBucket? = null,
    val calls: List<CallHistoryItemDto>? = null,
    val gifts: List<Map<String, Any>>? = null,
)

@JsonClass(generateAdapter = true)
data class CallHistoryItemDto(
    val id: String? = null,
    val hostId: String? = null,
    val userId: String? = null,
    val userName: String? = null,
    val userAvatar: String? = null,
    val ratePerMinute: Int? = null,
    val billedMinutes: Int? = null,
    val coinsSpent: Int? = null,
    val status: String? = null,
    val startedAt: Long? = null,
    val endedAt: Long? = null,
    val durationSec: Int? = null,
    val endReason: String? = null,
)

@JsonClass(generateAdapter = true)
data class CallHistoryResponse(val calls: List<CallHistoryItemDto> = emptyList(), val summary: EarningsSummary? = null)

@JsonClass(generateAdapter = true)
data class WithdrawalRequest(
    val hostId: String,
    val amountCoins: Int,
    val gateway: String,
    val accountName: String,
    val accountNumber: String,
)

@JsonClass(generateAdapter = true)
data class WithdrawalDto(
    val id: String? = null,
    val hostId: String? = null,
    val amountCoins: Int = 0,
    val gateway: String? = null,
    val status: String? = null,
    val accountName: String? = null,
    val accountNumber: String? = null,
    val createdAt: Long? = null,
    val updatedAt: Long? = null,
)

@JsonClass(generateAdapter = true)
data class WithdrawalResponse(val ok: Boolean = true, val withdrawal: WithdrawalDto? = null, val wallet: WalletDto? = null)

@JsonClass(generateAdapter = true)
data class WithdrawalsListResponse(val withdrawals: List<WithdrawalDto> = emptyList())

@JsonClass(generateAdapter = true)
data class DmThreadDto(
    val id: String? = null,
    val userId: String? = null,
    val userName: String? = null,
    val userAvatar: String? = null,
    val lastMessage: String? = null,
    val updatedAt: Long? = null,
)

@JsonClass(generateAdapter = true)
data class DmThreadsResponse(val threads: List<DmThreadDto> = emptyList())

@JsonClass(generateAdapter = true)
data class DmSendRequest(
    val fromId: String,
    val toId: String,
    val text: String,
    val fromName: String? = null,
    val fromAvatar: String? = null,
    val fromRole: String = "host",
    val peerName: String? = null,
    val peerAvatar: String? = null,
)

@JsonClass(generateAdapter = true)
data class DmMessageDto(
    val id: String? = null,
    val fromId: String? = null,
    val toId: String? = null,
    val text: String? = null,
    val fromName: String? = null,
    val createdAt: Long? = null,
)

@JsonClass(generateAdapter = true)
data class DmSendResponse(val ok: Boolean = true, val chatId: String? = null, val message: DmMessageDto? = null)

@JsonClass(generateAdapter = true)
data class DmMessagesResponse(val chatId: String? = null, val messages: List<DmMessageDto> = emptyList())

@JsonClass(generateAdapter = true)
data class SupportTicketRequest(val hostId: String, val hostName: String? = null, val text: String, val category: String? = "general")

@JsonClass(generateAdapter = true)
data class SupportTicketDto(
    val id: String? = null,
    val hostId: String? = null,
    val hostName: String? = null,
    val text: String? = null,
    val status: String? = null,
    val category: String? = null,
    val adminReply: String? = null,
    val createdAt: Long? = null,
    val updatedAt: Long? = null,
)

@JsonClass(generateAdapter = true)
data class SupportTicketCreateResponse(val ok: Boolean = true, val ticket: SupportTicketDto? = null)

@JsonClass(generateAdapter = true)
data class SupportTicketsResponse(val tickets: List<SupportTicketDto> = emptyList())

@JsonClass(generateAdapter = true)
data class HelpArticleDto(val id: String? = null, val title: String? = null, val category: String? = null, val body: String? = null)

@JsonClass(generateAdapter = true)
data class HelpCenterResponse(val articles: List<HelpArticleDto> = emptyList())

@JsonClass(generateAdapter = true)
data class NotificationDto(
    val id: String? = null,
    val hostUid: String? = null,
    val type: String? = null,
    val title: String? = null,
    val body: String? = null,
    val at: Long? = null,
    val read: Boolean? = false,
)

@JsonClass(generateAdapter = true)
data class NotificationsResponse(val notifications: List<NotificationDto> = emptyList())

@JsonClass(generateAdapter = true)
data class ActiveUserDto(val userId: String? = null, val userName: String? = null, val avatarUrl: String? = null, val role: String? = null)

@JsonClass(generateAdapter = true)
data class ActiveUsersResponse(val users: List<ActiveUserDto> = emptyList(), val count: Int = 0)

@JsonClass(generateAdapter = true)
data class MassTextRequest(val hostId: String, val hostName: String? = null, val text: String)

@JsonClass(generateAdapter = true)
data class MassTextResponse(val sent: Int = 0, val userIds: List<String> = emptyList(), val error: String? = null)

@JsonClass(generateAdapter = true)
data class JoinAgencyRequest(val hostId: String, val referralCode: String)

@JsonClass(generateAdapter = true)
data class JoinAgencyResponse(val ok: Boolean = true, val agencyId: String? = null, val agencyName: String? = null, val joined: Boolean? = null)

@JsonClass(generateAdapter = true)
data class CallDto(
    val id: String? = null,
    val hostId: String? = null,
    val userId: String? = null,
    val userName: String? = null,
    val userAvatar: String? = null,
    val status: String? = null,
    val channel: String? = null,
    val ratePerMinute: Int? = null,
)

@JsonClass(generateAdapter = true)
data class CallEnvelope(val call: CallDto? = null)

@JsonClass(generateAdapter = true)
data class EndCallRequest(val reason: String = "host")

@JsonClass(generateAdapter = true)
data class CallTokenResponse(
    val token: String? = null,
    val appId: String? = null,
    val channel: String? = null,
    val uid: Int? = null,
    val call: CallDto? = null,
)
