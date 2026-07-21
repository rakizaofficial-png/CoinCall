package com.coincall.host.presentation.chat

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.*
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.domain.model.ChatThread
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ChatViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _threads = MutableStateFlow<List<ChatThread>>(emptyList())
    val threads = _threads.asStateFlow()
    init { refresh() }
    fun refresh() = viewModelScope.launch { repo.threads().onSuccess { _threads.value = it } }
    fun send(toId: String, text: String, name: String?) = viewModelScope.launch { repo.sendMessage(toId, text, name) }
}

@Composable
fun ChatHubScreen(onThread: (String, String) -> Unit, onSupport: () -> Unit, vm: ChatViewModel = hiltViewModel()) {
    val threads by vm.threads.collectAsState()
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        SectionTitle("Messages")
        ElevatedButton(onClick = onSupport, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Outlined.SupportAgent, null); Spacer(Modifier.width(8.dp)); Text("Admin / Support / Agency help")
        }
        Spacer(Modifier.height(8.dp))
        if (threads.isEmpty()) EmptyState("No chats yet", "Fans messaging you will appear here")
        else LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(threads, key = { it.id }) { t ->
                ElevatedCard(onClick = { onThread(t.peerId, t.peerName) }, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(t.peerName, style = MaterialTheme.typography.titleMedium)
                        Text(t.lastMessage, maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
fun ChatThreadScreen(peerId: String, peerName: String, onBack: () -> Unit, vm: ChatViewModel = hiltViewModel()) {
    var text by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(listOf<String>()) }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text(peerName, style = MaterialTheme.typography.headlineMedium)
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(sent) { m -> HostCard { Text(m) } }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(value = text, onValueChange = { text = it }, modifier = Modifier.weight(1f), placeholder = { Text("Message… emoji welcome 😊") })
            IconButton(onClick = {
                if (text.isNotBlank()) {
                    val msg = text.trim()
                    sent = sent + msg
                    vm.send(peerId, msg, peerName)
                    text = ""
                }
            }) { Icon(Icons.Outlined.Send, contentDescription = "Send") }
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
