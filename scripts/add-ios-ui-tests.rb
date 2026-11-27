require 'xcodeproj'

project_path = ARGV.fetch(0)
test_source = ARGV.fetch(1)
project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |target| target.name == 'DukaanFlow' }
abort 'Could not find the DukaanFlow app target.' unless app_target

test_target = project.targets.find { |target| target.name == 'DukaanFlowTests' }
test_target ||= project.new_target(:ui_test_bundle, 'DukaanFlowTests', :ios, '16.0', nil, :swift)
existing_test_source = test_target.source_build_phase.files_references.find do |reference|
  File.basename(reference.path.to_s) == File.basename(test_source)
end
if existing_test_source && existing_test_source.path != test_source
  build_file = test_target.source_build_phase.files.find { |candidate| candidate.file_ref == existing_test_source }
  test_target.source_build_phase.remove_build_file(build_file) if build_file
  existing_test_source.remove_from_project
end
unless test_target.source_build_phase.files_references.any? { |reference| reference.path == test_source }
  test_target.add_file_references([project.new_file(test_source)])
end
test_target.add_dependency(app_target) unless test_target.dependencies.any? { |dependency| dependency.target == app_target }

test_target.build_configurations.each do |configuration|
  settings = configuration.build_settings
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.dukaanflow.prototype.tests'
  settings['PRODUCT_NAME'] = 'DukaanFlowTests'
  settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
  settings['SWIFT_VERSION'] = '5.0'
  settings['TARGETED_DEVICE_FAMILY'] = '1'
  settings['TEST_TARGET_NAME'] = 'DukaanFlow'
end

attributes = project.root_object.attributes['TargetAttributes'] ||= {}
attributes[test_target.uuid] ||= {}
attributes[test_target.uuid]['TestTargetID'] = app_target.uuid
project.save

scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app_target, test_target)
scheme.save_as(project_path, 'DukaanFlowReconciliationUITests')
