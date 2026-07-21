// Admin-only copy of the SeenInSeven question catalog. Keep labels aligned with js/app.js.
const PROMPT_QUESTION_CATALOG = {
  "easy": {
    "l1": [
      null,
      {"label":"What should someone know about your background, what makes you unexpected, and what you naturally care about?","hint":"Share whatever feels most important. The AI will organize it into the story.","key":"easyAnswer_v1"},
      {"label":"What is one thing you used to think was true that is not true?","hint":"Explain how it shaped you, what made you question it, and why the old way of thinking matters.","key":"easyAnswer_v2"},
      {"label":"What has making these videos actually been like so far?","hint":"Compare it with what you expected, share one real detail, and include what is changing, what is still difficult, and why you are continuing.","key":"easyAnswer_v3"},
      {"label":"In the part of your life you have been discussing, what is the absolute worst thing that happened after you first started seeing it differently? What did you do, avoid, refuse to see, or get completely wrong that made it your fault, and what did you lose because of it?","hint":"Give us the defeat, not the lesson. What happened, what was your responsibility, what did it cost, what did you try that failed, and what still felt broken afterward? A rough answer is enough. Your script will build out the story, and you can correct or personalize any details afterward.","key":"easyAnswer_v4"},
      {"label":"What larger truth did you discover because you lived through that difficult experience?","hint":"Describe how you discovered it, what it changed in you, and who else may need to understand it.","key":"easyAnswer_v5"},
      {"label":"Who were you before these realizations, and who are you now?","hint":"Describe what changed, what remains unfinished, what telling the story helped you understand, and where you go next.","key":"easyAnswer_v6"}
    ],
    "l2": [
      null,
      {"label":"What part of your past kept shaping you before you understood why?","hint":"Describe the ordinary world you were in, the thread or unlikely chapter that kept showing up, and why you did not recognize or follow it yet.","key":"easyAnswer_v1"},
      {"label":"What's a belief you held for a long time that turned out to be wrong?","hint":"What cracked it open? Walk me through how you arrived at seeing it differently. The journey matters more than the conclusion.","key":"easyAnswer_v2"},
      {"label":"Tell me about one moment when an old pattern met a new behavior.","hint":"What happened, what would you normally have done, what did you do differently, what did that reveal, and what is still difficult?","key":"easyAnswer_v3"},
      {"label":"In the work or expertise story you have been telling, what was your worst professional failure after your first breakthrough? What did you do, avoid, refuse to see, or get completely wrong that made it your fault, and what did it cost you?","hint":"Give us the professional defeat, not a fear about what might happen. Name what happened, your responsibility, the real loss, what you tried that failed, and what remained broken. A rough answer is enough. Your script will build out the story, and you can correct or personalize any details afterward.","key":"easyAnswer_v4"},
      {"label":"What do you believe now that you couldn't have said before the fall?","hint":"The deeper truth, reframe, or conviction you earned by naming the hard thing. Not a generic lesson. The truth you can carry forward.","key":"easyAnswer_v5"},
      {"label":"What did doing these 7 videos teach you that you didn't know at the start?","hint":"The honest accounting. What changed? What would you tell yourself at the beginning? What do you want to give your audience?","key":"easyAnswer_v6"}
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
      "note": "Return to your larger life story and tell the defeat. Something bad happened, you helped cause it, and you lost something that mattered. Do not give the lesson yet.",
      "prompts": [
        {"label":"In the part of your life you have been discussing, what is the absolute worst thing that happened after you first started seeing it differently?","hint":"Give one completed event or period. Tell us what actually happened, not what you were afraid might happen.","key":"v4p0","placeholder":"Describe the defeat that actually happened."},
        {"label":"Why was it your fault? What did you do, avoid, refuse to see, or get completely wrong that caused it or made it worse?","hint":"This is about responsibility, not villainy. Name the choice, pattern, blind spot, delay, refusal, or failure that was yours.","key":"v4p1","placeholder":"Describe your part in causing or worsening the defeat."},
        {"label":"What did you lose, damage, delay, or make worse because of that failure?","hint":"Name the real cost from inside the experience: the relationship, opportunity, money, time, credibility, identity, peace, momentum, or something else that mattered.","key":"v4p2","placeholder":"Describe what the failure actually cost you."},
        {"label":"What did you try afterward that still did not fix it, and what were you still unable to understand?","hint":"End inside the failed recovery. Name what you tried, why it was not enough, and what remained broken before the larger realization came.","key":"v4p3","placeholder":"Describe the failed recovery and the question that still had no answer."}
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
      "title": "The Origin Story",
      "note": "Your audience needs to understand the path that formed what you know. Stay with the detour, wound, obsession, or unlikely chapter before you understood its professional meaning. This is the origin, not the industry lesson yet.",
      "prompts": [
        {
          "label": "How did you get into this? Not the professional version. The real story of how you ended up knowing what you know.",
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
          "label": "What did you misunderstand about that path at the time, or why did you resist seeing it as part of your expertise?",
          "hint": "Stay inside the earlier perspective. Maybe it looked like wasted time, failure, a side interest, or something that did not count. Save the clean professional reframe for Video 3.",
          "key": "v1p2",
          "placeholder": "Describe what you believed about that path before its meaning became clear."
        }
      ]
    },
    {
      "title": "The First Epiphany",
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
      "title": "The Road Of Trials",
      "note": "Your first professional epiphany now has to survive public practice. Show one concrete collision between your expert instincts and the new behavior visibility required. Authority comes from how you read the trial, not from teaching or reporting progress.",
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
          "hint": "Name the remaining friction specifically. This is a trial, not proof that visibility is solved, and the unresolved cost prepares the fall in Video 5.",
          "key": "v3p3",
          "placeholder": "Describe where the old expert pattern still has a hold on you."
        }
      ]
    },
    {
      "title": "The Fall",
      "note": "Tell the professional defeat. Something went wrong, your own choice or blind spot helped cause it, and expertise did not save you from the loss. Do not give the lesson yet.",
      "prompts": [
        {
          "label": "In the work or expertise story you have been telling, what was your worst professional failure after your first breakthrough?",
          "hint": "Give one completed event or period when something actually went wrong. Do not give a fear about what might happen.",
          "key": "v4p0",
          "placeholder": "Describe the professional defeat that actually happened."
        },
        {
          "label": "Why was it your fault? What did you do, avoid, refuse to see, overestimate, or get completely wrong that caused it or made it worse?",
          "hint": "Name the professional choice, blind spot, delay, overconfidence, avoidance, or failure that was yours. Expertise does not remove responsibility.",
          "key": "v4p1",
          "placeholder": "Describe your part in causing or worsening the professional defeat."
        },
        {
          "label": "What did that failure actually cost you, your work, or the people who depended on you?",
          "hint": "Name the real loss: credibility, trust, money, time, an opportunity, a relationship, momentum, confidence, or something else that mattered.",
          "key": "v4p2",
          "placeholder": "Describe the real cost of the professional failure."
        },
        {
          "label": "What did you try afterward that still did not fix it, and what were you still unable to understand?",
          "hint": "End inside the failed recovery. Name what you tried, why your expertise or old strategy was not enough, and what remained broken before the second epiphany.",
          "key": "v4p3",
          "placeholder": "Describe the failed recovery and what still had no answer."
        }
      ]
    },
    {
      "title": "The Second Epiphany",
      "note": "Deeper. More personal. More convicted. After naming what visibility costs you, this is the myth or truth you can finally say with earned authority. You're not sharing an opinion, you're sharing what you can't unsee.",
      "prompts": [
        {
          "label": "What's the biggest myth or most overused piece of advice in your field that you've come to believe is actually wrong — or even harmful?",
          "hint": "The sacred cow. The thing every guru says. The advice that gets repeated so often nobody questions it anymore. You question it. You've seen what happens when people follow it. What is it?",
          "key": "v5p0",
          "placeholder": "e.g. the biggest myth in my field is that consistency is the answer. Post every day, show up every day, grind every day. I've watched people burn out following that advice and then blame themselves for failing."
        },
        {
          "label": "Tell the story of your own relationship with this belief. Did you used to follow it? Teach it? What happened that made you turn against it?",
          "hint": "The most powerful version of this is when YOU were a believer first. You followed the playbook. You recommended it to others. And then something happened that made you see it was broken. That personal journey from believer to heretic is what makes this credible, not preachy.",
          "key": "v5p1",
          "placeholder": "e.g. I used to tell my clients this. I believed in it. I built my own routine around it. And then I watched my most dedicated client, someone who followed every rule, completely crater her mental health in pursuit of consistency and end up taking six months off."
        },
        {
          "label": "What's the actual truth — the thing that works but nobody talks about because it's less sexy, less simple, or threatens the established way of doing things?",
          "hint": "The real answer. The thing you've figured out through doing the work, not reading about the work. It might be simpler than the myth. It might be harder. But it's TRUE, and you can back it up with your own experience and results.",
          "key": "v5p2",
          "placeholder": "e.g. depth beats volume every time. One video that changes how someone thinks is worth more than thirty that they half-watch. The people winning aren't the ones posting most. They're the ones saying the most true thing."
        },
        {
          "label": "What happens to people who keep following the myth? What have you watched it cost your peers, your clients, or people in your space?",
          "hint": "Be specific. Not 'they fail.' HOW do they fail? What does it look like? The wasted money, the wasted time, the frustration, the quitting.",
          "key": "v5p3",
          "placeholder": "e.g. they burn out. They create for months, see no results, decide they're not interesting enough, and quit. The myth told them consistency would compound. Nobody told them they also needed to have something worth saying."
        },
        {
          "label": "Who specifically needs to hear this, and what would change for them if they actually believed you?",
          "hint": "Picture one specific person. A client, a peer, someone who asked you for advice last week. If THEY got this, really got it, what would shift for them? That's the emotional engine. That's why you're saying this out loud instead of keeping it to yourself.",
          "key": "v5p4",
          "placeholder": "e.g. this is for the expert who's been posting dutifully for months with nothing to show for it and is starting to think the problem is them. It's not them. They just got sold a system designed for content farms, not humans with something to say."
        }
      ]
    },
    {
      "title": "What I Learned",
      "note": "Seven videos. A complete arc. Close it honestly: what you set out to prove, what you actually learned, what you'd tell someone at the beginning, and one open door for the right person.",
      "prompts": [
        {
          "label": "When you filmed Video 1, what were you trying to prove — to yourself, to your audience, to your industry? Did you prove it?",
          "hint": "Go back to the beginning. You had an intention — maybe it was clear, maybe it was vague. What was it? And now, seven videos later — did the challenge deliver what you expected? Or did it deliver something else entirely?",
          "key": "v6p0",
          "placeholder": "e.g. I started this wanting to prove I could show up consistently without a perfect strategy in place. Did I prove it? Sort of. What I actually proved was more interesting — that the strategy becomes obvious once you start."
        },
        {
          "label": "What did this challenge teach you about your own expertise that you didn't know before? Not about content or filming. About the actual WORK you do and who you do it for.",
          "hint": "Putting your knowledge on camera forces a kind of clarity that nothing else does. You had to simplify. You had to choose what matters. What did that process reveal about what you actually know and what you actually care about?",
          "key": "v6p1",
          "placeholder": "e.g. this challenge taught me that I know far more than I realize, and I've been gatekeeping it behind a fear of saying something imperfect. The act of saying it imperfectly taught me more about my expertise than a year of preparation would have."
        },
        {
          "label": "What's the one thing you'd tell someone in your field who's been hiding behind their work instead of putting themselves out there?",
          "hint": "You were that person seven videos ago. Now you're not. What do you know from the inside that they can't see from the outside? Not motivational fluff. The real, practical, emotional truth about what it takes and what it gives back.",
          "key": "v6p2",
          "placeholder": "e.g. I'd tell them: the fear doesn't go away before you start. It goes away because you started. There's no version of this where you feel ready first."
        },
        {
          "label": "What do you still need? Be honest. What did this challenge show you about where you need to grow, what support you need, or what's missing from your next chapter?",
          "hint": "You just did something real. You proved something. And in the process, you probably saw clearly what the next level requires. Maybe it's help with systems. Maybe it's community. Maybe it's accountability. Whatever it is — naming it isn't weakness. It's the most strategic thing you can do.",
          "key": "v6p3",
          "placeholder": "e.g. what I still need is a real framework for turning this visibility into actual conversations with the right people. The videos are working. I don't yet have a clear path from 'someone watches' to 'someone reaches out.'"
        },
        {
          "label": "If the right person is watching this — the exact person you've been making these videos for — what's your invitation to them? Not a pitch. An open door.",
          "hint": "You've spent seven videos showing this person who you are, what you know, and what you believe. They trust you. So what do you want to say to them? The specific person, the specific problem, the specific next step. That's it. That's enough.",
          "key": "v6p4",
          "placeholder": "e.g. if you're a consultant or coach who knows you're good at what you do but keeps struggling to get visible in a way that feels authentic — reach out. Not to pitch you anything. Just to talk about what's actually in the way."
        }
      ]
    }
  ]
};
