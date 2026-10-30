import type { Plugin } from "vite";
/** Development artifact only: self-contained HTML, no network assets or service worker.
 * This does not choose the final installation/distribution format.
 */
export function robotOfflineInlineBuild(): Plugin {
  return { name: "robot-offline-inline", enforce: "post", generateBundle(_options, bundle) {
    const html = Object.values(bundle).find(item => item.type === "asset" && item.fileName.endsWith(".html"));
    if (!html || html.type !== "asset" || typeof html.source !== "string") throw new Error("Missing offline HTML");
    let source = html.source;
    source = source.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_all: string, url: string) => {
      const chunk = bundle[url.replace(/^\.\//, "")];
      if (!chunk || chunk.type !== "chunk" || chunk.imports.length || chunk.dynamicImports.length) throw new Error("Offline script is not self-contained");
      return `<script type="module">${chunk.code.replace(/<\/script/gi, "<\\/script")}</script>`;
    }).replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (all: string) => {
      const url = /href="([^"]+)"/.exec(all)?.[1], asset = url ? bundle[url.replace(/^\.\//, "")] : undefined;
      if (!asset || asset.type !== "asset" || typeof asset.source !== "string") throw new Error("Missing inline CSS");
      return `<style>${asset.source.replace(/<\/style/gi, "<\\/style")}</style>`;
    });
    if (/<(?:script|link)\b[^>]*(?:src|href)=/i.test(source)) throw new Error("External offline dependency");
    for (const key of Object.keys(bundle)) if (key !== html.fileName) delete bundle[key];
    html.source = source;
  } };
}
