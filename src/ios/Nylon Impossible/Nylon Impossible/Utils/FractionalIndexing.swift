//
//  FractionalIndexing.swift
//  Nylon Impossible
//
//  Swift port of the fractional-indexing npm library (CC0 license).
//  https://github.com/rocicorp/fractional-indexing
//

import Foundation

private let BASE_62_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

private func charAt(_ s: String, _ i: Int) -> Character? {
    guard i < s.count else { return nil }
    return s[s.index(s.startIndex, offsetBy: i)]
}

private func midpoint(_ a: String, _ b: String?, _ digits: String) -> String {
    let zero = digits[digits.startIndex]

    if let b = b, a >= b {
        fatalError("\(a) >= \(b)")
    }
    if a.last == zero || (b?.last == zero) {
        fatalError("trailing zero")
    }

    if let b = b {
        // Remove longest common prefix. Pad `a` with zeros as we go.
        var n = 0
        while (charAt(a, n) ?? zero) == charAt(b, n)! {
            n += 1
        }
        if n > 0 {
            let prefix = String(b.prefix(n))
            let aSuffix = n < a.count ? String(a.suffix(from: a.index(a.startIndex, offsetBy: n))) : ""
            let bSuffix = String(b.suffix(from: b.index(b.startIndex, offsetBy: n)))
            return prefix + midpoint(aSuffix, bSuffix, digits)
        }
    }

    // First digits (or lack of digit) are different
    let digitA: Int = a.isEmpty ? 0 : indexOf(digits, a[a.startIndex])
    let digitB: Int = b != nil ? indexOf(digits, b![b!.startIndex]) : digits.count

    if digitB - digitA > 1 {
        let midDigit = Int(round(0.5 * Double(digitA + digitB)))
        return String(digits[digits.index(digits.startIndex, offsetBy: midDigit)])
    } else {
        // First digits are consecutive
        if let b = b, b.count > 1 {
            return String(b.prefix(1))
        } else {
            let aSuffix = a.isEmpty ? "" : String(a.suffix(from: a.index(after: a.startIndex)))
            return String(digits[digits.index(digits.startIndex, offsetBy: digitA)]) + midpoint(aSuffix, nil, digits)
        }
    }
}

private func indexOf(_ digits: String, _ ch: Character) -> Int {
    guard let idx = digits.firstIndex(of: ch) else {
        fatalError("character not found in digits: \(ch)")
    }
    return digits.distance(from: digits.startIndex, to: idx)
}

private func getIntegerLength(_ head: Character) -> Int {
    let code = head.asciiValue!
    if head >= "a" && head <= "z" {
        return Int(code) - Int(Character("a").asciiValue!) + 2
    } else if head >= "A" && head <= "Z" {
        return Int(Character("Z").asciiValue!) - Int(code) + 2
    } else {
        fatalError("invalid order key head: \(head)")
    }
}

private func validateInteger(_ int: String) {
    guard int.count == getIntegerLength(int[int.startIndex]) else {
        fatalError("invalid integer part of order key: \(int)")
    }
}

private func getIntegerPart(_ key: String) -> String {
    let length = getIntegerLength(key[key.startIndex])
    guard length <= key.count else {
        fatalError("invalid order key: \(key)")
    }
    return String(key.prefix(length))
}

private func validateOrderKey(_ key: String, _ digits: String) {
    let zero = digits[digits.startIndex]
    if key == "A" + String(repeating: zero, count: 26) {
        fatalError("invalid order key: \(key)")
    }
    let i = getIntegerPart(key)
    let f = String(key.suffix(from: key.index(key.startIndex, offsetBy: i.count)))
    if f.last == zero {
        fatalError("invalid order key: \(key)")
    }
}

private func incrementInteger(_ x: String, _ digits: String) -> String? {
    validateInteger(x)
    let head = x[x.startIndex]
    var digs = Array(x.suffix(from: x.index(after: x.startIndex)))
    var carry = true

    var i = digs.count - 1
    while carry && i >= 0 {
        let d = indexOf(digits, digs[i]) + 1
        if d == digits.count {
            digs[i] = digits[digits.startIndex]
        } else {
            digs[i] = digits[digits.index(digits.startIndex, offsetBy: d)]
            carry = false
        }
        i -= 1
    }

    if carry {
        if head == "Z" {
            return "a" + String(digits[digits.startIndex])
        }
        if head == "z" {
            return nil
        }
        let h = Character(UnicodeScalar(head.asciiValue! + 1))
        if h > "a" {
            digs.append(digits[digits.startIndex])
        } else {
            digs.removeLast()
        }
        return String(h) + String(digs)
    } else {
        return String(head) + String(digs)
    }
}

private func decrementInteger(_ x: String, _ digits: String) -> String? {
    validateInteger(x)
    let head = x[x.startIndex]
    var digs = Array(x.suffix(from: x.index(after: x.startIndex)))
    var borrow = true

    var i = digs.count - 1
    while borrow && i >= 0 {
        let d = indexOf(digits, digs[i]) - 1
        if d == -1 {
            digs[i] = digits[digits.index(before: digits.endIndex)]
        } else {
            digs[i] = digits[digits.index(digits.startIndex, offsetBy: d)]
            borrow = false
        }
        i -= 1
    }

    if borrow {
        if head == "a" {
            return "Z" + String(digits[digits.index(before: digits.endIndex)])
        }
        if head == "A" {
            return nil
        }
        let h = Character(UnicodeScalar(head.asciiValue! - 1))
        if h < "Z" {
            digs.append(digits[digits.index(before: digits.endIndex)])
        } else {
            digs.removeLast()
        }
        return String(h) + String(digs)
    } else {
        return String(head) + String(digs)
    }
}

/// Generate a fractional index key between `a` and `b`.
/// - Parameters:
///   - a: Lower bound key, or nil for start.
///   - b: Upper bound key, or nil for end.
/// - Returns: A key that sorts lexicographically between `a` and `b`.
func generateKeyBetween(_ a: String?, _ b: String?) -> String {
    let digits = BASE_62_DIGITS

    if let a = a {
        validateOrderKey(a, digits)
    }
    if let b = b {
        validateOrderKey(b, digits)
    }
    if let a = a, let b = b, a >= b {
        fatalError("\(a) >= \(b)")
    }

    if a == nil {
        if b == nil {
            return "a" + String(digits[digits.startIndex])
        }
        let b = b!
        let ib = getIntegerPart(b)
        let fb = String(b.suffix(from: b.index(b.startIndex, offsetBy: ib.count)))
        let zero = digits[digits.startIndex]
        if ib == "A" + String(repeating: zero, count: 26) {
            return ib + midpoint("", fb, digits)
        }
        if ib < b {
            return ib
        }
        guard let res = decrementInteger(ib, digits) else {
            fatalError("cannot decrement any more")
        }
        return res
    }

    let a = a!

    if b == nil {
        let ia = getIntegerPart(a)
        let fa = String(a.suffix(from: a.index(a.startIndex, offsetBy: ia.count)))
        if let i = incrementInteger(ia, digits) {
            return i
        }
        return ia + midpoint(fa, nil, digits)
    }

    let b = b!
    let ia = getIntegerPart(a)
    let fa = String(a.suffix(from: a.index(a.startIndex, offsetBy: ia.count)))
    let ib = getIntegerPart(b)
    let fb = String(b.suffix(from: b.index(b.startIndex, offsetBy: ib.count)))

    if ia == ib {
        return ia + midpoint(fa, fb, digits)
    }

    if let i = incrementInteger(ia, digits), i < b {
        return i
    }

    return ia + midpoint(fa, nil, digits)
}
