package com.coincall.host.core.network

import com.coincall.host.core.security.SecureTokenStore
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenStore: SecureTokenStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val builder = original.newBuilder()
            .header("Accept", "application/json")
            .header("X-App", "coincall-host-android")
            .header("X-App-Version", "1.0.0")
        tokenStore.hostId?.let { builder.header("X-User-Id", it) }
        tokenStore.accessToken?.let { builder.header("Authorization", "Bearer $it") }
        return chain.proceed(builder.build())
    }
}
