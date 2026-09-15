import SwiftUI
import WebKit

let siteOrigin = "https://local-ai-benchmark-lab.mossy-fern-2045.chatgpt.site"
@MainActor final class UploadStore: NSObject, ObservableObject, WKNavigationDelegate {
    @Published var enabled = UserDefaults.standard.object(forKey: "autoUpload") as? Bool ?? true {
        didSet { UserDefaults.standard.set(enabled, forKey: "autoUpload"); if !enabled { status = "uploadPaused" } }
    }
    @Published var publish = false
    @Published var status = "connectAccount"
    @Published var connected = false
    @Published var pending = 0
    @Published var showAccount = false
    let webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
    private let outbox: URL
    private let origin: String
    private var uploading = false
    init(origin: String = siteOrigin, queueDirectory: URL? = nil) {
        self.origin = origin; self.outbox = queueDirectory ?? supportFolder.appendingPathComponent("Outbox")
        super.init(); webView.navigationDelegate = self
        try? FileManager.default.createDirectory(at: outbox, withIntermediateDirectories: true)
        pending = files().count
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
    func enqueue(_ url: URL, consent: Bool, publication: Bool) {
        guard consent, enabled else { status = "localOnly"; return }
        do {
            let data = try Data(contentsOf: url)
            guard let report = try JSONSerialization.jsonObject(with: data) as? [String: Any], let id = report["runId"] as? String, UUID(uuidString: id) != nil else { return }
            let envelope: [String: Any] = ["report": report, "consent": ["collect": true, "publish": publication, "version": "2026-09-15-v1"]]
            try JSONSerialization.data(withJSONObject: envelope).write(to: outbox.appendingPathComponent(id + ".json"), options: .atomic)
            pending = files().count; status = "uploadQueued"
            if connected { retry() } else { load() }
        } catch { status = "uploadFailed" }
    }
    func clearQueue() { guard !uploading else { return }; for file in files() { try? FileManager.default.removeItem(at: file) }; pending = files().count; status = "localOnly" }
    func retry() {
        guard enabled, !uploading else { return }
        guard connected, webView.url?.absoluteString == origin + "/native-connect" else { status = "connectAccount"; return }
        guard let file = files().first, let bytes = try? Data(contentsOf: file), let payload = String(data: bytes, encoding: .utf8) else { return }
        uploading = true; status = "uploading"
        // Arguments are encoded by WebKit, never interpolated into JavaScript.
        webView.callAsyncJavaScript("""
        if(location.origin !== expectedOrigin || location.pathname !== '/native-connect') throw Error('Wrong origin');
        const controller = new AbortController(); const timeout = setTimeout(()=>controller.abort(),20000);
        try {
        const response = await fetch('/api/v2/submissions', {method:'POST',signal:controller.signal,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:payload});
        const data=await response.json();
        return response.ok && data.stored === true;
        } finally { clearTimeout(timeout); }
        """, arguments: ["payload": payload, "expectedOrigin": origin], in: nil, in: .page) { result in
            Task { @MainActor in
                self.uploading = false
                if case .success(let value) = result, value as? Bool == true {
                    try? FileManager.default.removeItem(at: file); self.pending = self.files().count; self.status = "uploaded"; self.retry()
                } else { self.status = "uploadFailed" }
            }
        }
    }
}
struct AccountWebView: NSViewRepresentable {
    let store: UploadStore
    func makeNSView(context: Context) -> WKWebView { store.webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
