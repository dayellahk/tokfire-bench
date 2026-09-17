using System.Text.Json.Nodes;
namespace TokFire.Bench;
public sealed class AdvancedDialog:Form {
 public Dictionary<string,string> Values {get;}=new();
 public AdvancedDialog(string engine,bool managed,Dictionary<string,string> current){
  Text="Pro · Advanced test settings";Size=new(840,720);StartPosition=FormStartPosition.CenterParent;
  var root=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true,Padding=new Padding(16)};Controls.Add(root);
  root.Controls.Add(new Label{Text="Select overrides. Unselected values keep benchmark/runtime defaults.\nPro required to run. Local reports only; no standard ranking uploads.\nServer acceptance does not prove every requested parameter took effect.",AutoSize=true});
  var catalog=JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"runner","advanced_parameters.json")))!.AsObject();
  var controls=new List<(string key,CheckBox selected,Control input)>();
  string group="";
  foreach(var field in catalog["parameters"]!.AsArray()){
   var key=field!["key"]!.GetValue<string>();var next=field["group"]!.GetValue<string>();
   if(next!=group){group=next;root.Controls.Add(new Label{Text=group,AutoSize=true,Font=new Font(Font,FontStyle.Bold),Margin=new Padding(0,18,0,8)});}
   var supported=field["engines"]!.AsArray().Any(e=>e!.GetValue<string>()==engine)&&(!field["managed"]!.GetValue<bool>()||managed)&&!(key=="context_tokens"&&engine=="llama.cpp"&&!managed);
   var selected=new CheckBox{Text=field["label"]!.GetValue<string>()+(supported?"":" — unavailable for this connection"),AutoSize=true,Enabled=supported,Checked=supported&&current.ContainsKey(key)};
   root.Controls.Add(selected);
   var value=current.GetValueOrDefault(key,field["default"]!.GetValue<string>());
   Control input;
   if(field["choices"] is JsonArray choices){var combo=new ComboBox{Width=220,DropDownStyle=ComboBoxStyle.DropDownList};foreach(var c in choices)combo.Items.Add(c!.GetValue<string>());combo.SelectedItem=value;input=combo;}
   else{var multiline=field["type"]!.GetValue<string>()=="text";input=new TextBox{Text=value,Width=740,Multiline=multiline,Height=multiline?60:28,ScrollBars=multiline?ScrollBars.Vertical:ScrollBars.None};}
   input.Enabled=selected.Checked;selected.CheckedChanged+=(_,_)=>input.Enabled=selected.Checked;root.Controls.Add(input);
   if(field["min"] is not null)root.Controls.Add(new Label{Text=$"Range: {field["min"]} … {field["max"]}",AutoSize=true});
   var help=field["help"]!.GetValue<string>();if(help.Length>0)root.Controls.Add(new Label{Text=help,AutoSize=true,MaximumSize=new Size(740,0)});
   controls.Add((key,selected,input));
  }
  foreach(var notice in catalog["unsupported"]!.AsArray())root.Controls.Add(new Label{Text=notice!.GetValue<string>(),AutoSize=true,MaximumSize=new Size(740,0),Margin=new Padding(0,10,0,0)});
  var reset=new Button{Text="Reset overrides",AutoSize=true};reset.Click+=(_,_)=>{foreach(var c in controls)c.selected.Checked=false;};root.Controls.Add(reset);
  var save=new Button{Text="Use these settings",AutoSize=true};save.Click+=(_,_)=>{foreach(var c in controls)if(c.selected.Checked)Values[c.key]=c.input.Text;DialogResult=DialogResult.OK;};root.Controls.Add(save);
 }
}
