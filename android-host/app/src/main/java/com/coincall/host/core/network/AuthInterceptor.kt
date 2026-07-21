package com.coincall.host.core.network

import com.coincall.host.core.security.JwtSession
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
            .header("X-Client-Role", "host")
        val hostId = tokenStore.hostId ?: JwtSession.hostId(tokenStore.accessToken)
        hostId?.let { builder.header("X-User-Id", it) }
        val access = tokenStore.accessToken
        if (JwtSession.isValid(access)) {
            builder.header("Authorization", "Bearer $access")
        }
        return chain.proceed(builder.build())
    }
}
