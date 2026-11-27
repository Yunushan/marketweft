import Foundation
import XCTest

final class SimulatorUpgradeTests: XCTestCase {
    private let identifier = "org.marketweft.terminal"
    private let quote = "IOSUPGRADE OHLCV. Open 27.00, high 30.00, low 26.00, close 29.00, volume 800"

    @MainActor
    private func assertExactChart(in app: XCUIApplication) {
        let web = app.webViews.firstMatch
        let readout = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", quote)).firstMatch
        XCTAssertTrue(readout.waitForExistence(timeout: 30), app.debugDescription)
    }

    @MainActor
    private func assertIndicator(in app: XCUIApplication) {
        let indicator = app.webViews.firstMatch.staticTexts["EMA 9"].firstMatch
        XCTAssertTrue(indicator.waitForExistence(timeout: 15), app.debugDescription)
    }

    @MainActor
    func testSeedsUpgradeWorkspace() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: identifier)
        app.launch()
        defer { app.terminate() }
        importSimulatorCSV(in: app, symbol: "IOSUPGRADE")
        assertExactChart(in: app)

        let web = app.webViews.firstMatch
        let preferences = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Indicators")).firstMatch
        XCTAssertTrue(preferences.waitForExistence(timeout: 15), web.debugDescription)
        preferences.tap()
        let exponential = web.staticTexts["Exponential moving average"].firstMatch
        XCTAssertTrue(exponential.waitForExistence(timeout: 15), web.debugDescription)
        exponential.tap()
        web.buttons["Close dialog"].tap()
        assertIndicator(in: app)
    }

    @MainActor
    func testReopensUpgradeWorkspace() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: identifier)
        app.launch()
        defer { app.terminate() }
        assertExactChart(in: app)
        assertIndicator(in: app)
        print("Verified saved iOS workspace, exact OHLCV and EMA preference after relaunch.")
    }
}
