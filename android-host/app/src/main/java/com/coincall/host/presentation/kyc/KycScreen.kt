package com.coincall.host.presentation.kyc

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Flight
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.ErrorBanner
import com.coincall.host.core.ui.components.HostCard
import com.coincall.host.core.ui.components.PrimaryButton
import com.coincall.host.core.ui.components.SectionTitle
import com.coincall.host.data.repository.HostRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class KycState(
    val selfieUri: String? = null,
    val cnicUri: String? = null,
    val passportUri: String? = null,
    val status: String = "Not submitted",
    val loading: Boolean = false,
    val error: String? = null,
    val submitted: Boolean = false,
) {
    val progress: Float
        get() {
            var p = 0
            if (!selfieUri.isNullOrBlank()) p += 1
            if (!cnicUri.isNullOrBlank() || !passportUri.isNullOrBlank()) p += 1
            if (submitted || status.contains("review", true) || status.contains("approved", true)) p += 1
            return p / 3f
        }
}

@HiltViewModel
class KycViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _state = MutableStateFlow(KycState())
    val state = _state.asStateFlow()

    fun captureSelfie() = _state.update {
        it.copy(selfieUri = "https://api.dicebear.com/9.x/avataaars/png?seed=selfie_${System.currentTimeMillis()}")
    }

    fun uploadCnic() = _state.update {
        it.copy(cnicUri = "local://cnic_${System.currentTimeMillis()}.jpg")
    }

    fun uploadPassport() = _state.update {
        it.copy(passportUri = "local://passport_${System.currentTimeMillis()}.jpg")
    }

    fun submit() = viewModelScope.launch {
        val s = _state.value
        _state.update { it.copy(loading = true, error = null) }
        repo.submitKyc(s.selfieUri, s.cnicUri, s.passportUri)
            .onSuccess {
                _state.update {
                    it.copy(loading = false, submitted = true, status = "Under review")
                }
            }
            .onFailure { e ->
                _state.update { it.copy(loading = false, error = e.message) }
            }
    }
}

@Composable
fun KycScreen(onBack: () -> Unit, vm: KycViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionTitle("KYC verification")
        Text("Required for withdrawals and verified badge")
        LinearProgressIndicator(progress = { state.progress }, modifier = Modifier.fillMaxWidth())
        Text("Progress ${(state.progress * 100).toInt()}% · ${state.status}")

        HostCard {
            ListItem(
                leadingContent = { Icon(Icons.Outlined.CameraAlt, null) },
                headlineContent = { Text("Selfie verification") },
                supportingContent = {
                    Text(if (state.selfieUri != null) "Captured ✓" else "Take a live selfie")
                },
                trailingContent = {
                    TextButton(onClick = vm::captureSelfie) {
                        Text(if (state.selfieUri != null) "Retake" else "Capture")
                    }
                },
            )
        }
        HostCard {
            ListItem(
                leadingContent = { Icon(Icons.Outlined.CreditCard, null) },
                headlineContent = { Text("CNIC upload") },
                supportingContent = {
                    Text(if (state.cnicUri != null) "Uploaded ✓" else "Front/back government ID")
                },
                trailingContent = {
                    TextButton(onClick = vm::uploadCnic) {
                        Text(if (state.cnicUri != null) "Re-upload" else "Upload")
                    }
                },
            )
        }
        HostCard {
            ListItem(
                leadingContent = { Icon(Icons.Outlined.Flight, null) },
                headlineContent = { Text("Passport upload") },
                supportingContent = {
                    Text(if (state.passportUri != null) "Uploaded ✓" else "Optional if CNIC provided")
                },
                trailingContent = {
                    TextButton(onClick = vm::uploadPassport) {
                        Text(if (state.passportUri != null) "Re-upload" else "Upload")
                    }
                },
            )
        }
        HostCard {
            ListItem(
                leadingContent = { Icon(Icons.Outlined.Badge, null) },
                headlineContent = { Text("Document approval status") },
                supportingContent = { Text(state.status) },
            )
            Text(
                "Documents are reviewed by admin. Hosts cannot self-approve KYC.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        state.error?.let { ErrorBanner(it) }
        PrimaryButton(
            if (state.loading) "Submitting…" else "Submit for review",
            onClick = vm::submit,
            enabled = !state.loading,
        )
        TextButton(onClick = onBack) { Text("Back") }
        Spacer(Modifier.height(24.dp))
    }
}
