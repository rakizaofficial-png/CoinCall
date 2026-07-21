package com.coincall.host.presentation.kyc

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.CameraAlt
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.unit.dp
import com.coincall.host.core.ui.components.*

@Composable
fun KycScreen(onBack: () -> Unit) {
    var selfieDone by remember { mutableStateOf(false) }
    var docStatus by remember { mutableStateOf("Pending upload") }
    val progress = listOf(selfieDone, docStatus == "Under review" || docStatus == "Approved").count { it } / 2f
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("KYC verification")
        Text("Required for withdrawals and verified badge")
        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
        Text("Progress ${(progress * 100).toInt()}%")
        HostCard {
            ListItem(leadingContent = { Icon(Icons.Outlined.CameraAlt, null) }, headlineContent = { Text("Selfie verification") }, supportingContent = { Text(if (selfieDone) "Captured" else "Take a live selfie") }, trailingContent = {
                TextButton(onClick = { selfieDone = true }) { Text(if (selfieDone) "Retake" else "Capture") }
            })
        }
        HostCard {
            ListItem(leadingContent = { Icon(Icons.Outlined.UploadFile, null) }, headlineContent = { Text("Government ID") }, supportingContent = { Text(docStatus) }, trailingContent = {
                TextButton(onClick = { docStatus = "Under review" }) { Text("Re-upload") }
            })
        }
        HostCard {
            ListItem(leadingContent = { Icon(Icons.Outlined.Badge, null) }, headlineContent = { Text("Document status") }, supportingContent = { Text(docStatus) })
        }
        PrimaryButton("Submit for review", onClick = { docStatus = "Under review" })
        TextButton(onClick = onBack) { Text("Back") }
    }
}
