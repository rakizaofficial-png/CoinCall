package com.coincall.host.presentation.help

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.*
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.domain.model.HelpArticle
import com.coincall.host.domain.model.SupportTicket
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HelpViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _articles = MutableStateFlow<List<HelpArticle>>(emptyList())
    private val _tickets = MutableStateFlow<List<SupportTicket>>(emptyList())
    val articles = _articles.asStateFlow()
    val tickets = _tickets.asStateFlow()
    init { refresh() }
    fun refresh() = viewModelScope.launch {
        repo.helpArticles().onSuccess { _articles.value = it }
        repo.tickets().onSuccess { _tickets.value = it }
    }
    fun submit(text: String, category: String) = viewModelScope.launch {
        repo.createTicket(text, category).onSuccess { refresh() }
    }
}

@Composable
fun HelpScreen(onBack: () -> Unit, vm: HelpViewModel = hiltViewModel()) {
    val articles by vm.articles.collectAsState()
    val tickets by vm.tickets.collectAsState()
    var tab by remember { mutableStateOf(0) }
    var text by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("general") }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        SectionTitle("Help Center")
        TabRow(selectedTabIndex = tab) {
            listOf("FAQ", "Contact", "Tickets").forEachIndexed { i, l -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(l) }) }
        }
        when (tab) {
            0 -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(articles, key = { it.id }) { a ->
                    var open by remember { mutableStateOf(false) }
                    ElevatedCard(onClick = { open = !open }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text(a.category, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            Text(a.title, style = MaterialTheme.typography.titleMedium)
                            if (open) Text(a.body, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                }
            }
            1 -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Submit ticket / report problem")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("general", "live", "android", "wallet").forEach { c ->
                        FilterChip(selected = category == c, onClick = { category = c }, label = { Text(c) })
                    }
                }
                HostTextField(text, { text = it }, "Describe your issue", singleLine = false)
                PrimaryButton("Submit ticket") { vm.submit(text.trim(), category); text = "" }
                Text("Live chat with support is available via Admin Help tickets.")
            }
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(tickets, key = { it.id }) { t ->
                    HostCard {
                        Text("${t.id} · ${t.status}")
                        Text(t.text)
                        t.adminReply?.let { Text("Admin: $it", color = MaterialTheme.colorScheme.primary) }
                    }
                }
            }
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
