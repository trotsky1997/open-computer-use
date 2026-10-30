import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaFilename,validateMediaRequest} from './browser-content.mjs';

test('media filenames use UTF-8 server names, sanitize paths/devices, and preserve usable extensions',()=>{
 const source={url:'https://example.test/image.php',download:'attribute.txt'};
 assert.equal(mediaFilename(source,{headers:{'Content-Disposition':`attachment; filename="fallback.txt"; filename*=UTF-8''%E4%BD%A0%E5%A5%BD.png`},contentType:'image/png'}),'你好.png');
 assert.equal(mediaFilename(source,{headers:{'content-disposition':'attachment; filename="../../secret.exe"'},contentType:'image/jpeg'}),'secret.jpg');
 assert.equal(mediaFilename(source,{headers:{'content-disposition':'attachment; filename="CON.txt"'},contentType:'text/plain'}),'media-CON.txt');
 assert.equal(mediaFilename(source,{contentType:'text/plain'}),'attribute.txt');
 assert.equal(mediaFilename({...source,download:'CON .txt'},{contentType:'text/plain'}),'media-CON.txt');
 assert.equal(mediaFilename({url:'https://example.test/photo.jpg',download:''},{contentType:null}),'photo.jpg');
 assert.equal(mediaFilename({url:'blob:https://example.test/uuid',download:''},{contentType:'audio/mpeg'}),'media.mp3');
 assert.ok(Buffer.byteLength(mediaFilename({url:source.url,download:'🦊'.repeat(500)+'.jpg'},{contentType:'image/jpeg'}))<=255);
});
test('media locator and timeout validation reject executable recipes and malformed arguments before IO',()=>{
 const request={action:'downloadMedia',targetId:'fixture',path:[{method:'locator',args:['img']}],options:{timeoutMs:0}};
 validateMediaRequest(request);
 for(const options of [null,[],{extra:true},{timeoutMs:-1},{timeoutMs:NaN},{timeoutMs:1.5},{timeoutMs:2147483648}])assert.throws(()=>validateMediaRequest({...request,options}));
 for(const path of [[],[{method:'evaluate',args:['fetch("file:///")']}],[{method:'locator',args:[{__ocuLocator:[{method:'click',args:[]}]}]}]])assert.throws(()=>validateMediaRequest({...request,path}));
 assert.throws(()=>validateMediaRequest({...request,url:'file:///private'}));
});
