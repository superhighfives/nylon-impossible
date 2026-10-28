---
title: iOS Keychain JWT Storage
status: Complete
created: 2026-03-27
updated: 2026-10-27
---

**Scope:** iOS

## Overview

The Clerk JWT that Siri, the share extension and background sync use was
sitting in plain text in the App Group's UserDefaults plist. #125 (merged
2026-04-05) moved it and its expiry into the Keychain, in an access group
shared by the app and its extensions, readable after first unlock so
background refresh still works while the phone is locked. Existing installs
copy the old token across once and the UserDefaults entries are deleted.

It is still how the token is stored. The Mac app (#408) reused it, and #462
(2026-10-25) changed what goes into it: ClerkKit now shares one session
between the app and its extensions, so `BackgroundSyncService` mints a
fresh token itself and only falls back to the stored one while its real
`exp` hasn't passed.

## Architecture

- `Utils/KeychainHelper.swift` wraps `SecItem*` for generic-password items
  under the service `com.superhighfives.Nylon-Impossible.shared`, with
  string and date helpers. Writes update first and add only on
  `errSecItemNotFound`, so a failed write never destroys the old value.
- `AuthService` writes the token and expiry with `persistAuthTokenToKeychain()`
  and deletes them on sign-out, along with any leftover UserDefaults copies.
  `migrateAuthTokenFromUserDefaultsToKeychain()` does the one-time copy; the
  app calls it when `isSignedIn` turns true, just before writing a fresh token.
- `BackgroundSyncService` reads the token from the Keychain instead of
  UserDefaults. `userId` stays in shared UserDefaults, as the plan allowed.
- `keychain-access-groups` (`$(AppIdentifierPrefix)com.superhighfives.Nylon-Impossible.shared`)
  is in the app and share-extension entitlements, and later the widget's
  and the macOS variants.

Deviations, mostly from review (e709373):

- **No `kSecAttrAccessGroup` in code.** The plan passed the access group to
  each call. The `$(AppIdentifierPrefix)` placeholder only expands in
  entitlements, not at runtime, so items are keyed by `kSecAttrService` and
  the entitlement scopes them to the group. The helper's functions take no
  `accessGroup` argument.
- **Update-then-add** instead of delete-then-add, and `loadUnaligned` when
  decoding the stored date.
- **macOS** (#408) sets `kSecUseDataProtectionKeychain`, because the legacy
  file keychain ignores access groups and wouldn't share the token with the
  widget.

I couldn't confirm from the repo whether the provisioning profiles were
updated by hand or picked up by automatic signing.

## Problem

The Clerk JWT used for background sync is currently stored in App Group UserDefaults
(`BackgroundSyncService.authTokenKey` / `authTokenExpiryKey` in the
`group.com.superhighfives.Nylon-Impossible` suite). UserDefaults is backed by an unencrypted
plist on disk — any process with file-system access to the app group container can read the
bearer token in plain text.

## Proposed solution

Move the JWT and its expiry to the Keychain using a shared access group so the main app,
extensions, and background tasks can still share the credential. The Keychain provides
hardware-backed encryption (Secure Enclave on devices with one) and OS-level access control.

## Implementation sketch

### 1. Keychain helper

Create a small wrapper around `Security.framework` for CRUD operations on generic password
items scoped to a shared access group:

```swift
// KeychainHelper.swift
import Security

enum KeychainHelper {
    static func save(key: String, data: Data, accessGroup: String) throws { … }
    static func load(key: String, accessGroup: String) -> Data? { … }
    static func delete(key: String, accessGroup: String) { … }
}
```

Use `kSecAttrAccessGroup` set to the shared access group identifier
(e.g. `$(TeamID).com.superhighfives.Nylon-Impossible.shared`) and
`kSecAttrAccessible` set to `kSecAttrAccessibleAfterFirstUnlock` so background tasks can
read the token while the device is locked.

### 2. Update AuthService

Replace UserDefaults reads/writes in `AuthService.swift` with calls to `KeychainHelper`:

| Current (UserDefaults) | New (Keychain) |
|------------------------|----------------|
| `sharedDefaults.set(token, forKey: authTokenKey)` | `KeychainHelper.save(key: authTokenKey, data: tokenData, accessGroup: group)` |
| `sharedDefaults.set(expiry, forKey: authTokenExpiryKey)` | `KeychainHelper.save(key: authTokenExpiryKey, data: expiryData, accessGroup: group)` |
| `sharedDefaults.removeObject(forKey:)` in `clearUserIdFromSharedDefaults()` | `KeychainHelper.delete(key:accessGroup:)` |

`persistAuthTokenToSharedDefaults()` (lines 79-90) and `clearUserIdFromSharedDefaults()`
(lines 93-98) are the two methods that need updating.

### 3. Update BackgroundSyncService

`BackgroundSyncService.init` (lines 26-37) currently reads the token and expiry from shared
UserDefaults. Update to read from Keychain instead.

### 4. Update Nylon_ImpossibleApp

The background task registered in `Nylon_ImpossibleApp.swift` (lines 47-50) retrieves the
token from shared UserDefaults. Update to use `KeychainHelper.load`.

### 5. One-time migration

On first launch after the update, check if a token exists in UserDefaults but not in the
Keychain. If so, copy it across and delete the UserDefaults entry. This avoids forcing a
re-authentication.

### 6. Entitlements

Add the `keychain-access-groups` entitlement to both the main app target and any extension
targets. Update provisioning profiles in the Apple Developer portal to include the shared
Keychain access group.

## Files to modify

| File | Change |
|------|--------|
| `src/ios/Nylon Impossible/Nylon Impossible/Utils/KeychainHelper.swift` | New — Keychain CRUD wrapper |
| `src/ios/Nylon Impossible/Nylon Impossible/Services/AuthService.swift` | Replace UserDefaults with KeychainHelper |
| `src/ios/Nylon Impossible/Nylon Impossible/Services/BackgroundSyncService.swift` | Replace UserDefaults read with KeychainHelper |
| `src/ios/Nylon Impossible/Nylon Impossible/Nylon_ImpossibleApp.swift` | Update background task token retrieval |
| `src/ios/Nylon Impossible/Nylon Impossible/Nylon Impossible.entitlements` | Add `keychain-access-groups` |

## Acceptance criteria

- [ ] JWT and expiry are stored in the Keychain, not UserDefaults
- [ ] Main app and background tasks can both read the token via shared access group
- [ ] `kSecAttrAccessibleAfterFirstUnlock` is used so background refresh works while locked
- [ ] One-time migration copies existing UserDefaults token to Keychain on upgrade
- [ ] Old UserDefaults entries are removed after successful migration
- [ ] Sign-out clears Keychain entries
- [ ] `userId` can remain in UserDefaults (non-sensitive, used for cache keys only)
- [ ] Provisioning profiles updated with Keychain access group entitlement

## Out of scope

- Encrypting the userId (low sensitivity, used only as a cache key)
- Biometric unlock gating (unnecessary for a short-lived JWT)

## Dependencies

- Apple Developer portal access to update provisioning profiles
- No third-party libraries — uses `Security.framework` directly
