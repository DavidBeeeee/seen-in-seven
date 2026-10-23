import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseInstructions, parseTurns, turnKind, checkHookCraft, checkOpenLoopCraft, checkScriptCompleteness, chosenOptions, resolveStep, extractBannedTerms, extractOptions, evidenceWords, targetWords, memberListItems} from '../api/_lib/storysculpt-steps.js';
import handler, {referenceDocsForTurn, stepDirective, systemPrompt} from '../api/storysculpt.js';
const liveProviderKey=process.argv.includes('--live')?process.env.DEEPSEEK_API_KEY:null;

const instructions = readFileSync('api/_hub/storysculpt-src/instructions.txt','utf8');
const turns = parseTurns(instructions);
const raw = "I’m in the montage of failure. Movies gloss over the failure part. The era of suck is longer and harder than I expected.";
const thread = [{role:'user',content:raw},{role:'assistant',content:'NEXT QUESTION: Here is the draft.\n\n'+raw}];
assert.equal(checkHookCraft(['Movies gloss over the failure part.','My training montage apparently came with a lease.','The soundtrack ended before the hard part started.'],thread).ok,false);
assert.equal(checkHookCraft(['My training montage apparently came with a lease.','The soundtrack ended before the hard part started.','Cinema gave failure better lighting than success.'],thread).ok,true,'fresh imagery can share topic nouns');
assert.equal(checkHookCraft(['I’m in the montage of failure.','A second opening.','A third opening.'],[...thread,{role:'user',content:'Use my exact original line for option one.'}]).ok,true,'explicit exact-line requests retain agency');
assert.equal(checkHookCraft(['My training montage came with a lease.','My training montage came with a lease!','Something different.'],thread).ok,false);

for (const mode of ['bold','mini','rant']) {
  const hookLabel = mode==='rant'?'R6':`${mode==='bold'?'B':'M'}5`;
  const refine = hookLabel+'.5';
  const hookTurn = turns[mode].turns.find(t=>t.label===hookLabel);
  assert.equal(turnKind(hookLabel,'Entirely reworded prose').hookCraft,true,'wording changes cannot disable hook checks');
  assert.equal(turnKind(refine,'Entirely reworded prose').escalation,true);
  assert.equal(resolveStep({mode,currentStep:hookLabel,messages:[{role:'user',content:'1'}],turns:turns[mode].turns}),refine);
  assert.match(referenceDocsForTurn(mode,hookTurn),/Hooks|hooks/);
  assert.match(stepDirective(mode,hookLabel,hookTurn.text,thread),/CREATIVE CONTRACT/);
  assert.match(stepDirective(mode,refine,turns[mode].turns.find(t=>t.label===refine).text,[{role:'assistant',content:'Hook options\n1. Cinema gave failure better lighting than success.\n2. B.\n3. C.'},{role:'user',content:'1'}]),/THE CHOSEN HOOK TO REFINE: Cinema gave failure better lighting than success/);
}
for (const tone of ['Entertainment','Enragement','Epiphany','Empathy','Education']) {
  const ref = referenceDocsForTurn('rant',turns.rant.turns.find(t=>t.label==='R6'));
  assert.ok(ref.includes(tone),`the actual ${tone} examples reach hook generation`);
}
const picked = [{role:'assistant',content:'Hook options\n1. Cinema gave failure better lighting than success.\n2. B.\n3. C.'},{role:'user',content:'1'}];
assert.equal(checkOpenLoopCraft(['Cinema gave failure better lighting than success.','Another.','Third.'],picked).ok,false);
assert.equal(checkOpenLoopCraft(['And that is when everything changed.','Another.','Third.'],picked).ok,false);
const withRefinement = [...picked,{role:'assistant',content:'Stronger hooks\n1. The soundtrack quit before the hard part started.\n2. B.\n3. C.'},{role:'user',content:'1'},{role:'assistant',content:'Open loops\n1. Because the credits never showed how long that part lasts.\n2. B.\n3. C.'},{role:'user',content:'1'}];
assert.equal(chosenOptions(withRefinement).hook,'The soundtrack quit before the hard part started.');
assert.equal(chosenOptions(withRefinement).openLoop,'Because the credits never showed how long that part lasts.');

