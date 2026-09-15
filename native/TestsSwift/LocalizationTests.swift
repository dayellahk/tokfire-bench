import XCTest
@testable import LocalAIBench
final class LocalizationTests: XCTestCase {
    @MainActor func testEveryLanguageHasEveryUIKey() {
        let store=LanguageStore.shared; let expected=Set(store.translations["en"]!.keys)
        XCTAssertEqual(store.translations.count,20)
        for (code,_) in LanguageStore.names { XCTAssertEqual(Set(store.translations[code]!.keys),expected,code); XCTAssertTrue(store.translations[code]!.values.allSatisfy { !$0.isEmpty }) }
    }
    func testEvenMedianAndEmpty() { XCTAssertEqual(median([1,3,5,7]),4); XCTAssertEqual(median([]),0) }
}
