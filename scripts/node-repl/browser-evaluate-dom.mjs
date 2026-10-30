const selectors=new Set(['locator','getByRole','getByText','getByLabel','getByPlaceholder','getByTestId','getByTitle','getByAltText','frameLocator','filter','nth','first','last','and','or']);
export function validateEvaluation({source,mode,path=[],options={}}) {
 if(typeof source!=='string'||!source.trim()||Buffer.byteLength(source)>1024*1024)throw Error('Evaluation requires a function or expression up to 1 MiB');
 if(!['page','element','all'].includes(mode)||!Array.isArray(path)||(mode==='page'&&path.length)||(mode!=='page'&&!path.length))throw Error('Invalid evaluation scope');
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='timeoutMs')|| (options.timeoutMs!==undefined&&(!Number.isInteger(options.timeoutMs)||options.timeoutMs<0||options.timeoutMs>2147483647)))throw Error('Invalid evaluation timeoutMs');
 const visit=steps=>{if(!Array.isArray(steps))throw Error('Invalid evaluation locator');for(const step of steps){if(!step || !selectors.has(step.method)||!Array.isArray(step.args))throw Error('Invalid evaluation locator');const values=value=>{if(value && typeof value==='object'){if(value.__ocuLocator)visit(value.__ocuLocator);else for(const item of Object.values(value))values(item);}};step.args.forEach(values);}};visit(path);
}

