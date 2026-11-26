import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function inlineOffline():Plugin{
  return {
    name:'monster-wars-offline',
    enforce:'post',
    generateBundle(_options,bundle){
      const html=bundle['index.html'];
      if(!html||html.type!=='asset'||typeof html.source!=='string')throw Error('Expected HTML entry');
      html.source=html.source.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,(_tag,url:string)=>{
        const asset=bundle[url.replace(/^\.\//,'')];
        if(!asset||asset.type!=='chunk'||asset.imports.length||asset.dynamicImports.length)throw Error('Expected standalone script');
        return '<script type="module">'+asset.code.replace(/<\/script/gi,'<\\/script')+'</script>';
      }).replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,(_tag,url:string)=>{
        const asset=bundle[url.replace(/^\.\//,'')];
        if(!asset||asset.type!=='asset'||typeof asset.source!=='string')throw Error('Expected standalone CSS');
        return '<style>'+asset.source.replace(/<\/style/gi,'<\\/style')+'</style>';
      });
      if(/<(?:script|link)\b[^>]*(?:src|href)=/i.test(html.source))throw Error('External dependency in offline HTML');
      for(const key of Object.keys(bundle))if(key!=='index.html')delete bundle[key];
    },
  };
}
export default defineConfig({
  root:resolve('apps/monster-wars'),base:'./',plugins:[inlineOffline()],
  build:{
    target:'es2022',outDir:resolve('dist/monster-wars-offline'),emptyOutDir:true,modulePreload:false,
    cssCodeSplit:false,rollupOptions:{output:{inlineDynamicImports:true}},
  },
});
