package com.coincall.host

import android.app.Application
import com.coincall.host.core.push.HostPush
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class HostApp : Application() {
    override fun onCreate() {
        super.onCreate()
        HostPush.ensureChannels(this)
    }
}
