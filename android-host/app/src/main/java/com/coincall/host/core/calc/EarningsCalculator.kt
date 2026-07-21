package com.coincall.host.core.calc

/**
 * Pure host earnings math — no Android deps (unit-testable).
 * Host earning = billed minutes * ratePerMinute (server is source of truth;
 * this mirrors display / offline preview).
 */
object EarningsCalculator {
    fun billedMinutes(durationSec: Int): Int =
        (durationSec.coerceAtLeast(0) + 59) / 60 // ceil to next minute after first second

    fun coinsForCall(durationSec: Int, ratePerMinute: Int): Int {
        val rate = ratePerMinute.coerceAtLeast(1)
        val minutes = billedMinutes(durationSec)
        return minutes * rate
    }

    fun hostShare(grossCoins: Int, platformCommissionRate: Double = 0.0): Int {
        val rate = platformCommissionRate.coerceIn(0.0, 0.95)
        return (grossCoins * (1.0 - rate)).toInt().coerceAtLeast(0)
    }

    fun weeklyFromDaily(daily: List<Int>): Int = daily.sum().coerceAtLeast(0)

    fun successRate(answered: Int, total: Int): Float {
        if (total <= 0) return 0f
        return (answered.toFloat() / total).coerceIn(0f, 1f)
    }

    fun withdrawable(balance: Int, pendingHold: Int): Int =
        (balance - pendingHold.coerceAtLeast(0)).coerceAtLeast(0)
}
