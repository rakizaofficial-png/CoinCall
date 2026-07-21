package com.coincall.host.data.repository

import com.coincall.host.core.calc.EarningsCalculator
import com.coincall.host.core.calc.WithdrawalValidator
import com.coincall.host.core.network.HostApi
import com.coincall.host.core.security.JwtSession
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
    fun sessionValid(): Boolean =
        tokens.isSessionValid() && JwtSession.isValid(tokens.accessToken)

    suspend fun login(email: String, password: String, name: String = "Host"): Result<HostSession> =
        withContext(Dispatchers.IO) {
            runCatching {
                require(email.contains("@")) { "Enter a valid email" }
                require(password.length >= 6) { "Password must be at least 6 characters" }
                if (security.isRooted()) {
                    // Soft warn — still allow debug; release builds should hard-block via UI.
                }
                val hostId = "host_" + email.trim().lowercase().hashCode().toUInt().toString(16)
                val display = name.ifBlank { email.substringBefore("@") }
                val ttl = 7L * 24 * 60 * 60 * 1000
                val jwt = JwtSession.mint(hostId, display, ttl)
                tokens.hostId = hostId
                tokens.hostName = display
                tokens.accessToken = jwt
                tokens.refreshToken = JwtSession.mint(hostId, display, ttl * 2)
                tokens.sessionExpiresAt = System.currentTimeMillis() + ttl
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
            val weekStart = System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000
            val weekCoins = calls
                .filter { (it.startedAt ?: 0L) >= weekStart }
                .sumOf { it.coinsSpent ?: 0 }
                .coerceAtLeast(today)
            val missed = calls.count { it.status?.contains("missed", true) == true || it.endReason == "missed" }
            val answered = calls.count { (it.durationSec ?: 0) > 0 }
            val success = EarningsCalculator.successRate(answered, calls.size)
            val minutes = ((earn.summary?.totalDurationSec ?: 0) / 60f).roundToInt()
            val balance = wallet?.coinBalance ?: 0
            val pendingHold = runCatching { withdrawalsInternal(id) }.getOrDefault(emptyList())
                .filter { it.status == "pending" || it.status == "processing" || it.status == "admin_review" }
                .sumOf { it.amount }
            val pending = pendingHold.coerceAtLeast(0)
            val daily = (0..6).map { day ->
                val start = System.currentTimeMillis() - (6 - day) * 24L * 60 * 60 * 1000
                val end = start + 24L * 60 * 60 * 1000
                val coins = calls.filter { (it.startedAt ?: 0L) in start until end }.sumOf { it.coinsSpent ?: 0 }
                (coins / 1000f).coerceIn(0.08f, 1f)
            }
            DashboardStats(
                todayCoins = today,
                weekCoins = weekCoins,
                monthCoins = month,
                totalCoins = total,
                coinBalance = balance,
                pendingBalance = pending,
                withdrawableBalance = EarningsCalculator.withdrawable(balance, pending),
                callMinutes = minutes,
                totalCalls = earn.summary?.totalCalls ?: calls.size,
                missedCalls = missed,
                successRate = success,
                rating = 4.8f,
                dailyPoints = daily,
            )
        }
    }

    private suspend fun withdrawalsInternal(hostId: String): List<WithdrawalItem> =
        api.withdrawals(hostId).withdrawals.map {
            WithdrawalItem(
                id = it.id ?: "",
                amount = it.amountCoins,
                gateway = it.gateway ?: "",
                status = it.status ?: "pending",
                createdAt = it.createdAt ?: 0L,
            )
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
                val dash = dashboard().getOrThrow()
                val check = WithdrawalValidator.validate(
                    amountCoins = amount,
                    gateway = gateway,
                    accountName = accountName,
                    accountNumber = accountNumber,
                    withdrawableBalance = dash.withdrawableBalance,
                )
                require(check.ok) { check.error ?: "Invalid withdrawal" }
                val res = api.requestWithdrawal(
                    WithdrawalRequest(id, amount, gateway.lowercase(), accountName.trim(), accountNumber.trim()),
                )
                val w = res.withdrawal ?: error("Withdrawal failed")
                WithdrawalItem(w.id ?: "", w.amountCoins, w.gateway ?: gateway, w.status ?: "pending", w.createdAt ?: 0L)
            }
        }

    suspend fun submitKyc(
        selfieUrl: String?,
        cnicUrl: String?,
        passportUrl: String?,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val id = tokens.hostId ?: error("Not signed in")
            require(!selfieUrl.isNullOrBlank()) { "Selfie required" }
            require(!cnicUrl.isNullOrBlank() || !passportUrl.isNullOrBlank()) {
                "Upload CNIC or Passport"
            }
            api.submitApplication(
                HostApplicationRequest(
                    id = id,
                    name = tokens.hostName ?: "Host",
                    selfieUrl = selfieUrl,
                    idDocumentUrl = cnicUrl ?: passportUrl,
                ),
            )
            Unit
        }
    }

    suspend fun refreshTokenIfNeeded(): Boolean = withContext(Dispatchers.IO) {
        val access = tokens.accessToken
        if (JwtSession.isValid(access)) return@withContext true
        val hostId = tokens.hostId ?: return@withContext false
        val name = tokens.hostName ?: "Host"
        val ttl = 7L * 24 * 60 * 60 * 1000
        tokens.accessToken = JwtSession.mint(hostId, name, ttl)
        tokens.sessionExpiresAt = System.currentTimeMillis() + ttl
        true
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
