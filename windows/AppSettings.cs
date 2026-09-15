using System.Text.Json;
namespace TokFire.Bench;
public sealed class AppSettings {
 public string Python {get;set;}="python.exe";
 public string Server {get;set;}="";
 public string Model {get;set;}="";
 public string Language {get;set;}="en";
 public bool AutoUpload {get;set;}=true;
 public static string Root {get;}=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"TokFireBench");
 public static string Reports=>Path.Combine(Root,"Reports");
 public static string Queue=>Path.Combine(Root,"Outbox");
 public static AppSettings Load(){Directory.CreateDirectory(Root);Directory.CreateDirectory(Reports);Directory.CreateDirectory(Queue);try{return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(Path.Combine(Root,"settings.json")))??new();}catch{return new();}}
 public void Save(){var path=Path.Combine(Root,"settings.json");File.WriteAllText(path+".tmp",JsonSerializer.Serialize(this));File.Move(path+".tmp",path,true);}
}
public sealed class Localization {
 public string Code {get;set;}="en";
 readonly Dictionary<string,Dictionary<string,string>> text;
 public static readonly (string code,string name)[] Names=[("en","English"),("zh-Hans","简体中文"),("hi","हिन्दी"),("es","Español"),("fr","Français"),("ar","العربية"),("bn","বাংলা"),("pt","Português"),("ru","Русский"),("ur","اردو"),("id","Bahasa Indonesia"),("de","Deutsch"),("ja","日本語"),("pcm","Naijá"),("mr","मराठी"),("te","తెలుగు"),("tr","Türkçe"),("ta","தமிழ்"),("zh-Hant","繁體中文"),("vi","Tiếng Việt")];
 public Localization(){try{text=JsonSerializer.Deserialize<Dictionary<string,Dictionary<string,string>>>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"languages.json")))??new();}catch{text=new();}}
 public string this[string key]=>key=="proDeactivate"?"Deactivate Pro on this device":text.GetValueOrDefault(Code)?.GetValueOrDefault(key)??text.GetValueOrDefault("en")?.GetValueOrDefault(key)??key;
}
