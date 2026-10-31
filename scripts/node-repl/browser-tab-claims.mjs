import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,rename,rm,lstat} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import path from 'node:path';

const hash=value=>createHash('sha256').update(value).digest('hex');
const root=path.join(process.platform==='win32'?tmpdir():'/tmp',`open-computer-use-claims-${process.getuid?.()??hash(homedir())}`);
const layout='__ocu_browser_layout__';
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

// shortcut: crashed hosts keep their claims; add native operation settlement before crash takeover.
export class BrowserTabClaims {
 constructor(browserId,directory=root){this.directory=path.join(directory,hash(browserId));this.root=directory;this.owners=new WeakMap();this.held=new Map();this.context=new AsyncLocalStorage();}
 token(owner){if(!this.owners.has(owner))this.owners.set(owner,randomUUID());return this.owners.get(owner);}
 async prepare(){
  for(const directory of [this.root,this.directory]){
   await mkdir(directory,{mode:0o700}).catch(error=>{if(error.code!=='EEXIST')throw error;});
   const info=await lstat(directory);
   if(!info.isDirectory()||process.getuid&&(info.uid!==process.getuid()||(info.mode&0o077)!==0))throw Error('Browser claim directory must be private to the current user');
  }
 }
 slot(id){return path.join(this.directory,hash(id));}
 async read(id){
  let record;try{record=JSON.parse(await readFile(path.join(this.slot(id),'owner.json'),'utf8'));}
  catch(error){
   if(error.code==='ENOENT'){try{await lstat(this.slot(id));}catch(missing){if(missing.code==='ENOENT')return;throw missing;}}
   throw Error('Browser claim record is unreadable; keep the tab fenced',{cause:error});
  }
  if(record?.version!==1||record.targetId!==id||!uuid.test(record.owner)||!uuid.test(record.lease)||!Number.isSafeInteger(record.pid)||record.pid<=0||typeof record.claimed!=='boolean')throw Error('Browser claim record is invalid; keep the tab fenced');
  return record;
 }
 async foreignAncestor(owner,id,openers){
  const token=this.token(owner),seen=new Set([id]);
  for(let parent=openers.get(id);parent&&!seen.has(parent);parent=openers.get(parent)){
   seen.add(parent);const record=await this.read(parent);if(record)return record.owner!==token;
  }
  return false;
 }
 async available(owner,id,openers=new Map()){
  const record=await this.read(id);
  if(record&&record.owner!==this.token(owner))throw Error('Tab belongs to another session or host; a crashed host keeps its claim until browser restart');
  if(!record&&await this.foreignAncestor(owner,id,openers))throw Error('Tab opener belongs to another session or host; release its claim before binding this descendant');
 }
 async claim(owner,id,claimed,openers=new Map()){
  await this.prepare();const record=await this.read(id);
  if(record){await this.available(owner,id,openers);this.held.set(id,record);return record;}
  return this.withLayout(owner,()=>this.reserve(owner,id,claimed,openers));
 }
 async withLayout(owner,operation){
  const current=this.context.getStore();if(current?.owner===owner&&current.active)return operation();
  await this.prepare();const deadline=Date.now()+10000;let held;
  for(;;){
   try{held=await this.reserve(owner,layout,false,new Map(),true);break;}
   catch(error){if(!error.layoutBusy||Date.now()>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,10));}
  }
  let retain=false;const scope={owner,active:true};
  try{return await this.context.run(scope,operation);}
  catch(error){retain=error.managementUnconfirmed===true;throw error;}
  finally{scope.active=false;if(!retain)await this.retire(layout,held);}
 }
 async reserve(owner,id,claimed,openers,exclusive=false){
  const token=this.token(owner);
  for(let attempt=0;attempt<3;attempt++){
   let record=await this.read(id);
   if(record){
    if(exclusive)throw Object.assign(Error('Browser layout belongs to another session or host; wait for native settlement or browser recovery'),{layoutBusy:true});
    if(record.owner!==token)throw Error('Tab belongs to another session or host; a crashed host keeps its claim until browser restart');
    this.held.set(id,record);return record;
   }
   if(await this.foreignAncestor(owner,id,openers))throw Error('Tab opener belongs to another session or host; release its claim before binding this descendant');
   const staging=await mkdtemp(path.join(this.directory,'.pending-'));
   try{
    record={version:1,targetId:id,owner:token,lease:randomUUID(),pid:process.pid,claimed};
    await writeFile(path.join(staging,'owner.json'),JSON.stringify(record),{mode:0o600,flag:'wx'});
    try{await rename(staging,this.slot(id));if(!exclusive)this.held.set(id,record);return record;}
    catch(error){if(!['EEXIST','ENOTEMPTY','EPERM'].includes(error.code))throw error;}
   }finally{await rm(staging,{recursive:true,force:true});}
  }
  throw Error('Browser tab claim changed during acquisition; retry from fresh inventory');
 }
 async unavailable(owner,ids,openers=new Map()){
  await this.prepare();const token=this.token(owner);
  const rows=await Promise.all([...ids].map(async id=>{const record=await this.read(id);return (record?record.owner!==token||!record.claimed:await this.foreignAncestor(owner,id,openers))?id:undefined;}));
  return rows.filter(id=>id!==undefined);
 }
 async retire(id,held){
  const record=await this.read(id);
  if(!record||record.owner!==held.owner||record.lease!==held.lease)throw Error('Browser tab claim changed before release; keep cleanup fenced');
  const retired=path.join(this.directory,`.released-${randomUUID()}`);
  await rename(this.slot(id),retired);await rm(retired,{recursive:true});
 }
 async release(owner,keep=new Set()){
  const token=this.token(owner);
  for(const [id,held] of this.held){
   if(held.owner!==token||keep.has(id))continue;
   await this.retire(id,held);this.held.delete(id);
  }
 }
}
