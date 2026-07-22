package com.coincall.host.di

import com.coincall.host.BuildConfig
import com.coincall.host.core.network.AuthInterceptor
import com.coincall.host.core.network.HostApi
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton
    fun moshi(): Moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    @Provides @Singleton
    fun okHttp(authInterceptor: AuthInterceptor): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
        }
        val builder = OkHttpClient.Builder()
            .connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
        if (BuildConfig.SSL_PINNING_ENABLED) {
            // Replace pins before Play release with production cert pins.
            val pinner = CertificatePinner.Builder()
                .add("coincall-api.onrender.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
                .build()
            // Keep disabled until real pins are configured to avoid lockout.
            // builder.certificatePinner(pinner)
        }
        return builder.build()
    }

    @Provides @Singleton
    fun retrofit(client: OkHttpClient, moshi: Moshi): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()

    @Provides @Singleton
    fun hostApi(retrofit: Retrofit): HostApi = retrofit.create(HostApi::class.java)
}
