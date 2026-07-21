package com.coincall.host.presentation.auth

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.ErrorBanner
import com.coincall.host.core.ui.components.HostTextField
import com.coincall.host.core.ui.components.PrimaryButton
import com.coincall.host.data.repository.HostRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OtpUiState(
    val phoneOrEmail: String = "",
    val otp: String = "",
    val sent: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
    val verified: Boolean = false,
    val cooldown: Int = 0,
)

@HiltViewModel
class OtpViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _state = MutableStateFlow(OtpUiState())
    val state = _state.asStateFlow()
    private var expectedOtp: String = ""

    fun onTarget(v: String) = _state.update { it.copy(phoneOrEmail = v, error = null) }
    fun onOtp(v: String) = _state.update {
        it.copy(otp = v.filter { ch -> ch.isDigit() }.take(6), error = null)
    }

    fun sendOtp() = viewModelScope.launch {
        val target = _state.value.phoneOrEmail.trim()
        if (target.length < 6) {
            _state.update { it.copy(error = "Enter phone or email") }
            return@launch
        }
        _state.update { it.copy(loading = true, error = null) }
        expectedOtp = ((target.hashCode().toUInt() % 900000u) + 100000u).toString()
        delay(400)
        _state.update { it.copy(loading = false, sent = true, cooldown = 30) }
        while (_state.value.cooldown > 0) {
            delay(1000)
            _state.update { it.copy(cooldown = (it.cooldown - 1).coerceAtLeast(0)) }
        }
    }

    fun verify() = viewModelScope.launch {
        val s = _state.value
        if (s.otp.length != 6) {
            _state.update { it.copy(error = "Enter 6-digit OTP") }
            return@launch
        }
        _state.update { it.copy(loading = true) }
        delay(250)
        if (s.otp != expectedOtp && s.otp != "123456") {
            _state.update { it.copy(loading = false, error = "Invalid OTP") }
            return@launch
        }
        val email =
            if (s.phoneOrEmail.contains("@")) s.phoneOrEmail
            else "${s.phoneOrEmail.filter { it.isDigit() }}@otp.coincall.host"
        repo.login(email, "otp-verified-${s.otp}", "Host")
            .onSuccess { _state.update { it.copy(loading = false, verified = true) } }
            .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
    }
}

@Composable
fun OtpScreen(
    onVerified: () -> Unit,
    onBack: () -> Unit,
    vm: OtpViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    LaunchedEffect(state.verified) { if (state.verified) onVerified() }
    AuthScaffold(
        title = "OTP Login",
        subtitle = "Verify phone or email to enter the host app",
    ) {
        HostTextField(state.phoneOrEmail, vm::onTarget, "Phone or email")
        Spacer(Modifier.height(10.dp))
        if (state.sent) {
            HostTextField(state.otp, vm::onOtp, "6-digit OTP")
            Text("QA tip: OTP 123456 always works", style = MaterialTheme.typography.bodySmall)
        }
        state.error?.let {
            Spacer(Modifier.height(8.dp))
            ErrorBanner(it)
        }
        Spacer(Modifier.height(14.dp))
        if (!state.sent) {
            PrimaryButton(
                if (state.loading) "Sending…" else "Send OTP",
                onClick = vm::sendOtp,
                enabled = !state.loading,
            )
        } else {
            PrimaryButton(
                if (state.loading) "Verifying…" else "Verify & continue",
                onClick = vm::verify,
                enabled = !state.loading,
            )
            TextButton(
                onClick = vm::sendOtp,
                enabled = state.cooldown == 0 && !state.loading,
            ) {
                Text(if (state.cooldown > 0) "Resend in ${state.cooldown}s" else "Resend OTP")
            }
        }
        TextButton(onClick = onBack) { Text("Back to password login") }
    }
}
