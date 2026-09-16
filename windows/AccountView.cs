using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
namespace TokFire.Bench;
internal sealed class AccountView:UserControl {
 public const string SiteOrigin="https://tokfires.com";
 readonly WebView2 view=new(){Dock=DockStyle.Fill};
 readonly Label notice=new(){Dock=DockStyle.Top,Height=60,Text="Guest uploads need no sign-in. Keep app data to manage your reports.",Padding=new Padding(12)};
 bool ready;
 public event EventHandler? SignedIn;
 public AccountView(){Controls.Add(view);Controls.Add(notice);}
 public async Task Connect(){
  try{
   if(!ready){var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(AppSettings.Root,"WebView2"));await view.EnsureCoreWebView2Async(env);view.CoreWebView2.Settings.AreHostObjectsAllowed=false;view.CoreWebView2.Settings.AreDevToolsEnabled=false;
    view.CoreWebView2.NavigationStarting+=(_,e)=>{if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out var u)||u.Scheme!="https"||u.Host!="tokfires.com")e.Cancel=true;};
    view.CoreWebView2.NewWindowRequested+=(_,e)=>e.Handled=true;view.CoreWebView2.NavigationCompleted+=async(_,_)=>{try{if(await view.CoreWebView2.ExecuteScriptAsync("document.querySelector('[data-native-ready=\"true\"]') !== null")=="true")SignedIn?.Invoke(this,EventArgs.Empty);}catch{}};ready=true;
   }
   view.CoreWebView2.Navigate(SiteOrigin+"/native-connect");
  }catch(Exception){notice.Text="Microsoft Edge WebView2 Runtime is required for account sign-in. Install it from Microsoft's WebView2 download page. Your local reports are safe.";throw;}
 }
 public async Task<JsonNode?> Post(string path,string payload){
  if(!ready)await Connect();
  var connected=false;
  for(var i=0;i<200;i++){if(await view.CoreWebView2.ExecuteScriptAsync("location.origin==='https://tokfires.com' && !!document.querySelector('[data-native-ready=\"true\"]')")=="true"){connected=true;break;}await Task.Delay(100);}
  if(!connected)throw new InvalidOperationException("Guest upload connection unavailable. The report remains queued.");
  var cookies=await view.CoreWebView2.CookieManager.GetCookiesAsync(SiteOrigin);
  var jar=new CookieContainer();foreach(var c in cookies){var cookie=new Cookie(c.Name,c.Value,c.Path,c.Domain){Secure=c.IsSecure,HttpOnly=c.IsHttpOnly};jar.Add(cookie);}
  using var handler=new HttpClientHandler{CookieContainer=jar,AllowAutoRedirect=false};using var client=new HttpClient(handler){Timeout=TimeSpan.FromSeconds(30)};
  client.DefaultRequestHeaders.Add("Origin",SiteOrigin);
  using var response=await client.PostAsync(SiteOrigin+path,new StringContent(payload,Encoding.UTF8,"application/json"));
  if(response.StatusCode==HttpStatusCode.Unauthorized)throw new InvalidOperationException("Reopen the upload manager, then retry queued uploads.");
  if(!response.IsSuccessStatusCode)throw new InvalidOperationException($"Upload returned {(int)response.StatusCode}. The local report remains queued.");
  return JsonNode.Parse(await response.Content.ReadAsStringAsync());
 }
 public async Task<bool> Upload(string payload){var result=await Post("/api/v2/submissions",payload);if(result?["stored"]?.GetValue<bool>()!=true)throw new InvalidOperationException("Upload was not acknowledged. The report remains queued.");return result?["status"]?.GetValue<string>()=="quarantined";}
 public async Task<string?> Challenge(JsonObject config){try{var ticket=await Post("/api/v2/challenges",config.ToJsonString());if(ticket?["id"] is null)return null;var path=Path.Combine(Path.GetTempPath(),"tokfire-challenge-"+Guid.NewGuid()+".json");await File.WriteAllTextAsync(path,ticket.ToJsonString());return path;}catch{return null;}}

}
