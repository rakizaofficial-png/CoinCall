package com.coincall.host.core.calc

object WithdrawalValidator {
    private val GATEWAYS = setOf("easypaisa", "jazzcash", "bank", "crypto")
    const val MIN_COINS = 100

    data class Result(val ok: Boolean, val error: String? = null)

    fun validate(
        amountCoins: Int,
        gateway: String,
        accountName: String,
        accountNumber: String,
        withdrawableBalance: Int,
    ): Result {
        if (amountCoins < MIN_COINS) return Result(false, "Minimum withdrawal is $MIN_COINS coins")
        if (amountCoins > withdrawableBalance) return Result(false, "Amount exceeds withdrawable balance")
        if (gateway.lowercase() !in GATEWAYS) return Result(false, "Unsupported gateway")
        if (accountName.trim().length < 2) return Result(false, "Account name required")
        val acct = accountNumber.trim()
        when (gateway.lowercase()) {
            "easypaisa", "jazzcash" -> {
                if (!acct.matches(Regex("^03\\d{9}$")) && !acct.matches(Regex("^\\d{10,12}$"))) {
                    return Result(false, "Enter a valid mobile wallet number")
                }
            }
            "bank" -> if (acct.length < 8) return Result(false, "Enter a valid bank account / IBAN")
            "crypto" -> if (acct.length < 20) return Result(false, "Enter a valid wallet address")
        }
        return Result(true)
    }
}
