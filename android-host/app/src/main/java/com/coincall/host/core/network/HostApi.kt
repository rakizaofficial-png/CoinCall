package com.coincall.host.core.network

import com.coincall.host.data.dto.*
import retrofit2.http.*

interface HostApi {
    @POST("host/login-event")
    suspend fun loginEvent(@Body body: LoginEventRequest): HostOkResponse

    @POST("host/applications")
    suspend fun submitApplication(@Body body: HostApplicationRequest): HostOkResponse

    @POST("hosts/presence")
    suspend fun updatePresence(@Body body: PresenceRequest): PresenceResponse

    @GET("hosts/{hostId}/profile")
    suspend fun getProfile(@Path("hostId") hostId: String): HostProfileDto

    @PUT("hosts/{hostId}/profile")
    suspend fun updateProfile(@Path("hostId") hostId: String, @Body body: UpdateProfileRequest): HostOkResponse

    @POST("wallet/sync")
    suspend fun syncWallet(@Body body: WalletSyncRequest): WalletResponse

    @GET("hosts/{hostId}/earnings")
    suspend fun earnings(
        @Path("hostId") hostId: String,
        @Query("limit") limit: Int = 50,
    ): EarningsResponse

    @GET("hosts/{hostId}/calls")
    suspend fun callHistory(@Path("hostId") hostId: String): CallHistoryResponse

    @POST("host/withdrawals")
    suspend fun requestWithdrawal(@Body body: WithdrawalRequest): WithdrawalResponse

    @GET("host/withdrawals/{hostId}")
    suspend fun withdrawals(@Path("hostId") hostId: String): WithdrawalsListResponse

    @GET("dm/threads")
    suspend fun dmThreads(@Query("hostId") hostId: String): DmThreadsResponse

    @POST("dm/send")
    suspend fun sendDm(@Body body: DmSendRequest): DmSendResponse

    @GET("dm/messages")
    suspend fun dmMessages(@Query("a") a: String, @Query("b") b: String): DmMessagesResponse

    @POST("support/tickets")
    suspend fun createTicket(@Body body: SupportTicketRequest): SupportTicketCreateResponse

    @GET("support/tickets")
    suspend fun tickets(@Query("hostId") hostId: String): SupportTicketsResponse

    @GET("help-center")
    suspend fun helpCenter(): HelpCenterResponse

    @GET("host/notifications/{hostUid}")
    suspend fun notifications(@Path("hostUid") hostUid: String): NotificationsResponse

    @GET("users/active")
    suspend fun activeUsers(): ActiveUsersResponse

    @POST("host/mass-text")
    suspend fun massText(@Body body: MassTextRequest): MassTextResponse

    @POST("host/join-agency")
    suspend fun joinAgency(@Body body: JoinAgencyRequest): JoinAgencyResponse

    @GET("calls/{id}")
    suspend fun getCall(@Path("id") id: String): CallEnvelope

    @POST("calls/{id}/accept")
    suspend fun acceptCall(@Path("id") id: String): CallEnvelope

    @POST("calls/{id}/reject")
    suspend fun rejectCall(@Path("id") id: String): CallEnvelope

    @POST("calls/{id}/end")
    suspend fun endCall(@Path("id") id: String, @Body body: EndCallRequest): CallEnvelope

    @GET("calls/{id}/token")
    suspend fun callToken(@Path("id") id: String, @Query("role") role: String = "host"): CallTokenResponse

    @GET("health")
    suspend fun health(): Map<String, Any>
}
