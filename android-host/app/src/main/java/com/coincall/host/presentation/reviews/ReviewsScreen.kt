package com.coincall.host.presentation.reviews

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.coincall.host.core.ui.components.HostCard
import com.coincall.host.core.ui.components.MetricRow
import com.coincall.host.core.ui.components.SectionTitle
import com.coincall.host.presentation.dashboard.DashboardViewModel

private data class ReviewRow(val name: String, val stars: Int, val body: String)

private val SAMPLE_REVIEWS = listOf(
    ReviewRow("Ayesha", 5, "Crystal video and warm chat energy."),
    ReviewRow("Omar", 4, "Answered quickly — great call quality."),
    ReviewRow("Sara", 5, "Professional host, fair coin rate."),
    ReviewRow("Bilal", 4, "Smooth audio, polite conversation."),
)

@Composable
fun ReviewsScreen(onBack: () -> Unit, vm: DashboardViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    Column(Modifier = Modifier.fillMaxSize().padding(16.dp)) {
        SectionTitle("Reviews & ranking")
        MetricRow(
            listOf(
                "Rating" to String.format("%.1f", state.stats.rating),
                "Rank" to "#12",
                "Success" to "${(state.stats.successRate * 100).toInt()}%",
            ),
        )
        HostCard {
            Text("Host ranking", style = MaterialTheme.typography.titleMedium)
            Text("Top 8% in your country this week · based on answered calls & rating")
            LinearProgressIndicator(
                progress = { 0.72f },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(SAMPLE_REVIEWS, key = { it.name }) { r ->
                HostCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(r.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        repeat(r.stars) {
                            Icon(Icons.Outlined.Star, null, tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    Text(r.body)
                }
            }
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
