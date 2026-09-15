import XCTest
@testable import LocalAIBench

final class LiveHubTests: XCTestCase {
    @MainActor func waitFor(_ condition: @escaping () -> Bool, seconds: Double = 60) async throws {
        let deadline = Date().addingTimeInterval(seconds)
        while !condition() && Date() < deadline { try await Task.sleep(nanoseconds: 100_000_000) }
        XCTAssertTrue(condition(), "Timed out")
    }
    @MainActor func testLiveCatalogPinnedFilesAndDownload() async throws {
        guard ProcessInfo.processInfo.environment["LOCALAI_LIVE_HUB"] == "1" else { throw XCTSkip("Opt-in live Hugging Face integration") }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("localai-live-test-" + UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = CatalogStore(device: .detect(), modelsDirectory: folder)
        store.setOnline(true)
        store.refresh(); try await waitFor { !store.loading }
        XCTAssertFalse(store.models.isEmpty, store.status); XCTAssertLessThanOrEqual(store.models.count, 10)
        XCTAssertTrue(store.models.allSatisfy(\.eligible))
        print("LIVE TOP10: \(store.models.map(\.id))")
        store.query = "MiniCPM5"; store.refresh(); try await waitFor { !store.loading }
        let model = try XCTUnwrap(store.models.first { $0.id == "openbmb/MiniCPM5-2B-GGUF" })
        store.select(model); try await waitFor { !store.loadingFiles }
        let file = try XCTUnwrap(store.files.first { $0.preferred })
        XCTAssertEqual(file.size, 1_561_318_368)
        XCTAssertEqual(file.checksum, "ec2d5801640099e97d8d7e8003ad4d81f336e757811f03a26173dddf386602fd")
        print("LIVE FILES: pinned revision \(model.sha ?? "missing"), Q4 checksum verified in metadata")
        if ProcessInfo.processInfo.environment["LOCALAI_LIVE_DOWNLOAD"] == "1" {
            var received: URL?
            store.download(file) { received = $0 }
            try await waitFor({ store.downloadProgress > 0 || !store.downloading }, seconds: 90)
            store.cancelDownload(); try await waitFor { !store.downloading }
            XCTAssertNil(received, "Cancelled download must not join queue")
            print("LIVE DOWNLOAD CANCELLATION: \(store.downloadMessage)")
            store.download(file) { received = $0 }
            try await waitFor({ !store.downloading }, seconds: 600)
            let url = try XCTUnwrap(received, store.downloadMessage)
            XCTAssertEqual(try fileSHA256(url), file.checksum)
            print("LIVE DOWNLOAD SUCCESS: \(url.lastPathComponent)")
        }
        await store.fetchCommunity()
        print("COMMUNITY: \(store.communityStatus)")
        store.setOnline(false); XCTAssertTrue(store.models.isEmpty)
    }
}
