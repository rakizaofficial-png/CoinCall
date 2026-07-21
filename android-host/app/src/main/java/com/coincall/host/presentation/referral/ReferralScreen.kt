package com.coincall.host.presentation.referral

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.coincall.host.core.ui.components.*
import com.coincall.host.data.repository.HostRepository
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class ReferralViewModel @Inject constructor(repo: HostRepository) : ViewModel() {
    val code = "CC" + (repo.currentHostId()?.takeLast(6)?.uppercase() ?: "HOST01")
    val link = "https://coincall.app/invite/$code"
}

@Composable
fun ReferralScreen(onBack: () -> Unit, vm: ReferralViewModel = hiltViewModel()) {
    val context = LocalContext.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("Referrals")
        HostCard {
            Text("Your code", style = MaterialTheme.typography.labelLarge)
            Text(vm.code, style = MaterialTheme.typography.headlineLarge)
            Text(vm.link, style = MaterialTheme.typography.bodySmall)
        }
        MetricRow(listOf("Invites" to "0", "Earnings" to "0", "Pending" to "0"))
        PrimaryButton("Invite friends") {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, "Join CoinCall with my code ${vm.code}: ${vm.link}")
            }
            context.startActivity(Intent.createChooser(send, "Share referral"))
        }
        HostCard { Text("Referral history"); Text("No conversions yet") }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
