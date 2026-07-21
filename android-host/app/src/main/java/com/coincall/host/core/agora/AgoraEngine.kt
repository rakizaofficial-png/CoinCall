package com.coincall.host.core.agora

import android.content.Context
import android.view.ViewGroup
import javax.inject.Inject
import javax.inject.Singleton

enum class CallMediaMode { VIDEO, AUDIO }

data class AgoraJoinConfig(
    val appId: String,
    val channel: String,
    val token: String,
    val uid: Int,
    val mode: CallMediaMode = CallMediaMode.VIDEO,
)

interface AgoraEngine {
    fun initialize(context: Context, appId: String)
    fun join(config: AgoraJoinConfig)
    fun leave()
    fun setMuted(muted: Boolean)
    fun setSpeakerphone(on: Boolean)
    fun switchCamera()
    fun setCameraEnabled(enabled: Boolean)
    fun setBeauty(enabled: Boolean)
    fun attachLocalPreview(container: ViewGroup)
    fun attachRemoteView(container: ViewGroup)
    fun destroy()
    val isJoined: Boolean
}

/**
 * Production-ready façade. When the Agora SDK AAR is on the classpath,
 * swap [StubAgoraEngine] for [SdkAgoraEngine] in [com.coincall.host.di.AgoraModule].
 * Keeps call UI / permissions / token flow testable without native libs in CI.
 */
@Singleton
class StubAgoraEngine @Inject constructor() : AgoraEngine {
    @Volatile override var isJoined: Boolean = false
        private set
    private var muted = false
    private var speaker = true
    private var cameraOn = true
    private var facingFront = true

    override fun initialize(context: Context, appId: String) {
        require(appId.isNotBlank()) { "Agora App ID required" }
    }

    override fun join(config: AgoraJoinConfig) {
        require(config.token.isNotBlank()) { "Agora token required" }
        require(config.channel.isNotBlank()) { "Channel required" }
        isJoined = true
        if (config.mode == CallMediaMode.AUDIO) cameraOn = false
    }

    override fun leave() { isJoined = false }
    override fun setMuted(muted: Boolean) { this.muted = muted }
    override fun setSpeakerphone(on: Boolean) { speaker = on }
    override fun switchCamera() { facingFront = !facingFront }
    override fun setCameraEnabled(enabled: Boolean) { cameraOn = enabled }
    override fun setBeauty(enabled: Boolean) { /* beauty extension hook */ }
    override fun attachLocalPreview(container: ViewGroup) { /* SurfaceView attach in SDK impl */ }
    override fun attachRemoteView(container: ViewGroup) { }
    override fun destroy() { isJoined = false }
}
