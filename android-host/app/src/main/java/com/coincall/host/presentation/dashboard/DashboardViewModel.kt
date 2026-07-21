package com.coincall.host.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.data.local.HostPreferences
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.domain.model.DashboardStats
import com.coincall.host.domain.model.HostPresenceStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val loading: Boolean = true,
    val stats: DashboardStats = DashboardStats(),
    val online: Boolean = false,
    val error: String? = null,
    val hostName: String = "Host",
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val repo: HostRepository,
    private val prefs: HostPreferences,
) : ViewModel() {
    private val _state = MutableStateFlow(DashboardUiState())
    val state: StateFlow<DashboardUiState> = _state.asStateFlow()
    val presence = prefs.presenceStatus.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "offline")

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        _state.update { it.copy(loading = true, error = null) }
        repo.dashboard()
            .onSuccess { stats ->
                _state.update {
                    it.copy(loading = false, stats = stats, hostName = repo.currentHostId()?.takeLast(6) ?: "Host")
                }
            }
            .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
    }

    fun toggleOnline(online: Boolean) = viewModelScope.launch {
        val status = if (online) HostPresenceStatus.ONLINE else HostPresenceStatus.OFFLINE
        repo.setOnline(online, status)
            .onSuccess {
                prefs.setPresenceStatus(if (online) "online" else "offline")
                _state.update { it.copy(online = online) }
            }
            .onFailure { e -> _state.update { it.copy(error = e.message) } }
    }
}
