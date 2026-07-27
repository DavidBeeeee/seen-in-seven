// Admin-only copy of the SeenInSeven question catalog. Keep labels aligned with js/app.js.
const PROMPT_QUESTION_CATALOG = {
  "easy": {
    "l1": [
      null,
      {"label":"What should someone know about your background, what makes you unexpected, and what you naturally care about?","hint":"Share whatever feels most important. The AI will organize it into the story.","key":"easyAnswer_v1"},
      {"label":"What is one thing you used to think was true that is not true?","hint":"Explain how it shaped you, what made you question it, and why the old way of thinking matters.","key":"easyAnswer_v2"},
      {"label":"After your first realization, what did you do differently and what happened when real life tested it?","hint":"Describe the actions you changed, the situations that challenged you, what began working, what that success made you believe, and what still felt unresolved.","key":"easyAnswer_v3"},
      {"label":"In the part of your life you have been discussing, what failure, loss, or period was so devastating that you thought it might ruin you or that you might never recover? What did you do, avoid, refuse to see, or get completely wrong that made it your fault?","hint":"Tell us what collapsed, what you believed might be gone forever, and why you could not see a way back. Include what you tried afterward that still failed. Answer from who you were while it was happening, before you knew what you would eventually learn.","key":"easyAnswer_v4"},
      {"label":"What larger truth did you discover only because you lived through that difficult experience?","hint":"Describe what happened afterward that made it clear, what you changed because of it, and who may need the perspective you earned. It does not have to connect to your first realization.","key":"easyAnswer_v5"},
      {"label":"Who were you before these realizations, and who are you now?","hint":"Describe what changed, what remains unfinished, what telling the story helped you understand, and where you go next.","key":"easyAnswer_v6"}
    ],
    "l2": [
      null,
      {"label":"Before you treated this as expertise, what ability or interest kept showing up, and why did you refuse to take it seriously?","hint":"Describe the ordinary work or life you were in, what other people might have valued before you did, and why staying where you were felt safer or more responsible.","key":"easyAnswer_v1"},
      {"label":"What is one idea you used to accept about your work that you now strongly disagree with? Why did it make sense to you at the time, and what made the old idea stop fitting what you saw?","hint":"Tell it like a journal entry. Include one concrete moment and who still pays the cost of the old idea. You do not need to explain the final lesson.","key":"easyAnswer_v2"},
      {"label":"After that first change in how you saw things, what did you do differently before you knew whether it would work?","hint":"Tell it like a journal entry. What made the old way tempting to return to, what did you choose anyway, and what small but meaningful result made continuing feel possible?","key":"easyAnswer_v3"},
      {"label":"What is the worst failure in this part of your work or life, and what made you wonder whether you or what you were building would ever recover?","hint":"Tell it as one honest journal entry. What happened, what part was your fault, what did you believe was gone for good, and what did you try afterward that still failed? End with what you believed at the lowest point, before the comeback or lesson.","key":"easyAnswer_v4"},
      {"label":"After the hardest experience, what became clear that you could not have understood before living through it?","hint":"Describe the aftermath evidence that brought it into focus, one observable change you made afterward, and who might need the perspective you earned. It may connect to your first realization, but it does not have to.","key":"easyAnswer_v5"},
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
      "note": "Share the hard-won realization you discovered because you lived through the hardest part of your story. It may connect to the first realization, but it does not have to. It must grow from the ordeal rather than repeat an earlier lesson or introduce a separate opinion.",
      "prompts": [
        {"label":"After the hardest part was over, what did you eventually understand that you could not have understood before living through it?","hint":"Say it in your own words. It does not need to sound polished. Keep it rooted in what happened rather than a separate idea you already believed.","key":"v5p0","placeholder":"Describe what only became clear after you lived through the difficult experience."},
        {"label":"What happened during the aftermath or rebuilding that made this understanding harder and harder to ignore?","hint":"Walk us through the evidence. What did you try, notice, lose, rebuild, stop doing, or finally do differently before the realization became clear?","key":"v5p1","placeholder":"Describe the aftermath evidence that brought the understanding into focus."},
        {"label":"What did you actually change afterward that another person could see in your choices or life?","hint":"Choose a real action, boundary, standard, conversation, habit, or way of responding. The change can be imperfect or ongoing.","key":"v5p3","placeholder":"Describe one observable change you made afterward."},
        {"label":"Who do you recognize in the place you were, and what do you wish they could see before repeating what happened to you?","hint":"Picture one specific person. What are they misreading, repeating, or blaming themselves for? Stay with the perspective you earned rather than turning it into advice.","key":"v5p4","placeholder":"Describe who needs this hard-won perspective and what it could help them recognize."}
      ],
      "legacyPrompts": [
        {"label":"Previously saved optional connection to the first realization","key":"v5p2"}
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
      "note": "Let people see what your everyday life felt like and why staying there made sense. You do not need to understand the deeper meaning yet. Just answer from what life felt like at the time.",
      "prompts": [
        {
          "label": "How did you get into this? Skip the polished professional answer. What is the real story of how you ended up knowing what you know?",
          "hint": "Maybe it started accidentally. Maybe you were solving your own problem. Maybe someone else needed help and you became the person they kept coming back to. What was actually happening in your life when this began?",
          "key": "v1p0",
          "placeholder": "Tell the real story of how you first got into this."
        },
        {
          "label": "What detour, wound, obsession, or unlikely chapter shaped the way you understand this work?",
          "hint": "What happened during that part of your life? Give us one concrete detail that someone would never learn from your résumé or professional bio. You do not need to explain what it taught you.",
          "key": "v1p1",
          "placeholder": "Describe the unlikely chapter and one concrete detail."
        },
        {
          "label": "What made you dismiss this, resist taking it seriously, or assume it could never become real work for you?",
          "hint": "Answer from what you believed at the time. Why did it seem irrelevant, impractical, unprofessional, or too ordinary to count? What felt more sensible or responsible instead?",
          "key": "v1p2",
          "placeholder": "Describe why you dismissed it and what felt more sensible instead."
        }
      ]
    },
    {
      "title": "What I See Differently",
      "note": "Think of one idea you used to accept and the moment it stopped matching what you could see. You do not need a polished lesson. Just give us the real pieces.",
      "prompts": [
        {
          "label": "What is one idea people in your field tend to accept as true that you now strongly disagree with? Why did you used to think it was true?",
          "hint": "Keep it to one assumption. Describe why it made sense at the time and how it shaped a decision, standard, habit, or way you judged your work.",
          "key": "v2p0",
          "placeholder": "Describe the idea you accepted, why it made sense then, and how it affected what you did."
        },
        {
          "label": "Tell us about one moment when the old idea stopped matching what you were seeing.",
          "hint": "Where were you? What happened? What concrete detail made the usual explanation feel incomplete? If it happened gradually, choose one moment that represents the pattern instead of summarizing the whole pattern.",
          "key": "v2p1",
          "placeholder": "Describe one moment when the old idea stopped fitting the evidence."
        },
        {
          "label": "Who do you picture still living by the old idea, what does it cost them in real life, and what do you wish they could recognize sooner?",
          "hint": "Think of one recognizable person. Show what they lose, postpone, waste, or blame themselves for, then say what you understand about their situation. Do not describe your current service, offer, or method.",
          "key": "v2p3",
          "placeholder": "Describe who still carries the old idea, what it costs them, and what you wish they could recognize sooner."
        }
      ]
    },
    {
      "title": "What I Chose Before I Knew",
      "note": "Think about the first time you tried to live by what you had started seeing differently. Tell us what you did, why returning to the old way was tempting, what you chose before you knew the result, and the first sign that made continuing feel possible.",
      "prompts": [
        {
          "label": "After you started seeing this differently, what did you actually try or do differently?",
          "hint": "Take us to one real situation. What did you choose, say, make, stop, start, or handle differently before you knew whether it would help?",
          "key": "v3p0",
          "placeholder": "Describe what you tried and the situation where you tried it."
        },
        {
          "label": "Tell us about a moment when the old way appeared to be working better than what you were trying.",
          "hint": "What happened around you? What made stopping, hiding, copying someone else, or returning to the familiar choice feel tempting? Give us ordinary details we can picture.",
          "key": "v3p1",
          "placeholder": "Describe the moment the old way looked more rewarding and why it tempted you."
        },
        {
          "label": "What did you choose to do while you still did not know whether it would work?",
          "hint": "Stay inside that moment. What did you do next, and what made you continue without having proof that it was the right choice?",
          "key": "v3p4",
          "placeholder": "Describe what you chose while the result was still uncertain."
        },
        {
          "label": "What small but meaningful result made you believe continuing might be worth it, and what did it make seem possible?",
          "hint": "Give us something you could actually see, hear, finish, decide, or point to. Keep it honest and proportionate. This is the first reason for hope, not the worst moment or the final lesson.",
          "key": "v3p2",
          "placeholder": "Describe the first meaningful result and what it made seem possible."
        }
      ]
    },
    {
      "title": "The Hardest Part",
      "note": "Return to the larger part of your work or life you have been discussing, not the experience of making these videos. Answer from who you were while things were falling apart. You do not need to understand the story or explain what it eventually taught you.",
      "prompts": [
        {
          "label": "Thinking about the part of your work or life you have been discussing, what is the worst thing that happened, the thing that made you wonder whether you or what you were building would ever recover?",
          "hint": "It may have happened in one terrible moment or gradually. Tell us what happened, when you could no longer dismiss it as a rough patch, and what you believed had been lost for good.",
          "key": "v4p0",
          "placeholder": "Describe what happened and what you believed might never recover."
        },
        {
          "label": "Looking back, what part of it was your fault?",
          "hint": "What did you ignore, avoid, overestimate, refuse to admit, or continue doing after something felt wrong? Why did that choice make sense to you at the time?",
          "key": "v4p1",
          "placeholder": "Describe the choice, avoidance, or blind spot that was yours."
        },
        {
          "label": "What did you try afterward, and what did you start believing when that failed too?",
          "hint": "Describe what you tried to repair or replace, what remained broken, and the darkest thing you believed about yourself or your future. Stop before explaining the comeback or lesson.",
          "key": "v4p3",
          "placeholder": "Describe the failed recovery and what you believed at the lowest point."
        }
      ],
      "legacyPrompts": [
        {"label":"Previously saved detail about when the seriousness became undeniable","key":"v4p4"},
        {"label":"Previously saved detail about what seemed permanently lost","key":"v4p2"}
      ]
    },
    {
      "title": "What The Hardest Part Taught Me",
      "note": "Look back at the hardest experience you just described. Focus on what only became clear afterward and what changed because of it. This must grow directly from that experience, but it does not have to connect to your first realization.",
      "prompts": [
        {
          "label": "After the hardest part was over, what did you eventually understand that you could not have understood before living through it?",
          "hint": "Say it in your own words. It does not need to sound polished. It should come from what happened, rather than from a separate opinion you already held.",
          "key": "v5p0",
          "placeholder": "Describe what only became clear after you lived through the difficult experience."
        },
        {
          "label": "What happened during the aftermath or rebuilding that made this understanding harder and harder to ignore?",
          "hint": "Walk us through the evidence. What did you try, notice, lose, rebuild, stop doing, or finally do differently? Give us what happened before giving us a lesson.",
          "key": "v5p1",
          "placeholder": "Describe the aftermath evidence that brought the deeper understanding into focus."
        },
        {
          "label": "What did you actually change afterward that another person could see in your decisions or work?",
          "hint": "Choose a real action, boundary, standard, conversation, habit, or way of responding. Show the effect of the deeper understanding without turning it into a list of advice.",
          "key": "v5p3",
          "placeholder": "Describe one observable change you made afterward."
        },
        {
          "label": "Who do you recognize in the place you were, and what do you wish they could see before repeating what happened to you?",
          "hint": "Picture one specific person. What are they misreading, repeating, or blaming themselves for? Stay with the useful perspective you earned, not an offer or invitation to work with you.",
          "key": "v5p4",
          "placeholder": "Describe who needs the hard-won perspective and what it could help them recognize."
        }
      ],
      "legacyPrompts": [
        {"label":"Previously saved optional connection to the first realization","key":"v5p2"}
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
