// Workaround for building with Xcode 26.3+.
//
// Expo SDK 58's ExpoModulesJSI pod is compiled in Swift 6 language mode, and the
// Swift compiler in Xcode 26.3 rejects one of its functions with
// "sending 'slot' risks causing data races" (JavaScriptObject.swift,
// withEncodedValue). That concurrency check is only a hard error in Swift 6
// mode, so this compiles just that pod in Swift 5 mode. Nothing else changes.
//
// Remove this plugin (and its entry in app.json) once an Expo release fixes it.
const { withPodfile } = require('expo/config-plugins');

const MARKER = '# aCcountable: ExpoModulesJSI Swift 5 workaround';
const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      next unless target.name == 'ExpoModulesJSI'
      target.build_configurations.each do |build_config|
        build_config.build_settings['SWIFT_VERSION'] = '5.0'
      end
    end`;

module.exports = function withExpoJsiSwift5(config) {
  return withPodfile(config, (cfg) => {
    const podfile = cfg.modResults.contents;
    if (podfile.includes(MARKER)) return cfg;
    const hook = /post_install do \|installer\|/;
    if (!hook.test(podfile)) {
      throw new Error('with-expo-jsi-swift5: could not find the post_install block in the Podfile');
    }
    cfg.modResults.contents = podfile.replace(hook, (m) => m + SNIPPET);
    return cfg;
  });
};
