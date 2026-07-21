package com.coincall.host.presentation.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.coincall.host.core.ui.components.ErrorBanner
import com.coincall.host.core.ui.components.HostTextField
import com.coincall.host.core.ui.components.PrimaryButton
import com.coincall.host.core.ui.theme.TealPrimary

@Composable
fun LoginScreen(
    onLoggedIn: () -> Unit,
    onRegister: () -> Unit,
    onForgot: () -> Unit,
    onOtp: () -> Unit,
    vm: AuthViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    LaunchedEffect(state.success) { if (state.success) onLoggedIn() }
    AuthScaffold(title = "CoinCall Host", subtitle = "Sign in to take 1:1 video calls") {
        HostTextField(state.email, vm::onEmail, "Email")
        Spacer(Modifier.height(10.dp))
        HostTextField(state.password, vm::onPassword, "Password")
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onForgot, modifier = Modifier.align(Alignment.End)) { Text("Forgot password?") }
        state.error?.let { ErrorBanner(it) }
        Spacer(Modifier.height(12.dp))
        PrimaryButton(if (state.loading) "Signing in…" else "Login", onClick = vm::login, enabled = !state.loading)
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onOtp) { Text("Login with OTP") }
        TextButton(onClick = onRegister) { Text("Create host account") }
    }
}

@Composable
fun RegisterScreen(onRegistered: () -> Unit, onBack: () -> Unit, vm: AuthViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    LaunchedEffect(state.success) { if (state.success) onRegistered() }
    AuthScaffold(title = "Become a Host", subtitle = "Apply once — start earning on verified calls") {
        HostTextField(state.name, vm::onName, "Full name")
        Spacer(Modifier.height(10.dp))
        HostTextField(state.email, vm::onEmail, "Email")
        Spacer(Modifier.height(10.dp))
        HostTextField(state.password, vm::onPassword, "Password")
        Spacer(Modifier.height(10.dp))
        HostTextField(state.country, vm::onCountry, "Country")
        state.error?.let { Spacer(Modifier.height(8.dp)); ErrorBanner(it) }
        Spacer(Modifier.height(16.dp))
        PrimaryButton(if (state.loading) "Submitting…" else "Register", onClick = vm::register, enabled = !state.loading)
        TextButton(onClick = onBack) { Text("Back to login") }
    }
}

@Composable
fun ForgotPasswordScreen(onBack: () -> Unit, onReset: () -> Unit, vm: AuthViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    LaunchedEffect(state.resetSent) { if (state.resetSent) onReset() }
    AuthScaffold(title = "Forgot password", subtitle = "We'll email a secure reset link") {
        HostTextField(state.email, vm::onEmail, "Account email")
        state.error?.let { Spacer(Modifier.height(8.dp)); ErrorBanner(it) }
        Spacer(Modifier.height(16.dp))
        PrimaryButton(if (state.loading) "Sending…" else "Send reset link", onClick = vm::forgotPassword, enabled = !state.loading)
        TextButton(onClick = onBack) { Text("Back") }
    }
}

@Composable
fun ResetPasswordScreen(onDone: () -> Unit) {
    var p1 by remember { mutableStateOf("") }
    var p2 by remember { mutableStateOf("") }
    AuthScaffold(title = "Reset password", subtitle = "Choose a strong new password") {
        HostTextField(p1, { p1 = it }, "New password")
        Spacer(Modifier.height(10.dp))
        HostTextField(p2, { p2 = it }, "Confirm password")
        Spacer(Modifier.height(16.dp))
        PrimaryButton("Update password", onClick = onDone, enabled = p1.length >= 6 && p1 == p2)
    }
}

@Composable
internal fun AuthScaffold(title: String, subtitle: String, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(TealPrimary.copy(alpha = 0.18f), MaterialTheme.colorScheme.background))),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text(title, style = MaterialTheme.typography.displayLarge.copy(fontWeight = FontWeight.Bold))
            Spacer(Modifier.height(6.dp))
            Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f))
            Spacer(Modifier.height(28.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(24.dp))
                    .padding(20.dp),
                content = content,
            )
        }
    }
}
