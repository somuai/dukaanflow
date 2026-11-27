# DukaanFlow

An iOS-first prototype for voice-first customer credit memory and supplier delivery reconciliation. Owners speak through the Wispr Flow keyboard or type, check the transcript, and tap Submit. DukaanFlow saves supported notes when it can match every event to shop records and keeps uncertain notes editable for clarification.

## Start the submission demo with Docker

With Docker running, clone this repository, enter its directory, and build and start the reviewer preview. It needs no API keys or `.env` file.

```sh
docker compose up --build --wait
```

Open [http://localhost:8080](http://localhost:8080) in a browser. Set up a test shop, choose **Continue with typing**, and submit `Raju ने ₹100 उधार लिया है, रविवार तक चुका देगा।` from Home. Open **Customers → Raju** to see the ₹100 balance and promise. Run `docker compose down` to stop the preview. The first build downloads the container images and npm dependencies.

Docker serves the Expo web export. The recorded demo shows Wispr Flow keyboard dictation on an iPhone. The iOS camera, OCR, and Files features require the custom native build described below.

## Run on a Mac

Prerequisites are Node 22, npm, Xcode with an iOS Simulator runtime, and CocoaPods. From this project directory:

```sh
npm ci
npm run typecheck
npm test
npm run ios -- booted
```

Boot an iPhone Simulator before the last command or replace `booted` with its device ID. The build stages the Expo project at a temporary path without spaces to support CocoaPods and React Native. It installs a self-contained Release build and writes a Simulator archive to `dist/ios`. The installed app can launch without Metro. Run `xcrun simctl list devices available` to find available device IDs.

## Try a receipt

On a clean install, create a shop profile and continue with Wispr Flow setup or skip to typing. Add Ramesh Sharma as a customer, then try `Ramesh Sharma ko 350 ka samaan udhaar likho, Friday ko denge.` in the Home note field. Check the transcript, tap **Submit**, then open the customer account to see the credit and promise. Record a partial repayment to see the remaining balance.

Supplier receiving stays available from Home. Review what the bill says against good, damaged, missing, and extra quantities; only the confirmed receipt changes usable stock and the supplier payable. Open **Supplier accounts** from Home to add a supplier and review its delivery and payment history. A partial supplier payment is a separate confirmed event; the app computes the remaining payable and keeps a linked correction history.

## Try it on your iPhone

Connect and unlock the iPhone, accept **Trust This Computer**, and enable **Developer Mode** in iOS Settings. In Xcode, select **DukaanFlow → Signing & Capabilities → Automatically manage signing → Personal Team**. Then run the build with your Team ID and the connected device UDID:

```sh
DUKAANFLOW_DEVELOPMENT_TEAM=YOUR_PERSONAL_TEAM_ID \
DUKAANFLOW_DEVICE_CONFIGURATION=Release \
npm run ios:device -- YOUR_IPHONE_UDID
```

Find the device ID with `xcrun devicectl list devices`. The command stages the Expo project, installs CocoaPods, then signs, installs, and launches the app. The Release configuration embeds JavaScript and runs without Metro. For development with live reload, omit the configuration flag and start Metro with `npm run ios:dev-server -- --lan`. Set `DUKAANFLOW_BUILD_ROOT` to a mounted volume with free space if needed. The native invoice OCR module requires a custom build. [Expo iOS device testing](docs/research/expo-ios-device-testing-2026-11-24.md)

Wispr Flow is installed separately from the App Store. On iPhone, add its keyboard in Settings → General → Keyboard → Keyboards and allow Full Access; choose Flow from the globe key in DukaanFlow. [Flow keyboard setup](https://docs.wisprflow.ai/articles/7453988911-set-up-the-flow-keyboard-on-iphone).

[Round 2 recording plan](docs/release/round-2-filming.md)
