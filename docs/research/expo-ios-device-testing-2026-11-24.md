# Expo iOS device testing and distribution

Researched 2026-11-24 against Expo and Apple documentation.

## Recommendation for DukaanFlow

Use an app-specific Expo development build for end-to-end testing. Expo Go has a fixed native runtime and cannot add native libraries that are not already bundled; development builds include this project's native dependencies. DukaanFlow no longer uses Rive; it uses Expo Blur for the frosted action tray and native tab bar, plus the local `invoice-ocr` Expo module with Swift code and an iOS podspec. Expo Go cannot validate those native blur and invoice capture/OCR paths. ([Expo: development builds FAQ](https://docs.expo.dev/develop/development-builds/faq/), [Expo: custom native code](https://docs.expo.dev/workflow/customizing/), [project dependencies](../../package.json), [InvoiceOCR module](../../modules/invoice-ocr/expo-module.config.json), [InvoiceOCR Swift implementation](../../modules/invoice-ocr/ios/InvoiceOCRModule.swift))

## Install on your own iPhone over USB without paid membership

On a Mac with Xcode, connect and trust the iPhone, sign in to Xcode with an Apple Account, and run `npm run ios:device` (`expo run:ios --device` in this repo). Expo CLI compiles and installs the app locally, and Expo documents this as the route for installing a development build on an iPhone without a paid Apple Developer Program membership. The app already has a bundle identifier and the `ios:device` script. ([Expo: build locally](https://docs.expo.dev/guides/local-app-development/), [Apple: developer account and Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account), [project app config](../../app.json), [device script](../../package.json))

With Apple's free Personal Team, Xcode manages the app IDs, devices, certificates, and profiles. Apple currently limits it to 10 App IDs (expire after 7 days), 3 devices (expire after 7 days), and 3 installed apps per device; the provisioning profile also expires after 7 days, so rebuild and reinstall when it expires. ([Apple: developer account and Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account))

On iOS 16 and later, enable **Settings → Privacy & Security → Developer Mode**, restart, confirm **Turn On**, and enter the passcode. A USB connection to Xcode can initiate pairing and make the setting appear. Developer Mode is required for local development builds and internal distribution builds, but not Simulator builds or enterprise-signed builds. ([Expo: iOS Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/), [Apple: enabling Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device))

After the first native build, JS/TypeScript-only edits can be served with `npm run ios:dev-server` (`expo start --dev-client`). Rebuild after native library, native code, or app configuration changes. ([Expo: local app development](https://docs.expo.dev/guides/local-app-development/), [dev-server script](../../package.json))

## EAS internal distribution

This repo's `development` and `preview` EAS profiles set `distribution: "internal"`. For iOS, that produces an ad hoc or enterprise build. Ad hoc installs require a paid Apple Developer Program account, and the provisioning profile allow-lists device UDIDs registered for that Apple team; a newly added device needs a refreshed profile and a new build or a re-signed build. Apple's standard program permits up to 100 devices per product family per membership year. The `development-simulator` profile is a separate Simulator target and does not require a paid Apple membership. ([Expo: internal distribution](https://docs.expo.dev/build/internal-distribution/), [Apple: device registration](https://developer.apple.com/help/account/devices/register-a-single-device/), [Apple: device limits](https://developer.apple.com/help/account/devices/devices-overview), [Expo: first build](https://docs.expo.dev/build/setup/), [EAS profiles](../../eas.json))

Register test phones with `eas device:create` (or Apple's developer account using the device name and UDID), then build with an updated ad hoc profile. EAS cloud builds also need an Expo account; Apple signing credentials must come from an authorized Apple Developer account or be supplied by an account member who has already configured them. ([Expo: internal distribution](https://docs.expo.dev/build/internal-distribution/), [Expo: Apple account roles and permissions](https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/))

## Expo Update workflow and native changes

Expo's update service, invoked with `eas update`, can deliver compatible JavaScript, styling, and asset changes to a build that already includes `expo-updates`. Configure it with `eas update:configure`, add update channels to the relevant build profiles, and publish to the channel embedded in the installed build. `runtimeVersion` keeps updates matched to the native code in each binary. If native code or app configuration changes, build and install a new binary, then publish updates compatible with its runtime. ([Expo: Expo Update](https://docs.expo.dev/eas-update/), [Expo: runtime versions](https://docs.expo.dev/eas-update/runtime-versions/), [Expo: configure Expo Update](https://docs.expo.dev/eas-update/getting-started/), [Expo: using Expo Update with builds](https://docs.expo.dev/build/updates/))

As inspected on 2026-11-24, DukaanFlow does not directly depend on `expo-updates`, and its app config has no `runtimeVersion` or update URL and its EAS profiles have no `channel`; OTA updates are therefore not configured yet. Native Expo Blur or InvoiceOCR changes, and native permission/configuration changes, must ship in a rebuilt app binary rather than an OTA update alone. ([package dependencies](../../package.json), [app config](../../app.json), [EAS profiles](../../eas.json), [Expo: native changes require compatible runtimes](https://docs.expo.dev/eas-update/runtime-versions/))

**Change since this 2026-11-24 snapshot:** the Rive runtime and Rive assets were removed on 2026-11-25. The current dependencies are listed in `package.json`; no Rive runtime is needed to run the iOS app.

## Caveats

- Local USB installation is a development workflow tied to the Mac/Xcode setup and free Personal Team's short-lived provisioning; it is suitable for personal testing, not sharing installable builds with a test group.
- EAS internal iOS installation is ad hoc distribution, not an unrestricted public download: each device must be in the provisioning allow-list.
- Simulator-only testing does not exercise the physical document camera; the InvoiceOCR README notes its VisionKit scan path requires a physical iPhone/iPad. ([InvoiceOCR README](../../modules/invoice-ocr/README.md))
