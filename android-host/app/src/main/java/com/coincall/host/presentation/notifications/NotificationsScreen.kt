package com.coincall.host.presentation.notifications

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.push.HostPush
import com.coincall.host.core.ui.components.EmptyState
import com.coincall.host.core.ui.components.HostCard
import com.coincall.host.core.ui.components.SectionTitle
import com.coincall.host.data.local.HostPreferences
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.domain.model.HostNotification
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class NotificationsViewModel @Inject constructor(
    private val repo: HostRepository,
    private val prefs: HostPreferences,
) : ViewModel() {
    private val _items = MutableStateFlow<List<HostNotification>>(emptyList())
    val items = _items.asStateFlow()
    val pushEnabled = prefs.pushEnabled

    init {
        viewModelScope.launch { repo.notifications().onSuccess { _items.value = it } }
    }

    suspend fun isPushOn(): Boolean = prefs.pushEnabled.first()
}

@Composable
fun NotificationsScreen(onBack: () -> Unit, vm: NotificationsViewModel = hiltViewModel()) {
    val items by vm.items.collectAsState()
    val push by vm.pushEnabled.collectAsState(initial = true)
    val context = LocalContext.current
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        SectionTitle("Notifications")
        Text("Push · Admin · Payment · Withdrawal · Calls · ${if (push) "ON" else "OFF"}")
        ElevatedButton(
            onClick = {
                HostPush.notifyHost(
                    context = context,
                    channelId = HostPush.CHANNEL_CALLS,
                    notificationId = 1001,
                    title = "Incoming call ready",
                    body = "A fan is calling you on CoinCall Host",
                    pushEnabled = push,
                )
            },
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        ) { Text("Send test push (local)") }
        if (items.isEmpty()) {
            EmptyState("You're all caught up", "Call and payout alerts appear here")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                items(items, key = { it.id }) { n ->
                    HostCard {
                        Text(n.title, style = MaterialTheme.typography.titleMedium)
                        Text(n.body)
                        Text(n.type, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
