#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
device="${1:-booted}"
simulator_id="$device"
if [[ "$simulator_id" == "booted" ]]; then
  simulator_id="$(xcrun simctl list devices booted | sed -nE 's/.*\(([0-9A-F-]{36})\).*/\1/p' | head -n 1)"
fi
if [[ -z "$simulator_id" ]]; then
  printf 'No booted iOS Simulator found for the requested build.\n' >&2
  exit 1
fi
destination="platform=iOS Simulator,id=$simulator_id"
build_root="${DUKAANFLOW_BUILD_ROOT:-/private/tmp}"
mkdir -p "$build_root"
stage="$(mktemp -d "$build_root/dukaanflow-ios.XXXXXX")"
output="$project_dir/dist/ios"
build_log="${DUKAANFLOW_BUILD_LOG:-$stage/xcodebuild.log}"
mkdir -p "$(dirname "$build_log")"
cleanup() {
  if [[ "${DUKAANFLOW_KEEP_STAGE:-0}" != "1" ]]; then
    rm -rf "$stage"
  else
    printf 'Preserving native build stage at %s\n' "$stage" >&2
  fi
}
trap cleanup EXIT

printf 'Staging native build at %s\n' "$stage"
cp -R "$project_dir/app" "$project_dir/src" "$project_dir/assets" "$project_dir/modules" "$project_dir/plugins" "$stage/"
cp "$project_dir/app.json" "$project_dir/package.json" "$project_dir/package-lock.json" "$project_dir/tsconfig.json" "$project_dir/metro.config.js" "$stage/"
cp "$project_dir/scripts/patch-ios-podfile.rb" "$project_dir/scripts/add-ios-ui-tests.rb" "$stage/"
cd -P "$stage"
if [[ "${DUKAANFLOW_REUSE_NODE_MODULES:-0}" == "1" ]]; then
  ditto --norsrc --noextattr --noqtn --noacl "$project_dir/node_modules" "$stage/node_modules"
  if [[ ! -e "$stage/node_modules/invoice-ocr" ]]; then
    ln -s ../modules/invoice-ocr "$stage/node_modules/invoice-ocr"
  fi
  npm ls --prefix "$stage" --depth=0
else
  npm ci --no-audit --no-fund --prefer-offline
fi
dot_clean -m "$stage"
./node_modules/.bin/expo prebuild --platform ios --no-install
dot_clean -m "$stage"
mkdir -p ios/DukaanFlowTests
cp "$project_dir/ios-tests/DukaanFlowTests/ReconciliationUITests.swift" ios/DukaanFlowTests/
ruby patch-ios-podfile.rb ios/Podfile
pod install --project-directory=ios
pod_wrapper="$(command -v pod)"
pod_gem_home="$(sed -nE 's/^GEM_HOME="([^"]+)".*/\1/p' "$pod_wrapper" | head -n 1)"
if [[ -z "$pod_gem_home" ]]; then
  pod_executable="$(realpath "$pod_wrapper")"
  pod_gem_home="$(dirname "$(dirname "$pod_executable")")"
fi
(
  cd ios
  GEM_HOME="$pod_gem_home" ruby ../add-ios-ui-tests.rb DukaanFlow.xcodeproj DukaanFlowTests/ReconciliationUITests.swift
)
# Build for the requested simulator architecture rather than a generic multi-architecture simulator target.
if ! xcodebuild -quiet -workspace ios/DukaanFlow.xcworkspace -scheme DukaanFlow \
  -configuration Release -sdk iphonesimulator -destination "$destination" \
  -derivedDataPath "$stage/build" ONLY_ACTIVE_ARCH=YES \
  CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- build >"$build_log" 2>&1; then
  tail -n 120 "$build_log" >&2
  exit 1
fi

if [[ "${DUKAANFLOW_RUN_UI_TESTS:-0}" == "1" ]]; then
  test_args=()
  if [[ -n "${DUKAANFLOW_XCRESULT:-}" ]]; then
    test_args+=(-resultBundlePath "$DUKAANFLOW_XCRESULT")
  fi
  if [[ -n "${DUKAANFLOW_TEST_ONLY:-}" ]]; then
    test_args+=(-only-testing:"$DUKAANFLOW_TEST_ONLY")
  fi
  if ! xcodebuild -workspace ios/DukaanFlow.xcworkspace -scheme DukaanFlowReconciliationUITests \
    -configuration Release -destination "$destination" \
    -derivedDataPath "$stage/build" ONLY_ACTIVE_ARCH=YES \
    CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=- \
    -parallel-testing-enabled NO "${test_args[@]}" test >>"$build_log" 2>&1; then
    tail -n 120 "$build_log" >&2
    exit 1
  fi
  printf 'Reconciliation UI test passed for simulator %s\n' "$simulator_id"
fi

app="$stage/build/Build/Products/Release-iphonesimulator/DukaanFlow.app"
mkdir -p "$output"
ditto -c -k --keepParent "$app" "$output/DukaanFlow-simulator.zip"
xcrun simctl install "$simulator_id" "$app"
xcrun simctl launch "$simulator_id" com.dukaanflow.prototype
printf 'Simulator bundle: %s\n' "$output/DukaanFlow-simulator.zip"
