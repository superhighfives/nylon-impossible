//
//  ToastUndoBridge.swift
//  Nylon Impossible
//
//  Puts the toast's Undo on the window's undo manager, so Edit ▸ Undo and ⌘Z
//  do what the toast's button does — "Undo Done", "Undo Deleted". The
//  registration is only good while that toast is up: a newer toast replaces
//  it, and an expired one removes it, so ⌘Z never reaches back past what the
//  toast offered. Text fields keep their own typing undo on the same manager,
//  so ⌘Z still undoes whatever happened most recently.
//
//  Used by the Mac board; shared so it's tested on every platform.
//

import Foundation

@MainActor
final class ToastUndoBridge {
    /// The toast currently registered, if any.
    private(set) var registeredId: UUID?

    /// Match the undo manager to `toasts.current`.
    func sync(_ toasts: ToastCenter, undoManager: UndoManager?) {
        guard let undoManager else { return }
        let toast = toasts.current
        guard toast?.id != registeredId else { return }
        undoManager.removeAllActions(withTarget: self)
        registeredId = nil
        guard let toast, toast.actionLabel == "Undo" else { return }
        registeredId = toast.id
        undoManager.registerUndo(withTarget: self) { [weak toasts] bridge in
            MainActor.assumeIsolated {
                guard let toasts, toasts.current?.id == toast.id else { return }
                bridge.registeredId = nil
                toasts.performAction()
            }
        }
        undoManager.setActionName(toast.text)
    }
}
