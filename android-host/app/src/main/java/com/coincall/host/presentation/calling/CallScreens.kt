package com.coincall.host.presentation.calling

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.CallEnd
import androidx.compose.material.icons.outlined.Cameraswitch
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.MicOff
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material.icons.outlined.VideocamOff
import androidx.compose.material.icons.outlined.VolumeUp
import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.agora.AgoraEngine
import com.coincall.host.core.agora.AgoraJoinConfig
import com.coincall.host.core.agora.CallMediaMode
import com.coincall.host.core.calc.EarningsCalculator
import com.coincall.host.core.permissions.PermissionHelper
import com.coincall.host.core.security.SecurityGuard
import com.coincall.host.core.ui.theme.CoinCallHostTheme
import com.coincall.host.data.repository.HostRepository
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import android.content.Context

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
    val mode: CallMediaMode = CallMediaMode.VIDEO,
    val ratePerMinute: Int = 80,
    val coinsEarned: Int = 0,
    val permissionGranted: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class CallViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val repo: HostRepository,
    private val security: SecurityGuard,
    private val agora: AgoraEngine,
) : ViewModel() {
    private val _state = MutableStateFlow(CallUiState())
    val state = _state.asStateFlow()

    fun security() = security

    fun onPermissions(granted: Boolean) {
        _state.update { it.copy(permissionGranted = granted) }
    }

    fun start(callId: String, peerName: String, audioOnly: Boolean = false) {
        _state.update {
            it.copy(
                callId = callId,
                peerName = peerName,
                mode = if (audioOnly) CallMediaMode.AUDIO else CallMediaMode.VIDEO,
                cameraOff = audioOnly,
            )
        }
        viewModelScope.launch {
            if (!_state.value.permissionGranted) {
                _state.update { it.copy(error = "Camera & microphone permission required") }
                return@launch
            }
            repo.acceptCall(callId)
            val tokenRes = repo.callToken(callId).getOrNull()
            val appId = tokenRes?.appId.orEmpty().ifBlank { "AGORA_APP_ID" }
            val channel = tokenRes?.channel ?: "call_$callId"
            val token = tokenRes?.token.orEmpty().ifBlank { "dev-token" }
            val uid = tokenRes?.uid ?: 1
            val rate = tokenRes?.call?.ratePerMinute ?: 80
            _state.update { it.copy(ratePerMinute = rate) }
            agora.initialize(appContext, appId)
            agora.join(
                AgoraJoinConfig(
                    appId = appId,
                    channel = channel,
                    token = token,
                    uid = uid,
                    mode = _state.value.mode,
                ),
            )
            while (!_state.value.ended) {
                delay(1000)
                _state.update {
                    val next = it.seconds + 1
                    it.copy(
                        seconds = next,
                        coinsEarned = EarningsCalculator.coinsForCall(next, it.ratePerMinute),
                        network = when {
                            next % 47 == 0 -> "Fair"
                            next % 23 == 0 -> "Excellent"
                            else -> "Good"
                        },
                    )
                }
            }
        }
    }

    fun toggleMute() {
        val next = !_state.value.muted
        agora.setMuted(next)
        _state.update { it.copy(muted = next) }
    }

    fun toggleSpeaker() {
        val next = !_state.value.speaker
        agora.setSpeakerphone(next)
        _state.update { it.copy(speaker = next) }
    }

    fun toggleCamera() {
        if (_state.value.mode == CallMediaMode.AUDIO) return
        val next = !_state.value.cameraOff
        agora.setCameraEnabled(!next)
        _state.update { it.copy(cameraOff = next) }
    }

    fun switchCamera() = agora.switchCamera()

    fun toggleBeauty() {
        val next = !_state.value.beauty
        agora.setBeauty(next)
        _state.update { it.copy(beauty = next) }
    }

    fun end() = viewModelScope.launch {
        agora.leave()
        agora.destroy()
        repo.endCall(_state.value.callId)
        _state.update { it.copy(ended = true) }
    }

    fun reject(callId: String) = viewModelScope.launch {
        repo.rejectCall(callId)
        agora.leave()
    }

    override fun onCleared() {
        agora.destroy()
        super.onCleared()
    }
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
        val audioOnly = intent.getBooleanExtra("audioOnly", false)
        setContent {
            CoinCallHostTheme(darkTheme = true) {
                ActiveCallScreen(
                    callId = callId,
                    peerName = peer,
                    audioOnly = audioOnly,
                    onHangup = { finish() },
                )
            }
        }
    }
}

