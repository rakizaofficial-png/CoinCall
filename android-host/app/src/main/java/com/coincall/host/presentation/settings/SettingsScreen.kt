package com.coincall.host.presentation.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.coincall.host.core.security.SecureTokenStore
import com.coincall.host.core.ui.components.*
import com.coincall.host.data.local.HostPreferences
import com.coincall.host.data.repository.HostRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val prefs: HostPreferences,
    private val repo: HostRepository,
    private val tokens: SecureTokenStore,
) : ViewModel() {
    val dark = prefs.darkTheme
    val lang = prefs.language
    val push = prefs.pushEnabled
    fun setDark(v: Boolean) = viewModelScope.launch { prefs.setDarkTheme(v) }
    fun setLang(v: String) = viewModelScope.launch { prefs.setLanguage(v) }
    fun setPush(v: Boolean) = viewModelScope.launch { prefs.setPushEnabled(v) }
    fun setBio(v: Boolean) { tokens.biometricEnabled = v }
    fun bio() = tokens.biometricEnabled
    fun logout() = repo.logout()
}

@Composable
fun SettingsScreen(onLogout: () -> Unit, onDevices: () -> Unit, onBack: () -> Unit, vm: SettingsViewModel = hiltViewModel()) {
    val dark by vm.dark.collectAsState(initial = false)
    val lang by vm.lang.collectAsState(initial = "en")
    val push by vm.push.collectAsState(initial = true)
    var bio by remember { mutableStateOf(vm.bio()) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Settings")
        HostCard {
            ListItem(headlineContent = { Text("Dark theme") }, trailingContent = { Switch(checked = dark, onCheckedChange = vm::setDark) })
            ListItem(headlineContent = { Text("Push notifications") }, trailingContent = { Switch(checked = push, onCheckedChange = vm::setPush) })
            ListItem(headlineContent = { Text("Biometric login") }, trailingContent = { Switch(checked = bio, onCheckedChange = { bio = it; vm.setBio(it) }) })
        }
        Text("Language")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("en" to "English", "ur" to "Urdu", "ar" to "Arabic").forEach { (code, label) ->
                FilterChip(selected = lang == code, onClick = { vm.setLang(code) }, label = { Text(label) })
            }
        }
        ElevatedButton(onClick = onDevices, modifier = Modifier.fillMaxWidth()) { Text("Device management") }
        ElevatedButton(onClick = { /* change password route */ }, modifier = Modifier.fillMaxWidth()) { Text("Change password") }
        ElevatedButton(onClick = { /* privacy */ }, modifier = Modifier.fillMaxWidth()) { Text("Privacy & security") }
        PrimaryButton("Logout") { vm.logout(); onLogout() }
        TextButton(onClick = onBack) { Text("Back") }
    }
}

@Composable
fun DevicesScreen(onBack: () -> Unit) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Device management")
        HostCard { Text("This Android device"); Text("Active session · secure token stored") }
        HostCard { Text("Session timeout"); Text("Auto logout after 7 days of inactivity") }
        TextButton(onClick = onBack) { Text("Back") }
    }
}
