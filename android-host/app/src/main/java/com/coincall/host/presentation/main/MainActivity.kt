package com.coincall.host.presentation.main

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.fragment.app.FragmentActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.Chat
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.coincall.host.R
import com.coincall.host.core.security.SecurityGuard
import com.coincall.host.core.ui.theme.CoinCallHostTheme
import com.coincall.host.data.local.HostPreferences
import com.coincall.host.data.repository.HostRepository
import com.coincall.host.presentation.agency.AgencyScreen
import com.coincall.host.presentation.auth.ForgotPasswordScreen
import com.coincall.host.presentation.auth.LoginScreen
import com.coincall.host.presentation.auth.RegisterScreen
import com.coincall.host.presentation.auth.ResetPasswordScreen
import com.coincall.host.presentation.calling.ActiveCallScreen
import com.coincall.host.presentation.calling.IncomingCallScreen
import com.coincall.host.presentation.chat.ChatHubScreen
import com.coincall.host.presentation.chat.ChatThreadScreen
import com.coincall.host.presentation.dashboard.DashboardScreen
import com.coincall.host.presentation.help.HelpScreen
import com.coincall.host.presentation.history.CallHistoryScreen
import com.coincall.host.presentation.kyc.KycScreen
import com.coincall.host.presentation.navigation.Routes
import com.coincall.host.presentation.notifications.NotificationsScreen
import com.coincall.host.presentation.performance.PerformanceScreen
import com.coincall.host.presentation.profile.EditProfileScreen
import com.coincall.host.presentation.profile.ProfileScreen
import com.coincall.host.presentation.referral.ReferralScreen
import com.coincall.host.presentation.settings.DevicesScreen
import com.coincall.host.presentation.settings.SettingsScreen
import com.coincall.host.presentation.status.StatusScreen
import com.coincall.host.presentation.wallet.WalletScreen
import com.coincall.host.presentation.withdraw.WithdrawScreen
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : FragmentActivity() {
    @Inject lateinit var securityGuard: SecurityGuard

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // FLAG_SECURE on sensitive money screens can be toggled per-route; keep call activity protected.
        setContent {
            val prefsVm: ThemeViewModel = hiltViewModel()
            val darkPref by prefsVm.darkTheme.collectAsState()
            val dark = darkPref || isSystemInDarkTheme()
            CoinCallHostTheme(darkTheme = dark) {
                HostRoot(
                    hasSession = prefsVm.hasSession(),
                    compromised = securityGuard.isDeviceCompromised() && securityGuard.isRooted(),
                )
            }
        }
    }
}

@HiltViewModel
class ThemeViewModel @Inject constructor(
    prefs: HostPreferences,
    private val repo: HostRepository,
) : ViewModel() {
    val darkTheme = prefs.darkTheme.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    fun hasSession() = repo.sessionValid()
}

