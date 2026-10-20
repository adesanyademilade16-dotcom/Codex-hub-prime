/* Text-only envelope normalization; formatting remains the page's escaping boundary. */
(function (w) {
  function unwrap(value, depth) {
    if (depth > 6 || value == null) return "";
    if (typeof value === "string") {
      var text = value.trim();
      var fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      var candidate = fenced ? fenced[1] : text;
      if (/^[{[\"]/.test(candidate)) {
        try { return unwrap(JSON.parse(candidate), depth + 1) || text; } catch (e) {}
      }
      return text;
    }
    if (Array.isArray(value)) return value.map(function (item) { return unwrap(item, depth + 1); }).filter(Boolean).join("\n");
    if (typeof value === "object") {
      var keys = ["summary", "notes", "content", "text", "reply", "outputs"];
      for (var i = 0; i < keys.length; i++) {
        var result = unwrap(value[keys[i]], depth + 1);
        if (result) return result;
      }
      if (Array.isArray(value.keyPoints)) return unwrap(value.keyPoints, depth + 1);
      if (value.choices && value.choices[0]) return unwrap(value.choices[0].message, depth + 1);
    }
    return "";
  }
  w.CodexSummaryText = function (value) { return unwrap(value, 0); };
})(window);
