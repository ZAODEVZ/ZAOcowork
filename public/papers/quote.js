/* ZAO papers - quote any passage to Farcaster.
   Select text on any paper -> a "Quote on Farcaster" button appears -> opens a
   Farcaster compose prefilled with the quote + this page, posted to /zao.
   Their profile + credit are automatic (it is their cast). No login, no DB. */
(function () {
  "use strict";
  var CHANNEL = "zao";
  var MAXQ = 280; // keep the quoted passage sane for a cast

  var btn = document.createElement("button");
  btn.textContent = "Quote on Farcaster";
  btn.setAttribute("type", "button");
  btn.style.cssText = [
    "position:absolute", "z-index:9999", "display:none",
    "font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif",
    "padding:8px 14px", "border-radius:9px", "border:none", "cursor:pointer",
    "background:#f5a623", "color:#141e27", "box-shadow:0 4px 16px rgba(0,0,0,0.35)",
    "letter-spacing:0.01em"
  ].join(";");
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(btn); });
  if (document.body) document.body.appendChild(btn);

  var lastText = "";

  function hide() { btn.style.display = "none"; lastText = ""; }

  function showFor(sel) {
    var text = (sel.toString() || "").trim();
    if (text.length < 8) { hide(); return; } // ignore stray clicks
    lastText = text;
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    var top = rect.bottom + window.scrollY + 8;
    var left = rect.left + window.scrollX + Math.max(0, (rect.width / 2) - 80);
    left = Math.min(left, window.scrollX + document.documentElement.clientWidth - 190);
    btn.style.top = top + "px";
    btn.style.left = Math.max(8, left) + "px";
    btn.style.display = "block";
  }

  document.addEventListener("mouseup", function () {
    setTimeout(function () {
      var sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) showFor(sel); else hide();
    }, 10);
  });
  document.addEventListener("selectionchange", function () {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) hide();
  });

  btn.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep selection
  btn.addEventListener("click", function () {
    if (!lastText) return;
    var q = lastText.length > MAXQ ? lastText.slice(0, MAXQ - 1) + "…" : lastText;
    var text = '"' + q + '"\n\nMy note on the ZAO papers:\n';
    var url = "https://farcaster.xyz/~/compose"
      + "?text=" + encodeURIComponent(text)
      + "&channelKey=" + encodeURIComponent(CHANNEL)
      + "&embeds[]=" + encodeURIComponent(window.location.href);
    window.open(url, "_blank", "noopener");
    hide();
  });
})();
