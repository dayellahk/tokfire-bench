import XCTest
import WebKit
@testable import LocalAIBench
final class UploadTests: XCTestCase {
    @MainActor func testLocalWebKitSignInAndUpload() async throws {
        guard ProcessInfo.processInfo.environment["LOCALAI_TEST_SITE"] == "1" else { throw XCTSkip("Opt-in local website integration") }
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store=UploadStore(origin:"http://localhost:5173",queueDirectory:folder)
        let before=store.enabled; defer { store.enabled=before }; store.enabled=true
        store.webView.load(URLRequest(url:URL(string:"http://localhost:5173/signin-with-chatgpt?return_to=%2Fnative-connect")!))
        for _ in 0..<200 { if store.connected { break }; try await Task.sleep(nanoseconds:100_000_000) }
        XCTAssertTrue(store.connected)
        guard store.connected else { return }
        let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        var report=try JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("tests/fixtures/jobs-llama-real.json"))) as! [String:Any]
        let id=UUID().uuidString; report["runId"]=id
        let reportURL=folder.appendingPathComponent("fixture.tmp");try JSONSerialization.data(withJSONObject:report).write(to:reportURL)
        store.enqueue(reportURL,consent:true,publication:false)
        for _ in 0..<200 { if store.status == "uploaded" { break }; try await Task.sleep(nanoseconds:100_000_000) }
        XCTAssertEqual(store.status,"uploaded");XCTAssertEqual(store.pending,0)
        let result=try await store.webView.callAsyncJavaScript("""
        const r=await fetch('/api/v1/submissions');const data=await r.json();
        const row=data.results.find(x=>x.runId===id);
        if(!row)return false;
        const deletion=await fetch('/api/v1/submissions/'+row.id,{method:'DELETE'});
        return deletion.ok && row.isPublic===0;
        """,arguments:["id":id],in:nil,contentWorld:.page)
        XCTAssertEqual(result as? Bool,true)
    }
}
