package com.coincall.host.core.security

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SecureTokenStore @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "cc_host_secure",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var accessToken: String?
        get() = prefs.getString(KEY_ACCESS, null)
        set(value) = prefs.edit().putString(KEY_ACCESS, value).apply()

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH, null)
        set(value) = prefs.edit().putString(KEY_REFRESH, value).apply()

    var hostId: String?
        get() = prefs.getString(KEY_HOST, null)
        set(value) = prefs.edit().putString(KEY_HOST, value).apply()

    var hostName: String?
        get() = prefs.getString(KEY_NAME, null)
        set(value) = prefs.edit().putString(KEY_NAME, value).apply()

    var biometricEnabled: Boolean
        get() = prefs.getBoolean(KEY_BIO, false)
        set(value) = prefs.edit().putBoolean(KEY_BIO, value).apply()

    var sessionExpiresAt: Long
        get() = prefs.getLong(KEY_EXP, 0L)
        set(value) = prefs.edit().putLong(KEY_EXP, value).apply()

    fun clear() {
        prefs.edit().clear().apply()
    }

    fun isSessionValid(now: Long = System.currentTimeMillis()): Boolean {
        val token = accessToken
        if (token.isNullOrBlank() || hostId.isNullOrBlank()) return false
        val exp = sessionExpiresAt
        return exp == 0L || now < exp
    }

    companion object {
        private const val KEY_ACCESS = "access"
        private const val KEY_REFRESH = "refresh"
        private const val KEY_HOST = "host_id"
        private const val KEY_NAME = "host_name"
        private const val KEY_BIO = "bio"
        private const val KEY_EXP = "exp"
    }
}
