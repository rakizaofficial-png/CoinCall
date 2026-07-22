package com.coincall.host.presentation.navigation

object Routes {
    const val Splash = "splash"
    const val Login = "login"
    const val Register = "register"
    const val Otp = "otp"
    const val ForgotPassword = "forgot_password"
    const val ResetPassword = "reset_password"
    const val BiometricGate = "biometric_gate"
    const val Main = "main"
    const val Home = "home"
    const val Calls = "calls"
    const val Wallet = "wallet"
    const val Chat = "chat"
    const val Profile = "profile"
    const val EditProfile = "edit_profile"
    const val Kyc = "kyc"
    const val Status = "status"
    const val Schedule = "schedule"
    const val Reviews = "reviews"
    const val CallHistory = "call_history"
    const val Withdraw = "withdraw"
    const val Notifications = "notifications"
    const val ChatThread = "chat_thread/{peerId}/{peerName}"
    const val Performance = "performance"
    const val Agency = "agency"
    const val Referral = "referral"
    const val Settings = "settings"
    const val Help = "help"
    const val Devices = "devices"
    const val IncomingCall = "incoming_call/{callId}"
    const val ActiveCall = "active_call/{callId}/{audioOnly}"

    fun chatThread(peerId: String, peerName: String): String {
        val safeName = peerName.replace("/", "-").ifBlank { "Chat" }
        return "chat_thread/$peerId/$safeName"
    }

    fun incomingCall(callId: String) = "incoming_call/$callId"

    fun activeCall(callId: String, audioOnly: Boolean = false) =
        "active_call/$callId/${if (audioOnly) "1" else "0"}"
}
