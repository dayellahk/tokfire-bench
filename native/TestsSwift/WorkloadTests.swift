import XCTest
@testable import LocalAIBench
final class WorkloadTests: XCTestCase {
    func testSmallSampleTailsAreNearestRank() {
        XCTAssertEqual(tail([3,1,2],0.95),3); XCTAssertEqual(tail([3,1,2],0.99),3); XCTAssertNil(tail([],0.95))
    }
    @MainActor func testSweepSampleCountAndLegacyMode() {
        let b=BenchController();b.models=[URL(fileURLWithPath:"/tmp/model.gguf")];b.concurrentJobs=3;b.sweep=true;b.repeats=5
        XCTAssertEqual(b.workloadLevels,[1,2,3]);XCTAssertEqual(b.expectedSamples,30)
        b.workloadMode=false;XCTAssertEqual(b.expectedSamples,9)
        b.backend="Ollama";XCTAssertTrue(b.usesWorkloads);XCTAssertFalse(b.validSelection)
        b.servedModel="model-id";XCTAssertTrue(b.validSelection)
    }
}
