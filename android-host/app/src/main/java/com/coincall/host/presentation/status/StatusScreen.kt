package com.coincall.host.presentation.status

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.*
import com.coincall.host.data.local.HostPreferences
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.domain.model.HostPresenceStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class StatusViewModel @Inject constructor(
    private val repo: HostRepository,
    private val prefs: HostPreferences,
) : ViewModel() {
    val status = prefs.presenceStatus
    val autoReject = prefs.autoReject
    fun setStatus(value: HostPresenceStatus) = viewModelScope.launch {
        val online = value == HostPresenceStatus.ONLINE
        repo.setOnline(online, value)
        prefs.setPresenceStatus(value.name.lowercase())
    }
    fun setAutoReject(v: Boolean) = viewModelScope.launch { prefs.setAutoReject(v) }
}

@Composable
fun StatusScreen(onBack: () -> Unit, vm: StatusViewModel = hiltViewModel()) {
    val current by vm.status.collectAsState(initial = "offline")
    val autoReject by vm.autoReject.collectAsState(initial = false)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Online status")
        Text("Current: $current")
        HostPresenceStatus.entries.forEach { st ->
            ElevatedButton(onClick = { vm.setStatus(st) }, modifier = Modifier.fillMaxWidth()) {
                Text(st.name.lowercase().replaceFirstChar { it.titlecase() })
            }
        }
        HostCard {
            ListItem(
                headlineContent = { Text("Auto reject incoming calls") },
                supportingContent = { Text("Useful in Away / Vacation mode") },
                trailingContent = { Switch(checked = autoReject, onCheckedChange = vm::setAutoReject) },
            )
            Text("Auto accept is admin-controlled and cannot be enabled by hosts.", style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
