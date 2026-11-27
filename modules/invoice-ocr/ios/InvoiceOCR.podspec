Pod::Spec.new do |s|
  s.name = 'InvoiceOCR'
  s.version = '1.0.0'
  s.summary = 'On-device invoice OCR and document scanning for DukaanFlow.'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'DukaanFlow'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '16.0' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ZIPFoundation', '= 0.9.21'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
