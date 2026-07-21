package com.coincall.host.presentation.wallet

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.ui.components.*
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
    init { viewModelScope.launch { repo.dashboard().onSuccess { _stats.value = it } } }
}

@Composable
fun WalletScreen(onWithdraw: () -> Unit, vm: WalletViewModel = hiltViewModel()) {
    val stats by vm.stats.collectAsState()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("Wallet")
        HostCard {
            Text("Coin balance", style = MaterialTheme.typography.labelLarge)
            Text("${stats.coinBalance}", style = MaterialTheme.typography.displayLarge)
            Text("Pending ${stats.pendingBalance} · Withdrawable ${stats.withdrawableBalance}")
        }
        MetricRow(listOf("Daily" to "${stats.todayCoins}", "Monthly" to "${stats.monthCoins}", "Total" to "${stats.totalCoins}"))
        PrimaryButton("Request withdrawal", onClick = onWithdraw)
        SectionTitle("Histories")
        listOf("Coin history", "Earnings history", "Transaction history", "Withdrawal history").forEach {
            HostCard { Text(it); Text("Synced from CoinCall ledger", style = MaterialTheme.typography.bodySmall) }
        }
    }
}