// Only this fixed reader runs in Chrome; evaluator source never enters the page.
export function createReadWorld(decodeData) {
 const objects=new Map(),ids=new WeakMap(),windows=new WeakSet([window]);let next=0;
 const properties=new Set(`nodeType nodeName nodeValue textContent isConnected ownerDocument parentNode parentElement firstChild
  lastChild nextSibling previousSibling childNodes children childElementCount firstElementChild
  lastElementChild nextElementSibling previousElementSibling tagName localName namespaceURI id className
  classList dataset attributes innerHTML outerHTML innerText outerText shadowRoot host assignedSlot slot title
  lang dir hidden inert tabIndex role ariaLabel ariaHidden accessKey value defaultValue checked defaultChecked
  selected defaultSelected disabled readOnly multiple required name type placeholder min max step pattern size
  maxLength minLength selectionStart selectionEnd selectionDirection options selectedOptions selectedIndex
  length labels form validity validationMessage willValidate href src currentSrc srcset sizes alt width height
  naturalWidth naturalHeight complete loading decoding download rel target text htmlFor open returnValue
  readyState currentTime duration paused ended muted volume playbackRate controls autoplay loop poster preload
  videoWidth videoHeight buffered played seekable rows cells rowIndex cellIndex colSpan rowSpan tHead tBodies
  tFoot caption contentDocument contentWindow documentElement head body URL documentURI baseURI characterSet
  contentType compatMode doctype forms images links scripts styleSheets activeElement scrollingElement
  defaultView visibilityState hidden cookie location origin protocol host hostname port pathname search hash
  document referrer lastModified clientWidth clientHeight clientLeft clientTop offsetWidth offsetHeight
  offsetLeft offsetTop offsetParent scrollWidth scrollHeight scrollLeft scrollTop innerWidth innerHeight
  outerWidth outerHeight devicePixelRatio scrollX scrollY pageXOffset pageYOffset visualViewport scale
  offsetLeft offsetTop pageLeft pageTop anchorNode focusNode anchorOffset focusOffset isCollapsed rangeCount
  startContainer endContainer startOffset endOffset commonAncestorContainer collapsed media matches style
  cssText cssRules sheet selectorText styleSheet parentRule disabled name value ownerElement specified`.split(/\s+/u));
 // Cookie access and all ambient transport/storage APIs are deliberately absent.
 properties.delete('cookie');
 const methods=new Set(`querySelector querySelectorAll getElementById getElementsByTagName getElementsByClassName getElementsByName
  getAttribute getAttributeNS hasAttribute hasAttributeNS getAttributeNames matches closest contains
  compareDocumentPosition isEqualNode isSameNode getRootNode hasChildNodes getBoundingClientRect
  getClientRects checkVisibility item namedItem contains toString getPropertyValue getPropertyPriority
  getSelection getRangeAt cloneRange intersectsNode isPointInRange comparePoint getComputedStyle matchMedia
  escape getAll get has entries keys values assignedNodes assignedElements`.split(/\s+/u));
 const writes=new Set(`click focus blur submit requestSubmit reset setAttribute setAttributeNS removeAttribute removeAttributeNS
  toggleAttribute append appendChild prepend insertBefore insertAdjacentHTML insertAdjacentElement
  insertAdjacentText replaceChild replaceChildren replaceWith remove before after normalize attachShadow
  dispatchEvent addEventListener removeEventListener setRangeText setSelectionRange select scroll scrollBy
  scrollTo scrollIntoView show showModal close play pause load requestFullscreen exitFullscreen write writeln
  open createElement createElementNS createTextNode createDocumentFragment createRange execCommand assign
  replace reload setTimeout setInterval clearTimeout clearInterval queueMicrotask requestAnimationFrame
  cancelAnimationFrame fetch postMessage sendBeacon setProperty removeProperty insertRule deleteRule add
  remove toggle replace adoptNode importNode surroundContents deleteContents extractContents insertNode
  collapse extend selectAllChildren setBaseAndExtent removeAllRanges addRange selectNode selectNodeContents
  setStart setEnd setStartBefore setStartAfter setEndBefore setEndAfter`.split(/\s+/u));
 const brand=value=>Object.prototype.toString.call(value).slice(8,-1);
 const nodeTypeGetter=Object.getOwnPropertyDescriptor(Node.prototype,'nodeType').get;
 function nativeNodeType(value){try{return Reflect.apply(nodeTypeGetter,value,[]);}catch{return undefined;}}
 function member(value,property){
  let descriptor;
  if(windows.has(value)){
   if(value!==window&&!['window','self','top','parent','frames'].includes(property))void value.document;
   descriptor=Object.getOwnPropertyDescriptor(window,property);
  }else if(value===CSS)descriptor=Object.getOwnPropertyDescriptor(CSS,property);
  else if(brand(value)==='Location')descriptor=Object.getOwnPropertyDescriptor(location,property);
  else {
   for(let prototype=window[brand(value)]?.prototype;prototype;prototype=Object.getPrototypeOf(prototype)){
    descriptor=Object.getOwnPropertyDescriptor(prototype,property);if(descriptor)break;
   }
  }
  if(descriptor?.get)return Reflect.apply(descriptor.get,value,[]);
  if(descriptor&&'value' in descriptor)return descriptor.value;
  if(brand(value)==='DOMStringMap'&&Object.hasOwn(value,property))return value[property];
  if(brand(value)==='CSSStyleDeclaration'&&property in value)return value[property];
  if(brand(value)==='DOMTokenList'&&/^\d+$/u.test(property))return value[property];
  return undefined;
 }
 function reference(value,nodeType) {let id=ids.get(value);if(id===undefined){id=next++;objects.set(id,value);ids.set(value,id);}let iterable=false;try{iterable=typeof value[Symbol.iterator]==='function';}catch{}return {kind:'ref',id,nodeType,iterable};}
 function encode(value) {
  if(value===undefined)return {kind:'undefined'};
  if(value===null || typeof value==='string'||typeof value==='boolean')return {kind:'value',value};
  if(typeof value==='number')return {kind:'value',value:Number.isFinite(value)?value:String(value),number:!Number.isFinite(value)};
  try{if(value.window===value){windows.add(value);return reference(value);}}catch{}
  if(Array.isArray(value)||['NodeList','HTMLCollection','NamedNodeMap','DOMRectList','StyleSheetList','CSSRuleList'].includes(brand(value)))return {kind:'list',values:Array.from(value,encode)};
  if(typeof value?.next==='function' && typeof value?.[Symbol.iterator]==='function')return {kind:'iterator',values:Array.from(value,encode)};
  if(['DOMRect','DOMRectReadOnly'].includes(brand(value)))return {kind:'record',value:Object.fromEntries(['x','y','width','height','top','right','bottom','left'].map(key=>[key,encode(value[key])]))};
  return reference(value,nativeNodeType(value));
 }
 function unwrap(value){
  if(value.kind==='ref'){if(!objects.has(value.id))throw Error('Unknown read-only DOM argument');return objects.get(value.id);}
  if(value.kind==='array')return value.values.map(unwrap);
  if(value.kind==='object')return Object.fromEntries(value.values.map(([key,item])=>[key,unwrap(item)]));
  if(value.kind==='data')return decodeData(value.value);
  throw Error('Invalid read-only DOM argument');
 }
 function read(request) {
  const value=objects.get(request.id);if(!value)throw Error('Unknown read-only DOM object');
  const property=request.property;
  if(typeof property!=='string')throw Error('Invalid read-only DOM member');
  if(request.op==='keys')return encode(value===window?['CSS','document','location','self','top','window','getComputedStyle','getSelection','matchMedia','setTimeout','clearTimeout','scroll','scrollBy','scrollTo','visualViewport','devicePixelRatio','innerHeight','innerWidth','outerHeight','outerWidth','pageXOffset','pageYOffset','scrollX','scrollY']:brand(value)==='DOMStringMap'?Object.keys(value):[]);
  if(writes.has(property)){if(request.op==='has')return encode(['scroll','scrollBy','scrollTo'].includes(property)&&value===window);if(request.op==='get')return ['scroll','scrollBy','scrollTo'].includes(property)&&value===window?{kind:'denied'}:{kind:'undefined'};throw Error(`Read-only page scope rejects ${property}`);}
  if(request.op==='has')return encode((windows.has(value)&&['window','self','top','parent','frames','CSS','scroll','scrollBy','scrollTo'].includes(property))||(properties.has(property)&&property in value)||(methods.has(property)&&typeof member(value,property)==='function')||(brand(value)==='DOMStringMap'&&Object.hasOwn(value,property)));
  if(request.op==='get') {
   if(['window','self','top','parent','frames'].includes(property)&&windows.has(value))return encode(member(value,property));
   if(property==='CSS'&&value===window)return encode(CSS);
   if(methods.has(property)&&typeof member(value,property)==='function')return {kind:'method',id:request.id,property};
   if((/^\d+$/u.test(property)&&brand(value)==='DOMTokenList') || properties.has(property) || (brand(value)==='DOMStringMap' && Object.hasOwn(value,property)) || (brand(value)==='CSSStyleDeclaration' && (property in value))) {
    const result=member(value,property);if(typeof result==='function')return {kind:'undefined'};return encode(result);
   }
   return {kind:'undefined'};
  }
  if(request.op==='call'&&methods.has(property)&&typeof member(value,property)==='function')return encode(Reflect.apply(member(value,property),value,(request.args??[]).map(unwrap)));
  throw Error('Unsupported read-only DOM operation');
 }
 const record=value=>({kind:'record',value:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]))});
 return {seed:encode,roots:()=>({document:encode(document),window:encode(window),location:encode(location)}),read(request){
  if(request.op==='summary'){
   const value=objects.get(request.id);
   if(nativeNodeType(value)===1)return record({id:member(value,'id'),tagName:member(value,'tagName'),textContent:member(value,'textContent')});
   if(nativeNodeType(value)===2)return record({name:value.name,value:value.value});
   if(brand(value)==='DOMStringMap')return record({...value});
   if(brand(value)==='DOMTokenList')return {kind:'list',values:Array.from(value,encode)};
   if(brand(value)==='CSSStyleDeclaration')return record(Object.fromEntries(Array.from(value,key=>[key,value.getPropertyValue(key)])));
   if(value===location)return record(Object.fromEntries(['href','origin','protocol','host','hostname','port','pathname','search','hash'].map(key=>[key,value[key]])));
   return encode(String(value));
  }
  return read(request);
 }};
}

