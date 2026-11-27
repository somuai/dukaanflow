const fs = require('node:fs/promises');
const path = require('node:path');
const {
  createRunOncePlugin,
  withDangerousMod,
  withInfoPlist,
} = require('@expo/config-plugins');

const marker = '// DukaanFlow UIScene lifecycle';

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return modConfig;
  });

  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const appDelegatePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'DukaanFlow',
        'AppDelegate.swift',
      );
      let appDelegate = await fs.readFile(appDelegatePath, 'utf8');

      if (appDelegate.includes(marker)) {
        return modConfig;
      }

      const launchWindowBlock = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\n\s*launchOptions: launchOptions\)\n#endif\n/;
      if (!launchWindowBlock.test(appDelegate)) {
        throw new Error('Could not find the generated Expo AppDelegate launch-window block.');
      }
      appDelegate = appDelegate.replace(launchWindowBlock, '');

      const linkingAnchor = '  // Linking API\n';
      if (!appDelegate.includes(linkingAnchor)) {
        throw new Error('Could not find the generated Expo AppDelegate linking section.');
      }
      appDelegate = appDelegate.replace(
        linkingAnchor,
        `  public func application(\n    _ application: UIApplication,\n    configurationForConnecting connectingSceneSession: UISceneSession,\n    options: UIScene.ConnectionOptions\n  ) -> UISceneConfiguration {\n    let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)\n    configuration.delegateClass = SceneDelegate.self\n    return configuration\n  }\n\n  func startReactNative(in window: UIWindow) {\n    reactNativeFactory?.startReactNative(\n      withModuleName: "main",\n      in: window,\n      launchOptions: nil)\n  }\n\n${linkingAnchor}`,
      );

      appDelegate += `\n${marker}\nclass SceneDelegate: UIResponder, UIWindowSceneDelegate {\n  var window: UIWindow?\n\n  func scene(\n    _ scene: UIScene,\n    willConnectTo session: UISceneSession,\n    options connectionOptions: UIScene.ConnectionOptions\n  ) {\n    guard let windowScene = scene as? UIWindowScene else { return }\n\n    let window = UIWindow(windowScene: windowScene)\n    self.window = window\n    (UIApplication.shared.delegate as? AppDelegate)?.startReactNative(in: window)\n  }\n\n  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {\n    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }\n    for context in URLContexts {\n      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])\n    }\n  }\n\n  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {\n    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }\n    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })\n  }\n}\n`;

      await fs.writeFile(appDelegatePath, appDelegate);
      return modConfig;
    },
  ]);
}

module.exports = createRunOncePlugin(withIosSceneLifecycle, 'with-ios-scene-lifecycle', '1.0.0');
