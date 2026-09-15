import XCTest
@testable import LocalAIBench

final class RecommendationTests: XCTestCase {
    let smallMac = DeviceProfile(chip: "Apple M1", cores: 8, memory: 8 * pow(1024, 3), gpu: "Apple M1", os: "test")
    func model(_ id: String, total: Double? = nil, task: String = "text-generation") -> HubModel {
        HubModel(id: id, sha: String(repeating: "a", count: 40), downloads: 20, likes: 10, trendingScore: 2, tags: [], pipeline_tag: task, gguf: .init(total: total, architecture: nil))
    }
    func testDenseSizeCapAndUnknownSize() {
        XCTAssertTrue(model("org/model-2B-GGUF").eligible)
        XCTAssertTrue(model("org/model-27B-GGUF").eligible)
        XCTAssertFalse(model("org/model-70B-GGUF").eligible)
        XCTAssertFalse(model("org/unknown-GGUF").eligible)
        XCTAssertFalse(model("org/embed-2B-GGUF", task: "feature-extraction").eligible)
    }
    func testMoEUsesTotalWeightsNotActiveCount() {
        let moe = model("Qwen/model-36B-A3B-GGUF")
        XCTAssertEqual(moe.billions, 36); XCTAssertEqual(moe.activeBillions, 3)
        XCTAssertTrue(moe.eligible)
        XCTAssertFalse(model("org/model-80B-A3B-GGUF").eligible)
        XCTAssertFalse(model("org/model-36B-A10B-GGUF").eligible)
        XCTAssertEqual(smallMac.fit(bytes: moe.billions! * 1e9 * 0.65), .tooLarge)
    }
    func testMetadataCannotShrinkLargerNamedModel() {
        XCTAssertEqual(model("org/model-27B-GGUF", total: 1_800_000_000).billions, 27)
        XCTAssertFalse(model("org/model-27B-GGUF", total: 180_000_000_000).eligible)
    }
    func testCapacityBudgetsReserveRuntimeAndOS() {
        XCTAssertEqual(smallMac.fit(bytes: 1_500_000_000), .comfortable)
        XCTAssertEqual(smallMac.fit(bytes: 3_000_000_000), .tight)
        XCTAssertEqual(smallMac.fit(bytes: 5_000_000_000), .tooLarge)
    }
    func testOnlyVerifiedSingleFileWeights() {
        let lfs = HubFile.LFS(oid: String(repeating: "a", count: 64), size: 10_000_000)
        func file(_ path: String, hash: HubFile.LFS? = lfs) -> HubFile { HubFile(type: "file", path: path, size: 10_000_000, lfs: hash) }
        XCTAssertTrue(file("model-Q4_K_M.gguf").usable)
        XCTAssertFalse(file("model-00001-of-00002.gguf").usable)
        XCTAssertFalse(file("mmproj-model.gguf").usable)
        XCTAssertFalse(file("imatrix.gguf").usable)
        XCTAssertFalse(file("model.gguf", hash: nil).usable)
        XCTAssertFalse(file("weights.safetensors").usable)
    }
    func testChecksumStreamsActualBytes() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: url) }
        try Data("abc".utf8).write(to: url)
        XCTAssertEqual(try fileSHA256(url), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }
    @MainActor func testOfflineClearsOnlineRecommendations() {
        let store = CatalogStore(device: smallMac)
        store.models = [model("org/model-2B-GGUF")]
        store.setOnline(false)
        XCTAssertTrue(store.models.isEmpty); XCTAssertFalse(store.loading)
        XCTAssertTrue(store.status.contains("離線"))
        store.refresh()
        XCTAssertFalse(store.loading)
    }
    @MainActor func testControllerDoesNotRunInvalidSelection() {
        let controller = BenchController(); controller.models = []; controller.run()
        XCTAssertFalse(controller.running)
        controller.models = [URL(fileURLWithPath: "/tmp/one.gguf"), URL(fileURLWithPath: "/tmp/two.gguf")]
        controller.trial = true; controller.run()
        XCTAssertFalse(controller.running)
    }
    @MainActor func testSelectionDeduplicatesAndCapsQueue() {
        let controller = BenchController()
        let first = URL(fileURLWithPath: "/private/tmp/one.gguf")
        controller.add([first, first, URL(fileURLWithPath: "/private/tmp/two.gguf"), URL(fileURLWithPath: "/private/tmp/three.gguf"), URL(fileURLWithPath: "/private/tmp/four.gguf")])
        XCTAssertEqual(controller.models.count, 3)
    }
}
