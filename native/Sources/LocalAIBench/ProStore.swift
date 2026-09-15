import SwiftUI
import Security

struct LemonConfiguration: Decodable {
    let storeId: Int
    let productId: Int
    let variantId: Int
    let purchaseURL: String
    let priceLabel: String
    static var bundled: Self {
        guard let url = Bundle.main.url(forResource: "lemon-squeezy", withExtension: "json") ?? Bundle.module.url(forResource: "lemon-squeezy", withExtension: "json"), let data = try? Data(contentsOf: url), let value = try? JSONDecoder().decode(Self.self, from: data) else { return Self(storeId: 0, productId: 0, variantId: 0, purchaseURL: "", priceLabel: "HK$180") }
        return value
    }
    var configured: Bool { storeId > 0 && productId > 0 && variantId > 0 }
    var checkout: URL? {
        guard let url = URL(string: purchaseURL), url.scheme == "https", let host = url.host,
              host == "lemonsqueezy.com" || host.hasSuffix(".lemonsqueezy.com"), url.path.hasPrefix("/checkout/") else { return nil }; return url
    }
}
struct LicenseCredential: Codable { let key: String; let instanceID: String }

enum LemonValidation {
    static func valid(_ data: Data, configuration: LemonConfiguration, key: String, instanceID: String? = nil, activating: Bool = false, preactivation: Bool = false) -> Bool {
        guard configuration.configured, let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any], object[activating ? "activated" : "valid"] as? Bool == true,
              object["error"] is NSNull, let license = object["license_key"] as? [String:Any], license["key"] as? String == key, license["expires_at"] is NSNull,
              let status = license["status"] as? String, (preactivation ? ["active","inactive"] : ["active"]).contains(status),
              let meta = object["meta"] as? [String:Any] else { return false }
        for (field,expected) in [("store_id",configuration.storeId),("product_id",configuration.productId),("variant_id",configuration.variantId)] {
            guard let n=meta[field] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue == Double(expected) else { return false }
        }
        if preactivation { return true }
        guard let instance=object["instance"] as? [String:Any], let id=instance["id"] as? String, UUID(uuidString:id) != nil else { return false }
        return instanceID == nil || id == instanceID
    }
    static func body(_ fields: [String:String]) -> Data {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        return fields.sorted { $0.key < $1.key }.map { $0.key + "=" + ($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "") }.joined(separator: "&").data(using: .utf8)!
    }
}

