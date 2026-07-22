package com.coincall.host.presentation.history

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.*
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.domain.model.CallHistoryItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CallHistoryViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _items = MutableStateFlow<List<CallHistoryItem>>(emptyList())
    private val _query = MutableStateFlow("")
    private val _filter = MutableStateFlow("all")
    val items = _items.asStateFlow()
    val query = _query.asStateFlow()
    val filter = _filter.asStateFlow()
    init { refresh() }
    fun refresh() = viewModelScope.launch { repo.callHistory().onSuccess { _items.value = it } }
    fun setQuery(q: String) = _query.update { q }
    fun setFilter(f: String) = _filter.update { f }
    fun visible(): List<CallHistoryItem> {
        val q = _query.value.trim().lowercase()
        val f = _filter.value
        return _items.value.filter {
            (q.isBlank() || it.userName.lowercase().contains(q)) &&
                (f == "all" || (f == "missed" && it.status.contains("missed", true)) || (f == "recent" && !it.status.contains("missed", true)))
        }
    }
}

@Composable
fun CallHistoryScreen(vm: CallHistoryViewModel = hiltViewModel()) {
    val query by vm.query.collectAsState()
    val filter by vm.filter.collectAsState()
    val items = vm.visible()
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        SectionTitle("Call history")
        OutlinedTextField(value = query, onValueChange = vm::setQuery, modifier = Modifier.fillMaxWidth(), leadingIcon = { Icon(Icons.Outlined.Search, null) }, placeholder = { Text("Search fans") }, singleLine = true)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("all", "recent", "missed").forEach { f ->
                FilterChip(selected = filter == f, onClick = { vm.setFilter(f) }, label = { Text(f.replaceFirstChar { it.titlecase() }) })
            }
        }
        Spacer(Modifier.height(8.dp))
        if (items.isEmpty()) EmptyState("No calls yet", "Go online to receive 1:1 video calls")
        else LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.id }) { c ->
                HostCard {
                    Text(c.userName, style = MaterialTheme.typography.titleMedium)
                    Text("${c.durationSec / 60}m ${c.durationSec % 60}s · ${c.coinsEarned} coins · ${c.status}")
                    c.rating?.let { Text("Fan rating $it") }
                }
            }
        }
    }
}
