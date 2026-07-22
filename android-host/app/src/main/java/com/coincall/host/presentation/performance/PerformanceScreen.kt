package com.coincall.host.presentation.performance

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.coincall.host.core.ui.components.*
import com.coincall.host.presentation.dashboard.DashboardViewModel

@Composable
fun PerformanceScreen(onBack: () -> Unit, vm: DashboardViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    var tab by remember { mutableStateOf(0) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("Host performance")
        TabRow(selectedTabIndex = tab) {
            listOf("Daily", "Weekly", "Monthly").forEachIndexed { i, label ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(label) })
            }
        }
        val coins = when (tab) {
            0 -> state.stats.todayCoins
            1 -> state.stats.weekCoins
            else -> state.stats.monthCoins
        }
        MetricRow(listOf("Coins" to "$coins", "Calls" to "${state.stats.totalCalls}", "Rating" to String.format("%.1f", state.stats.rating)))
        HostCard {
            Text("Leaderboard")
            Text("Rank #12 in your country · Top 8% this week")
            LinearProgressIndicator(progress = { 0.72f }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        }
        HostCard {
            Text("Reviews")
            Text("“Great energy and clear video.” ★★★★★")
            Text("“Answered quickly.” ★★★★☆")
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
