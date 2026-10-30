import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gsuiteExport,youtubeVideo,playerResponse,captionTrack,captionText,verifyExport,BrowserContent} from './browser-content.mjs';

test('content endpoints preserve document/account/sheet identity and reject unsupported origins/types',()=>{
 const sheet=gsuiteExport('https://docs.google.com/spreadsheets/u/1/d/fixture_ID/edit?authuser=1#gid=25','csv');
 assert.equal(sheet.url,'https://docs.google.com/spreadsheets/u/1/d/fixture_ID/export?format=csv&authuser=1&gid=25');
 assert.equal(gsuiteExport('https://docs.google.com/presentation/d/fixture/edit','pptx').url,'https://docs.google.com/presentation/d/fixture/export/pptx');
 assert.equal(gsuiteExport('https://docs.google.com/document/d/fixture/edit','md').type,'md');
 assert.equal(new URL(gsuiteExport('https://docs.google.com/spreadsheets/d/fixture/edit?gid=0#gid=25','csv').url).searchParams.get('gid'),'25');
 for(const [url,type] of [['http://docs.google.com/document/d/id/edit','pdf'],['https://docs.google.com.evil.test/document/d/id/edit','pdf'],['https://docs.google.com/document/d/id/edit','xlsx'],['https://docs.google.com/document/d/e/published/pub','pdf'],['https://docs.google.com/spreadsheets/d/id/edit#gid=bad','csv'],['https://user:pass@docs.google.com/document/d/id/edit','pdf']])assert.throws(()=>gsuiteExport(url,type));
 assert.equal(youtubeVideo('https://www.youtube.com/watch?v=jNQXAC9IVRw&t=10').id,'jNQXAC9IVRw');
 for(const url of ['https://youtu.be/jNQXAC9IVRw','https://www.youtube.com/shorts/jNQXAC9IVRw','https://youtube.com/watch?v=jNQXAC9IVRw&v=other','https://youtube.com.evil.test/watch?v=jNQXAC9IVRw'])assert.throws(()=>youtubeVideo(url));
});
test('caption parsing uses matching video metadata, validates advertised URLs and preserves timestamped Unicode',()=>{
 const response={videoDetails:{videoId:'jNQXAC9IVRw'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{baseUrl:'https://www.youtube.com/api/timedtext?v=jNQXAC9IVRw&sig=fixture',languageCode:'zh',kind:'asr'}]}}};
 assert.deepEqual(playerResponse(`<script>var ytInitialPlayerResponse = ${JSON.stringify(response)};run();</script>`,'jNQXAC9IVRw'),response);
 assert.throws(()=>playerResponse(`ytInitialPlayerResponse=${JSON.stringify(response)}`,'another-id'));
 assert.deepEqual(playerResponse(`ytInitialPlayerResponse={"playabilityStatus":{"status":"LOGIN_REQUIRED"}};ytInitialPlayerResponse=${JSON.stringify(response)}`,'jNQXAC9IVRw'),response);
 assert.match(captionTrack(response,'jNQXAC9IVRw').url,/fmt=json3/u);
 assert.throws(()=>playerResponse('ytInitialPlayerResponse={"playabilityStatus":{"status":"LOGIN_REQUIRED"}}','jNQXAC9IVRw'),/LOGIN_REQUIRED/u);
 response.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl='https://evil.test/api/timedtext?v=jNQXAC9IVRw';
 assert.throws(()=>captionTrack(response,'jNQXAC9IVRw'),/match/u);
 assert.equal(captionText({events:[{tStartMs:1200,segs:[{utf8:'你好\n'},{utf8:'世界'}]},{tStartMs:3601000,segs:[{utf8:'Done'}]}]}),'[00:01] 你好 世界\n[1:00:01] Done');
 assert.throws(()=>captionText({events:[null]}));assert.throws(()=>captionText({events:[]}));assert.throws(()=>captionText({events:[{tStartMs:-1,segs:[{utf8:'bad'}]}]}));
});
test('export validation rejects login/error bodies and incorrect binary formats',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ocu-content-test-')),file=path.join(dir,'export');
 try{
  await writeFile(file,'');await verifyExport(file,'csv','text/csv');await verifyExport(file,'md','text/markdown');await assert.rejects(verifyExport(file,'pdf','application/pdf'),/Empty/u);
  await writeFile(file,'<!doctype html><title>Sign in</title>');await assert.rejects(verifyExport(file,'pdf','text/html'),/login/u);
  await writeFile(file,'<html>');await verifyExport(file,'csv','text/csv');await verifyExport(file,'md','text/markdown');
  await writeFile(file,'not a PDF');await assert.rejects(verifyExport(file,'pdf','application/pdf'),/signature/u);
  await writeFile(file,'%PDF-1.7 fixture');await verifyExport(file,'pdf','application/pdf');
  await writeFile(file,'你好,CSV\n');await verifyExport(file,'csv','text/csv; charset=utf-8');
  await assert.rejects(verifyExport(file,'csv','application/json'),/login/u);
  const api=new BrowserContent(()=>{throw Error('Unexpected IO');});await assert.rejects(api.request({},{action:'exportGsuite',targetId:'fixture',type:'zip'}),/Invalid/u);assert.equal(api.owners.size,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
