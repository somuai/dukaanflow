const fs = require('node:fs/promises');
const path = require('node:path');
const plist = require('@expo/plist').default;
const { createRunOncePlugin, IOSConfig, withFinalizedMod, withXcodeProject } = require('@expo/config-plugins');

const defaultLocalNetworkDescription = 'Expo Dev Launcher uses the local network to discover and connect to development servers running on your computer.';

function withIosReleaseInfo(config) {
  config = withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const release = IOSConfig.Target.getXCBuildConfigurationFromPbxproj(project, { buildConfiguration: 'Release' });
    if (!release) throw new Error('Could not find the iOS app Release configuration.');
    release.buildSettings.INFOPLIST_FILE = 'DukaanFlow/Info.Release.plist';
    return modConfig;
  });

  return withFinalizedMod(config, ['ios', async (modConfig) => {
    // Read the generated plist after every Expo plugin has populated it.
    const directory = path.join(modConfig.modRequest.platformProjectRoot, 'DukaanFlow');
    const info = plist.parse(await fs.readFile(path.join(directory, 'Info.plist'), 'utf8'));
    if (Array.isArray(info.NSBonjourServices)) {
      const services = info.NSBonjourServices.filter((name) => !/^_expo\._tcp\.?$/iu.test(name));
      if (services.length) info.NSBonjourServices = services;
      else delete info.NSBonjourServices;
    }
    if (info.NSLocalNetworkUsageDescription === defaultLocalNetworkDescription) delete info.NSLocalNetworkUsageDescription;
    await fs.writeFile(path.join(directory, 'Info.Release.plist'), plist.build(info));
    return modConfig;
  }]);
}

module.exports = createRunOncePlugin(withIosReleaseInfo, 'with-ios-release-info', '1.0.0');
