const { createRunOncePlugin, withPodfile } = require('@expo/config-plugins');

const marker = '# DukaanFlow: normalize old pod deployment targets for current simulator SDKs.';

function withIosDeploymentTarget(config) {
  return withPodfile(config, (modConfig) => {
    let podfile = modConfig.modResults.contents;
    if (podfile.includes(marker)) {
      podfile = podfile
        .replace(/Gem::Version\.new\('15\.1'\)/gu, "Gem::Version.new('16.0')")
        .replace(/build_settings\['IPHONEOS_DEPLOYMENT_TARGET'\] = '15\.1'/gu, "build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'");
      modConfig.modResults.contents = podfile;
      return modConfig;
    }

    const postInstallEnd = '    )\n  end\nend\n';
    if (!podfile.includes(postInstallEnd)) {
      throw new Error('Could not find the React Native post_install block in the generated Podfile.');
    }

    const normalizeTargets = `      ${marker}\n      installer.pods_project.targets.each do |target|\n        target.build_configurations.each do |build_configuration|\n          deployment_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']\n          next unless deployment_target && Gem::Version.new(deployment_target) < Gem::Version.new('16.0')\n\n          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'\n        end\n      end\n`;
    modConfig.modResults.contents = podfile.replace(postInstallEnd, `    )\n${normalizeTargets}  end\nend\n`);
    return modConfig;
  });
}

module.exports = createRunOncePlugin(withIosDeploymentTarget, 'with-ios-deployment-target', '1.0.0');
