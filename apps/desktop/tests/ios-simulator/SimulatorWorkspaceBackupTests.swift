import Foundation
import XCTest

final class SimulatorWorkspaceBackupTests: XCTestCase {
    private let identifier = "org.marketweft.terminal"
    private let quote = "IOSCSV OHLCV. Open 27.00, high 30.00, low 26.00, close 29.00, volume 800"

    @MainActor
    private func openBackupPanel(in app: XCUIApplication) -> XCUIElement {
        let web = app.webViews.firstMatch
        let backup = web.buttons["Workspace backup"]
        XCTAssertTrue(backup.waitForExistence(timeout: 30), app.debugDescription)
        backup.tap()
        return web
    }

    @MainActor
    private func showVerifiedPreview(in web: XCUIElement) {
        let message = web.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Checksums verified.")).firstMatch
        XCTAssertTrue(message.waitForExistence(timeout: 20), web.debugDescription)
        XCTAssertTrue(web.staticTexts["LOCAL:IOSCSV"].firstMatch.exists, web.debugDescription)
    }

    @MainActor
    func testExportsWorkspaceToFiles() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: identifier)
        app.launch()
        defer { app.terminate() }
        let web = openBackupPanel(in: app)
        let export = web.buttons["Export workspace"]
        XCTAssertTrue(export.waitForExistence(timeout: 15), web.debugDescription)
        export.tap()
        XCTAssertTrue(web.staticTexts["Workspace backup prepared for download."].waitForExistence(timeout: 20), web.debugDescription)

        let format = ISO8601DateFormatter()
        format.formatOptions = [.withFullDate, .withDashSeparatorInDate]
        format.timeZone = TimeZone(secondsFromGMT: 0)
        let day = format.string(from: Date())
        chooseSimulatorFile(in: app, input: "Backup file", folders: ["MarketWeft", "Downloads"], filename: "marketweft-workspace-\(day).marketweft.json")
        showVerifiedPreview(in: web)
        print("Verified that the workspace backup is readable through Files and passes checksum verification.")
    }

    @MainActor
    func testRestoresWorkspaceIntoFreshInstall() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: identifier)
        app.launch()
        defer { app.terminate() }
        let web = app.webViews.firstMatch
        let readout = web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", quote)).firstMatch
        let backup = web.buttons["Workspace backup"]
        XCTAssertTrue(backup.waitForExistence(timeout: 30), app.debugDescription)
        XCTAssertFalse(readout.exists, app.debugDescription)
        backup.tap()

        chooseSimulatorFile(in: app, input: "Backup file", folders: ["MarketWeft Test Files"], filename: "preserved-workspace.marketweft.json")
        showVerifiedPreview(in: web)
        let restore = web.buttons["Restore workspace"]
        XCTAssertTrue(restore.isEnabled, web.debugDescription)
        if !restore.isHittable { web.swipeUp() }
        restore.tap()
        XCTAssertTrue(readout.waitForExistence(timeout: 25), app.debugDescription)
        print("Verified a fresh iOS install restored the exported workspace and its exact original OHLCV.")
    }
}