// Executed inside QuickJS. Its only host capability is the read-only RPC closure.
export function installReadScope(rpc,roots,encodeValue,decodeValue,setTimer,clearTimer) {
 const global=globalThis,indirectEval=eval,refs=new WeakMap(),cache=new Map();
 const deny=()=>{throw new TypeError('Read-only page scope rejects mutation');};
 function decode(value) {
  if(value.kind==='denied')return deny;
  if(value.kind==='undefined')return undefined;
  if(value.kind==='value')return value.number?Number(value.value):value.value;
  if(value.kind==='list'){const list=value.values.map(decode);Object.defineProperty(list,'item',{value:index=>list[index]??null});Object.defineProperty(list,'namedItem',{value:name=>list.find(node=>node.id===name||node.name===name)??null});return list;}
  if(value.kind==='iterator')return value.values.map(decode).values();
  if(value.kind==='record')return Object.fromEntries(Object.entries(value.value).map(([key,item])=>[key,decode(item)]));
  if(value.kind==='method')return (...args)=>ask({op:'call',id:value.id,property:value.property,args:args.map(arg=>encodeArg(arg))});
  if(value.kind!=='ref')throw Error('Invalid read-only response');
  if(cache.has(value.id))return cache.get(value.id);
  const proxy=new Proxy(Object.create(null),{
   get(_,property){
    if(property===Symbol.iterator)return value.iterable?function*(){for(let index=0;index<proxy.length;index++)yield proxy[String(index)];}:undefined;
    if(property===Symbol.toStringTag)return 'ReadOnlyDOM';
    if(property===Symbol.toPrimitive)return ()=>ask({op:'call',id:value.id,property:'toString',args:[]});
    if(value.id===roots.window.id&&property==='setTimeout')return global.setTimeout;
    if(value.id===roots.window.id&&property==='clearTimeout')return global.clearTimeout;
    if(property==='toJSON')return ()=>ask({op:'summary',id:value.id,property:''});
    if(typeof property!=='string')return undefined;
    return ask({op:'get',id:value.id,property});
   },
   set:deny,defineProperty:deny,deleteProperty:deny,setPrototypeOf:deny,
   ownKeys(){return ask({op:'keys',id:value.id,property:''});},
   has(_,property){if(value.id===roots.window.id&&['setTimeout','clearTimeout'].includes(property))return true;return typeof property==='string'&&ask({op:'has',id:value.id,property});},
   getOwnPropertyDescriptor(_,property){if(!ask({op:'keys',id:value.id,property:''}).includes(property))return undefined;return {configurable:true,enumerable:true,get:()=>proxy[property]};},
  });
  refs.set(proxy,value);cache.set(value.id,proxy);return proxy;
 }
 function encodeArg(value,seen=new Set()) {
  if(refs.has(value))return {kind:'ref',id:refs.get(value).id};
  if(value && typeof value==='object'&&(Array.isArray(value)||Object.prototype.toString.call(value)==='[object Object]')){
   if(seen.has(value))throw Error('Cyclic DOM argument');seen.add(value);
   const result=Array.isArray(value)?{kind:'array',values:value.map(item=>encodeArg(item,seen))}:{kind:'object',values:Object.entries(value).map(([key,item])=>[key,encodeArg(item,seen)])};
   seen.delete(value);return result;
  }
  return {kind:'data',value:encodeValue(value)};
 }
 function ask(request){const result=JSON.parse(rpc(JSON.stringify(request)));if(result.error)throw Error(result.error);return Object.hasOwn(result,'data')?result.data:decode(result.value);}
 const urls=new WeakMap(),parameters=new WeakMap();
 global.URLSearchParams=class URLSearchParams {
  constructor(value=''){if(value instanceof global.URLSearchParams)value=value.toString();parameters.set(this,{text:ask({op:'params',value:encodeValue(value),method:'toString',args:[]})});}
  toString(){return parameters.get(this).text;}
  [Symbol.iterator](){return this.entries();}
 };
 for(const method of ['get','getAll','has','entries','keys','values','append','set','delete','sort'])Object.defineProperty(global.URLSearchParams.prototype,method,{value:function(...args){
  const state=parameters.get(this),result=ask({op:'params',value:encodeValue(state.text),method,args:args.map(arg=>encodeValue(arg))});
  if(['append','set','delete','sort'].includes(method)){state.text=result;state.changed?.(result);return;}
  return ['entries','keys','values'].includes(method)?result.values():result;
 }});
 global.URL=class URL {
  constructor(value,base){urls.set(this,ask({op:'url',value:String(value),base:base===undefined?undefined:String(base)}));}
  toString(){return urls.get(this).href;}
  toJSON(){return this.toString();}
  get searchParams(){const state=urls.get(this);if(!state.params){state.params=new global.URLSearchParams(state.search);parameters.get(state.params).changed=text=>{this.search=text;};}return state.params;}
 };
 for(const key of ['href','origin','protocol','username','password','host','hostname','port','pathname','search','hash'])Object.defineProperty(global.URL.prototype,key,{get(){return urls.get(this)[key];},set: key==='origin'?undefined:function(value){const state=urls.get(this),next=ask({op:'url',value:state.href,key,setValue:String(value)});Object.assign(state,next);if(state.params)parameters.get(state.params).text=next.search;}});
 const window=decode(roots.window),document=decode(roots.document),location=decode(roots.location);
 for(const [name,value] of Object.entries({window,self:window,top:window.top,document,location}))Object.defineProperty(global,name,{get:()=>value,set:deny});
 for(const property of ['getComputedStyle','getSelection','matchMedia'])Object.defineProperty(global,property,{get:()=>window[property],set:deny});
 for(const property of ['innerHeight','innerWidth','outerHeight','outerWidth','devicePixelRatio','pageXOffset','pageYOffset','scrollX','scrollY','visualViewport','CSS'])Object.defineProperty(global,property,{get:()=>window[property],set:deny});
 global.Element=class Element{static [Symbol.hasInstance](value){return refs.get(value)?.nodeType===1;}};
 global.Node=Object.freeze({ELEMENT_NODE:1,TEXT_NODE:3,DOCUMENT_NODE:9,DOCUMENT_FRAGMENT_NODE:11,DOCUMENT_POSITION_DISCONNECTED:1,DOCUMENT_POSITION_PRECEDING:2,DOCUMENT_POSITION_FOLLOWING:4,DOCUMENT_POSITION_CONTAINS:8,DOCUMENT_POSITION_CONTAINED_BY:16});
 global.setTimeout=(callback,delay=0,...args)=>setTimer(callback,Number(delay),...args);global.clearTimeout=clearTimer;delete global.__setTimer;delete global.__clearTimer;
 delete global.__readRpc;global.Function=undefined;global.eval=undefined;global.globalThis=undefined;
 return async function(source,arg,target,mode) {
  const fn=indirectEval(`(${source}\n)`);
  const result=typeof fn==='function'?await (mode==='page'?fn(decodeValue(arg)):fn(decode(target),decodeValue(arg))):fn;
  return JSON.stringify(encodeValue(result));
 };
}

