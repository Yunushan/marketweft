import Darwin
import Foundation
import XCTest

final class SimulatorImportTests: XCTestCase {
    private let identifier = "org.marketweft.terminal"
    private let quote = "IOSCSV OHLCV. Open 27.00, high 30.00, low 26.00, close 29.00, volume 800"

    private func canaryConnectionError() throws -> Int32 {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else {
            throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
        }
        defer { close(descriptor) }

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = UInt16(53179).bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let status = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
                connect(descriptor, socketAddress, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return status == 0 ? 0 : errno
    }

    @MainActor
    private func assertImportedQuote(in app: XCUIApplication) {
        let readout = app.webViews.firstMatch.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", quote)).firstMatch
        XCTAssertTrue(readout.waitForExistence(timeout: 30), app.debugDescription)
    }

    @MainActor
    func testImportsCSVFromFiles() throws {
        continueAfterFailure = false
        XCTAssertEqual(try canaryConnectionError(), 0, "The simulator must reach the live loopback canary before import.")
        let app = XCUIApplication(bundleIdentifier: identifier)
        app.launch()
        defer { app.terminate() }
        let web = app.webViews.firstMatch
        let open = web.buttons["Import CSV"]
        XCTAssertTrue(open.waitForExistence(timeout: 35), app.debugDescription)
        open.tap()

        let symbol = web.textFields.matching(NSPredicate(format: "label == %@ OR placeholderValue == %@", "Symbol", "e.g. ABC")).firstMatch
        XCTAssertTrue(symbol.waitForExistence(timeout: 15), web.debugDescription)
        symbol.tap()
        symbol.typeText("IOSCSV")

        let file = web.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@", "Historical CSV file")).firstMatch
        XCTAssertTrue(file.waitForExistence(timeout: 15), web.debugDescription)
        if !file.isHittable { web.swipeUp() }
        file.tap()

        let chooseFiles = app.buttons["Choose Files"].firstMatch
        if chooseFiles.waitForExistence(timeout: 3) { chooseFiles.tap() }
        let browse = app.buttons["Browse"].firstMatch
        if browse.waitForExistence(timeout: 3), browse.isHittable { browse.tap() }
        let location = app.staticTexts.matching(NSPredicate(format: "label IN %@", ["On My iPhone", "On My iPad"])).firstMatch
        XCTAssertTrue(location.waitForExistence(timeout: 15), app.debugDescription)
        location.tap()
        let folder = app.staticTexts["MarketWeft Test Files"].firstMatch
        XCTAssertTrue(folder.waitForExistence(timeout: 15), app.debugDescription)
        folder.tap()
        let fixture = app.collectionViews["File View"].cells
            .matching(NSPredicate(format: "identifier IN %@", ["native-verification, csv", "native-verification.csv"])).firstMatch
        XCTAssertTrue(fixture.waitForExistence(timeout: 15), app.debugDescription)
        let icon = fixture.images.firstMatch
        if icon.exists && icon.isHittable { icon.tap() } else { fixture.tap() }
        let confirm = app.navigationBars.buttons["Open"].firstMatch
        if confirm.waitForExistence(timeout: 2), confirm.isHittable { confirm.tap() }
        let selectedFile = web.buttons.matching(NSPredicate(
            format: "label BEGINSWITH %@ AND value CONTAINS[c] %@", "Historical CSV file", "native-verification"
        )).firstMatch
        XCTAssertTrue(selectedFile.waitForExistence(timeout: 15), app.debugDescription)

        let submit = web.buttons["Import to watchlist"]
        XCTAssertTrue(submit.waitForExistence(timeout: 15), app.debugDescription)
        if !submit.isHittable { web.swipeUp() }
        submit.tap()
        assertImportedQuote(in: app)
        print("Verified iOS Files CSV selection and exact imported OHLCV.")
    }

    @MainActor
    func testRecoversCSVAfterLoopbackLoss() throws {
        continueAfterFailure = false
        XCTAssertEqual(try canaryConnectionError(), ECONNREFUSED, "The previously reachable loopback route must refuse connections.")
        let app = XCUIApplication(bundleIdentifier: identifier)
        app.launch()
        defer { app.terminate() }
        assertImportedQuote(in: app)
        print("Verified exact persisted iOS OHLCV after losing the loopback route.")
    }
}
