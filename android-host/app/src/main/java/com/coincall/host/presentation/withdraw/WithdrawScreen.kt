package com.coincall.host.presentation.withdraw

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.coincall.host.domain.model.WithdrawalItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WithdrawState(
    val amount: String = "100",
    val gateway: String = "easypaisa",
    val accountName: String = "",
    val accountNumber: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val items: List<WithdrawalItem> = emptyList(),
    val filter: String = "all",
)

@HiltViewModel
class WithdrawViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _state = MutableStateFlow(WithdrawState())
    val state = _state.asStateFlow()
    init { refresh() }
    fun refresh() = viewModelScope.launch { repo.withdrawals().onSuccess { list -> _state.update { it.copy(items = list) } } }
    fun update(t: (WithdrawState) -> WithdrawState) = _state.update(t)
    fun submit() = viewModelScope.launch {
        val s = _state.value
        val amount = s.amount.toIntOrNull() ?: 0
        _state.update { it.copy(loading = true, error = null) }
        repo.requestWithdrawal(amount, s.gateway, s.accountName, s.accountNumber)
            .onSuccess { refresh(); _state.update { it.copy(loading = false) } }
            .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
    }
}

@Composable
fun WithdrawScreen(onBack: () -> Unit, vm: WithdrawViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        SectionTitle("Withdrawals")
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            HostTextField(state.amount, { vm.update { s -> s.copy(amount = it) } }, "Amount (coins, min 100)")
            Text("Gateway")
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf("easypaisa", "jazzcash", "bank", "crypto").forEach { g ->
                    FilterChip(selected = state.gateway == g, onClick = { vm.update { s -> s.copy(gateway = g) } }, label = { Text(g) })
                }
            }
            HostTextField(state.accountName, { vm.update { s -> s.copy(accountName = it) } }, "Account name")
            HostTextField(state.accountNumber, { vm.update { s -> s.copy(accountNumber = it) } }, "Account number / wallet")
            state.error?.let { ErrorBanner(it) }
            PrimaryButton(if (state.loading) "Submitting…" else "Request withdrawal", onClick = vm::submit, enabled = !state.loading)
        }
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            listOf("all", "pending", "approved", "paid", "failed", "admin_review").forEach { f ->
                FilterChip(selected = state.filter == f, onClick = { vm.update { s -> s.copy(filter = f) } }, label = { Text(f) })
            }
        }
        val filtered = state.items.filter { state.filter == "all" || it.status.contains(state.filter, true) || (state.filter == "paid" && it.status == "approved") }
        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filtered, key = { it.id }) { w ->
                HostCard {
                    Text("${w.amount} coins · ${w.gateway}")
                    Text(w.status)
                }
            }
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
