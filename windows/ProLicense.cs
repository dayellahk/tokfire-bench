using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
namespace TokFire.Bench;
internal sealed class ProLicense {
 readonly JsonObject cfg=JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"runner","lemon-squeezy.json")))!.AsObject();
 string FilePath=>Path.Combine(AppSettings.Root,"license.dat");
 public bool Configured=>new[]{"storeId","productId","variantId"}.All(k=>(cfg[k]?.GetValue<int>()??0)>0);
 public string? Credential {get;private set;}
 public ProLicense(){try{Credential=Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(FilePath),null,DataProtectionScope.CurrentUser));}catch{Credential=null;}}
 public async Task Activate(string key){
  if(!Configured)throw new InvalidOperationException("Live Pro sales are not yet configured.");
  if(!Guid.TryParse(key,out _))throw new InvalidOperationException("Enter a valid license key.");
  var r=await Call("activate",new(){["license_key"]=key,["instance_name"]="TokFire Windows "+Guid.NewGuid().ToString("N")[..8]});
  var instance=r["instance"]?["id"]?.GetValue<string>();
  if(r["activated"]?.GetValue<bool>()!=true||r["error"] is not null||instance is null)throw new InvalidOperationException("Activation failed. Check the key and one-device activation limit.");
  var credential=new JsonObject{["key"]=key,["instanceID"]=instance}.ToJsonString();
  try{await Validate(credential);}catch{await Call("deactivate",new(){["license_key"]=key,["instance_id"]=instance});throw;}
  Credential=credential;File.WriteAllBytes(FilePath,ProtectedData.Protect(Encoding.UTF8.GetBytes(credential),null,DataProtectionScope.CurrentUser));
 }
 public async Task Validate(string? value=null){
  if(!Configured||string.IsNullOrEmpty(value??Credential))throw new InvalidOperationException("Activate Pro to select more than three jobs.");
  var c=JsonNode.Parse(value??Credential!)!;var r=await Call("validate",new(){["license_key"]=c["key"]!.GetValue<string>(),["instance_id"]=c["instanceID"]!.GetValue<string>()});
  if(r["valid"]?.GetValue<bool>()!=true||r["error"] is not null||r["license_key"]?["status"]?.GetValue<string>()!="active"||r["license_key"] is not JsonObject license||!license.ContainsKey("expires_at")||license["expires_at"] is not null||r["instance"]?["id"]?.GetValue<string>()!=c["instanceID"]!.GetValue<string>()||r["license_key"]?["key"]?.GetValue<string>()!=c["key"]!.GetValue<string>())throw new InvalidOperationException("Pro license is inactive or invalid.");
  foreach(var pair in new[]{("store_id","storeId"),("product_id","productId"),("variant_id","variantId")})if(r["meta"]?[pair.Item1]?.GetValue<int>()!=cfg[pair.Item2]!.GetValue<int>())throw new InvalidOperationException("License is for another product.");
 }
 public async Task Deactivate(){if(Credential is null)return;var c=JsonNode.Parse(Credential)!;var r=await Call("deactivate",new(){["license_key"]=c["key"]!.GetValue<string>(),["instance_id"]=c["instanceID"]!.GetValue<string>()});if(r["deactivated"]?.GetValue<bool>()!=true)throw new InvalidOperationException("Deactivation failed; the key remains saved.");File.Delete(FilePath);Credential=null;}
 static async Task<JsonObject> Call(string action,Dictionary<string,string> data){using var client=new HttpClient{Timeout=TimeSpan.FromSeconds(25)};using var response=await client.PostAsync("https://api.lemonsqueezy.com/v1/licenses/"+action,new FormUrlEncodedContent(data));response.EnsureSuccessStatusCode();return JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();}
}
