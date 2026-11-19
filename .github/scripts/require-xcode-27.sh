#!/bin/sh
# The App Store needs the iOS 27 SDK (ITMS-90725), so an older Xcode on the
# runner image fails the job here rather than shipping it.
version=$(xcodebuild -version | head -1)
echo "$version"
major=$(echo "$version" | awk '{ print int($2) }')
if [ "$major" -lt 27 ]; then
  echo "::error title=Xcode too old::Expected Xcode 27 or later, found ${version}"
  exit 1
fi
