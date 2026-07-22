package com.coincall.host.presentation.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.coincall.host.core.ui.components.*
import com.coincall.host.data.repository.HostRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileState(
    val name: String = "",
    val bio: String = "",
    val country: String = "",
    val city: String = "",
    val gender: String = "",
    val dob: String = "",
    val languages: String = "English",
    val interests: String = "",
    val skills: String = "",
    val experience: String = "",
    val avatarUrl: String? = null,
    val coverUrl: String? = null,
    val verified: Boolean = false,
    val completion: Int = 45,
    val loading: Boolean = false,
    val saved: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(private val repo: HostRepository) : ViewModel() {
    private val _state = MutableStateFlow(ProfileState())
    val state = _state.asStateFlow()
    init { load() }
    fun load() = viewModelScope.launch {
        _state.update { it.copy(loading = true) }
        repo.getProfile().onSuccess { p ->
            _state.update {
                it.copy(
                    loading = false,
                    name = p.name ?: "",
                    bio = p.bio ?: "",
                    country = p.country ?: "",
                    languages = p.languages?.joinToString(", ") ?: "English",
                    avatarUrl = p.avatarUrl ?: p.photoUrl,
                    verified = p.isVerified == true,
                    completion = listOf(p.name, p.bio, p.country, p.photoUrl).count { !it.isNullOrBlank() } * 20 + 20,
                )
            }
        }.onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
    }
    fun update(transform: (ProfileState) -> ProfileState) = _state.update(transform)
    fun save() = viewModelScope.launch {
        val s = _state.value
        _state.update { it.copy(loading = true, error = null) }
        repo.updateProfile(s.name, s.bio, s.country, s.languages.split(",").map { it.trim() }.filter { it.isNotEmpty() })
            .onSuccess { _state.update { it.copy(loading = false, saved = true, completion = 90) } }
            .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
    }
}

@Composable
fun ProfileScreen(
    onEdit: () -> Unit,
    onKyc: () -> Unit,
    onAgency: () -> Unit,
    onReferral: () -> Unit,
    onHelp: () -> Unit,
    onSettings: () -> Unit,
    onSchedule: () -> Unit = {},
    onReviews: () -> Unit = {},
    onStatus: () -> Unit = {},
    vm: ProfileViewModel = hiltViewModel(),
) {
    val state by vm.state.collectAsState()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HostCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AsyncImage(
                    model = state.avatarUrl ?: "https://api.dicebear.com/9.x/avataaars/png?seed=host",
                    contentDescription = null,
                    modifier = Modifier.size(72.dp).clip(CircleShape),
                    contentScale = ContentScale.Crop,
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(state.name.ifBlank { "Host" }, style = MaterialTheme.typography.titleLarge)
                        if (state.verified) {
                            Spacer(Modifier.width(6.dp))
                            Icon(Icons.Outlined.Verified, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                    Text(state.bio.ifBlank { "Complete your profile to get more calls" }, style = MaterialTheme.typography.bodyMedium)
                    LinearProgressIndicator(progress = { state.completion / 100f }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                    Text("Profile ${state.completion}% complete", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        listOf(
            "Edit profile" to onEdit,
            "KYC verification" to onKyc,
            "Online / busy / vacation" to onStatus,
            "Availability schedule" to onSchedule,
            "Reviews & ranking" to onReviews,
            "Agency" to onAgency,
            "Referrals" to onReferral,
            "Help Center" to onHelp,
            "Settings" to onSettings,
        ).forEach { (label, action) ->
            ElevatedButton(onClick = action, modifier = Modifier.fillMaxWidth()) { Text(label) }
        }
    }
}

@Composable
fun EditProfileScreen(onBack: () -> Unit, vm: ProfileViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    LaunchedEffect(state.saved) { if (state.saved) onBack() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SectionTitle("Edit profile")
        HostTextField(state.name, { vm.update { s -> s.copy(name = it) } }, "Name")
        HostTextField(state.bio, { vm.update { s -> s.copy(bio = it) } }, "Bio", singleLine = false)
        HostTextField(state.country, { vm.update { s -> s.copy(country = it) } }, "Country")
        HostTextField(state.city, { vm.update { s -> s.copy(city = it) } }, "City")
        HostTextField(state.gender, { vm.update { s -> s.copy(gender = it) } }, "Gender")
        HostTextField(state.dob, { vm.update { s -> s.copy(dob = it) } }, "Date of birth")
        HostTextField(state.languages, { vm.update { s -> s.copy(languages = it) } }, "Languages")
        HostTextField(state.interests, { vm.update { s -> s.copy(interests = it) } }, "Interests")
        HostTextField(state.skills, { vm.update { s -> s.copy(skills = it) } }, "Skills")
        HostTextField(state.experience, { vm.update { s -> s.copy(experience = it) } }, "Experience")
        Text("Upload avatar / cover via gallery in next media picker pass", style = MaterialTheme.typography.bodySmall)
        state.error?.let { ErrorBanner(it) }
        PrimaryButton(if (state.loading) "Saving…" else "Save profile", onClick = vm::save, enabled = !state.loading)
        TextButton(onClick = onBack) { Text("Cancel") }
    }
}
