package com.coincall.host.presentation.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Business
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.SupportAgent
import androidx.compose.material3.ElevatedButton
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.EmptyState
import com.coincall.host.core.ui.components.HostCard
import com.coincall.host.core.ui.components.SectionTitle
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.domain.model.ChatThread
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

object HostChatPeers {
    const val ADMIN_ID = "admin_support"
    const val ADMIN_NAME = "CoinCall Admin"
    const val AGENCY_ID = "agency_desk"
    const val AGENCY_NAME = "Agency Desk"
}

@HiltViewModel
class ChatViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _threads = MutableStateFlow<List<ChatThread>>(emptyList())
    val threads = _threads.asStateFlow()
    init { refresh() }
    fun refresh() = viewModelScope.launch { repo.threads().onSuccess { _threads.value = it } }
    fun send(toId: String, text: String, name: String?) =
        viewModelScope.launch { repo.sendMessage(toId, text, name) }
}

@Composable
fun ChatHubScreen(
    onThread: (String, String) -> Unit,
    onSupport: () -> Unit,
    vm: ChatViewModel = hiltViewModel(),
) {
    val threads by vm.threads.collectAsState()
    Column(Modifier = Modifier.fillMaxSize().padding(16.dp)) {
        SectionTitle("Messages")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            ElevatedButton(
                onClick = { onThread(HostChatPeers.ADMIN_ID, HostChatPeers.ADMIN_NAME) },
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Outlined.SupportAgent, null)
                Spacer(Modifier.width(6.dp))
                Text("Admin")
            }
            ElevatedButton(
                onClick = { onThread(HostChatPeers.AGENCY_ID, HostChatPeers.AGENCY_NAME) },
                modifier = Modifier.weight(1f),
            ) {
                Icon(Icons.Outlined.Business, null)
                Spacer(Modifier.width(6.dp))
                Text("Agency")
            }
        }
        Spacer(Modifier.height(8.dp))
        ElevatedButton(onClick = onSupport, modifier = Modifier.fillMaxWidth()) {
            Text("Help Center tickets")
        }
        Spacer(Modifier.height(8.dp))
        if (threads.isEmpty()) {
            EmptyState("No fan chats yet", "Fans messaging you will appear here")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(threads, key = { it.id }) { t ->
                    ElevatedCard(
                        onClick = { onThread(t.peerId, t.peerName) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Text(t.peerName, style = MaterialTheme.typography.titleMedium)
                            Text(t.lastMessage, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ChatThreadScreen(
    peerId: String,
    peerName: String,
    onBack: () -> Unit,
    vm: ChatViewModel = hiltViewModel(),
) {
    var text by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(listOf<String>()) }
    val isStaff = peerId == HostChatPeers.ADMIN_ID || peerId == HostChatPeers.AGENCY_ID
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(peerName, style = MaterialTheme.typography.headlineMedium)
        if (isStaff) {
            Text(
                "Secure host ↔ ${if (peerId == HostChatPeers.ADMIN_ID) "admin" else "agency"} channel",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(sent) { m -> HostCard { Text(m) } }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Message…") },
                singleLine = true,
            )
            IconButton(
                onClick = {
                    if (text.isNotBlank()) {
                        val msg = text.trim()
                        sent = sent + msg
                        vm.send(peerId, msg, peerName)
                        text = ""
                    }
                },
            ) { Icon(Icons.Outlined.Send, contentDescription = "Send") }
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