@Composable
fun IncomingCallScreen(
    callId: String,
    peerName: String = "Fan",
    onAccepted: () -> Unit,
    onRejected: () -> Unit,
    vm: CallViewModel = hiltViewModel(),
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Color(0xFF0B1020), Color(0xFF1E293B))))
            .statusBarsPadding()
            .navigationBarsPadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .widthIn(max = 420.dp)
                .padding(24.dp),
        ) {
            Text("Incoming HD video call", color = Color.White)
            Spacer(Modifier.height(8.dp))
            Text(peerName, style = MaterialTheme.typography.displayLarge, color = Color.White)
            Spacer(Modifier.height(32.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                FilledIconButton(
                    onClick = {
                        vm.reject(callId)
                        onRejected()
                    },
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFFEF4444)),
                ) { Icon(Icons.Outlined.CallEnd, null, tint = Color.White) }
                FilledIconButton(
                    onClick = onAccepted,
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFF10B981)),
                ) { Icon(Icons.Outlined.Call, null, tint = Color.White) }
            }
        }
    }
}

@Composable
fun ActiveCallScreen(
    callId: String,
    peerName: String,
    audioOnly: Boolean = false,
    onHangup: () -> Unit,
    vm: CallViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    val context = LocalContext.current
    val activity = context as? ComponentActivity
    var asked by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val ok = result.values.all { it } || PermissionHelper.hasCallPermissions(context)
        vm.onPermissions(ok)
        if (ok) vm.start(callId, peerName, audioOnly)
    }

    LaunchedEffect(callId) {
        activity?.let { vm.security().enableScreenshotProtection(it) }
        if (PermissionHelper.hasCallPermissions(context)) {
            vm.onPermissions(true)
            vm.start(callId, peerName, audioOnly)
        } else if (!asked) {
            asked = true
            permissionLauncher.launch(PermissionHelper.callPermissions)
        }
    }
    LaunchedEffect(state.ended) { if (state.ended) onHangup() }
    DisposableEffect(Unit) { onDispose { /* engine cleaned in VM */ } }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF05070F)),
    ) {
        val compact = maxWidth < 360.dp
        // Remote video plane
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF111827)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                if (state.mode == CallMediaMode.AUDIO) "Audio call" else "Camera preview area",
                color = Color.White.copy(0.55f),
            )
        }
        // Local PiP — always inside bounds
        if (state.mode == CallMediaMode.VIDEO && !state.cameraOff) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(12.dp)
                    .size(if (compact) 96.dp else 120.dp, if (compact) 128.dp else 160.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFF1F2937)),
                contentAlignment = Alignment.Center,
            ) {
                Text("You", color = Color.White)
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "%02d:%02d".format(state.seconds / 60, state.seconds % 60),
                color = Color.White,
                style = MaterialTheme.typography.headlineLarge,
            )
            Text(
                "${state.peerName} · ${state.network} · ${state.coinsEarned} coins",
                color = Color.White.copy(0.8f),
            )
            state.error?.let {
                Text(it, color = Color(0xFFFF6B8A), modifier = Modifier.padding(top = 8.dp))
            }
            Spacer(Modifier.weight(1f))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 480.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                CallFab(if (state.muted) Icons.Outlined.MicOff else Icons.Outlined.Mic, vm::toggleMute)
                CallFab(Icons.Outlined.VolumeUp, vm::toggleSpeaker)
                if (state.mode == CallMediaMode.VIDEO) {
                    CallFab(Icons.Outlined.Cameraswitch, vm::switchCamera)
                    if (!compact) {
                        CallFab(
                            if (state.cameraOff) Icons.Outlined.VideocamOff else Icons.Outlined.Videocam,
                            vm::toggleCamera,
                        )
                        CallFab(Icons.Outlined.AutoAwesome, vm::toggleBeauty)
                    }
                }
            }
            if (state.mode == CallMediaMode.VIDEO && compact) {
                Spacer(Modifier.height(10.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    CallFab(
                        if (state.cameraOff) Icons.Outlined.VideocamOff else Icons.Outlined.Videocam,
                        vm::toggleCamera,
                    )
                    CallFab(Icons.Outlined.AutoAwesome, vm::toggleBeauty)
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AssistChip(onClick = { /* report user */ }, label = { Text("Report") })
                AssistChip(onClick = { /* block user */ }, label = { Text("Block") })
            }
            Spacer(Modifier.height(14.dp))
            FilledIconButton(
                onClick = vm::end,
                modifier = Modifier.size(68.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFFFF2D55)),
            ) {
                Icon(Icons.Outlined.CallEnd, contentDescription = "End", tint = Color.White)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Screenshot & recording protected · Agora ${if (state.permissionGranted) "ready" else "waiting perms"}",
                color = Color.White.copy(0.55f),
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}

@Composable
private fun CallFab(icon: ImageVector, onClick: () -> Unit) {
    FilledIconButton(
        onClick = onClick,
        modifier = Modifier.size(48.dp),
        shape = CircleShape,
        colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color.White.copy(0.16f)),
    ) {
        Icon(icon, null, tint = Color.White)
    }
}
