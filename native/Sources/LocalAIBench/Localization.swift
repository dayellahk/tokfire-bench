import SwiftUI
@MainActor final class LanguageStore: ObservableObject {
    static let shared = LanguageStore()
    @Published var code = UserDefaults.standard.string(forKey: "uiLanguage") ?? "zh-Hant" { didSet { UserDefaults.standard.set(code, forKey: "uiLanguage") } }
    static let names = [("en","English"),("zh-Hans","简体中文"),("hi","हिन्दी"),("es","Español"),("fr","Français"),("ar","العربية"),("bn","বাংলা"),("pt","Português"),("ru","Русский"),("ur","اردو"),("id","Bahasa Indonesia"),("de","Deutsch"),("ja","日本語"),("pcm","Naijá"),("mr","मराठी"),("te","తెలుగు"),("tr","Türkçe"),("ta","தமிழ்"),("zh-Hant","繁體中文"),("vi","Tiếng Việt")]
    let translations: [String: [String: String]] = {
        guard let url = Bundle.main.url(forResource: "languages", withExtension: "json") ?? Bundle.module.url(forResource: "languages", withExtension: "json"), let data = try? Data(contentsOf: url), let result = try? JSONDecoder().decode([String: [String: String]].self, from: data) else { return [:] }; return result
    }()
    var rtl: Bool { ["ar", "ur"].contains(code) }
    func text(_ key: String) -> String { translations[code]?[key] ?? translations["en"]?[key] ?? key }
}
@MainActor func L(_ key: String) -> String { LanguageStore.shared.text(key) }
