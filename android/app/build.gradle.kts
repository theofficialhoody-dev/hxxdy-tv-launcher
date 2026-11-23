plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.hxxdy.launcher"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hxxdy.launcher"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    androidResources {
        // The default pattern drops underscore-prefixed directories, which would remove Next.js's `_next` folder.
        ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~"
    }
}

// The launcher UI is the Next.js static export (../../out). Run `npm run build` in the repo root first.
val webOut = layout.projectDirectory.dir("../../out")
val copyWebAssets by tasks.registering(Copy::class) {
    from(webOut)
    into(layout.buildDirectory.dir("generated/webassets/www"))
    doFirst {
        check(webOut.file("index.html").asFile.exists()) { "Missing ../out/index.html - run `npm run build` first." }
    }
}

android.sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webassets"))

tasks.configureEach {
    if (name.startsWith("merge") && name.endsWith("Assets")) dependsOn(copyWebAssets)
}
