require 'json'

podfile = ARGV.fetch(0)
source = File.read(podfile)
marker = '# DukaanFlow: normalize old pod deployment targets for current simulator SDKs.'

properties_path = File.join(File.dirname(podfile), 'Podfile.properties.json')
properties = JSON.parse(File.read(properties_path))
properties['ios.deploymentTarget'] = '16.0'
File.write(properties_path, JSON.pretty_generate(properties) + "\n")

project_path = File.join(File.dirname(podfile), 'DukaanFlow.xcodeproj', 'project.pbxproj')
if File.file?(project_path)
  project = File.read(project_path).gsub(/IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/, 'IPHONEOS_DEPLOYMENT_TARGET = 16.0;')
  File.write(project_path, project)
end

if source.include?(marker)
  source = source.gsub("Gem::Version.new('15.1')", "Gem::Version.new('16.0')")
  source = source.gsub("build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'", "build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'")
  File.write(podfile, source)
  exit
end

needle = "    )\n  end\nend\n"
unless source.include?(needle)
  abort("Could not find the React Native post_install block in #{podfile}")
end

adjustment = <<~RUBY
      #{marker}
      installer.pods_project.targets.each do |target|
        target.build_configurations.each do |build_configuration|
          deployment_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
          next unless deployment_target && Gem::Version.new(deployment_target) < Gem::Version.new('16.0')

          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
        end
      end
RUBY

File.write(podfile, source.sub(needle, "    )\n#{adjustment}  end\nend\n"))
