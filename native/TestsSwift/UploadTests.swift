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
    @MainActor func testTokFireDeploymentWebKitUpload() async throws {
        guard let endpoint=ProcessInfo.processInfo.environment["TOKFIRE_TEST_ORIGIN"] else { throw XCTSkip("Opt-in deployment integration") }
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store=UploadStore(origin:endpoint,queueDirectory:folder)
        let previous=store.enabled; defer { store.enabled=previous }; store.enabled=true
        store.load()
        for _ in 0..<200 { if !store.webView.isLoading && store.webView.url != nil { break }; try await Task.sleep(nanoseconds:100_000_000) }
        let email="tokfire-native-qa-"+UUID().uuidString+"@example.invalid"
        let password=UUID().uuidString+UUID().uuidString
        let account=try await store.webView.callAsyncJavaScript("""
        const r=await fetch('/api/auth/sign-up/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'TokFire Native QA',email,password})});
        const d=await r.json(); if(!r.ok) throw Error('QA registration failed: '+r.status); return d.user.id;
        """,arguments:["email":email,"password":password],in:nil,contentWorld:.page)
        let id=try XCTUnwrap(account as? String)
        try id.write(to:URL(fileURLWithPath:"/tmp/tokfire-native-qa-id"),atomically:true,encoding:.utf8)
        store.load()
        for _ in 0..<200 { if store.connected { break }; try await Task.sleep(nanoseconds:100_000_000) }
        XCTAssertTrue(store.connected)
        guard store.connected else { return }
        let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        var report=try JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("tests/fixtures/jobs-llama-real.json"))) as! [String:Any]
        let runId=UUID().uuidString;report["runId"]=runId
        let reportURL=folder.appendingPathComponent("fixture.tmp");try JSONSerialization.data(withJSONObject:report).write(to:reportURL)
        store.enqueue(reportURL,consent:true,publication:false)
        for _ in 0..<300 { if store.status == "uploaded" { break }; try await Task.sleep(nanoseconds:100_000_000) }
        XCTAssertEqual(store.status,"uploaded");XCTAssertEqual(store.pending,0)
        let deleted=try await store.webView.callAsyncJavaScript("""
        const r=await fetch('/api/v1/submissions');const d=await r.json();const row=d.results.find(x=>x.runId===runId);
        if(!row || row.isPublic!==0)return false;
        return (await fetch('/api/v1/submissions/'+row.id,{method:'DELETE'})).ok;
        """,arguments:["runId":runId],in:nil,contentWorld:.page)
        XCTAssertEqual(deleted as? Bool,true)
        _ = try await store.webView.callAsyncJavaScript("await fetch('/api/auth/sign-out',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});",arguments:[:],in:nil,contentWorld:.page)
    }

}
