package com.coincall.host.presentation.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.coincall.host.core.ui.components.ErrorBanner
import com.coincall.host.core.ui.components.HostCard
import com.coincall.host.core.ui.components.LoadingScreen
import com.coincall.host.core.ui.components.MetricRow
import com.coincall.host.core.ui.components.OnlineDot
import com.coincall.host.core.ui.components.PrimaryButton
import com.coincall.host.core.ui.components.SectionTitle
import com.coincall.host.core.ui.components.ShimmerBox
import com.coincall.host.core.ui.theme.TealPrimary

@Composable
fun DashboardScreen(
    onWithdraw: () -> Unit,
    onNotifications: () -> Unit,
    onSettings: () -> Unit,
    onPerformance: () -> Unit,
    onStatus: () -> Unit,
    vm: DashboardViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    if (state.loading && state.stats.totalCalls == 0) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ShimmerBox(Modifier.fillMaxWidth().height(160.dp))
            ShimmerBox(Modifier.fillMaxWidth().height(90.dp))
            ShimmerBox(Modifier.fillMaxWidth().height(90.dp))
        }
        return
    }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Welcome back", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onBackground.copy(0.65f))
                Text(state.hostName, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            }
            IconButton(onClick = onNotifications) { Icon(Icons.Outlined.Notifications, contentDescription = "Notifications") }
            IconButton(onClick = onSettings) { Icon(Icons.Outlined.Settings, contentDescription = "Settings") }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(TealPrimary, Color(0xFF6366F1))), RoundedCornerShape(24.dp))
                .padding(20.dp),
        ) {
            Column {
                Text("Today's earnings", color = Color.White.copy(0.9f))
                Text("${state.stats.todayCoins}", color = Color.White, style = MaterialTheme.typography.displayLarge, fontWeight = FontWeight.Bold)
                Text("Wallet ${state.stats.coinBalance} · Withdrawable ${state.stats.withdrawableBalance}", color = Color.White.copy(0.85f))
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OnlineDot(state.online)
                    Spacer(Modifier.padding(4.dp))
                    Text(if (state.online) "Online for calls" else "Offline", color = Color.White, modifier = Modifier.weight(1f))
                    Switch(checked = state.online, onCheckedChange = vm::toggleOnline)
                }
            }
        }

        state.error?.let { ErrorBanner(it, onRetry = vm::refresh) }

        MetricRow(
            listOf(
                "Weekly" to "${state.stats.weekCoins}",
                "Monthly" to "${state.stats.monthCoins}",
                "Total" to "${state.stats.totalCoins}",
            ),
        )
        MetricRow(
            listOf(
                "Calls" to "${state.stats.totalCalls}",
                "Missed" to "${state.stats.missedCalls}",
                "Minutes" to "${state.stats.callMinutes}",
            ),
        )
        MetricRow(
            listOf(
                "Success" to "${(state.stats.successRate * 100).toInt()}%",
                "Rating" to String.format("%.1f", state.stats.rating),
                "Pending" to "${state.stats.pendingBalance}",
            ),
        )

        SectionTitle("Monthly growth")
        HostCard {
            GrowthChart(state.stats.dailyPoints)
        }

        PrimaryButton("Withdraw earnings", onClick = onWithdraw)
        PrimaryButton("Presence & vacation mode", onClick = onStatus)
        PrimaryButton("Performance & leaderboard", onClick = onPerformance)
    }
}

@Composable
private fun GrowthChart(points: List<Float>) {
    val data = if (points.isEmpty()) listOf(0.2f, 0.4f, 0.35f, 0.6f, 0.5f, 0.8f, 0.7f) else points
    Canvas(modifier = Modifier.fillMaxWidth().height(140.dp)) {
        val maxX = size.width
        val maxY = size.height
        val step = maxX / (data.size - 1).coerceAtLeast(1)
        val path = Path()
        data.forEachIndexed { i, v ->
            val x = i * step
            val y = maxY - (v.coerceIn(0f, 1f) * (maxY * 0.85f))
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, color = Color(0xFF0D9488), style = Stroke(width = 6f, cap = StrokeCap.Round))
        data.forEachIndexed { i, v ->
            val x = i * step
            val y = maxY - (v.coerceIn(0f, 1f) * (maxY * 0.85f))
            drawCircle(Color(0xFF0D9488), radius = 7f, center = Offset(x, y))
        }
    }
}
