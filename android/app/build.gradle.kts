plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Version kommt aus dem CI (-PappVersionName=1.2.3 -PappVersionCode=10203),
// lokal fallen wir auf einen Entwicklungsstand zurueck.
val appVersionName = (findProperty("appVersionName") as String?) ?: "0.0.1"
val appVersionCode = (findProperty("appVersionCode") as String?)?.toInt() ?: 1

// Signierschluessel wird ueber Umgebungsvariablen hereingereicht (GitHub Secrets).
val keystorePath: String? = System.getenv("KEYSTORE_FILE")
val hasReleaseKeystore = !keystorePath.isNullOrBlank() && file(keystorePath).exists()

android {
    namespace = "de.kraemersippe.essensplan"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.kraemersippe.essensplan"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName

        // Quelle fuer die In-App-Updates
        buildConfigField("String", "UPDATE_REPO", "\"DukyNuky/meinibs-essensplan\"")
    }

    signingConfigs {
        create("release") {
            if (hasReleaseKeystore) {
                storeFile = file(keystorePath!!)
                storeType = "PKCS12"
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS") ?: "essensplan"
                keyPassword = System.getenv("KEY_PASSWORD") ?: System.getenv("KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Ohne Keystore (lokaler Testbau) mit dem Debug-Schluessel signieren,
            // damit ueberhaupt ein installierbares APK herauskommt.
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("com.google.android.material:material:1.12.0")
}
