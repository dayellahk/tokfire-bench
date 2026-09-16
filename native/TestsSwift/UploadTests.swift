import XCTest
import WebKit
@testable import LocalAIBench
final class UploadTests: XCTestCase {
    @MainActor func testRealChallengeRunAndGuestUpload() async throws {
        guard let model=ProcessInfo.processInfo.environment["TOKFIRE_REAL_CHALLENGE_MODEL"] else { throw XCTSkip("Opt-in real local model run") }
        let origin=ProcessInfo.processInfo.environment["TOKFIRE_GUEST_TEST_ORIGIN"] ?? "https://tokfires.com"
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let suite="TokFire.ChallengeQA."+UUID().uuidString
        let prefs=try XCTUnwrap(UserDefaults(suiteName:suite));prefs.set(true,forKey:"autoUpload")
        defer { prefs.removePersistentDomain(forName:suite);try? FileManager.default.removeItem(at:folder) }
        let store=UploadStore(origin:origin,queueDirectory:folder.appendingPathComponent("outbox"),preferences:prefs,arguments:[])
        let config:[String:Any] = ["workload":"agent-tools","engine":"llama.cpp","model":URL(fileURLWithPath:model).lastPathComponent,"concurrencyLevels":[1],"repeats":3]
        let issued=await store.prepareChallenge(config)
        let ticket=try XCTUnwrap(issued)
        defer {try? FileManager.default.removeItem(at:ticket)}
        let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let script=root.appendingPathComponent("native/Sources/LocalAIBench/Resources/workload_runner.py")
        let output=folder.appendingPathComponent("report.json"),log=folder.appendingPathComponent("runner.log")
        FileManager.default.createFile(atPath:log.path,contents:nil)
        let exit=try await Task.detached { () throws -> Int32 in
            let process=Process();process.executableURL=URL(fileURLWithPath:"/opt/homebrew/bin/python3")
            process.arguments=["-B","-u",script.path,"--engine","llama.cpp","--server","/opt/homebrew/bin/llama-server","--model",model,"--workload","agent-tools","--jobs","1","--repeats","3","--challenge",ticket.path,"--output",output.path]
            let handle=try FileHandle(forWritingTo:log);defer {try? handle.close()}
            process.standardOutput=handle;process.standardError=handle;try process.run();process.waitUntilExit();return process.terminationStatus
        }.value
        let diagnostic=try String(contentsOf:log,encoding:.utf8)
        XCTAssertEqual(exit,0,diagnostic)
        guard exit==0 else {return}
        let report=try JSONSerialization.jsonObject(with:Data(contentsOf:output)) as! [String:Any]
        let runID=try XCTUnwrap(report["runId"] as? String)
        store.enqueue(output,consent:true,publication:false)
        for _ in 0..<300 {if store.status=="uploaded" {break};try await Task.sleep(nanoseconds:100_000_000)}
        XCTAssertEqual(store.status,"uploaded");XCTAssertEqual(store.pending,0)
        let (list,_)=try await store.apiRequest("/api/v1/submissions",method:"GET")
        let rows=(try JSONSerialization.jsonObject(with:list) as! [String:Any])["results"] as! [[String:Any]]
        let row=try XCTUnwrap(rows.first { $0["runId"] as? String == runID })
        XCTAssertEqual(row["isPublic"] as? Int,0);XCTAssertEqual(row["integrityStatus"] as? String,"challenge-checked")
        let (_,deleted)=try await store.apiRequest("/api/v1/submissions/"+(row["id"] as! String),method:"DELETE")
        XCTAssertEqual((deleted as? HTTPURLResponse)?.statusCode,200)
    }

    @MainActor func testGuestUploadWithoutSignIn() async throws {
        guard let origin=ProcessInfo.processInfo.environment["TOKFIRE_GUEST_TEST_ORIGIN"] else { throw XCTSkip("Opt-in guest deployment integration") }
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let suite="TokFire.GuestQA."+UUID().uuidString
        let prefs=try XCTUnwrap(UserDefaults(suiteName:suite));prefs.set(true,forKey:"autoUpload")
        defer { prefs.removePersistentDomain(forName:suite);try? FileManager.default.removeItem(at:folder) }
        let store=UploadStore(origin:origin,queueDirectory:folder,preferences:prefs,arguments:[])
        let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        var report=try JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("tests/fixtures/workload-mac-real.json"))) as! [String:Any]
        let id=UUID().uuidString;report["runId"]=id
        var hardware=report["hardware"] as! [String:Any];hardware["chip"]="Private QA "+id;report["hardware"]=hardware
        let file=folder.appendingPathComponent("report.tmp");try JSONSerialization.data(withJSONObject:report).write(to:file)
        store.enqueue(file,consent:true,publication:false)
        for _ in 0..<300 { if store.status=="uploaded" { break };try await Task.sleep(nanoseconds:100_000_000) }
        XCTAssertTrue(store.connected);XCTAssertEqual(store.status,"uploaded");XCTAssertEqual(store.pending,0)
        let result=try await store.webView.callAsyncJavaScript("""
        const r=await fetch('/api/v1/submissions');const d=await r.json();const row=d.results?.find(x=>x.runId===id);
        if(!row)return false;const deleted=await fetch('/api/v1/submissions/'+row.id,{method:'DELETE'});
        return row.isPublic===0 && deleted.ok;
        """,arguments:["id":id],in:nil,contentWorld:.page)
        XCTAssertEqual(result as? Bool,true)
    }

    @MainActor func testNoUploadFlagDoesNotChangeSavedPreference() throws {
        let suite = "TokFire.UploadTests." + UUID().uuidString
        let prefs = try XCTUnwrap(UserDefaults(suiteName: suite))
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { prefs.removePersistentDomain(forName: suite); try? FileManager.default.removeItem(at: folder) }
        prefs.set(true, forKey: "autoUpload")
        let isolated = UploadStore(queueDirectory: folder, preferences: prefs, arguments: ["--no-upload"])
        XCTAssertFalse(isolated.enabled)
        XCTAssertTrue(isolated.uploadSuppressed)
        isolated.enabled = false
        XCTAssertTrue(prefs.bool(forKey: "autoUpload"))
        isolated.enabled = true
        isolated.enqueue(folder.appendingPathComponent("missing.json"), consent: true, publication: false)
        XCTAssertEqual(isolated.pending, 0)
        XCTAssertEqual(isolated.status, "localOnly")
        let normal = UploadStore(queueDirectory: folder, preferences: prefs, arguments: [])
        XCTAssertTrue(normal.enabled)
        normal.enabled = false
        XCTAssertFalse(prefs.bool(forKey: "autoUpload"))
    }

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
