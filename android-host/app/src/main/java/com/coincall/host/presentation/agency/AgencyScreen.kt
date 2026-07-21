package com.coincall.host.presentation.agency

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.*
import com.coincall.host.data.repository.HostRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AgencyViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _name = MutableStateFlow("Not linked")
    val name = _name.asStateFlow()
    private val _msg = MutableStateFlow<String?>(null)
    val msg = _msg.asStateFlow()
    fun join(code: String) = viewModelScope.launch {
        repo.joinAgency(code).onSuccess { _name.value = it; _msg.value = "Joined $it" }
            .onFailure { _msg.value = it.message }
    }
}

@Composable
fun AgencyScreen(onBack: () -> Unit, vm: AgencyViewModel = hiltViewModel()) {
    val name by vm.name.collectAsState()
    val msg by vm.msg.collectAsState()
    var code by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("Agency")
        HostCard {
            Text("Agency name: $name")
            Text("Manager: Assigned after join")
            Text("Contact: Via agency inbox")
            Text("Commission: Set by agency (read-only)")
        }
        HostCard {
            Text("Announcements")
            Text("• Keep 1:1 online during peak hours")
            Text("• Complete KYC for faster payouts")
        }
        HostTextField(code, { code = it }, "Referral / agency code")
        PrimaryButton("Join agency", onClick = { vm.join(code.trim()) })
        msg?.let { Text(it) }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
