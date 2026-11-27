#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
device_id="${1:-}"
team_id="${DUKAANFLOW_DEVELOPMENT_TEAM:-}"
configuration="${DUKAANFLOW_DEVICE_CONFIGURATION:-Debug}"
case "$configuration" in
  Debug|Release) ;;
  *) printf 'DUKAANFLOW_DEVICE_CONFIGURATION must be Debug or Release.\n' >&2; exit 2 ;;
esac
if [[ -z "$device_id" ]]; then
  printf 'Usage: DUKAANFLOW_DEVELOPMENT_TEAM=<team-id> npm run ios:device -- <device-udid>\n' >&2
  exit 2
fi
if [[ -z "$team_id" ]]; then
  printf 'Set DUKAANFLOW_DEVELOPMENT_TEAM to the Team ID shown in Xcode → DukaanFlow target → Signing & Capabilities.\n' >&2
  exit 2
fi

build_root="${DUKAANFLOW_BUILD_ROOT:-/private/tmp}"
mkdir -p "$build_root"
stage="$(mktemp -d "$build_root/dukaanflow-device.XXXXXX")"
log="$stage/device-build.log"
cleanup() {
  if [[ "${DUKAANFLOW_KEEP_STAGE:-0}" == "1" ]]; then
    printf 'Preserving native build stage at %s\n' "$stage" >&2
  else
    rm -rf "$stage"
  fi
}
trap cleanup EXIT

printf 'Staging native device build at %s\n' "$stage"
cp -R "$project_dir/app" "$project_dir/src" "$project_dir/assets" "$project_dir/modules" "$project_dir/plugins" "$stage/"
cp "$project_dir/app.json" "$project_dir/package.json" "$project_dir/package-lock.json" "$project_dir/tsconfig.json" "$project_dir/metro.config.js" "$stage/"
cp "$project_dir/scripts/patch-ios-podfile.rb" "$stage/"
cd -P "$stage"

if [[ "${DUKAANFLOW_REUSE_NODE_MODULES:-1}" == "1" ]]; then
  ditto --norsrc --noextattr --noqtn --noacl "$project_dir/node_modules" "$stage/node_modules"
  if [[ ! -e "$stage/node_modules/invoice-ocr" ]]; then
    ln -s ../modules/invoice-ocr "$stage/node_modules/invoice-ocr"
  fi
else
  npm ci --no-audit --no-fund --prefer-offline
fi

dot_clean -m "$stage"
./node_modules/.bin/expo prebuild --platform ios --no-install
dot_clean -m "$stage"
ruby patch-ios-podfile.rb ios/Podfile
pod install --project-directory=ios
# CocoaPods writes AppleDouble metadata on ExFAT volumes; remove it before Xcode indexes headers.
dot_clean -m "$stage"

if ! xcodebuild -quiet -workspace ios/DukaanFlow.xcworkspace -scheme DukaanFlow \
  -configuration "$configuration" -sdk iphoneos -destination "id=$device_id" \
  -derivedDataPath "$stage/build" -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM="$team_id" build >"$log" 2>&1; then
  tail -n 120 "$log" >&2
  exit 1
fi

app="$stage/build/Build/Products/${configuration}-iphoneos/DukaanFlow.app"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")"
if [[ "$configuration" == "Release" && ! -s "$app/main.jsbundle" ]]; then
  printf 'Release build is missing its bundled JavaScript.\n' >&2
  exit 1
fi
xcrun devicectl device install app --device "$device_id" "$app"
xcrun devicectl device process launch --device "$device_id" "$bundle_id"
if [[ "$configuration" == "Debug" ]]; then
  printf 'Installed the Debug build. Start Metro with: npm run ios:dev-server -- --lan\n'
else
  printf 'Installed the Release build with bundled JavaScript.\n'
fi
