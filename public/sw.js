self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Winservice Leads &amp; ROI</title>
     <style>body{font:1rem system-ui;background:#f4f8fc;color:#092748;margin:12vh auto;padding:1.5rem;max-width:30rem}a{color:#095a9b}</style>
     <h1>Sem conexão</h1><p>Conecte-se à internet para abrir o Leads &amp; ROI.</p>
     <a href="/">Tentar novamente</a></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  )));
});
