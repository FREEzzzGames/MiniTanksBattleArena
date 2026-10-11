plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "games.freezzz.tetrisconsole"
    compileSdk = 35
    defaultConfig {
        applicationId = "games.freezzz.tetrisconsole"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
}
