import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appConfig = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')) as {
  expo: { ios: { buildNumber: string }; plugins: (string | [string, Record<string, unknown>])[] };
};
const easConfig = JSON.parse(await readFile(new URL('../eas.json', import.meta.url), 'utf8')) as {
  build: { production?: { distribution?: string; developmentClient?: boolean; autoIncrement?: boolean } };
};
const infoPlist = await readFile(new URL('../ios/DukaanFlow/Info.plist', import.meta.url), 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
});

test('iOS does not request microphone access for Wispr keyboard dictation', () => {
  const cameraPlugin = appConfig.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera');
  const imagePickerPlugin = appConfig.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker');

  assert.ok(Array.isArray(cameraPlugin));
  assert.ok(Array.isArray(imagePickerPlugin));
  assert.equal(cameraPlugin[1].microphonePermission, false);
  assert.equal(imagePickerPlugin[1].microphonePermission, false);
  assert.equal(appConfig.expo.ios.buildNumber, '1');
});

test('generated iOS plist limits in-app capture permissions to the declared uses', { skip: infoPlist === null }, () => {
  assert.ok(infoPlist);
  assert.doesNotMatch(infoPlist, /NSMicrophoneUsageDescription/u);
  assert.match(infoPlist, /NSCameraUsageDescription[\s\S]*?scan product barcodes and supplier invoices/u);
});

test('iOS photo permission describes attaching a reference photo, not automatic product recognition', () => {
  const imagePickerPlugin = appConfig.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker');

  assert.ok(Array.isArray(imagePickerPlugin));
  assert.match(String(imagePickerPlugin[1].photosPermission), /attach a reference photo/u);
  assert.doesNotMatch(String(imagePickerPlugin[1].photosPermission), /recognize|identify|read/u);
});

test('EAS production profile targets store distribution and increments the local build number', () => {
  assert.equal(easConfig.build.production?.distribution, 'store');
  assert.equal(easConfig.build.production?.developmentClient, false);
  assert.equal(easConfig.build.production?.autoIncrement, true);
});
