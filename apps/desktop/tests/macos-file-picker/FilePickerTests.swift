import Foundation
import XCTest

final class FilePickerTests: XCTestCase {
    @MainActor
    func testImportsAuthorizedCSVThroughNativeOpenPanel() throws {
        continueAfterFailure = false
        let testBundle = Bundle(for: Self.self)
        let appPath = try XCTUnwrap(testBundle.object(forInfoDictionaryKey: "MarketWeftApplicationPath") as? String)
        let csvPath = try XCTUnwrap(testBundle.object(forInfoDictionaryKey: "MarketWeftCSVPath") as? String)
        XCTAssertTrue(FileManager.default.isReadableFile(atPath: csvPath))

        let app = XCUIApplication(url: URL(fileURLWithPath: appPath, isDirectory: true))
        app.launch()
        defer { app.terminate() }
        let web = app.webViews.firstMatch
        let importButton = web.buttons["Import CSV"]
        XCTAssertTrue(importButton.waitForExistence(timeout: 30), app.debugDescription)
        importButton.click()

        let symbol = web.textFields.matching(
            NSPredicate(format: "label == %@ OR placeholderValue == %@", "Symbol", "e.g. ABC")
        ).firstMatch
        XCTAssertTrue(symbol.waitForExistence(timeout: 10), web.debugDescription)
        symbol.click()
        symbol.typeText("MACPICKER")

        let chooseFile = web.buttons.matching(NSPredicate(format: "value ==[c] %@", "no file selected")).firstMatch
        XCTAssertTrue(chooseFile.waitForExistence(timeout: 10), web.debugDescription)
        chooseFile.click()

        let openButton = app.buttons["Open"].firstMatch
        XCTAssertTrue(openButton.waitForExistence(timeout: 10), app.debugDescription)
        app.typeKey("g", modifierFlags: [.command, .shift])
        app.typeText(csvPath)
        app.typeKey(XCUIKeyboardKey.return, modifierFlags: [])
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true AND hittable == true"),
            object: openButton
        )
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed, app.debugDescription)
        openButton.click()

        let fixture = URL(fileURLWithPath: csvPath).lastPathComponent
        let chosen = web.buttons.matching(NSPredicate(format: "value == %@", fixture)).firstMatch
        XCTAssertTrue(chosen.waitForExistence(timeout: 10), web.debugDescription)
        let submit = web.buttons["Import to watchlist"]
        XCTAssertTrue(submit.waitForExistence(timeout: 10), web.debugDescription)
        submit.click()

        let readout = "MACPICKER OHLCV. Open 27.00, high 30.00, low 26.00, close 29.00, volume 800"
        let matchedQuote = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", readout)).firstMatch
        XCTAssertTrue(matchedQuote.waitForExistence(timeout: 20), web.debugDescription)
        print("Verified the production macOS file picker and exact OHLCV.")
    }
}
