"""Bounded, read-only tool-calling exercise. Requires Ollama and qwen3:4b."""
import json
from urllib.request import Request, urlopen

INVENTORY = {"cable": 12, "adapter": 0}  # Fictional teaching data.
TOOLS = [{"type": "function", "function": {
    "name": "stock_count", "description": "Look up stock for one item.",
    "parameters": {"type": "object", "properties": {
        "item": {"type": "string", "enum": list(INVENTORY)}},
        "required": ["item"], "additionalProperties": False}
}}]

def chat(messages):
    request = Request("http://127.0.0.1:11434/api/chat", json.dumps({
        "model": "qwen3:4b", "stream": False, "think": False,
        "messages": messages, "tools": TOOLS,
        "options": {"num_ctx": 4096, "num_predict": 256, "temperature": 0}
    }).encode(), {"Content-Type": "application/json"})
    with urlopen(request, timeout=120) as response:
        return json.load(response)["message"]

def dispatch(function):
    args = function.get("arguments", {})
    if function.get("name") != "stock_count":
        raise ValueError("Unknown tool")
    if not isinstance(args, dict) or set(args) != {"item"}:
        raise ValueError("Invalid arguments")
    item = args["item"]
    if not isinstance(item, str) or item not in INVENTORY:
        raise ValueError("Unknown item")
    return {"item": item, "count": INVENTORY[item]}

def run(question):
    messages = [{"role": "system", "content": "Use stock_count for stock facts. "
                 "Do not invent inventory. This tool only reads data."},
                {"role": "user", "content": question}]
    calls_used = 0
    for _ in range(4):
        message = chat(messages)
        messages.append(message)
        calls = message.get("tool_calls", [])
        if not calls:
            if not calls_used:
                raise RuntimeError("No tool used: the task is not verified")
            print(message.get("content", ""))
            return
        if not isinstance(calls, list) or calls_used + len(calls) > 4:
            raise RuntimeError("Tool-call limit exceeded")
        for call in calls:
            result = dispatch(call["function"])
            calls_used += 1
            print("Verified tool result:", json.dumps(result))
            messages.append({"role": "tool", "tool_name": "stock_count",
                             "content": json.dumps(result)})
    raise RuntimeError("Stopped: model did not finish within four rounds")

if __name__ == "__main__":
    run("How many cables and adapters are in stock?")