@MainActor final class ProStore: ObservableObject {
    let configuration = LemonConfiguration.bundled
    @Published var active = false
    @Published var checking = false
    @Published var status = "proFree"
    @Published var enteredKey = ""
    @Published private(set) var credential: LicenseCredential?
    private let service = "dev.localaibench.lemonsqueezy"
    private let account = "pro-license"
    var limit: Int { active ? 20 : 3 }
    var keyForRun: String? {
        guard active, let credential, let data=try? JSONEncoder().encode(credential) else { return nil }
        return String(data:data,encoding:.utf8)
    }
    private var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account] }
    private func call(_ operation: String, fields: [String:String]) async throws -> Data {
        var request=URLRequest(url:URL(string:"https://api.lemonsqueezy.com/v1/licenses/"+operation)!);request.httpMethod="POST";request.timeoutInterval=20
        request.setValue("application/x-www-form-urlencoded",forHTTPHeaderField:"Content-Type");request.setValue("application/json",forHTTPHeaderField:"Accept");request.httpBody=LemonValidation.body(fields)
        let (data,response)=try await URLSession.shared.data(for:request)
        guard let http=response as? HTTPURLResponse, http.statusCode != 429, http.statusCode < 500, data.count <= 65_536 else { throw URLError(.badServerResponse) }
        return data
    }
    func restore() async {
        guard configuration.configured else { status="proNotConfigured";return }
        var request=query;request[kSecReturnData as String]=true;request[kSecMatchLimit as String]=kSecMatchLimitOne
        var item:CFTypeRef?
        if SecItemCopyMatching(request as CFDictionary,&item)==errSecSuccess,let data=item as? Data { credential=try? JSONDecoder().decode(LicenseCredential.self,from:data) }
        if credential != nil { await revalidate() }
    }
    func revalidate() async {
        guard !checking,let credential else { return }
        checking=true;status="proChecking";defer{checking=false}
        do {
            let data=try await call("validate",fields:["license_key":credential.key,"instance_id":credential.instanceID])
            active=LemonValidation.valid(data,configuration:configuration,key:credential.key,instanceID:credential.instanceID)
            status=active ? "proActive" : "proInvalid"
        } catch { active=false;status="proOffline" }
    }
    func activate() async {
        guard !checking,configuration.configured,credential == nil else { return }
        let key=enteredKey.trimmingCharacters(in:.whitespacesAndNewlines).lowercased()
        guard UUID(uuidString:key) != nil else { status="proInvalid";return }
        checking=true;status="proChecking";defer{checking=false}
        do {
            // Check the exact live store/product/variant before consuming an activation.
            let checked=try await call("validate",fields:["license_key":key])
            guard LemonValidation.valid(checked,configuration:configuration,key:key,preactivation:true) else { status="proInvalid";return }
            let data=try await call("activate",fields:["license_key":key,"instance_name":"LocalAI-"+UUID().uuidString])
            guard LemonValidation.valid(data,configuration:configuration,key:key,activating:true),let object=try JSONSerialization.jsonObject(with:data) as? [String:Any],let instance=object["instance"] as? [String:Any],let id=instance["id"] as? String else { status="proInvalid";return }
            let saved=LicenseCredential(key:key,instanceID:id)
            let bytes=try JSONEncoder().encode(saved)
            var item=query;item[kSecValueData as String]=bytes;item[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let result=SecItemAdd(item as CFDictionary,nil)
            let stored=result==errSecDuplicateItem ? SecItemUpdate(query as CFDictionary,[kSecValueData as String:bytes] as CFDictionary) : result
            credential=saved
            guard stored==errSecSuccess else {
                // Keep the instance in memory so the user can release it; never silently activate twice.
                status="proKeychainError";return
            }
            active=true;enteredKey="";status="proActive"
        } catch { active=false;status="proOffline" }
    }
    func invalidate() { active=false;status="proInvalid" }
    func forgetLocal() {
        guard !checking else { return }
        let result=SecItemDelete(query as CFDictionary)
        guard result==errSecSuccess || result==errSecItemNotFound else {status="proKeychainError";return}
        credential=nil;active=false;enteredKey="";status="proFree"
    }
    func deactivate() async {
        guard !checking,let credential else{return}
        checking=true;active=false;status="proChecking";defer{checking=false}
        do {
            let data=try await call("deactivate",fields:["license_key":credential.key,"instance_id":credential.instanceID])
            guard let object=try JSONSerialization.jsonObject(with:data) as? [String:Any],object["deactivated"] as? Bool==true else{status="proInvalid";return}
            let result=SecItemDelete(query as CFDictionary)
            guard result==errSecSuccess || result==errSecItemNotFound else{status="proKeychainError";return}
            self.credential=nil;enteredKey="";status="proFree"
        } catch {status="proOffline"}
    }
}
struct ProPanel: View {
    @ObservedObject var store: ProStore
    @ObservedObject private var lang=LanguageStore.shared
    var body: some View {
        VStack(alignment:.leading,spacing:12){
            HStack{Label("Local AI Bench Pro",systemImage:"bolt.fill").font(.headline);Spacer();Tag(text:store.active ? "Pro · 20 jobs" : "Free · 3 jobs")}
            Text(L("proHelp")).font(.callout)
            Text(L(store.status)).font(.caption).foregroundColor(store.active ? accent : muted)
            if store.configuration.configured {
                if store.credential != nil {
                    HStack{Button(L("retry")){Task{await store.revalidate()}};Button(L("proDeactivate")){Task{await store.deactivate()}}}.disabled(store.checking)
                    if !store.active { Button(L("proForget")) { store.forgetLocal() }.disabled(store.checking); Text(L("proForgetHelp")).font(.caption).foregroundColor(muted) }
                }else{
                    HStack{SecureField(L("proKey"),text:$store.enteredKey).textFieldStyle(.roundedBorder);Button(L("proActivate")){Task{await store.activate()}}.disabled(store.checking || store.enteredKey.isEmpty)}
                    if let url=store.configuration.checkout{Link(L("proBuy")+" "+store.configuration.priceLabel,destination:url)}
                }
            }
        }
    }
}
