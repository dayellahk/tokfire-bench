import SwiftUI
import WebKit

let siteOrigin = "https://tokfires.com"
@MainActor final class UploadStore: NSObject, ObservableObject, WKNavigationDelegate {
    let uploadSuppressed: Bool
    private let preferences: UserDefaults
    @Published var enabled: Bool {
        didSet { if !uploadSuppressed { preferences.set(enabled, forKey: "autoUpload") }; if !enabled { status = "uploadPaused" } }
    }
    @Published var publish = false
    @Published var status = "accountConnected"
    @Published var connected = false
    @Published var pending = 0
    @Published var showAccount = false
    let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    private let outbox: URL
    private let origin: String
    private var uploading = false
    init(origin: String = siteOrigin, queueDirectory: URL? = nil, preferences: UserDefaults = .standard, arguments: [String] = CommandLine.arguments) {
        self.preferences = preferences
        self.uploadSuppressed = arguments.contains("--no-upload")
        self.enabled = !arguments.contains("--no-upload") && (preferences.object(forKey: "autoUpload") as? Bool ?? true)
        self.origin = origin; self.outbox = queueDirectory ?? supportFolder.appendingPathComponent("Outbox")
        super.init(); webView.navigationDelegate = self
        try? FileManager.default.createDirectory(at: outbox, withIntermediateDirectories: true)
        pending = files().count
        if pending > 0 && enabled && !uploadSuppressed { load() }
    }
    private func files() -> [URL] { ((try? FileManager.default.contentsOfDirectory(at: outbox, includingPropertiesForKeys: nil)) ?? []).filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent } }
    func connect() { showAccount = true; load() }
    func load() { webView.load(URLRequest(url: URL(string: origin + "/native-connect")!)) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView.url?.host == URL(string: origin)?.host, webView.url?.scheme == URL(string: origin)?.scheme, webView.url?.path == "/native-connect" else { connected = false; return }
        webView.evaluateJavaScript("document.querySelector('[data-native-ready=\"true\"]') !== null") { value, _ in
            Task { @MainActor in self.connected = value as? Bool == true; self.status = self.connected ? "accountConnected" : "connectAccount"; if self.connected { self.retry() } }
        }
    }
    func prepareChallenge(_ config: [String: Any]) async -> URL? {
        guard enabled, !uploadSuppressed else { return nil }
        if !connected { load() }
        for _ in 0..<50 {
            if connected { break }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        guard connected else { return nil }
        do {
            let (data,response)=try await apiRequest("/api/v2/challenges",data:JSONSerialization.data(withJSONObject:config))
            guard (response as? HTTPURLResponse)?.statusCode == 201,
                  let ticket=try JSONSerialization.jsonObject(with:data) as? [String:Any],
                  let id=ticket["id"] as? String, UUID(uuidString:id) != nil else { return nil }
            let url=FileManager.default.temporaryDirectory.appendingPathComponent("tokfire-challenge-"+id+".json")
            try data.write(to:url,options:.atomic); return url
        } catch { return nil }
    }
    // WebKit keeps the guest cookie; native networking avoids suspended background-page promises.
    func apiRequest(_ path: String, method: String = "POST", data: Data? = nil) async throws -> (Data,URLResponse) {
        guard path.hasPrefix("/api/") else { throw URLError(.badURL) }
        let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
            webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { continuation.resume(returning:$0) }
        }
        let host=URL(string:origin)!.host!
        let selected=cookies.filter { $0.domain == host || $0.domain == "."+host }
        var request=URLRequest(url:URL(string:origin+path)!)
        request.httpMethod=method;request.timeoutInterval=20
        request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        request.setValue(origin,forHTTPHeaderField:"Origin")
        for (key,value) in HTTPCookie.requestHeaderFields(with:selected) { request.setValue(value,forHTTPHeaderField:key) }
        request.httpBody=data
        let session=URLSession(configuration:.ephemeral,delegate:UploadNoRedirectDelegate(),delegateQueue:nil)
        defer {session.invalidateAndCancel()}
        return try await session.data(for:request)
    }
    func enqueue(_ url: URL, consent: Bool, publication: Bool) {
        guard !uploadSuppressed, consent, enabled else { status = "localOnly"; return }
        do {
            let data = try Data(contentsOf: url)
            guard let report = try JSONSerialization.jsonObject(with: data) as? [String: Any], let id = report["runId"] as? String, UUID(uuidString: id) != nil else { return }
            guard report["specVersion"] as? String != "tokfire-advanced-v1" else { status = "localOnly"; return }
            let envelope: [String: Any] = ["report": report, "consent": ["collect": true, "publish": publication, "version": "2026-09-15-v1"]]
            try JSONSerialization.data(withJSONObject: envelope).write(to: outbox.appendingPathComponent(id + ".json"), options: .atomic)
            pending = files().count; status = "uploadQueued"
            if connected { retry() } else { load() }
        } catch { status = "uploadFailed" }
    }
    func clearQueue() { guard !uploading else { return }; for file in files() { try? FileManager.default.removeItem(at: file) }; pending = files().count; status = "localOnly" }
    func retry() {
        guard !uploadSuppressed, enabled, !uploading else { return }
        guard connected, webView.url?.absoluteString == origin + "/native-connect" else { status = "connectAccount"; return }
        guard let file = files().first, let bytes = try? Data(contentsOf: file), let payload = String(data: bytes, encoding: .utf8) else { return }
        uploading = true; status = "uploading"
        Task { @MainActor in
            do {
                let (data,response)=try await apiRequest("/api/v2/submissions",data:Data(payload.utf8))
                let result=try JSONSerialization.jsonObject(with:data) as? [String:Any]
                guard let http=response as? HTTPURLResponse, (200..<300).contains(http.statusCode),result?["stored"] as? Bool == true else { throw URLError(.badServerResponse) }
                try? FileManager.default.removeItem(at:file);pending=files().count
                status=result?["status"] as? String == "quarantined" ? "uploadReview" : "uploaded"
                uploading=false;retry()
            } catch { uploading=false;status="uploadFailed" }
        }
    }
}
struct AccountWebView: NSViewRepresentable {
    let store: UploadStore
    func makeNSView(context: Context) -> WKWebView { store.webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}

private final class UploadNoRedirectDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