export function encodeEvaluationValue(value,seen=new Set()) {
 if(value===undefined)return {type:'undefined'};
 if(value===null||typeof value==='string'||typeof value==='boolean')return {type:'value',value};
 if(typeof value==='number')return {type:'number',value:Object.is(value,-0)?'-0':String(value)};
 if(typeof value==='bigint')return {type:'bigint',value:String(value)};
 if(typeof value!=='object')throw Error('Evaluation arguments/results must be serializable data');
 if(seen.has(value))throw Error('Cyclic evaluation argument/result');seen.add(value);
 let result;
 if(value[Symbol.toStringTag]==='ReadOnlyDOM')result=encodeEvaluationValue(value.toJSON(),seen);
 else if(Object.prototype.toString.call(value)==='[object Date]')result={type:'date',value:value.toISOString()};
 else if(Object.prototype.toString.call(value)==='[object RegExp]')result={type:'regexp',value:value.source,flags:value.flags};
 else if(Array.isArray(value))result={type:'array',value:value.map(item=>encodeEvaluationValue(item,seen))};
 else if(Object.prototype.toString.call(value)==='[object Object]')result={type:'object',value:Object.entries(value).map(([key,item])=>[key,encodeEvaluationValue(item,seen)])};
 else throw Error('Unsupported evaluation argument/result type');
 seen.delete(value);return result;
}
export function decodeEvaluationValue(value) {
 switch(value.type){
  case 'undefined':return undefined;
  case 'value':return value.value;
  case 'number':return Number(value.value);
  case 'bigint':return BigInt(value.value);
  case 'date':return new Date(value.value);
  case 'regexp':return new RegExp(value.value,value.flags);
  case 'array':return value.value.map(decodeEvaluationValue);
  case 'object':return Object.fromEntries(value.value.map(([key,item])=>[key,decodeEvaluationValue(item)]));
  default:throw Error('Invalid serialized evaluation value');
 }
}
