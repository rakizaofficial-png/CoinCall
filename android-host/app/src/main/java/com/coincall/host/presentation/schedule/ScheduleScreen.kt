package com.coincall.host.presentation.schedule

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.HostCard
import com.coincall.host.core.ui.components.PrimaryButton
import com.coincall.host.core.ui.components.SectionTitle
import com.coincall.host.data.local.HostPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ScheduleViewModel @Inject constructor(private val prefs: HostPreferences) : ViewModel() {
    private val _saved = MutableStateFlow(false)
    val saved = _saved.asStateFlow()
    fun persist(json: String) = viewModelScope.launch {
        prefs.setScheduleJson(json)
        _saved.value = true
    }
}

private val DAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
private val SLOTS = listOf("09–12", "12–16", "16–20", "20–24")

@Composable
fun ScheduleScreen(onBack: () -> Unit, vm: ScheduleViewModel = hiltViewModel()) {
    val enabled = remember {
        mutableStateMapOf<String, Boolean>().apply {
            DAYS.forEach { d -> SLOTS.forEach { s -> put("$d|$s", d != "Sun") } }
        }
    }
    val saved by vm.saved.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionTitle("Availability schedule")
        Text("Set when fans can place 1:1 calls. Offline outside these windows unless you go online manually.")
        DAYS.forEach { day ->
            HostCard {
                Text(day, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    SLOTS.forEach { slot ->
                        val key = "$day|$slot"
                        FilterChip(
                            selected = enabled[key] == true,
                            onClick = { enabled[key] = !(enabled[key] ?: false) },
                            label = { Text(slot) },
                        )
                    }
                }
            }
        }
        HostCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Respect schedule automatically", modifier = Modifier.weight(1f))
                Switch(checked = true, onCheckedChange = {})
            }
        }
        PrimaryButton("Save schedule") {
            val json = enabled.entries.joinToString(";") { "${it.key}=${it.value}" }
            vm.persist(json)
        }
        if (saved) Text("Schedule saved on device")
        TextButton(onClick = onBack) { Text("Back") }
    }
}
