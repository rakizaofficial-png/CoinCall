package com.coincall.host.di

import com.coincall.host.core.agora.AgoraEngine
import com.coincall.host.core.agora.StubAgoraEngine
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AgoraModule {
    @Binds @Singleton
    abstract fun bindAgora(impl: StubAgoraEngine): AgoraEngine
}
