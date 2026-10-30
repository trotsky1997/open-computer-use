import {createRequire} from 'node:module';
import {readFileSync,existsSync,realpathSync,cpSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const EVALUATE_DEPENDENCIES={'quickjs-emscripten-core':'0.32.0','@jitl/quickjs-wasmfile-release-sync':'0.32.0'};
export function copyRuntimeDependencies(sourceRoot,destination) {
 const source=path.resolve(sourceRoot),target=path.resolve(destination),copied=new Map();
 function visit(name,from) {
  const require=createRequire(path.join(from,'package.json'));
  let directory=path.dirname(require.resolve(name)),manifest;
  for(;;){
   const file=path.join(directory,'package.json');
   if(existsSync(file)){const candidate=JSON.parse(readFileSync(file,'utf8'));if(candidate.name===name){manifest=candidate;break;}}
   const parent=path.dirname(directory);if(parent===directory)throw Error(`Cannot locate runtime dependency ${name}`);directory=parent;
  }
  if(copied.has(name)){if(copied.get(name)!==manifest.version)throw Error(`Conflicting runtime dependency versions for ${name}`);return;}
  copied.set(name,manifest.version);
  const output=path.join(target,'node_modules',name);mkdirSync(path.dirname(output),{recursive:true});cpSync(directory,output,{recursive:true});
  for(const dependency of Object.keys(manifest.dependencies??{}))visit(dependency,directory);
 }
 const manifest=JSON.parse(readFileSync(path.join(source,'package.json'),'utf8'));
 for(const dependency of Object.keys(manifest.dependencies??{}))visit(dependency,source);
 return [...copied.keys()];
}
if(process.argv[1]&&existsSync(process.argv[1])&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))) {
 if(!process.argv[2]||!process.argv[3])throw Error('Usage: runtime-dependencies.mjs SOURCE_ROOT DESTINATION');
 copyRuntimeDependencies(process.argv[2],process.argv[3]);
}
