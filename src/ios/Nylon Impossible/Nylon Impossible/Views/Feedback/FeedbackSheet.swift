//
//  FeedbackSheet.swift
//  Nylon Impossible
//
//  The feedback draft: a description, up to four screenshots, and what gets
//  sent with them. Screenshots come from the snapshot that opened the sheet,
//  the Photos picker, the pasteboard (Paste, or ⌘V on a Mac) and drops.
//  Admin only; see FeedbackService.
//

import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct FeedbackSheet: View {
    @Bindable var feedback: FeedbackService
    /// Closes whatever is presenting the sheet.
    let onClose: () -> Void

    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var isDropTargeted = false
    @FocusState private var isEditing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Hairline()
            ScrollView {
                VStack(alignment: .leading, spacing: Theme.Space.s5) {
                    descriptionField
                    screenshots
                    if let message = feedback.errorMessage {
                        Text(message)
                            .textStyle(Theme.Fonts.Role.meta)
                            .foregroundStyle(Theme.Colors.destructive)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    contextLine
                }
                .padding(.horizontal, Theme.Phone.gutter)
                .padding(.vertical, Theme.Space.s4)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(Theme.Colors.canvas)
        .overlay {
            if isDropTargeted {
                RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous)
                    .strokeBorder(Theme.Colors.ink, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                    .padding(Theme.Space.s2)
                    .allowsHitTesting(false)
            }
        }
        .onDrop(of: [.image], isTargeted: $isDropTargeted) { providers in
            feedback.add(providers)
            return true
        }
        #if os(macOS)
        .onPasteCommand(of: [.image]) { feedback.add($0) }
        .frame(minWidth: 520, idealWidth: 560, minHeight: 460, idealHeight: 560)
        #endif
        .onChange(of: pickerItems) { _, items in
            guard !items.isEmpty else { return }
            pickerItems = []
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        feedback.add(data: data)
                    }
                }
            }
        }
        .onAppear { isEditing = true }
        .interactiveDismissDisabled(feedback.isSubmitting)
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: Theme.Space.s3) {
            Button("Cancel") {
                feedback.discard()
                onClose()
            }
            .textStyle(Theme.Fonts.Role.control)
            .foregroundStyle(Theme.Colors.inkMuted)
            .buttonStyle(.plain)
            .frame(minHeight: Theme.Space.rowMinHeight)
            .pointingHandCursor()
            .keyboardShortcut(.cancelAction)
            .disabled(feedback.isSubmitting)

            Spacer()
            Text("Send feedback")
                .textStyle(Theme.Fonts.Role.control)
                .foregroundStyle(Theme.Colors.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer()

            Button {
                Task { if await feedback.submit() { onClose() } }
            } label: {
                ZStack {
                    ChipLabel(text: "Send", isOn: true, strong: true)
                        .opacity(feedback.isSubmitting ? 0 : 1)
                    if feedback.isSubmitting {
                        ProgressView().controlSize(.small)
                    }
                }
                .frame(minHeight: Theme.Space.rowMinHeight)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointingHandCursor()
            .keyboardShortcut(.return, modifiers: .command)
            .disabled(!feedback.canSubmit)
            .opacity(feedback.canSubmit || feedback.isSubmitting ? 1 : 0.5)
            .accessibilityLabel(feedback.isSubmitting ? "Sending" : "Send")
        }
        .padding(.horizontal, Theme.Phone.gutter)
        .padding(.vertical, Theme.Space.s2)
    }

    // MARK: - Description

    private var descriptionField: some View {
        TextField(
            "Description",
            text: $feedback.text,
            prompt: Text("What’s wrong, or what could be better?").foregroundStyle(Theme.Colors.inkMuted),
            axis: .vertical
        )
        .textStyle(Theme.Fonts.Role.body)
        .foregroundStyle(Theme.Colors.ink)
        .textFieldStyle(.plain)
        .lineLimit(5...)
        .focused($isEditing)
        .padding(Theme.Space.s3)
        .background(Theme.Colors.fill, in: RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous))
        .accessibilityLabel("Description")
    }

    // MARK: - Screenshots

    private var screenshots: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            SectionLabel(text: "Screenshots", detail: "\(feedback.images.count)/\(FeedbackService.maxImages)")
            if !feedback.images.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: Theme.Space.s2) {
                        ForEach(Array(feedback.images.enumerated()), id: \.element.id) { index, image in
                            thumbnail(image, index: index)
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }
            HStack(spacing: Theme.Space.s2) {
                PhotosPicker(
                    selection: $pickerItems,
                    maxSelectionCount: max(FeedbackService.maxImages - feedback.images.count, 1),
                    matching: .images
                ) {
                    ChipLabel(text: "Photos", systemImage: "photo")
                        .frame(minHeight: Theme.Space.rowMinHeight)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
                pasteButton
            }
            .disabled(!feedback.canAddImages)
            .opacity(feedback.canAddImages ? 1 : 0.5)
            Text(addHint)
                .textStyle(Theme.Fonts.Role.meta)
                .foregroundStyle(Theme.Colors.inkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var addHint: String {
        #if os(macOS)
        "Paste with ⌘V, or drop images here."
        #else
        "Take a screenshot anywhere in Nylon to attach it, or add one from Photos."
        #endif
    }

    @ViewBuilder
    private var pasteButton: some View {
        #if os(macOS)
        ChipButton(text: "Paste", systemImage: "doc.on.clipboard") {
            let items = NSPasteboard.general.pasteboardItems ?? []
            let providers = items.compactMap { item -> NSItemProvider? in
                for type in [NSPasteboard.PasteboardType.png, .tiff] {
                    if let data = item.data(forType: type) {
                        return NSItemProvider(item: data as NSData, typeIdentifier: UTType.image.identifier)
                    }
                }
                return nil
            }
            feedback.add(providers)
        }
        #else
        // The system button pastes without the "Allow Paste" prompt.
        PasteButton(supportedContentTypes: [.image]) { providers in
            Task { @MainActor in feedback.add(providers) }
        }
        .buttonBorderShape(.capsule)
        .labelStyle(.titleAndIcon)
        .tint(Theme.Colors.fill)
        .foregroundStyle(Theme.Colors.ink)
        #endif
    }

    private func thumbnail(_ image: FeedbackImage, index: Int) -> some View {
        Image(feedbackImage: image)
            .resizable()
            .scaledToFit()
            .frame(height: 160)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous)
                    .strokeBorder(Theme.Colors.hairline, lineWidth: 1)
            )
            .overlay(alignment: .topTrailing) {
                Button {
                    feedback.remove(image)
                } label: {
                    Image(systemName: Theme.Icon.close)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Theme.Colors.canvas)
                        .frame(width: 24, height: 24)
                        .background(Theme.Colors.ink, in: Circle())
                        .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
                .accessibilityLabel("Remove screenshot \(index + 1)")
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Screenshot \(index + 1)")
    }

    // MARK: - Context

    /// What the issue carries besides the description, so nothing is sent
    /// that isn't shown.
    private var contextLine: some View {
        let context = FeedbackContext.current(
            screen: feedback.screen,
            colorScheme: feedback.colorScheme,
            viewport: feedback.viewport
        )
        let parts = [
            [context.appVersion, context.build.map { "(\($0))" }].compactMap { $0 }.joined(separator: " "),
            context.os,
            context.device,
            context.screen,
            context.colorScheme,
            context.viewport,
        ].compactMap { $0 }.filter { !$0.isEmpty }
        return Text("Sent with: \(parts.joined(separator: " · ")). Files a public GitHub issue, screenshots included.")
            .textStyle(Theme.Fonts.Role.meta)
            .foregroundStyle(Theme.Colors.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}
