// Admin-only copy of the SeenInSeven question catalog. Keep labels aligned with js/app.js.
const PROMPT_QUESTION_CATALOG = {
  "easy": {
    "l1": [
      null,
      {"label":"What should someone know about your background, what makes you unexpected, and what you naturally care about?","hint":"Share whatever feels most important. The AI will organize it into the story.","key":"easyAnswer_v1"},
      {"label":"What is one thing you used to think was true that is not true?","hint":"Explain how it shaped you, what made you question it, and why the old way of thinking matters.","key":"easyAnswer_v2"},
      {"label":"What has making these videos actually been like so far?","hint":"Compare it with what you expected, share one real detail, and include what is changing, what is still difficult, and why you are continuing.","key":"easyAnswer_v3"},
      {"label":"In the part of your life you have been discussing, what failure, loss, or period was so devastating that you thought it might ruin you or that you might never recover? What did you do, avoid, refuse to see, or get completely wrong that made it your fault?","hint":"Tell us what collapsed, what you believed might be gone forever, and why you could not see a way back. Include what you tried afterward that still failed. Answer from who you were while it was happening, before you knew what you would eventually learn.","key":"easyAnswer_v4"},
      {"label":"What larger truth did you discover because you lived through that difficult experience?","hint":"Describe how you discovered it, what it changed in you, and who else may need to understand it.","key":"easyAnswer_v5"},
      {"label":"Who were you before these realizations, and who are you now?","hint":"Describe what changed, what remains unfinished, what telling the story helped you understand, and where you go next.","key":"easyAnswer_v6"}
    ],
    "l2": [
      null,
      {"label":"What part of your past kept shaping you before you understood why?","hint":"Describe the everyday life you were in, the thread or unlikely chapter that kept showing up, and why you did not recognize or follow it yet.","key":"easyAnswer_v1"},
      {"label":"What is one thing you used to think was true about your work or field that experience proved was wrong or incomplete?","hint":"Describe the real situation that exposed the problem, the new lens you earned, what the old thinking costs, and why this matters to the people you understand.","key":"easyAnswer_v2"},
      {"label":"Where has your first professional realization met the reality of communicating your expertise publicly?","hint":"Describe one concrete moment, what your usual expert instinct wanted to do, what you did instead, what it revealed, and what remains difficult.","key":"easyAnswer_v3"},
      {"label":"In the work, craft, calling, or expertise story you have been telling, what failure was so devastating that you thought what you had built or hoped to build might never recover? What did you do, avoid, refuse to see, or get completely wrong that made it your fault?","hint":"Tell us what collapsed, what seemed permanently lost, and why you could not see a way back in this part of your life. Include what you tried afterward that still failed. Answer from who you were while it was happening, before you knew what you would eventually learn.","key":"easyAnswer_v4"},
      {"label":"What larger professional truth did that difficult experience force you to understand, and how did it deepen the first realization you shared?","hint":"Trace how the truth emerged through the aftermath or rebuilding, what it changed in your work or decisions, and what useful lens it gives someone facing the problem now.","key":"easyAnswer_v5"},
      {"label":"Who were you before the two professional realizations and the hardest part of the story, and who are you now in relation to your expertise and the people you want to reach?","hint":"Describe what genuinely changed, what remains unfinished or still needed, what telling the story clarified about your work, and what perspective or mission you want the right viewer to keep following.","key":"easyAnswer_v6"}
    ]
  },
  "l1": [
    {
      "title": "I'm Doing This",
      "note": "These are pre-filled from your earlier answers. Edit anything that doesn't sound exactly like you, then generate your script.",
      "prompts": []
    },
    {
      "title": "Here's Who I Am",
      "note": "Let people meet the person behind the videos: where you came from, something they might not expect, and what naturally holds your attention. You do not need to explain what it all means yet.",
      "prompts": [
        {"label":"What part of your background or everyday life would help someone understand you better?","hint":"Choose one part of where you came from, what your life looked like, or an experience that left a mark. You do not need to tell your entire life story.","key":"v1p0","placeholder":"Share the part of your background that helps someone understand you."},
        {"label":"What is something about you that people usually do not expect?","hint":"It could be an interest, habit, skill, obsession, contradiction, past chapter, or part of your personality that does not fit the obvious version of you.","key":"v1p1","placeholder":"Share something real about you that people may not expect."},
        {"label":"What do you find yourself caring about, noticing, or returning to, even when nobody asks you to?","hint":"What gets your attention, bothers you, fascinates you, or makes you want to say something? Why does it matter to you personally?","key":"v1p2","placeholder":"Describe what naturally keeps drawing your attention and why you care."}
      ]
    },
    {
      "title": "What I Used To Think Was True",
      "note": "Share one thing you used to think was true, the experience that made you question it, and why that old way of thinking matters. The script will shape the larger realization from your answers.",
      "prompts": [
        {"label":"What is one thing you used to think was true (that isn't true), and how did it shape the way you acted, waited, chose, or saw yourself?","hint":"Choose something that affected real decisions, not a minor opinion you happened to change.","key":"v2p0","placeholder":"Describe what you used to think was true and how it affected your life."},
        {"label":"What experience, moment, or repeated pattern first made you question whether it was actually true?","hint":"If there was one clear moment, describe it. If the change happened gradually, describe the evidence that kept piling up.","key":"v2p1","placeholder":"Describe what made the old idea stop making sense."},
        {"label":"What does continuing to think the old way quietly cost someone, and why do you care enough to say that aloud?","hint":"Name the honest consequence and why another person recognizing it matters to you.","key":"v2p2","placeholder":"Describe the cost of the old way of thinking and why you want to name it."}
      ]
    },
    {
      "title": "Here's What It's Actually Been Like",
      "note": "Report honestly from the middle. Compare the experience with what you expected, notice any early change, name what remains difficult, and explain why you are continuing.",
      "prompts": [
        {"label":"What has making these videos actually been like so far, compared with what you expected? Share one moment or detail that captures the difference.","hint":"What has been stranger, easier, harder, quieter, more emotional, or more ordinary than you imagined? Include something you did, almost did, noticed, avoided, or handled differently.","key":"v3p0","placeholder":"Describe the reality so far and one detail that captures it."},
        {"label":"What, if anything, is beginning to change in the way you approach recording, posting, or trusting yourself?","hint":"A small change counts. It is also fine if the change is incomplete or difficult to describe.","key":"v3p1","placeholder":"Describe any small change you are beginning to notice."},
        {"label":"What is still difficult, awkward, uncertain, or unresolved right now?","hint":"Name the specific part you have not conquered. The middle is allowed to remain messy.","key":"v3p2","placeholder":"Describe what is still difficult or unresolved."},
        {"label":"Why are you continuing even though that part is still difficult?","hint":"What is enough to make you record the next video even without certainty that this is working?","key":"v3p3","placeholder":"Describe the honest reason you are continuing."}
      ]
    },
    {
      "title": "The Hardest Part",
      "note": "Now we are returning to the larger story you have been telling, not the experience of making these videos. This is the chapter where things went as badly as they could have gone. Choose the failure, loss, or period when you genuinely wondered whether you would recover. Do not tell us what you eventually learned or how everything worked out. Answer from who you were while it was happening, before you could see a way forward.",
      "prompts": [
        {"label":"Thinking about the main part of your life you have been discussing, what failure, loss, or period brought you closest to believing you might never recover?","hint":"Choose something that actually happened, rather than something you feared might happen. It could involve your work, money, family, health, identity, reputation, relationships, or the future you thought you were building. If there was not one dramatic event, describe the period when everything gradually fell apart.","key":"v4p0","placeholder":"Describe the failure, loss, or period when you thought you might not recover."},
        {"label":"Take us to the moment you realized this was more than an ordinary setback. What had happened, and what made you think your life might not return to normal?","hint":"Give us something we can picture. Where were you? Who else was affected? What had just happened? What did you see, hear, lose, or finally understand that made the seriousness impossible to ignore?","key":"v4p4","placeholder":"Describe the moment the full seriousness became real."},
        {"label":"Why was it your fault? What did you do, avoid, ignore, refuse to admit, or get completely wrong that caused the failure or made it worse?","hint":"You do not have to make yourself the villain. Look for the decision that was yours: the warning you ignored, the conversation you avoided, the risk you underestimated, the pattern you kept repeating, or the moment you knew better and continued anyway. Tell us what you should have done differently and why you did not do it.","key":"v4p1","placeholder":"Describe the decision, avoidance, or blind spot that was yours."},
        {"label":"What did this failure take from you, and what did you believe might be permanently over because of it?","hint":"Go beyond saying it was difficult. What future disappeared? What relationship, livelihood, trust, identity, opportunity, belonging, confidence, or sense of purpose seemed impossible to restore? Why did that particular loss feel capable of ruining you?","key":"v4p2","placeholder":"Describe what seemed permanently lost and why it mattered so much."},
        {"label":"What did you try afterward that still did not fix it, and what did you believe about yourself or your future when you could no longer see a way back?","hint":"Tell us about the attempted recovery that failed. What did you try to repair, replace, escape, prove, or force? What remained broken afterward? End before the realization or comeback. The next part of your story will deal with what eventually changed.","key":"v4p3","placeholder":"Describe the failed recovery and the lowest point before you could see a way forward."}
      ]
    },
    {
      "title": "What I See Differently Now",
      "note": "Share the larger realization you discovered because you lived through the hardest part of your story. This should deepen the first realization, not repeat it.",
      "prompts": [
        {"label":"What is the biggest thing you eventually understood because you lived through the difficult experience you just described?","hint":"Choose something you could not have fully understood before living through it. Say it in your own words.","key":"v5p0","placeholder":"Describe the larger truth the difficult experience taught you."},
        {"label":"How did you come to understand that? Was there a moment when it became clear, or did you recognize it gradually?","hint":"Describe the experience, evidence, conversation, consequence, or repeated pattern that brought the deeper truth into focus.","key":"v5p1","placeholder":"Describe how the larger realization became clear."},
        {"label":"How did this larger realization change the way you understand your first realization or the person you were before it?","hint":"What became deeper, more complete, or different after the hard experience?","key":"v5p2","placeholder":"Describe how the second realization changed your understanding of the first."},
        {"label":"What changed in who you became, the choices you made, or the way you live because you understood this?","hint":"Describe real consequences in your life. The change can be imperfect or ongoing.","key":"v5p3","placeholder":"Describe what genuinely changed in you or your life."},
        {"label":"Who most needs to understand what you discovered, and what might it help them see differently?","hint":"Think of someone still living inside the part of the story you have already lived through.","key":"v5p4","placeholder":"Describe who needs this realization and what it could help them see."}
      ]
    },
    {
      "title": "What I Learned",
      "note": "Close the larger life story you have told. Compare who you were before both realizations with who you are now, acknowledge what remains, and connect the seven videos to what comes next.",
      "prompts": [
        {"label":"Before either of the realizations you have talked about, who were you and how did you see yourself or this part of your life?","hint":"Think about how you thought, chose, or moved through the world before the first truth changed and before the difficult experience that led to the second one.","key":"v6p0","placeholder":"Describe who you were and how you saw this part of your life before either realization."},
        {"label":"Who are you now, and what is genuinely different in the way you think, choose, respond, or live?","hint":"Point to real differences rather than saying you are a completely different person. What would the earlier version of you notice?","key":"v6p1","placeholder":"Describe who you are now and what is genuinely different."},
        {"label":"What part of the earlier version of you is still present or still being worked through?","hint":"Growth does not erase a person. What remains complicated, unfinished, useful, or recognizably you?","key":"v6p2","placeholder":"Describe what remains present or unfinished."},
        {"label":"What did telling this story across seven videos help you notice, understand, or finally put into words about your larger story?","hint":"The videos did not create your entire transformation. What did telling the story help you connect or express?","key":"v6p3","placeholder":"Describe what telling the story helped you understand or express."},
        {"label":"What are you carrying forward from everything you lived and learned, and where do you want your story to go next?","hint":"You do not need a complete plan. Name the truth, direction, relationship, work, or possibility that now matters enough to continue.","key":"v6p4","placeholder":"Describe what you are carrying forward and where the story goes next."}
      ]
    }
  ],
  "l2": [
    {
      "title": "I'm Doing This",
      "note": "These are pre-filled from your earlier answers. Edit anything that doesn't sound exactly like you, then generate your script.",
      "prompts": []
    },
    {
      "title": "How I Got Here",
      "note": "Your audience needs to understand the path that formed what you know. Stay with the detour, wound, obsession, or unlikely chapter before you understood its professional meaning. This is the origin, not the industry lesson yet.",
      "prompts": [
        {
          "label": "How did you get into this? Skip the polished professional answer. What is the real story of how you ended up knowing what you know?",
          "hint": "Maybe it was accidental. Maybe you were trying to solve your own problem. Maybe someone else's problem landed in your lap and you realized you were good at this. What actually happened?",
          "key": "v1p0",
          "placeholder": "e.g. I got into this because my sister was drowning in debt after her divorce and I helped her build a plan that got her out in 18 months. Her friends started asking me for help. Then their friends."
        },
        {
          "label": "What detour, wound, obsession, or unlikely chapter shaped the way you understand this work?",
          "hint": "The part of the story that may not look professional on paper but changed what you notice, care about, or do differently. Give one concrete detail.",
          "key": "v1p1",
          "placeholder": "Describe the chapter that formed your lens before you had language for it."
        },
        {
          "label": "What did you misunderstand or resist about treating that path as expertise, and why does this work matter to you personally now?",
          "hint": "Start inside the earlier perspective: why did the chapter look irrelevant, unprofessional, or unworthy of claiming? Then name the human reason the work matters to you now without turning it into an industry lesson or business pitch.",
          "key": "v1p2",
          "placeholder": "Describe what you resisted about the path and why the work matters personally now."
        }
      ]
    },
    {
      "title": "What I See Differently",
      "note": "Seven beats, one shift. You're not sharing a hot take. You're sharing a genuine paradigm shift. Something 'everyone knows' in your field that you've come to believe is wrong, the moment you saw the cracks, and the reframe that changes everything.",
      "prompts": [
        {
          "label": "What's something that 'everyone knows' in your field or area of expertise that you've come to believe is wrong, incomplete, or actually harmful?",
          "hint": "The advice that gets passed around like gospel. The method everyone defaults to. The first thing a beginner is told that a veteran knows is oversimplified. You've been close enough to see the cracks in it. What is it?",
          "key": "v2p0",
          "placeholder": "e.g. everyone says 'make a budget and stick to it'... the discipline narrative. I've watched hundreds of people make perfect budgets and fail completely within three weeks."
        },
        {
          "label": "Tell the story of when you first saw the cracks. What actually happened (the specific moment, client, project, or experience) that made you go 'wait, this doesn't work the way everyone says it does'?",
          "hint": "A real story. Not 'I gradually realized over time.' A SCENE. The client who succeeded by doing the opposite. The project that failed despite following the playbook perfectly.",
          "key": "v2p1",
          "placeholder": "e.g. I had a client, smart woman, good job, made great money. She'd done every budget app, every system. Nothing stuck. An hour of conversation revealed she wasn't overspending from lack of discipline. She was overspending because spending was the only way she knew how to soothe herself after a bad day."
        },
        {
          "label": "What's actually true instead? Say it as plainly as you can, like you're letting someone in on something the industry doesn't want to admit.",
          "hint": "The reframe. The new lens. If the old belief is the map everyone's using, your reframe shows them the map is wrong and the real terrain looks different. Make it feel inevitable. Not clever, not contrarian. Just true.",
          "key": "v2p2",
          "placeholder": "e.g. money problems are almost never math problems. They're emotional regulation problems wearing a math costume. Until you address why someone spends, no spreadsheet on earth will save them."
        },
        {
          "label": "What happens to people who keep following the conventional wisdom? What does it cost them that they don't even realize?",
          "hint": "You've watched people go down this path. What do they sacrifice, waste, or miss because they're following a map that doesn't match the territory? Be specific. Not 'they fail' but HOW they fail, what it looks like from the inside.",
          "key": "v2p3",
          "placeholder": "e.g. they keep failing at budgets and thinking THEY'RE broken. They're not broken. The approach is broken. They just keep getting more ashamed every time they 'fail' at something that was never designed to work for them."
        },
        {
          "label": "Why do you feel like this needs to be said? What's at stake if people in your space keep getting this wrong?",
          "hint": "This is where your passion lives. The reason you can't just let this go. Maybe people are wasting years. Maybe the shame spiral is costing people their relationships. Why does this matter enough to put on camera?",
          "key": "v2p4",
          "placeholder": "e.g. because the shame spiral is killing people. Financial stress is the number one cause of relationship problems and one of the top causes of anxiety and depression. And we're out here telling people to track their lattes."
        }
      ]
    },
    {
      "title": "What The Work Looks Like",
      "note": "Your first professional realization now has to survive public practice. Show one concrete collision between your expert instincts and the new behavior visibility required. Authority comes from how you read the experience, not from teaching or reporting progress.",
      "prompts": [
        {
          "label": "Tell me about one specific moment when your usual expert instinct showed up while you were communicating publicly.",
          "hint": "A real scene. What were you tempted to overexplain, hide, control, perfect, dismiss, or avoid? What would you normally have done?",
          "key": "v3p0",
          "placeholder": "Describe the exact public moment and the expert habit it triggered."
        },
        {
          "label": "What did you actually do differently this time?",
          "hint": "Make the change observable. What did you simplify, say plainly, leave imperfect, publish, ask, or allow the audience to see?",
          "key": "v3p1",
          "placeholder": "Describe the different action you took in that moment."
        },
        {
          "label": "What happened because you acted differently, and what did it reveal about your expertise or communication?",
          "hint": "Use only a real result. It can be something you noticed internally; you do not need a client, comment, message, metric, or public response.",
          "key": "v3p2",
          "placeholder": "Describe the real consequence and what made it unexpected."
        },
        {
          "label": "What is still difficult about being seen doing this work, even after that small win?",
          "hint": "Name the remaining friction specifically. This is one test, not proof that visibility is solved, and the unresolved cost prepares the hardest part of the story in Video 5.",
          "key": "v3p3",
          "placeholder": "Describe where the old expert pattern still has a hold on you."
        }
      ]
    },
    {
      "title": "The Hardest Part",
      "note": "Now we are returning to the larger work, craft, calling, or expertise story you have been telling, not the experience of making these videos. This is the chapter where what you had built or hoped to build came closest to collapsing. Choose the failure or period when you genuinely wondered whether this part of your future would recover. Do not tell us what you eventually learned or how everything worked out. Answer from who you were while it was happening.",
      "prompts": [
        {
          "label": "Thinking about the work, craft, calling, or expertise story you have been discussing, what failure or period brought you closest to believing what you had built or hoped to build might never recover?",
          "hint": "Choose something that actually happened, rather than something you feared might happen. You do not need to own a business or have clients. If there was not one dramatic event, describe the period when your work, confidence, reputation, livelihood, direction, or hoped-for future gradually fell apart.",
          "key": "v4p0",
          "placeholder": "Describe the failure or period when what you had built or hoped to build seemed lost."
        },
        {
          "label": "Take us to the moment you realized this was more than an ordinary professional setback. What had happened, and what made the consequences feel impossible to repair?",
          "hint": "Give us something we can picture. Where were you? Who else was affected? What result, conversation, loss, message, or realization made the seriousness impossible to ignore?",
          "key": "v4p4",
          "placeholder": "Describe the moment the full professional seriousness became real."
        },
        {
          "label": "Why was it your fault? What did you do, avoid, ignore, refuse to admit, overestimate, or get completely wrong that caused the failure or made it worse?",
          "hint": "Look for the professional decision that was yours: the warning you ignored, the conversation you avoided, the risk you underestimated, the responsibility you mishandled, or the moment you knew better and continued anyway. Tell us what you should have done differently and why you did not do it.",
          "key": "v4p1",
          "placeholder": "Describe the professional decision, avoidance, or blind spot that was yours."
        },
        {
          "label": "What did this failure take from you, your work, or the people who depended on you, and what did you believe might be permanently over?",
          "hint": "Go beyond saying it was difficult. What livelihood, credibility, trust, opportunity, relationship, body of work, identity, or future seemed impossible to restore? Why did that loss feel capable of ending everything you had built?",
          "key": "v4p2",
          "placeholder": "Describe what seemed permanently lost professionally and why it mattered so much."
        },
        {
          "label": "What did you try afterward that still did not fix it, and what did you believe about yourself or your future when you could no longer see a professional way back?",
          "hint": "Tell us about the attempted recovery that failed. What did you try to repair, replace, explain, prove, or force? What remained broken afterward? End before the realization or comeback. The next part of your story will deal with what eventually changed.",
          "key": "v4p3",
          "placeholder": "Describe the failed recovery and the professional lowest point before you could see a way forward."
        }
      ]
    },
    {
      "title": "What The Hardest Part Taught Me",
      "note": "This is the larger professional truth earned through the difficult experience you just described. It must deepen or correct the first realization rather than becoming another unrelated hot take. Show how the defeat changed your understanding, your work, and the lens you can now give someone else.",
      "prompts": [
        {
          "label": "Looking back at the difficult experience you just described, what larger truth about your work, your field, or the people you serve became impossible for you to ignore?",
          "hint": "Choose the truth you could not have earned before that defeat. It may challenge familiar advice, but it must grow directly from what happened to you rather than becoming a separate industry opinion.",
          "key": "v5p0",
          "placeholder": "Describe the larger professional truth the difficult experience made impossible to ignore."
        },
        {
          "label": "How did that truth become clear through the aftermath, failed recovery, or rebuilding?",
          "hint": "Walk through the evidence. What did you try, notice, lose, rebuild, or finally stop doing that changed your interpretation of the failure? Give the story that earned the truth instead of jumping straight to the lesson.",
          "key": "v5p1",
          "placeholder": "Describe how the larger truth emerged through the aftermath or rebuilding."
        },
        {
          "label": "How does this larger realization deepen, correct, or complete the first professional realization you shared earlier?",
          "hint": "The first realization changed the direction of the story. The difficult experience showed what that lens still could not explain. Name what became more complete without simply repeating the first insight.",
          "key": "v5p2",
          "placeholder": "Describe how the second realization changes or completes the first."
        },
        {
          "label": "What changed in the way you work, decide, communicate, or help people once you understood this?",
          "hint": "Make the larger truth observable. Describe a real choice, standard, boundary, method, or way of seeing that changed because the difficult experience taught you something theory could not.",
          "key": "v5p3",
          "placeholder": "Describe what genuinely changed in your work or decisions."
        },
        {
          "label": "Who is still facing this problem the way you once did, and what could this truth help them recognize or do differently?",
          "hint": "Picture one specific person whether or not they are a client. What are they misreading, repeating, or blaming themselves for? Give them the useful lens you paid for through experience.",
          "key": "v5p4",
          "placeholder": "Describe who needs this lens and what it could help them recognize."
        }
      ]
    },
    {
      "title": "What I Carry Forward",
      "note": "Close the larger expert story, not merely the filming experience. Compare your earlier relationship to your expertise with who you are now, acknowledge what remains unfinished, name what telling the story clarified, and open an ongoing relationship with the people who value your perspective.",
      "prompts": [
        {
          "label": "Before the two professional realizations and the hardest part of the story, how did you see your expertise, your place in the work, and your right to speak about it publicly?",
          "hint": "Return to the person behind Video 1 and the origin in Video 2. What did you believe made knowledge count? What were you waiting to prove, earn, perfect, or receive permission for?",
          "key": "v6p0",
          "placeholder": "Describe your earlier relationship to your expertise and public voice."
        },
        {
          "label": "Who are you now in relation to your expertise and the people you want to reach, and what do you do differently because of what you lived through?",
          "hint": "Make the return observable. Name a real change in how you decide, communicate, practice, teach, create, lead, or allow yourself to be seen.",
          "key": "v6p1",
          "placeholder": "Describe who you are now and what is genuinely different in your work or public voice."
        },
        {
          "label": "What remains unfinished, and what do you still need in order to grow into the work, impact, or public role you now see more clearly?",
          "hint": "Authority does not require pretending you are complete. Name the specific skill, support, courage, structure, experience, or unresolved tension that belongs to the next chapter without asking the audience to rescue you.",
          "key": "v6p2",
          "placeholder": "Describe what remains unfinished or what you still need."
        },
        {
          "label": "What did telling this larger story across seven videos help you understand or finally put into words about your work and the people you understand?",
          "hint": "The videos did not create your expertise or your whole transformation. What connection, pattern, responsibility, audience, or professional truth became clearer when you had to tell the complete story?",
          "key": "v6p3",
          "placeholder": "Describe what telling the story helped you clarify about your work and audience."
        },
        {
          "label": "What perspective, work, or mission are you carrying forward, and why would the right person want to keep following where you take it?",
          "hint": "Name the direction and the relationship, not an offer. What will you keep noticing, questioning, building, practicing, or saying that makes your continuing story worth staying connected to?",
          "key": "v6p4",
          "placeholder": "Describe what you are carrying forward and why the right viewer should stay."
        }
      ]
    }
  ]
};
