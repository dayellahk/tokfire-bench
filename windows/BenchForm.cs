using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
namespace TokFire.Bench;
public sealed class BenchForm:Form {
 readonly AppSettings settings=AppSettings.Load();readonly Localization language=new();readonly ProLicense pro=new();
 readonly TabControl tabs=new(){Dock=DockStyle.Fill};readonly AccountView account=new(){Dock=DockStyle.Fill};
 readonly TextBox python=new(){Width=620},server=new(){Width=620},model=new(){Width=620};
 readonly NumericUpDown jobs=new(){Minimum=1,Maximum=3,Value=1,Width=100};
 readonly CheckBox upload=new(){AutoSize=true},publish=new(){AutoSize=true},online=new(){Checked=true,AutoSize=true};
 readonly Button run=new(),cancel=new();readonly ProgressBar progress=new(){Width=850,Height=12};
 readonly Label status=new(){AutoSize=true,MaximumSize=new Size(900,0)},hardware=new(){AutoSize=true,MaximumSize=new Size(900,0)},capacity=new(){AutoSize=true,MaximumSize=new Size(900,0)};
 readonly TextBox log=new(){Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Width=850,Height=140};
 readonly TextBox assessment=new(){Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Width=850,Height=280};
 readonly ListBox history=new(){Width=850,Height=170},models=new(){Width=850,Height=260};
 readonly ComboBox languages=new(){DropDownStyle=ComboBoxStyle.DropDownList,Width=240};
 readonly Label catalogStatus=new(){AutoSize=true,MaximumSize=new Size(850,0)};readonly TextBox key=new(){Width=420,UseSystemPasswordChar=true};
 Process? process;ProcessJob? job;bool running,cancelled,uploading;double memory;int measured;string? reportPath;
 static readonly Color Dark=Color.FromArgb(24,20,18),PanelColor=Color.FromArgb(36,29,25),Orange=Color.FromArgb(255,151,77);
 public BenchForm(){
  Text="TokFire Bench · Windows Preview 0.6.0";Size=new(1040,920);MinimumSize=new(1000,650);AutoScaleMode=AutoScaleMode.Dpi;Font=new("Segoe UI",10);StartPosition=FormStartPosition.CenterScreen;
  var header=new Label{Text="TokFire Bench\nKnow your model. Know your PC.",Dock=DockStyle.Top,Height=94,Padding=new Padding(22,12,0,0),Font=new("Segoe UI",20,FontStyle.Bold),ForeColor=Orange};Controls.Add(tabs);Controls.Add(header);
  var bench=Page("benchmark");var explore=Page("discover");var reports=Page("history");var prefs=Page("settings");var connected=new TabPage("Account"){Tag="connectAccount"};connected.Controls.Add(account);tabs.TabPages.Add(connected);
  bench.Controls.Add(Label("Windows x64 preview · llama.cpp / GGUF · one model, multiple concurrent jobs"));
  bench.Controls.Add(hardware);hardware.Text="Choose Python and llama-server in Settings, then inspect your device.";
  bench.Controls.Add(Row(LabelKey("model"),model,ButtonKey("choose",()=>Pick(model,"GGUF model|*.gguf"))));
  bench.Controls.Add(Row(LabelKey("concurrent"),jobs));bench.Controls.Add(LabelKey("jobsHelp"));bench.Controls.Add(capacity);
  upload.Tag="autoUpload";upload.Checked=settings.AutoUpload;publish.Tag="publicShare";publish.Text="Also publish hardware and measurements in community comparisons";
  bench.Controls.Add(upload);bench.Controls.Add(publish);bench.Controls.Add(Label("Uploads include CPU, GPU names, RAM, OS and timings. No prompts, generated text, usernames, hostnames or serial numbers."));
  run.Tag="start";run.AutoSize=true;run.Click+=async(_,_)=>await RunBenchmark();cancel.Tag="cancel";cancel.AutoSize=true;cancel.Enabled=false;cancel.Click+=(_,_)=>Cancel();
  bench.Controls.Add(Row(run,cancel,ButtonKey("connectAccount",async()=>{tabs.SelectedTab=connected;await Connect();})));bench.Controls.Add(progress);bench.Controls.Add(status);bench.Controls.Add(log);
  reports.Controls.Add(LabelKey("assessment"));reports.Controls.Add(assessment);reports.Controls.Add(Row(ButtonKey("export",Export),ButtonKey("reportFolder",()=>OpenPath(AppSettings.Reports)),ButtonKey("retry",async()=>await RetryUploads())));reports.Controls.Add(history);history.DoubleClick+=(_,_)=>LoadHistory();
  explore.Controls.Add(LabelKey("headline"));online.Tag="online";explore.Controls.Add(online);explore.Controls.Add(Row(ButtonKey("refresh",async()=>await RefreshCatalog()),ButtonKey("hf",()=>OpenURL("https://huggingface.co/models?library=gguf&sort=trending"))));explore.Controls.Add(catalogStatus);explore.Controls.Add(models);
  explore.Controls.Add(ButtonKey("openWebsite",()=>{if(models.SelectedItem is HubModel m)OpenURL("https://huggingface.co/"+m.Id);}));explore.Controls.Add(Label("Download a compatible single-file GGUF from the model page, review its license, then select it in Benchmark. Trending is popularity; RAM estimates do not predict speed. All MoE weights still need memory."));
  online.CheckedChanged+=(_,_)=>{if(!online.Checked){models.Items.Clear();catalogStatus.Text=language["offlineHelp"];}else catalogStatus.Text="Refresh to load the latest Hugging Face models.";};
  python.Text=settings.Python;server.Text=settings.Server;model.Text=settings.Model;
  prefs.Controls.Add(Label("Runtime executables — keep llama.cpp's DLL files alongside llama-server.exe."));prefs.Controls.Add(Row(Label("Python 3.10+"),python,ButtonKey("choose",()=>Pick(python,"Python executable|python.exe|Executable|*.exe"))));prefs.Controls.Add(Row(Label("llama-server.exe"),server,ButtonKey("choose",()=>Pick(server,"llama.cpp server|llama-server.exe|Executable|*.exe"))));
  prefs.Controls.Add(Row(ButtonKey("device",async()=>await Inspect()),ButtonKey("openWebsite",()=>OpenURL("https://github.com/ggml-org/llama.cpp/releases")),Button("Install Python",()=>OpenURL("https://www.python.org/downloads/windows/")),Button("WebView2 Runtime",()=>OpenURL("https://developer.microsoft.com/en-us/microsoft-edge/webview2/"))));
  prefs.Controls.Add(Label("CPU: use a CPU build. NVIDIA: use the CUDA build and supported drivers. AMD/Intel GPU: use a compatible Vulkan build. GPU acceleration depends on your hardware/runtime; MLX and oMLX are Mac-only."));
  prefs.Controls.Add(Row(LabelKey("language"),languages));languages.Items.AddRange(Localization.Names.Select(x=>(object)x.name).ToArray());languages.SelectedIndex=Math.Max(0,Array.FindIndex(Localization.Names,x=>x.code==settings.Language));language.Code=Localization.Names[languages.SelectedIndex].code;
  languages.SelectedIndexChanged+=(_,_)=>{language.Code=Localization.Names[languages.SelectedIndex].code;Save();Translate(this);};
  prefs.Controls.Add(Label("TokFire Bench Pro · HK$180 once · one activated device · up to 20 jobs. Live sales pending store activation."));
  var activate=ButtonKey("proActivate",async()=>{try{await pro.Activate(key.Text.Trim());key.Clear();jobs.Maximum=20;status.Text=language["proActive"];}catch(Exception e){ShowError(e);}});activate.Enabled=pro.Configured;
  prefs.Controls.Add(Row(key,activate,ButtonKey("proDeactivate",async()=>{try{await pro.Deactivate();jobs.Value=Math.Min(3,jobs.Value);jobs.Maximum=3;}catch(Exception e){ShowError(e);}})));
  jobs.ValueChanged+=(_,_)=>UpdateCapacity();model.TextChanged+=(_,_)=>UpdateCapacity();upload.CheckedChanged+=(_,_)=>{publish.Enabled=upload.Checked;if(!upload.Checked)publish.Checked=false;Save();};
  Shown+=async(_,_)=>{RefreshHistory();if(pro.Credential is not null&&pro.Configured){try{await pro.Validate();jobs.Maximum=20;}catch{status.Text="Pro could not be verified. Free jobs remain available.";}}};
  account.SignedIn+=async(_,_)=>await RetryUploads();
  FormClosing+=(_,_)=>{Cancel();Save();};Style(this);Translate(this);status.Text="Ready. Choose one model and run a test.";
 }
 FlowLayoutPanel Page(string title){var page=new TabPage{Tag=title};var panel=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true,Padding=new Padding(20)};page.Controls.Add(panel);tabs.TabPages.Add(page);return panel;}
 static Label Label(string text)=>new(){Text=text,AutoSize=true,MaximumSize=new Size(900,0),Margin=new Padding(4,8,4,8)};
 Label LabelKey(string key){var l=Label(language[key]);l.Tag=key;return l;}
 static FlowLayoutPanel Row(params Control[] controls){var row=new FlowLayoutPanel{AutoSize=true,MaximumSize=new Size(940,0),WrapContents=true};row.Controls.AddRange(controls);return row;}
 Button ButtonKey(string key,Action action){var b=Button(language[key],action);b.Tag=key;return b;}
 static Button Button(string text,Action action){var b=new Button{Text=text,AutoSize=true,Padding=new Padding(10,6,10,6),Margin=new Padding(4)};b.Click+=(_,_)=>action();return b;}
 void Translate(Control c){if(c.Tag is string tag){var translated=language[tag];if(translated!=tag)c.Text=translated;}foreach(Control child in c.Controls)Translate(child);RightToLeft=language.Code is "ar" or "ur"?RightToLeft.Yes:RightToLeft.No;}
 static void Style(Control c){c.BackColor=c is TextBox or ListBox?PanelColor:Dark;c.ForeColor=Color.FromArgb(243,233,223);if(c is Button b){b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderColor=Orange;}foreach(Control child in c.Controls)Style(child);}
 void Pick(TextBox target,string filter){using var d=new OpenFileDialog{Filter=filter,CheckFileExists=true};if(d.ShowDialog()==DialogResult.OK){target.Text=d.FileName;Save();}}
 void Save(){settings.Python=python.Text.Trim();settings.Server=server.Text.Trim();settings.Model=model.Text.Trim();settings.AutoUpload=upload.Checked;settings.Language=language.Code;try{settings.Save();}catch{status.Text="Could not save settings.";}}
 void ShowError(Exception e){status.Text=e.Message;MessageBox.Show(this,e.Message,"TokFire Bench",MessageBoxButtons.OK,MessageBoxIcon.Information);}
 static void OpenURL(string url){Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}
 static void OpenPath(string path){Process.Start(new ProcessStartInfo("explorer.exe"){ArgumentList={path},UseShellExecute=true});}
 async Task Connect(){try{await account.Connect();}catch{ShowError(new InvalidOperationException("Install Microsoft Edge WebView2 Runtime to connect your account."));}}
 async Task Inspect(){
  if(running)return;Save();try{
   using var p=new Process{StartInfo=new ProcessStartInfo(settings.Python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true}};
   p.StartInfo.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory,"runner","platform_support.py"));p.Start();using var job=new ProcessJob();job.Assign(p);using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(40));var output=p.StandardOutput.ReadToEndAsync(timeout.Token);await p.WaitForExitAsync(timeout.Token);if(p.ExitCode!=0)throw new InvalidOperationException("Hardware detection failed. Check your Python installation and Windows WMI service.");SetHardware(JsonNode.Parse(await output)!.AsObject());
  }catch(Exception e){ShowError(e);}
 }
 void SetHardware(JsonObject h){memory=h["memoryBytes"]!.GetValue<double>();hardware.Text=$"{h["chip"]} · {h["cpuCores"]} CPU cores · {memory/Math.Pow(1024,3):F1} GiB RAM\r\nGPU: {string.Join(", ",h["gpuNames"]!.AsArray().Select(x=>x!.GetValue<string>()))}";UpdateCapacity();}
 void UpdateCapacity(){try{if(memory<=0){capacity.Text="Inspect your device in Settings for a RAM estimate.";return;}var bytes=File.Exists(model.Text)?new FileInfo(model.Text).Length:0;var estimate=bytes*1.25+(2+(double)jobs.Value*.5)*Math.Pow(1024,3);capacity.Text=$"Estimated model + runtime + job memory: {estimate/Math.Pow(1024,3):F1} GiB / {memory/Math.Pow(1024,3):F1} GiB RAM. "+(estimate>memory*.8?"Choose a smaller model or fewer jobs.":"Within the initial RAM budget. GPU VRAM still needs checking.");}catch{capacity.Text="Select a model file to estimate capacity.";}}
 async Task RunBenchmark(){
  if(running)return;Save();if(!File.Exists(settings.Server)||!File.Exists(settings.Model)){ShowError(new InvalidOperationException("Choose llama-server.exe in Settings and a local GGUF model."));return;}
  if(jobs.Value>3){try{await pro.Validate();}catch(Exception e){ShowError(e);return;}}
  running=true;cancelled=false;run.Enabled=false;cancel.Enabled=true;jobs.Enabled=false;measured=0;progress.Maximum=(int)jobs.Value*3;progress.Value=0;log.Clear();assessment.Clear();var selectedUpload=upload.Checked;var selectedPublish=publish.Checked;var output=Path.Combine(AppSettings.Reports,Guid.NewGuid()+".json");
  try{
   var info=new ProcessStartInfo(settings.Python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=System.Text.Encoding.UTF8,StandardErrorEncoding=System.Text.Encoding.UTF8};
   foreach(var arg in new[]{"-u",Path.Combine(AppContext.BaseDirectory,"runner","jobs_runner.py"),"--engine","llama.cpp","--server",settings.Server,"--model",settings.Model,"--jobs",((int)jobs.Value).ToString(),"--output",output})info.ArgumentList.Add(arg);
   process=new Process{StartInfo=info};process.Start();job=new ProcessJob();job.Assign(process);
   if(jobs.Value>3)await process.StandardInput.WriteLineAsync(pro.Credential);process.StandardInput.Close();
   process.OutputDataReceived+=(_,e)=>{if(e.Data is not null)UI(()=>Event(e.Data));};process.ErrorDataReceived+=(_,e)=>{if(e.Data is not null)UI(()=>Append(e.Data));};process.BeginOutputReadLine();process.BeginErrorReadLine();
   await process.WaitForExitAsync();if(cancelled){status.Text=language["cancel"]+" — local runtime stopped.";return;}
   if(process.ExitCode!=0||!File.Exists(output))throw new InvalidOperationException("The benchmark did not complete. Review the event log and runtime selection.");
   var report=JsonNode.Parse(await File.ReadAllTextAsync(output))!.AsObject();reportPath=output;assessment.Text=Reports.Assess(report);await File.WriteAllTextAsync(Path.ChangeExtension(output,".txt"),assessment.Text);progress.Value=progress.Maximum;status.Text=language["complete"];RefreshHistory();tabs.SelectedIndex=2;
   if(selectedUpload){var payload=new JsonObject{["report"]=report,["consent"]=new JsonObject{["collect"]=true,["publish"]=selectedPublish,["version"]="2026-09-15-v1"}}.ToJsonString();await File.WriteAllTextAsync(Path.Combine(AppSettings.Queue,Path.GetFileName(output)),payload);await RetryUploads();}
  }catch(Exception e){if(!cancelled)ShowError(e);}finally{job?.Dispose();job=null;try{if(process is {HasExited:false})process.Kill(true);}catch{}process?.Dispose();process=null;running=false;run.Enabled=true;cancel.Enabled=false;jobs.Enabled=true;}
 }
 void Cancel(){if(!running)return;cancelled=true;job?.Dispose();job=null;try{if(process is {HasExited:false})process.Kill(true);}catch{}status.Text="Stopping benchmark processes…";}
 void UI(Action action){if(!IsDisposed&&IsHandleCreated)try{BeginInvoke(()=>{if(!IsDisposed)action();});}catch(InvalidOperationException){}}
 void Event(string line){try{var e=JsonNode.Parse(line)!;var type=e["event"]?.GetValue<string>();if(type=="hardware")SetHardware(e["hardware"]!.AsObject());if(e["message"] is not null){status.Text=e["message"]!.GetValue<string>();Append(status.Text);}if(type=="sample"){var s=e["sample"]!;measured++;progress.Value=Math.Min(progress.Maximum,measured);Append($"Job {s["jobId"]} · round {s["repeat"]} · {s["decodeTps"]!.GetValue<double>():F1} tok/s · first token {s["ttftMs"]!.GetValue<double>():F0} ms");}}catch(JsonException){Append(line);}}
 void Append(string text){if(log.TextLength>24000)log.Text=log.Text[^12000..];log.AppendText(text+Environment.NewLine);}
 async Task RetryUploads(){if(uploading||!upload.Checked)return;uploading=true;try{foreach(var path in Directory.GetFiles(AppSettings.Queue,"*.json")){if(!upload.Checked)break;await account.Upload(await File.ReadAllTextAsync(path));File.Delete(path);}status.Text=language["uploaded"];}catch(Exception e){status.Text=e.Message+" ("+Directory.GetFiles(AppSettings.Queue,"*.json").Length+" queued)";}finally{uploading=false;}}
 void RefreshHistory(){history.Items.Clear();history.Items.AddRange(Directory.GetFiles(AppSettings.Reports,"*.json").OrderDescending().Select(x=>(object)Path.GetFileName(x)).ToArray());}
 void LoadHistory(){if(history.SelectedItem is not string name)return;try{reportPath=Path.Combine(AppSettings.Reports,name);assessment.Text=Reports.Assess(JsonNode.Parse(File.ReadAllText(reportPath))!.AsObject());}catch(Exception e){ShowError(e);}}
 void Export(){if(reportPath is null)return;using var d=new SaveFileDialog{Filter="Benchmark report|*.json",FileName=Path.GetFileName(reportPath)};if(d.ShowDialog()==DialogResult.OK)File.Copy(reportPath,d.FileName,true);}
 async Task RefreshCatalog(){if(!online.Checked){catalogStatus.Text=language["offlineHelp"];return;}catalogStatus.Text=language["loadingCatalog"];try{var result=await Catalog.Load();if(!online.Checked)return;models.Items.Clear();models.Items.AddRange(result.Cast<object>().ToArray());catalogStatus.Text="Live Hugging Face trending selection · small models first · "+DateTime.Now.ToString("g");}catch{catalogStatus.Text=language["offlineHelp"];}}
}
