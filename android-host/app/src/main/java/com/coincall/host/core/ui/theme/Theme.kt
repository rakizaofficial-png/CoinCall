package com.coincall.host.core.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val LightColors = lightColorScheme(
    primary = TealPrimary,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFCCFBF1),
    secondary = Blush,
    tertiary = Gold,
    background = SurfaceLight,
    surface = Color.White,
    surfaceVariant = Color(0xFFE8EEF7),
    onBackground = Ink,
    onSurface = Ink,
    outline = Color(0xFFCBD5E1),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF2DD4BF),
    onPrimary = Ink,
    primaryContainer = TealDark,
    secondary = Color(0xFFFF6BA8),
    tertiary = Color(0xFFFBBF24),
    background = SurfaceDark,
    surface = CardDark,
    surfaceVariant = InkSoft,
    onBackground = Color(0xFFE2E8F0),
    onSurface = Color(0xFFE2E8F0),
    outline = Color(0xFF334155),
)

@Composable
fun CoinCallHostTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val colors = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colors, typography = HostTypography, content = content)
}
