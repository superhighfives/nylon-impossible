import Testing
@testable import Nylon_Impossible

@Suite("FractionalIndexing")
struct FractionalIndexingTests {
    @Test("generateKeyBetween(nil, nil) returns 'a0'")
    func defaultKey() {
        let key = generateKeyBetween(nil, nil)
        #expect(key == "a0")
    }

    @Test("generateKeyBetween(nil, 'a0') returns a key < 'a0'")
    func keyBeforeA0() {
        let key = generateKeyBetween(nil, "a0")
        #expect(key < "a0")
    }

    @Test("generateKeyBetween('a0', nil) returns a key > 'a0'")
    func keyAfterA0() {
        let key = generateKeyBetween("a0", nil)
        #expect(key > "a0")
    }

    @Test("generateKeyBetween('a0', 'a1') returns a key between them")
    func keyBetweenA0AndA1() {
        let key = generateKeyBetween("a0", "a1")
        #expect(key > "a0")
        #expect(key < "a1")
    }

    @Test("Sequential keys maintain sort order")
    func sequentialKeys() {
        var keys: [String] = []
        var prev: String? = nil

        for _ in 0..<100 {
            let key = generateKeyBetween(prev, nil)
            keys.append(key)
            prev = key
        }

        // Verify sorted
        let sorted = keys.sorted()
        #expect(keys == sorted)
    }

    @Test("Keys between two values sort correctly")
    func insertBetween() {
        let a = generateKeyBetween(nil, nil)      // "a0"
        let c = generateKeyBetween(a, nil)         // "a1"
        let b = generateKeyBetween(a, c)           // between "a0" and "a1"

        #expect(a < b)
        #expect(b < c)
    }

    @Test("Multiple inserts at same position stay ordered")
    func multipleInserts() {
        var keys = [generateKeyBetween(nil, nil)]

        // Insert 10 keys at the beginning
        for _ in 0..<10 {
            let newKey = generateKeyBetween(nil, keys.first!)
            keys.insert(newKey, at: 0)
        }

        // All should be sorted
        let sorted = keys.sorted()
        #expect(keys == sorted)
    }

    @Test("Cross-platform consistency: generateKeyBetween(nil, nil) matches npm")
    func crossPlatformDefault() {
        // The npm library's generateKeyBetween(null, null) also returns "a0"
        let key = generateKeyBetween(nil, nil)
        #expect(key == "a0")
    }
}
