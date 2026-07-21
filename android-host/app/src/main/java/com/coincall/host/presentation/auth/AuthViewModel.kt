package com.coincall.host.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.security.SecureTokenStore
import com.coincall.host.data.repository.HostRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val name: String = "",
    val country: String = "Pakistan",
    val loading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
    val resetSent: Boolean = false,
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repo: HostRepository,
    private val tokens: SecureTokenStore,
) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    fun onEmail(v: String) = _state.update { it.copy(email = v, error = null) }
    fun onPassword(v: String) = _state.update { it.copy(password = v, error = null) }
    fun onName(v: String) = _state.update { it.copy(name = v, error = null) }
    fun onCountry(v: String) = _state.update { it.copy(country = v) }

    fun login() = viewModelScope.launch {
        val s = _state.value
        _state.update { it.copy(loading = true, error = null) }
        repo.login(s.email.trim(), s.password, s.name.ifBlank { "Host" })
            .onSuccess { _state.update { it.copy(loading = false, success = true) } }
            .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
    }

    fun register() = viewModelScope.launch {
        val s = _state.value
        _state.update { it.copy(loading = true, error = null) }
        repo.register(s.name.trim(), s.email.trim(), s.password, s.country)
            .onSuccess { _state.update { it.copy(loading = false, success = true) } }
            .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
    }

    fun forgotPassword() = viewModelScope.launch {
        val email = _state.value.email.trim()
        if (!email.contains("@")) {
            _state.update { it.copy(error = "Enter your account email") }
            return@launch
        }
        _state.update { it.copy(loading = true) }
        // Hook to auth provider password-reset email in production.
        kotlinx.coroutines.delay(600)
        _state.update { it.copy(loading = false, resetSent = true) }
    }

    fun enableBiometric(enabled: Boolean) {
        tokens.biometricEnabled = enabled
    }

    fun biometricEnabled() = tokens.biometricEnabled
    fun hasSession() = repo.sessionValid()
}