const complete = 'FINAL SCRIPT: The Montage\n\nI thought the hard part would fit between two songs, but movies leave out the days that look exactly like yesterday. That is the part I am in now. Does your awkward middle also feel longer than the whole movie? Follow along if the unfinished part is where you are too.';
const check = (content,stepLabel='R8',memberMessages=[])=>checkScriptCompleteness({content,stepLabel,memberMessages});
assert.equal(check(complete).ok,true);
assert.match(check(complete.replace('Follow along if the unfinished part is where you are too.','')).issue,/missing-cta/);
assert.match(check(complete.replace('Does your awkward middle also feel longer than the whole movie?','')).issue,/missing-audience-question/);
assert.equal(check(complete.replace('Follow along if the unfinished part is where you are too.',''),'F2',[{role:'user',content:'Remove the CTA.'}]).ok,true);
assert.equal(check(complete.replace('Does your awkward middle also feel longer than the whole movie?',''),'F2',[{role:'user',content:'No audience question please.'}]).ok,true);
assert.match(check(complete.replace('Follow along if the unfinished part is where you are too.',''),'F2',[{role:'user',content:"Don't remove the CTA."}]).issue,/missing-cta/);
const draft = 'NEXT QUESTION: '+complete.replace(/^FINAL SCRIPT: The Montage\n\n/,'').replace('Does your awkward middle also feel longer than the whole movie?','')+'\n\nWould you like to change anything, or should I move on to the hooks?';
assert.match(check(draft,'R5').issue,/missing-audience-question/,'the app approval question is not audience engagement');
assert.equal(check('NEXT QUESTION: '+complete.replace(/^FINAL SCRIPT: The Montage\n\n/,'').replace('Does your','\n\nDoes your').replace('Follow along','\n\nFollow along')+'\n\nHow does this sound?','R5').ok,true,'short closing paragraphs count as spoken parts');

// Real handler: after bounded retries, missing final parts or copied hooks
// never advance the saved step or masquerade as a finished deliverable.
process.env.RATE_LIMIT_SECRET='craft-test-'.padEnd(40,'x');
process.env.GUEST_SESSION_SECRET='craft-test-'.padEnd(40,'y');
process.env.DEEPSEEK_API_KEY='craft-test-placeholder';
const priorFetch=globalThis.fetch;
try {
  for (const scene of [
    {step:'R7',pick:'1',reply:complete.replace('Follow along if the unfinished part is where you are too.',''),expected:'missing-cta'},
    {step:'R5',pick:'Looks good, go for the hooks',reply:'NEXT QUESTION: Hook options\n1. Movies gloss over the failure part.\n2. My training montage apparently came with a lease.\n3. The soundtrack ended before the hard part started.\nWhich hook?',expected:'hook-extracted'}
  ]) {
    let writes=0, calls=0;
    const events=[];
    globalThis.fetch=async (url,init={})=>{
      const u=String(url);let data;
      if(u.includes('/auth/v1/user'))data={id:'fixture'};
      else if(u.includes('has_studio_app_access')||u.includes('quota'))data=true;
      else if(u.includes('storysculpt_projects')){if(init.method==='PATCH')writes++;data=[{id:'22222222-2222-4222-8222-222222222222',content_type:'rant',output:null,intake:{current_step:scene.step}}];}
      else if(u.includes('record_log_event')){events.push(JSON.parse(init.body));data=null;}
      else if(u.includes('deepseek.com')){calls++;data={choices:[{message:{content:scene.reply}}]};}
      else throw Error('Unexpected fixture request');
      return {ok:true,status:200,json:async()=>data};
    };
    const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await handler({method:'POST',headers:{authorization:'Bearer fixture'},body:{mode:'rant',projectId:'22222222-2222-4222-8222-222222222222',intent:'interview',messages:[{role:'user',content:raw},{role:'assistant',content:'What is next?'},{role:'user',content:scene.pick}]}},res);
    assert.equal(res.code,502,JSON.stringify(res.body));
    assert.equal(res.body.rejected,scene.expected);
    assert.equal(calls,3,'at most two repairs after the first attempt');
    assert.equal(writes,0,'failure cannot move the saved step');
    assert.equal(events.at(-1).p_event_type,'storysculpt_output_rejected');
  }
} finally {globalThis.fetch=priorFetch;}
console.log('PASS: fresh hook craft, chosen-hook refinement, all 5E references, useful loops, CTA/audience completeness, explicit opt-outs, and bounded non-advancing failures.');

