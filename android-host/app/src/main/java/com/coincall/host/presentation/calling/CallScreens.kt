package com.coincall.host.presentation.calling

import android.app.Activity
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.security.SecurityGuard
import com.coincall.host.core.ui.theme.CoinCallHostTheme
import com.coincall.host.data.repository.HostRepository
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CallUiState(
    val callId: String = "",
    val peerName: String = "Fan",
    val seconds: Int = 0,
    val muted: Boolean = false,
    val speaker: Boolean = true,
    val cameraOff: Boolean = false,
    val beauty: Boolean = true,
    val network: String = "Good",
    val ended: Boolean = false,
)

@HiltViewModel
class CallViewModel @Inject constructor(
    private val repo: HostRepository,
    private val security: SecurityGuard,
) : ViewModel() {
    private val _state = MutableStateFlow(CallUiState())
    val state = _state.asStateFlow()

    fun start(callId: String, peerName: String) {
        _state.update { it.copy(callId = callId, peerName = peerName) }
        viewModelScope.launch {
            repo.acceptCall(callId)
            while (!_state.value.ended) {
                delay(1000)
                _state.update { it.copy(seconds = it.seconds + 1) }
            }
        }
    }

    fun toggleMute() = _state.update { it.copy(muted = !it.muted) }
    fun toggleSpeaker() = _state.update { it.copy(speaker = !it.speaker) }
    fun toggleCamera() = _state.update { it.copy(cameraOff = !it.cameraOff) }
    fun toggleBeauty() = _state.update { it.copy(beauty = !it.beauty) }
    fun end() = viewModelScope.launch {
        repo.endCall(_state.value.callId)
        _state.update { it.copy(ended = true) }
    }
    fun reject(callId: String) = viewModelScope.launch { repo.rejectCall(callId) }
    fun security() = security
}

@AndroidEntryPoint
class CallActivity : ComponentActivity() {
    @Inject lateinit var securityGuard: SecurityGuard
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        securityGuard.enableScreenshotProtection(this)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val callId = intent.getStringExtra("callId") ?: "demo"
        val peer = intent.getStringExtra("peerName") ?: "Fan"
        setContent {
            CoinCallHostTheme(darkTheme = true) {
                ActiveCallScreen(callId = callId, peerName = peer, onHangup = { finish() })
            }
        }
    }
}

@Composable
fun IncomingCallScreen(callId: String, peerName: String = "Fan", onAccepted: () -> Unit, onRejected: () -> Unit, vm: CallViewModel = hiltViewModel()) {
    Box(modifier = Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF0B1020), Color(0xFF1E293B)))), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Incoming HD video call", color = Color.White)
            Spacer(Modifier.height(8.dp))
            Text(peerName, style = MaterialTheme.typography.displayLarge, color = Color.White)
            Spacer(Modifier.height(32.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                FilledIconButton(onClick = { vm.reject(callId); onRejected() }, colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFFEF4444))) {
                    Icon(Icons.Outlined.CallEnd, null, tint = Color.White)
                }
                FilledIconButton(onClick = onAccepted, colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFF10B981))) {
                    Icon(Icons.Outlined.Call, null, tint = Color.White)
                }
            }
        }
    }
}

@Composable
fun ActiveCallScreen(callId: String, peerName: String, onHangup: () -> Unit, vm: CallViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    val activity = LocalContext.current as? ComponentActivity
    LaunchedEffect(callId) {
        activity?.let { vm.security().enableScreenshotProtection(it) }
        vm.start(callId, peerName)
    }
    LaunchedEffect(state.ended) { if (state.ended) onHangup() }
    Box(modifier = Modifier.fillMaxSize().background(Color(0xFF05070F))) {
        Column(modifier = Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("%02d:%02d".format(state.seconds / 60, state.seconds % 60), color = Color.White, style = MaterialTheme.typography.headlineLarge)
            Text("${state.peerName} · ${state.network} network", color = Color.White.copy(0.8f))
            Spacer(Modifier.weight(1f))
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                CallFab(if (state.muted) Icons.Outlined.MicOff else Icons.Outlined.Mic, vm::toggleMute)
                CallFab(Icons.Outlined.VolumeUp, vm::toggleSpeaker)
                CallFab(Icons.Outlined.Cameraswitch) { /* camera switch hook for Agora */ }
                CallFab(if (state.cameraOff) Icons.Outlined.VideocamOff else Icons.Outlined.Videocam, vm::toggleCamera)
                CallFab(Icons.Outlined.AutoAwesome, vm::toggleBeauty)
            }
            Spacer(Modifier.height(18.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                AssistChip(onClick = { /* report */ }, label = { Text("Report") })
                AssistChip(onClick = { /* block */ }, label = { Text("Block") })
            }
            Spacer(Modifier.height(18.dp))
            FilledIconButton(onClick = vm::end, modifier = Modifier.size(72.dp), colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFFFF2D55))) {
                Icon(Icons.Outlined.CallEnd, contentDescription = "End", tint = Color.White)
            }
            Spacer(Modifier.height(12.dp))
            Text("Screenshot & recording protected", color = Color.White.copy(0.55f), style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun CallFab(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    FilledIconButton(onClick = onClick, modifier = Modifier.size(52.dp), shape = CircleShape, colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.White.copy(0.16f))) {
        Icon(icon, null, tint = Color.White)
    }
}
