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
        importSimulatorCSV(in: app, symbol: "IOSCSV")
        assertImportedQuote(in: app)
        print("Verified iOS Files CSV selection and exact imported OHLCV.")
    }

    @MainActor
    func testRecoversCSVAfterLoopbackLoss() throws {
        continueAfterFailure = false
        XCTAssertEqual(try canaryConnectionError(), ECONNREFUSED, "The previously reachable loopback route must refuse connections.")
        let app = XCUIApplication(bundleIdentifier: identifier)
        let state = app.state
        XCTAssertTrue(
            [.runningForeground, .runningBackground, .runningBackgroundSuspended].contains(state),
            "The simulator must already have relaunched MarketWeft. Application state: \(state.rawValue)."
        )
        if state != .runningForeground { app.activate() }
        defer { app.terminate() }
        assertImportedQuote(in: app)
        print("Verified exact persisted iOS OHLCV after losing the loopback route.")
    }
}
