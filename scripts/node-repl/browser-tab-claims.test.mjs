import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BrowserTabClaims} from './browser-tab-claims.mjs';

test('independent coordinators serialize races, keep retained leases and release only their own claims',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ocu-claims-test-'));
 try{
  const a=new BrowserTabClaims('/browser/one',root),b=new BrowserTabClaims('/browser/one',root),owners=[{},{}];
  const race=await Promise.allSettled([a.claim(owners[0],'user',true),b.claim(owners[1],'user',true)]);
  assert.equal(race.filter(value=>value.status==='fulfilled').length,1);
  const index=race[0].status==='fulfilled'?0:1,winner=[a,b][index],loser=[a,b][1-index],owner=owners[index],other=owners[1-index];
  assert.deepEqual(await loser.unavailable(other,['user']),['user']);
  await loser.release(other);await assert.rejects(loser.claim(other,'user',true),/another session or host/);
  const openers=new Map([['child','user'],['grandchild','child']]);await assert.rejects(loser.claim(other,'grandchild',true,openers),/opener belongs/);assert.deepEqual(await loser.unavailable(other,['child','grandchild'],openers),['child','grandchild']);
  await loser.claim(other,'preexisting',true);const independent=new Map([['preexisting','user'],['own-popup','preexisting']]);await loser.claim(other,'preexisting',true,independent);await loser.claim(other,'own-popup',false,independent);
  await winner.release(owner,new Set(['user']));await assert.rejects(loser.claim(other,'user',true),/another session or host/);
  await winner.release(owner);await loser.claim(other,'user',true);assert.deepEqual(await loser.unavailable(other,['user']),[]);
  await loser.claim(other,'created',false);assert.deepEqual(await loser.unavailable(other,['user','created']),['created']);
  await loser.release(other);assert.deepEqual(await winner.unavailable(owner,['user','created']),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a lost host cannot be impersonated by a new coordinator and a new browser has its own namespace',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ocu-claims-test-'));
 try{
  const first=new BrowserTabClaims('/browser/old',root),owner={};await first.claim(owner,'user',true);
  const replacement=new BrowserTabClaims('/browser/old',root);await assert.rejects(replacement.claim({},'user',true),/crashed host/);
  const fresh=new BrowserTabClaims('/browser/new',root),next={};await fresh.claim(next,'user',true);await fresh.release(next);
  await writeFile(path.join(first.slot('user'),'owner.json'),'{}');await assert.rejects(first.release(owner),/invalid/);await assert.rejects(replacement.claim({},'user',true),/invalid/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('claims refuse a symlinked shared directory',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ocu-claims-test-'));
 try{const link=path.join(root,'link');await symlink(root,link,'dir');await assert.rejects(new BrowserTabClaims('/browser/one',link).claim({},'user',true),/private/);}
 finally{await rm(root,{recursive:true,force:true});}
});
