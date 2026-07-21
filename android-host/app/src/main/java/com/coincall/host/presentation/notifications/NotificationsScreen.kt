package com.coincall.host.presentation.notifications

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.modifier.modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.*
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.domain.model.HostNotification
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class NotificationsViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _items = MutableStateFlow<List<HostNotification>>(emptyList())
    val items = _items.asStateFlow()
    init { viewModelScope.launch { repo.notifications().onSuccess { _items.value = it } } }
}

@Composable
fun NotificationsScreen(onBack: () -> Unit, vm: NotificationsViewModel = hiltViewModel()) {
    val items by vm.items.collectAsState()
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        SectionTitle("Notifications")
        Text("Push · Admin · Payment · Withdrawal · Calls")
        if (items.isEmpty()) EmptyState("You're all caught up", "Call and payout alerts appear here")
        else LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.id }) { n ->
                HostCard {
                    Text(n.title, style = MaterialTheme.typography.titleMedium)
                    Text(n.body)
                    Text(n.type, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
