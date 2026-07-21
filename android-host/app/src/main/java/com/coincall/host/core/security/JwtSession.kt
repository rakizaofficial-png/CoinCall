package com.coincall.host.core.security

import android.util.Base64
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Lightweight JWT-shaped session tokens for host app.
 * Production should validate server-issued JWTs; this mints/verifies
 * HS256 tokens so Authorization headers are real JWTs (not opaque sess_).
 */
object JwtSession {
    private const val DEV_SECRET = "coincall-host-dev-hmac-change-me"

    fun mint(hostId: String, name: String, ttlMs: Long = 7L * 24 * 60 * 60 * 1000): String {
        val header = b64("""{"alg":"HS256","typ":"JWT"}""")
        val now = System.currentTimeMillis() / 1000
        val payload = b64(
            JSONObject()
                .put("sub", hostId)
                .put("name", name)
                .put("role", "host")
                .put("iat", now)
                .put("exp", now + ttlMs / 1000)
                .toString(),
        )
        val sig = sign("$header.$payload")
        return "$header.$payload.$sig"
    }

    fun isValid(token: String?, nowSec: Long = System.currentTimeMillis() / 1000): Boolean {
        if (token.isNullOrBlank()) return false
        val parts = token.split(".")
        if (parts.size != 3) return false
        if (sign("${parts[0]}.${parts[1]}") != parts[2]) return false
        return try {
            val json = JSONObject(String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP)))
            json.optString("role") == "host" && json.optLong("exp") >= nowSec
        } catch (_: Exception) {
            false
        }
    }

    fun hostId(token: String?): String? {
        if (!isValid(token)) return null
        val payload = token!!.split(".")[1]
        return JSONObject(String(Base64.decode(payload, Base64.URL_SAFE or Base64.NO_WRAP))).optString("sub").ifBlank { null }
    }

    private fun b64(s: String): String =
        Base64.encodeToString(s.toByteArray(StandardCharsets.UTF_8), Base64.URL_SAFE or Base64.NO_WRAP)

    private fun sign(data: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(DEV_SECRET.toByteArray(StandardCharsets.UTF_8), "HmacSHA256"))
        return Base64.encodeToString(mac.doFinal(data.toByteArray(StandardCharsets.UTF_8)), Base64.URL_SAFE or Base64.NO_WRAP)
    }
}
