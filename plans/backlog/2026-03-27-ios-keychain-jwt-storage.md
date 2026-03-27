# iOS Keychain JWT Storage

The Clerk JWT used for background sync is currently stored in App Group UserDefaults (`BackgroundSyncService.authTokenKey`) so the main app and extensions can share it. UserDefaults is a relatively weak storage mechanism for bearer tokens.

The preferred approach is to store the JWT in the Keychain using a shared access group, which provides hardware-backed encryption and OS-level access control. This requires adding the `keychain-access-groups` entitlement to the app and extension targets and updating provisioning profiles accordingly — out of scope for the background sync feature but worth doing as a follow-up.

Raised during PR review of `src/ios/Nylon Impossible/Nylon Impossible/Services/AuthService.swift`.
