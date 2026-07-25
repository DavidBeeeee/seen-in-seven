// Admin-only copy of the SeenInSeven question catalog. Keep labels aligned with js/app.js.
const PROMPT_QUESTION_CATALOG = {
  "easy": {
    "l1": [
      null,
      {"label":"What should someone know about your background, what makes you unexpected, and what you naturally care about?","hint":"Share whatever feels most important. The AI will organize it into the story.","key":"easyAnswer_v1"},
      {"label":"What is one thing you used to think was true that is not true?","hint":"Explain how it shaped you, what made you question it, and why the old way of thinking matters.","key":"easyAnswer_v2"},
      {"label":"After your first realization, what did you do differently and what happened when real life tested it?","hint":"Describe the actions you changed, the situations that challenged you, what began working, what that success made you believe, and what still felt unresolved.","key":"easyAnswer_v3"},
      {"label":"In the part of your life you have been discussing, what failure, loss, or period was so devastating that you thought it might ruin you or that you might never recover? What did you do, avoid, refuse to see, or get completely wrong that made it your fault?","hint":"Tell us what collapsed, what you believed might be gone forever, and why you could not see a way back. Include what you tried afterward that still failed. Answer from who you were while it was happening, before you knew what you would eventually learn.","key":"easyAnswer_v4"},
      {"label":"What larger truth did you discover because you lived through that difficult experience?","hint":"Describe how you discovered it, what it changed in you, and who else may need to understand it.","key":"easyAnswer_v5"},
      {"label":"Who were you before these realizations, and who are you now?","hint":"Describe what changed, what remains unfinished, what telling the story helped you understand, and where you go next.","key":"easyAnswer_v6"}
    ],
    "l2": [
      null,
      {"label":"Before you treated this as expertise, what ability or interest kept showing up, and why did you refuse to take it seriously?","hint":"Describe the ordinary work or life you were in, what other people might have valued before you did, and why staying where you were felt safer or more responsible.","key":"easyAnswer_v1"},
      {"label":"What is one thing you used to think was true about your work or field that another person helped you question?","hint":"Describe who guided you, what they helped you notice, what happened when you tested it, the new lens you earned, and why it matters.","key":"easyAnswer_v2"},
      {"label":"What happened when you started applying that first professional realization in the real world?","hint":"Describe the situations that tested it, what began working, what those wins made you believe, and what pressure, blind spot, or limit still remained.","key":"easyAnswer_v3"},
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
      "title": "When The Insight Met Reality",
      "note": "Show what happened when you began living by the first realization. Stay with the real tests, partial wins, growing confidence, and the limit you could not see clearly yet.",
      "prompts": [
        {"label":"After the first realization you described, what did you actually do differently?","hint":"Choose a real action inside the main part of your life you are discussing. What choice, conversation, boundary, risk, habit, or response changed because you could no longer see things the old way?","key":"v3p0","placeholder":"Describe the first real action you changed after the realization."},
        {"label":"What situations kept testing that new understanding, especially when returning to the old way would have been easier?","hint":"Describe the resistance, repeated problem, difficult choice, or imperfect attempt. Give us one or two moments we can picture rather than a general report of growth.","key":"v3p1","placeholder":"Describe the real situations that tested the new understanding."},
        {"label":"What began working, and what did that success lead you to believe you now understood or could handle?","hint":"Name the partial win honestly. What changed enough to give you confidence, and what conclusion did you begin drawing from that success at the time?","key":"v3p2","placeholder":"Describe the partial win and the confidence it created."},
        {"label":"What pressure, warning sign, or unresolved limit was still present even while things seemed to be working?","hint":"Stay with what you could see or feel then. Do not explain the later failure or the larger realization that eventually came from it.","key":"v3p3","placeholder":"Describe the unresolved limit beneath the progress."}
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
      "title": "Before I Knew What It Was",
      "note": "Let people see the ability or interest that kept appearing before you treated it as expertise. Stay inside the ordinary life and the reasons you dismissed or refused the path. You do not need to explain what it eventually became.",
      "prompts": [
        {
          "label": "Before you thought of this as expertise or a possible path, what work, role, routine, or kind of life were you living?",
          "hint": "Put us inside the ordinary world you were used to. What filled your time, shaped your choices, or made staying where you were feel normal and responsible?",
          "key": "v1p0",
          "placeholder": "Describe the work or life you were in before you treated this ability as a path."
        },
        {
          "label": "What ability, responsibility, interest, or recurring problem kept showing up even though you treated it as ordinary?",
          "hint": "What did you repeatedly notice, solve, study, practice, or get asked about? Give one concrete example that lets someone else see its value before you explain it.",
          "key": "v1p1",
          "placeholder": "Describe the ability or thread that kept appearing and one concrete example."
        },
        {
          "label": "What did you refuse to claim, pursue, share, or take seriously, and why did remaining where you were feel safer or more responsible?",
          "hint": "Maybe it seemed too small, too strange, too uncertain, too easy for you, or not professional enough. Stay with what you believed then. Do not jump ahead to what you eventually learned.",
          "key": "v1p2",
          "placeholder": "Describe what you refused to claim and why staying in the ordinary role felt safer."
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
          "label": "Who helped you question the old understanding, and what did they say, show, ask, correct, or demonstrate that you could not see alone?",
          "hint": "Name a real person who performed the guide role. It might be a mentor, teacher, supervisor, peer, client, elder, or collaborator. They do not need to be famous or formally called a mentor. Describe the specific guidance you received and what you did with it.",
          "key": "v2p5",
          "placeholder": "Describe the person who guided you, the specific thing they helped you see, and how you tested their guidance."
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
      "title": "When The Insight Met Reality",
      "note": "Show what happened when you began applying the first professional realization. Stay with the real tests, partial wins, growing confidence, and the limit you could not see clearly yet.",
      "prompts": [
        {
          "label": "Where did you first try to apply what your guide helped you understand, and what did you do differently because of it?",
          "hint": "Choose a real situation connected to your work, craft, calling, business, life, or public communication. Show the changed action rather than only describing a new mindset.",
          "key": "v3p0",
          "placeholder": "Describe where you applied the first realization and the action you changed."
        },
        {
          "label": "What other situations tested that new understanding, especially when the old way would have been easier?",
          "hint": "Describe the resistance, imperfect attempts, competing pressure, or repeated decisions that made this a road of trials rather than one clean success.",
          "key": "v3p1",
          "placeholder": "Describe the real situations that kept testing the new lens."
        },
        {
          "label": "What began working, and what did those wins lead you to believe you now understood or could handle?",
          "hint": "Name the partial success honestly. What result, pattern, decision, or change gave you earned confidence? Then describe the conclusion you began drawing from it at the time.",
          "key": "v3p2",
          "placeholder": "Describe the partial wins and the confidence they created."
        },
        {
          "label": "What pressure, blind spot, warning sign, or unresolved limit was still present even while things seemed to be working?",
          "hint": "Stay with what you could see or feel then. Do not explain the later failure or what you eventually learned from it. We only need the unstable edge beneath the success.",
          "key": "v3p3",
          "placeholder": "Describe the unresolved limit that remained beneath the wins."
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
