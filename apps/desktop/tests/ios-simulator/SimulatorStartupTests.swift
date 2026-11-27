import Foundation
import XCTest

final class SimulatorStartupTests: XCTestCase {
    @MainActor
    func testLoadsBundledTerminalAndExactQuote() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "org.marketweft.terminal")
        app.launch()
        defer { app.terminate() }
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.buttons["Import CSV"].waitForExistence(timeout: 35), app.debugDescription)
        let expected = "NVDA OHLCV. Open 156.31, high 157.13, low 153.96, close 155.03, volume 21.98M"
        let quote = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", expected)).firstMatch
        XCTAssertTrue(quote.waitForExistence(timeout: 15), web.debugDescription)
        print("Verified bundled iOS terminal startup and exact OHLCV.")
    }
}
