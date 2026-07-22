package com.coincall.host.presentation.wallet

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.HostCard
import com.coincall.host.core.ui.components.MetricRow
import com.coincall.host.core.ui.components.PrimaryButton
import com.coincall.host.core.ui.components.SectionTitle
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.domain.model.DashboardStats
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class WalletViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _stats = MutableStateFlow(DashboardStats())
    val stats = _stats.asStateFlow()
    init {
        viewModelScope.launch {
            repo.refreshTokenIfNeeded()
            repo.dashboard().onSuccess { _stats.value = it }
        }
    }
}

@Composable
fun WalletScreen(onWithdraw: () -> Unit, vm: WalletViewModel = hiltViewModel()) {
    val stats by vm.stats.collectAsState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionTitle("Wallet")
        HostCard {
            Text("Coin balance", style = MaterialTheme.typography.labelLarge)
            Text("${stats.coinBalance}", style = MaterialTheme.typography.displayLarge)
            Text("Pending ${stats.pendingBalance} · Withdrawable ${stats.withdrawableBalance}")
        }
        SectionTitle("Coin earnings")
        MetricRow(
            listOf(
                "Daily" to "${stats.todayCoins}",
                "Weekly" to "${stats.weekCoins}",
                "Monthly" to "${stats.monthCoins}",
            ),
        )
        MetricRow(listOf("Total" to "${stats.totalCoins}", "Minutes" to "${stats.callMinutes}", "Calls" to "${stats.totalCalls}"))
        PrimaryButton("Request withdrawal", onClick = onWithdraw)
        SectionTitle("Histories")
        HostCard {
            Text("Coin history")
            Text("Ledger sync · host-scoped only", style = MaterialTheme.typography.bodySmall)
        }
        HostCard {
            Text("Earnings history")
            Text("Daily ${stats.todayCoins} · Weekly ${stats.weekCoins} · Monthly ${stats.monthCoins}")
        }
        HostCard {
            Text("Withdrawal history")
            Text("Open Withdrawals tab for pending / approved filters", style = MaterialTheme.typography.bodySmall)
        }
    }
}
