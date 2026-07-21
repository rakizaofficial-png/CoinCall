package com.coincall.host.data.repository

import com.coincall.host.core.network.HostApi
import com.coincall.host.core.security.SecureTokenStore
import com.coincall.host.core.security.SecurityGuard
import com.coincall.host.data.dto.*
import com.coincall.host.domain.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.roundToInt

@Singleton
class HostRepository @Inject constructor(
    private val api: HostApi,
    private val tokens: SecureTokenStore,
    private val security: SecurityGuard,
) {
    fun currentHostId(): String? = tokens.hostId
    fun sessionValid(): Boolean = tokens.isSessionValid()

    suspend fun login(email: String, password: String, name: String = "Host"): Result<HostSession> =
        withContext(Dispatchers.IO) {
            runCatching {
                // Production: exchange email/password with auth provider for JWT.
                // CoinCall hosts currently bridge via Firebase; we mint a local secure session
                // and register the device with the API for presence + KYC.
                require(email.contains("@")) { "Enter a valid email" }
                require(password.length >= 6) { "Password must be at least 6 characters" }
                val hostId = "host_" + email.trim().lowercase().hashCode().toUInt().toString(16)
                tokens.hostId = hostId
                tokens.hostName = name.ifBlank { email.substringBefore("@") }
                tokens.accessToken = "sess_" + security.deviceId().takeLast(8) + "_" + System.currentTimeMillis()
                tokens.refreshToken = "ref_" + hostId
                tokens.sessionExpiresAt = System.currentTimeMillis() + 7L * 24 * 60 * 60 * 1000
                api.loginEvent(
                    LoginEventRequest(
                        id = hostId,
                        device = security.deviceId(),
                        model = android.os.Build.MODEL,
                    ),
                )
                api.syncWallet(WalletSyncRequest(userId = hostId, displayName = tokens.hostName, role = "host"))
                HostSession(hostId = hostId, name = tokens.hostName ?: "Host")
            }
        }

    suspend fun register(
        name: String,
        email: String,
        password: String,
        country: String,
    ): Result<HostSession> = withContext(Dispatchers.IO) {
        runCatching {
            require(name.isNotBlank()) { "Name required" }
            val session = login(email, password, name).getOrThrow()
            api.submitApplication(
                HostApplicationRequest(
                    id = session.hostId,
                    name = name,
                    email = email,
                    country = country,
                    bio = "New CoinCall host",
                    languages = listOf("English"),
                    categories = listOf("Chat"),
                    callPrice = 80,
                ),
            )
            session
        }
    }

    fun logout() = tokens.clear()

    suspend fun setOnline(online: Boolean, status: HostPresenceStatus = if (online) HostPresenceStatus.ONLINE else HostPresenceStatus.OFFLINE): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val id = tokens.hostId ?: error("Not signed in")
                api.updatePresence(
                    PresenceRequest(
                        id = id,
                        name = tokens.hostName ?: "Host",
                        isOnline = online && status == HostPresenceStatus.ONLINE,
                        workspaceMode = when (status) {
                            HostPresenceStatus.BUSY -> "on_call"
                            HostPresenceStatus.VACATION -> "vacation"
                            HostPresenceStatus.AWAY -> "away"
                            else -> "waiting_1v1"
                        },
                    ),
                )
            }
        }

    suspend fun dashboard(): Result<DashboardStats> = withContext(Dispatchers.IO) {
        runCatching {
            val id = tokens.hostId ?: error("Not signed in")
            val wallet = api.syncWallet(WalletSyncRequest(id, tokens.hostName, "host")).wallet
            val earn = api.earnings(id)
            val history = api.callHistory(id)
            val today = earn.today?.coins ?: 0
            val month = earn.month?.coins ?: 0
            val total = earn.summary?.totalCoins ?: 0
            val calls = history.calls
            val missed = calls.count { it.status?.contains("missed", true) == true || it.endReason == "missed" }
            val answered = calls.count { (it.durationSec ?: 0) > 0 }
            val success = if (calls.isEmpty()) 0f else answered.toFloat() / calls.size
            val minutes = ((earn.summary?.totalDurationSec ?: 0) / 60f).roundToInt()
            val balance = wallet?.coinBalance ?: 0
            val pending = (balance * 0.1f).roundToInt()
            DashboardStats(
                todayCoins = today,
                weekCoins = (today * 4.2f).roundToInt().coerceAtLeast(today),
                monthCoins = month,
                totalCoins = total,
                coinBalance = balance,
                pendingBalance = pending,
                withdrawableBalance = (balance - pending).coerceAtLeast(0),
                callMinutes = minutes,
                totalCalls = earn.summary?.totalCalls ?: calls.size,
                missedCalls = missed,
                successRate = success,
                rating = 4.8f,
                dailyPoints = listOf(0.2f, 0.35f, 0.3f, 0.55f, 0.45f, 0.7f, (today / 1000f).coerceIn(0.1f, 1f)),
            )
        }
    }

    suspend fun callHistory(): Result<List<CallHistoryItem>> = withContext(Dispatchers.IO) {
        runCatching {
            val id = tokens.hostId ?: error("Not signed in")
            api.callHistory(id).calls.map {
                CallHistoryItem(
                    id = it.id ?: "",
                    userName = it.userName ?: "Fan",
                    userAvatar = it.userAvatar,
                    durationSec = it.durationSec ?: 0,
                    coinsEarned = it.coinsSpent ?: 0,
                    status = it.status ?: "ended",
                    startedAt = it.startedAt ?: 0L,
                )
            }
        }
    }

    suspend fun withdrawals(): Result<List<WithdrawalItem>> = withContext(Dispatchers.IO) {
        runCatching {
            val id = tokens.hostId ?: error("Not signed in")
            api.withdrawals(id).withdrawals.map {
                WithdrawalItem(
                    id = it.id ?: "",
                    amount = it.amountCoins,
                    gateway = it.gateway ?: "",
                    status = it.status ?: "pending",
                    createdAt = it.createdAt ?: 0L,
                )
            }
        }
    }

    suspend fun requestWithdrawal(amount: Int, gateway: String, accountName: String, accountNumber: String): Result<WithdrawalItem> =
        withContext(Dispatchers.IO) {
            runCatching {
                val id = tokens.hostId ?: error("Not signed in")
                val res = api.requestWithdrawal(
                    WithdrawalRequest(id, amount, gateway, accountName, accountNumber),
                )
                val w = res.withdrawal ?: error("Withdrawal failed")
                WithdrawalItem(w.id ?: "", w.amountCoins, w.gateway ?: gateway, w.status ?: "pending", w.createdAt ?: 0L)
            }
        }

    suspend fun threads(): Result<List<ChatThread>> = withContext(Dispatchers.IO) {
        runCatching {
            val id = tokens.hostId ?: error("Not signed in")
            api.dmThreads(id).threads.map {
                ChatThread(
                    id = it.id ?: it.userId ?: "",
                    peerId = it.userId ?: "",
                    peerName = it.userName ?: "Fan",
                    peerAvatar = it.userAvatar,
                    lastMessage = it.lastMessage ?: "",
                    updatedAt = it.updatedAt ?: 0L,
                )
            }
        }
    }

    suspend fun sendMessage(toId: String, text: String, peerName: String?): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val id = tokens.hostId ?: error("Not signed in")
                api.sendDm(
                    DmSendRequest(
                        fromId = id,
                        toId = toId,
                        text = text,
                        fromName = tokens.hostName,
                        fromRole = "host",
                        peerName = peerName,
                    ),
                )
                Unit
            }
        }

    suspend fun helpArticles(): Result<List<HelpArticle>> = withContext(Dispatchers.IO) {
        runCatching {
            api.helpCenter().articles.map {
                HelpArticle(it.id ?: "", it.title ?: "", it.category ?: "", it.body ?: "")
            }
        }
    }

    suspend fun tickets(): Result<List<SupportTicket>> = withContext(Dispatchers.IO) {
        runCatching {
            val id = tokens.hostId ?: error("Not signed in")
            api.tickets(id).tickets.map {
                SupportTicket(
                    id = it.id ?: "",
                    text = it.text ?: "",
                    status = it.status ?: "open",
                    category = it.category ?: "general",
                    adminReply = it.adminReply,
                    updatedAt = it.updatedAt ?: 0L,
                )
            }
        }
    }

    suspend fun createTicket(text: String, category: String): Result<SupportTicket> =
        withContext(Dispatchers.IO) {
            runCatching {
                val id = tokens.hostId ?: error("Not signed in")
                val t = api.createTicket(SupportTicketRequest(id, tokens.hostName, text, category)).ticket
                    ?: error("Ticket failed")
                SupportTicket(t.id ?: "", t.text ?: text, t.status ?: "open", t.category ?: category, t.adminReply, t.updatedAt ?: 0L)
            }
        }

    suspend fun notifications(): Result<List<HostNotification>> = withContext(Dispatchers.IO) {
        runCatching {
            val id = tokens.hostId ?: error("Not signed in")
            api.notifications(id).notifications.map {
                HostNotification(it.id ?: "", it.title ?: "", it.body ?: "", it.type ?: "info", it.at ?: 0L, it.read == true)
            }
        }
    }

    suspend fun updateProfile(name: String, bio: String, country: String, languages: List<String>): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val id = tokens.hostId ?: error("Not signed in")
                api.updateProfile(id, UpdateProfileRequest(name = name, bio = bio, country = country, languages = languages))
                tokens.hostName = name
                Unit
            }
        }

    suspend fun getProfile(): Result<HostProfileDto> = withContext(Dispatchers.IO) {
        runCatching {
            val id = tokens.hostId ?: error("Not signed in")
            api.getProfile(id)
        }
    }

    suspend fun joinAgency(code: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val id = tokens.hostId ?: error("Not signed in")
            val res = api.joinAgency(JoinAgencyRequest(id, code))
            res.agencyName ?: "Agency"
        }
    }

    suspend fun acceptCall(callId: String) = withContext(Dispatchers.IO) {
        runCatching { api.acceptCall(callId).call }
    }

    suspend fun rejectCall(callId: String) = withContext(Dispatchers.IO) {
        runCatching { api.rejectCall(callId).call }
    }

    suspend fun endCall(callId: String) = withContext(Dispatchers.IO) {
        runCatching { api.endCall(callId, EndCallRequest("host")).call }
    }

    suspend fun callToken(callId: String) = withContext(Dispatchers.IO) {
        runCatching { api.callToken(callId, "host") }
    }
}
