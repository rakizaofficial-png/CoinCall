package com.coincall.host.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HostPreferences @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    private val darkKey = booleanPreferencesKey("dark_theme")
    private val langKey = stringPreferencesKey("language")
    private val statusKey = stringPreferencesKey("presence_status")
    private val autoRejectKey = booleanPreferencesKey("auto_reject")
    private val notifKey = booleanPreferencesKey("push_enabled")

    val darkTheme: Flow<Boolean> = dataStore.data.map { it[darkKey] ?: false }
    val language: Flow<String> = dataStore.data.map { it[langKey] ?: "en" }
    val presenceStatus: Flow<String> = dataStore.data.map { it[statusKey] ?: "offline" }
    val autoReject: Flow<Boolean> = dataStore.data.map { it[autoRejectKey] ?: false }
    val pushEnabled: Flow<Boolean> = dataStore.data.map { it[notifKey] ?: true }

    suspend fun setDarkTheme(value: Boolean) = dataStore.edit { it[darkKey] = value }
    suspend fun setLanguage(value: String) = dataStore.edit { it[langKey] = value }
    suspend fun setPresenceStatus(value: String) = dataStore.edit { it[statusKey] = value }
    suspend fun setAutoReject(value: Boolean) = dataStore.edit { it[autoRejectKey] = value }
    suspend fun setPushEnabled(value: Boolean) = dataStore.edit { it[notifKey] = value }
}