// Optional, bounded real-provider comparison. Normal npm tests never call a
// provider or read credentials. No customer project or Supabase row is written.
if (process.argv.includes('--live')) {
  if(!liveProviderKey||liveProviderKey.length<20)throw Error('Run live evaluation through the existing preview environment; normal tests never retrieve secrets.');
  const key=liveProviderKey;
  const baseline='68ec1cb';
  const oldApi=execFileSync('git',['show',`${baseline}:api/storysculpt.js`],{encoding:'utf8'});
  const oldText=execFileSync('git',['show',`${baseline}:api/_hub/storysculpt-src/instructions.txt`],{encoding:'utf8'});
  const banned=extractBannedTerms(readFileSync('api/_lib/blueprints.txt','utf8'));
  const oldParsed={globalText:oldText.slice(0,oldText.indexOf('\n/Bold:')).split('\nCommands to follow')[0].trim().replace(/^(BANNED WORDS:[^\n]*)/m,(_,line)=>line+'\n'+banned.join('\n'))}, oldTurns=parseTurns(oldText);
  const oldTurnFor=(mode,label)=>oldTurns[mode].turns.find(t=>t.label===label);
  const extract=(start,end)=>oldApi.slice(oldApi.indexOf(start),oldApi.indexOf(end,oldApi.indexOf(start))).replace(/^export /,'');
  const oldSystem=new Function('TURNS','turnFor','PARSED_INSTRUCTIONS',extract('export function systemPrompt(','\n// The binding instruction')+';return systemPrompt;')(oldTurns,oldTurnFor,oldParsed);
  const oldDirective=new Function('turnKind','evidenceWords','targetWords','memberListItems','chosenOptions',extract('export function stepDirective(','\n// Everything the member supplied')+';return stepDirective;')(turnKind,evidenceWords,targetWords,memberListItems,chosenOptions);
  const rows=[];
  async function generate(messages,maxTokens=550){
    const r=await priorFetch('https://api.deepseek.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-v4-pro',messages,temperature:0.86,max_tokens:maxTokens,thinking:{type:'disabled'}}),signal:AbortSignal.timeout(60000)});
    if(!r.ok)throw Error(`Provider HTTP ${r.status}`);
    const d=await r.json();return {content:d.choices?.[0]?.message?.content||'',usage:d.usage};
  }
  for(const tone of ['Entertainment','Epiphany']){
    const history=[{role:'user',content:raw},{role:'assistant',content:'Who or what is the target?'},{role:'user',content:'Movies that make the failure period look quick.'},{role:'assistant',content:'How long?'},{role:'user',content:'60 seconds'},{role:'assistant',content:'Choose your tone.'},{role:'user',content:tone},{role:'assistant',content:'NEXT QUESTION: Here is the approved draft.\n\n'+raw},{role:'user',content:'Looks good, go for the hooks'}];
    for(const version of ['before','after']){
      const turn=version==='before'?oldTurnFor('rant','R6'):turns.rant.turns.find(t=>t.label==='R6');
      const refs=referenceDocsForTurn('rant',turn);
      const system=version==='before'?oldSystem('rant','R6',turn.text,refs):systemPrompt('rant','R6',turn.text,refs);
      const directive=version==='before'?oldDirective('rant','R6',turn.text,history):stepDirective('rant','R6',turn.text,history);
      const output=await generate([{role:'system',content:system},...history,{role:'user',content:directive}]);
      const craft=checkHookCraft(extractOptions(output.content),history);
      const row={tone,version,content:output.content,craft,usage:output.usage};rows.push(row);
      console.log(JSON.stringify({comparison:row}));
      if(version==='after'){assert.equal(extractOptions(output.content).length,3);assert.equal(craft.ok,true,'new live hooks must be fresh');}
    }
  }
  const entertainment=rows.find(r=>r.tone==='Entertainment'&&r.version==='after');
  const history=[{role:'user',content:raw},{role:'user',content:'60 seconds'},{role:'user',content:'Entertainment'},{role:'assistant',content:entertainment.content},{role:'user',content:'1'}];
  for(const [label,pick,maxTokens] of [['R6.5','2',550],['R7','1',550],['R8',null,1100]]){
    const turn=turns.rant.turns.find(t=>t.label===label);
    const output=await generate([{role:'system',content:systemPrompt('rant',label,turn.text,referenceDocsForTurn('rant',turn))},...history,{role:'user',content:stepDirective('rant',label,turn.text,history)}],maxTokens);
    console.log(JSON.stringify({liveFlow:{step:label,...output}}));
    if(label==='R8')assert.equal(checkScriptCompleteness({content:output.content,stepLabel:label,turnText:turn.text,memberMessages:history}).ok,true,'live final includes the question and CTA');
    else assert.equal(extractOptions(output.content).length,3);
    history.push({role:'assistant',content:output.content});if(pick)history.push({role:'user',content:pick});
  }
  console.log('PASS live comparison and Entertainment refinement-to-final; samples require editorial review, not a claim of universal quality.');
}