@Composable
fun HostRoot(hasSession: Boolean, compromised: Boolean) {
    val nav = rememberNavController()
    val snack = remember { SnackbarHostState() }
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val tabs = listOf(
        Routes.Home to (stringResource(R.string.nav_home) to Icons.Outlined.Home),
        Routes.Calls to (stringResource(R.string.nav_calls) to Icons.Outlined.Call),
        Routes.Wallet to (stringResource(R.string.nav_wallet) to Icons.Outlined.AccountBalanceWallet),
        Routes.Chat to (stringResource(R.string.nav_chat) to Icons.Outlined.Chat),
        Routes.Profile to (stringResource(R.string.nav_profile) to Icons.Outlined.AccountCircle),
    )
    val showBottom = route in tabs.map { it.first }

    LaunchedEffect(compromised) {
        if (compromised) snack.showSnackbar("Security warning: rooted device detected")
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = {
            if (showBottom) {
                NavigationBar {
                    tabs.forEach { (r, meta) ->
                        NavigationBarItem(
                            selected = route == r,
                            onClick = {
                                nav.navigate(r) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(meta.second, contentDescription = meta.first) },
                            label = { Text(meta.first) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = Routes.Splash,
            modifier = Modifier.padding(padding),
        ) {
            composable(Routes.Splash) {
                SplashRoute(
                    hasSession = hasSession,
                    onAuth = {
                        nav.navigate(Routes.Login) { popUpTo(Routes.Splash) { inclusive = true } }
                    },
                    onMain = {
                        nav.navigate(Routes.Home) { popUpTo(Routes.Splash) { inclusive = true } }
                    },
                )
            }
            composable(Routes.Login) {
                LoginScreen(
                    onLoggedIn = { nav.navigate(Routes.Home) { popUpTo(Routes.Login) { inclusive = true } } },
                    onRegister = { nav.navigate(Routes.Register) },
                    onForgot = { nav.navigate(Routes.ForgotPassword) },
                )
            }
            composable(Routes.Register) {
                RegisterScreen(
                    onRegistered = { nav.navigate(Routes.Home) { popUpTo(Routes.Login) { inclusive = true } } },
                    onBack = { nav.popBackStack() },
                )
            }
            composable(Routes.ForgotPassword) {
                ForgotPasswordScreen(
                    onBack = { nav.popBackStack() },
                    onReset = { nav.navigate(Routes.ResetPassword) },
                )
            }
            composable(Routes.ResetPassword) {
                ResetPasswordScreen(onDone = { nav.navigate(Routes.Login) { popUpTo(Routes.Login) { inclusive = true } } })
            }
            composable(Routes.Home) {
                DashboardScreen(
                    onWithdraw = { nav.navigate(Routes.Withdraw) },
                    onNotifications = { nav.navigate(Routes.Notifications) },
                    onSettings = { nav.navigate(Routes.Settings) },
                    onPerformance = { nav.navigate(Routes.Performance) },
                    onStatus = { nav.navigate(Routes.Status) },
                )
            }
            composable(Routes.Calls) { CallHistoryScreen() }
            composable(Routes.Wallet) { WalletScreen(onWithdraw = { nav.navigate(Routes.Withdraw) }) }
            composable(Routes.Chat) {
                ChatHubScreen(
                    onThread = { id, name -> nav.navigate(Routes.chatThread(id, name)) },
                    onSupport = { nav.navigate(Routes.Help) },
                )
            }
            composable(Routes.Profile) {
                ProfileScreen(
                    onEdit = { nav.navigate(Routes.EditProfile) },
                    onKyc = { nav.navigate(Routes.Kyc) },
                    onAgency = { nav.navigate(Routes.Agency) },
                    onReferral = { nav.navigate(Routes.Referral) },
                    onHelp = { nav.navigate(Routes.Help) },
                    onSettings = { nav.navigate(Routes.Settings) },
                )
            }
            composable(Routes.EditProfile) { EditProfileScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.Kyc) { KycScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.Status) { StatusScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.Withdraw) { WithdrawScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.Notifications) { NotificationsScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.Performance) { PerformanceScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.Agency) { AgencyScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.Referral) { ReferralScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.Settings) {
                SettingsScreen(
                    onLogout = {
                        nav.navigate(Routes.Login) { popUpTo(0) { inclusive = true } }
                    },
                    onDevices = { nav.navigate(Routes.Devices) },
                    onBack = { nav.popBackStack() },
                )
            }
            composable(Routes.Devices) { DevicesScreen(onBack = { nav.popBackStack() }) }
            composable(Routes.Help) { HelpScreen(onBack = { nav.popBackStack() }) }
            composable(
                Routes.ChatThread,
                arguments = listOf(
                    navArgument("peerId") { type = NavType.StringType },
                    navArgument("peerName") { type = NavType.StringType },
                ),
            ) { entry ->
                ChatThreadScreen(
                    peerId = entry.arguments?.getString("peerId").orEmpty(),
                    peerName = entry.arguments?.getString("peerName").orEmpty(),
                    onBack = { nav.popBackStack() },
                )
            }
            composable(
                Routes.IncomingCall,
                arguments = listOf(navArgument("callId") { type = NavType.StringType }),
            ) { entry ->
                val callId = entry.arguments?.getString("callId").orEmpty()
                IncomingCallScreen(
                    callId = callId,
                    onAccepted = {
                        nav.navigate("active_call/$callId") { popUpTo(Routes.IncomingCall) { inclusive = true } }
                    },
                    onRejected = { nav.popBackStack() },
                )
            }
            composable(
                "active_call/{callId}",
                arguments = listOf(navArgument("callId") { type = NavType.StringType }),
            ) { entry ->
                ActiveCallScreen(
                    callId = entry.arguments?.getString("callId").orEmpty(),
                    peerName = "Fan",
                    onHangup = { nav.popBackStack() },
                )
            }
        }
    }
}

@Composable
private fun SplashRoute(hasSession: Boolean, onAuth: () -> Unit, onMain: () -> Unit) {
    LaunchedEffect(Unit) {
        delay(900)
        if (hasSession) onMain() else onAuth()
    }
    androidx.compose.foundation.layout.Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        Text("CoinCall Host", style = androidx.compose.material3.MaterialTheme.typography.displayLarge)
    }
}
