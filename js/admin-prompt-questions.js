// Admin-only copy of the SeenInSeven question catalog. Keep labels aligned with js/app.js.
const PROMPT_QUESTION_CATALOG = {
  "easy": [
    null,
    {
      "label": "What part of your past kept shaping you before you understood why?",
      "hint": "Describe the ordinary world you were in, the thread or unlikely chapter that kept showing up, and why you did not recognize or follow it yet.",
      "key": "easyAnswer_v1"
    },
    {
      "label": "What's a belief you held for a long time that turned out to be wrong?",
      "hint": "What cracked it open? Walk me through how you arrived at seeing it differently. The journey matters more than the conclusion.",
      "key": "easyAnswer_v2"
    },
    {
      "label": "Tell me about one moment when an old pattern met a new behavior.",
      "hint": "What happened, what would you normally have done, what did you do differently, what did that reveal, and what is still difficult?",
      "key": "easyAnswer_v3"
    },
    {
      "label": "What's something you've been avoiding saying out loud?",
      "hint": "The thing that would make you feel most exposed. Not for shock. For honesty. The thing that makes the next lesson earned.",
      "key": "easyAnswer_v4"
    },
    {
      "label": "What do you believe now that you couldn't have said before the fall?",
      "hint": "The deeper truth, reframe, or conviction you earned by naming the hard thing. Not a generic lesson. The truth you can carry forward.",
      "key": "easyAnswer_v5"
    },
    {
      "label": "What did doing these 7 videos teach you that you didn't know at the start?",
      "hint": "The honest accounting. What changed? What would you tell yourself at the beginning? What do you want to give your audience?",
      "key": "easyAnswer_v6"
    }
  ],
  "l1": [
    {
      "title": "I'm Doing This",
      "note": "These are pre-filled from your earlier answers. Edit anything that doesn't sound exactly like you, then generate your script.",
      "prompts": []
    },
    {
      "title": "The Hidden Thread",
      "note": "You're still in the ordinary world. This video lets the audience notice one interest, frustration, obsession, or pattern that kept showing up before you understood what it meant. Reveal the clue, not the final lesson.",
      "prompts": [
        {
          "label": "What did your ordinary life look like before you started following this thread? Give me one concrete detail that captures that period.",
          "hint": "A schedule, place, responsibility, routine, or situation. Set the world you were living in without explaining what it all meant yet.",
          "key": "v1p0",
          "placeholder": "Describe one specific detail from that part of your life."
        },
        {
          "label": "What interest, frustration, obsession, or pattern did you keep returning to during that time?",
          "hint": "The thing that seemed random, impractical, or unrelated then but kept catching your attention. Be specific about what you did, noticed, collected, watched, questioned, or cared about.",
          "key": "v1p1",
          "placeholder": "Describe the recurring thread and what you actually did with it."
        },
        {
          "label": "Why didn't you follow that thread sooner, and what did you think it meant about you back then?",
          "hint": "Stay inside the old perspective. What made the outside world feel unavailable, unrealistic, embarrassing, or not meant for you? Do not jump ahead to the lesson you know now.",
          "key": "v1p2",
          "placeholder": "Describe the belief or circumstance that kept the thread in the background."
        }
      ]
    },
    {
      "title": "The First Epiphany",
      "note": "Seven beats, one shift. The audience knows you and likes you after Video 2. Now you give them something they can't unsee. A belief you held, the moment it cracked, the new truth, simple enough to text to a friend.",
      "prompts": [
        {
          "label": "What's something you used to believe (about life, success, fear, identity, or how things work) that you held onto for a long time before you realized it wasn't true?",
          "hint": "Not a small preference change. A deep belief, maybe one you built decisions around. Something that felt like bedrock until it cracked.",
          "key": "v2p0",
          "placeholder": "e.g. I used to believe that if I just worked hard enough and stayed quiet, the right people would eventually notice... and I built years of decisions around that idea"
        },
        {
          "label": "Tell the story of what happened that made you see it differently. Not when you 'decided to change your mind' but the actual experience. Where were you? What did you see, hear, or feel?",
          "hint": "This is a moment, not a summary. Ground it in a real scene. The more specific and human, the more powerful it becomes.",
          "key": "v2p1",
          "placeholder": "e.g. I was sitting in my car after a meeting where I'd watched someone say something I'd been thinking for months... and they got all the credit. That was the moment I understood that staying quiet wasn't humility, it was just fear"
        },
        {
          "label": "Now that you see it differently, what's the new truth? Say it as simply as you can, like you're explaining it to someone you care about.",
          "hint": "One or two sentences. If the old belief was the lens you were wearing, what's the prescription of the new one? The simpler you can make this, the harder it will hit.",
          "key": "v2p2",
          "placeholder": "e.g. the new truth is that waiting to be discovered is a strategy for staying invisible. The only people who get found are the ones who decide to be seen"
        },
        {
          "label": "What does it cost someone to keep believing the old way? Not in a dramatic sense. Just honestly, what do they miss or lose without realizing it?",
          "hint": "You can see both sides now. What's the invisible price someone pays when they're still stuck in the old one? It's about caring enough to name what you wish someone had named for you.",
          "key": "v2p3",
          "placeholder": "e.g. what it costs them is years... years of doing good work that nobody outside their immediate circle ever hears about, wondering why they feel invisible when they've been choosing invisibility"
        },
        {
          "label": "Why does this matter to you enough to say it out loud on camera?",
          "hint": "You could have kept this to yourself. Why are you sharing it? Maybe because you see other people stuck where you were. That reason is the emotional engine of this video.",
          "key": "v2p4",
          "placeholder": "e.g. because I spent too long believing I wasn't the kind of person who did things like this, and I watch other people believe that same lie about themselves every day"
        }
      ]
    },
    {
      "title": "The Road Of Trials",
      "note": "Your first epiphany was a win. Now show what happened when the old pattern met a new behavior in real life. One specific trial gives the audience something they can witness, while what remains difficult keeps the journey honest.",
      "prompts": [
        {
          "label": "Tell me about one specific moment when your old pattern showed up while you were making or posting these videos.",
          "hint": "A real scene, not a progress summary. What happened, where were you, and what did the old version of you normally do in that moment?",
          "key": "v3p0",
          "placeholder": "Describe the exact moment and the old reaction it triggered."
        },
        {
          "label": "What did you actually do differently this time?",
          "hint": "Make the change observable. What did you click, say, leave alone, finish, post, or stop yourself from doing? Small behavioral proof is stronger than saying you felt more confident.",
          "key": "v3p1",
          "placeholder": "Describe the different action you took, even if it felt minor."
        },
        {
          "label": "What happened because you acted differently, and what did that reveal?",
          "hint": "The result can be internal or external. Use only what really happened. Do not invent comments, views, messages, or praise if there were none.",
          "key": "v3p2",
          "placeholder": "Describe the real consequence and what made it surprising."
        },
        {
          "label": "Where is the old pattern still winning? What's still difficult even after this small shift?",
          "hint": "This is the road of trials, not the finish line. Name the remaining resistance specifically so the win feels honest and the fall in Video 5 can be earned.",
          "key": "v3p3",
          "placeholder": "Describe the part that still has not become easy."
        }
      ]
    },
    {
      "title": "The Fall",
      "note": "The first breakthrough was real, but it didn't magically erase the deeper fear. Video 5 is where you name the thing you've been carrying while still showing up. This is the fall that makes the next epiphany earned.",
      "prompts": [
        {
          "label": "What's the thing you've been carrying through this challenge that you haven't said on camera yet? The fear, the doubt, the struggle that's still present even though you keep showing up.",
          "hint": "Not the surface-level stuff. Not 'filming is hard.' The REAL thing. Maybe it's the voice that says nobody cares. Maybe it's the comparison. Say the thing you've been avoiding.",
          "key": "v4p0",
          "placeholder": "e.g. the thing I've been carrying is the very specific fear that I'll finish all seven videos, put everything into this, and wake up to silence... and that silence will confirm the thing I've been trying to prove wrong"
        },
        {
          "label": "Where does that come from? Not the logical explanation. The deeper root. When did you first start believing that about yourself?",
          "hint": "This fear or doubt didn't start with the challenge. It was there before. Trace it back. You don't have to go into full detail. Just name the root.",
          "key": "v4p1",
          "placeholder": "e.g. it goes back further than this challenge. I think it started in the years I spent doing good work that nobody outside my immediate circle ever saw, slowly convincing myself that was fine"
        },
        {
          "label": "What would it mean to you, really honestly, if you could let go of that? What becomes possible on the other side of this battle?",
          "hint": "Don't make this aspirational fluff. Think about it practically. What would you DO differently? How would you FEEL differently? What would you stop avoiding?",
          "key": "v4p2",
          "placeholder": "e.g. if I could let go of it, I think I'd stop waiting for proof before I acted. I'd just act. And I'd stop treating my own work like it needs to earn the right to exist before I show it to anyone"
        },
        {
          "label": "What do you want to say to anyone watching this who's fighting their own version of the same battle?",
          "hint": "You've just told your story. The fear, the root, the possibility. What do you want to leave them with? Not advice. A message. The thing you wish someone had said to you when you were in the middle of the fight.",
          "key": "v4p3",
          "placeholder": "e.g. I want to say: the fact that you're watching this means part of you already knows. You don't need more proof. Just decide that this thing you're carrying doesn't get to keep making your decisions"
        }
      ]
    },
    {
      "title": "The Second Epiphany",
      "note": "Now that you've named the fall, Video 6 finds the elixir. This is your second big reframe: what you can see now, what the old way was costing you, and what becomes possible when it stops making the decisions.",
      "prompts": [
        {
          "label": "What's something you now believe that most people around you would disagree with (or at least wouldn't say out loud)?",
          "hint": "Not something designed to be controversial. Something genuinely true for you because of what you've just had to face.",
          "key": "v5p0",
          "placeholder": "e.g. I believe that most of what we call 'not being ready' is actually just fear of being judged, and the preparation is usually a delay tactic we've convinced ourselves is responsible"
        },
        {
          "label": "What did naming the fear or fall help you see that you couldn't see before?",
          "hint": "There was a before and an after. What became obvious only after you stopped avoiding the hard thing?",
          "key": "v5p1",
          "placeholder": "e.g. once I named the fear, I realized it had been making practical decisions for me while pretending to be wisdom"
        },
        {
          "label": "What was the old way costing you? Be specific about what you were doing, tolerating, or missing.",
          "hint": "Before you saw this clearly, you were living inside the old belief. What did that actually look like day to day?",
          "key": "v5p2",
          "placeholder": "e.g. it was costing me time I'll never get back and conversations I kept not having because I kept waiting to feel qualified enough to have them"
        },
        {
          "label": "What opened up or changed when you stopped letting the old belief make the decisions?",
          "hint": "The other side. Not a fantasy. Your actual experience of life after the shift. What does the world look like through the new lens?",
          "key": "v5p3",
          "placeholder": "e.g. what opened up was the ability to act before I felt ready, which sounds simple, but it changed everything about how I show up"
        },
        {
          "label": "If you could say this to one specific person who's still stuck in the old belief... what would you say to them?",
          "hint": "Picture one person. What do you want to say to them through the camera? Not a lecture. A direct, personal message.",
          "key": "v5p4",
          "placeholder": "e.g. I'd say: you're not getting more ready. Every day you wait, you're not building courage. You're building a bigger story about why you can't start yet"
        }
      ]
    },
    {
      "title": "What I Learned",
      "note": "Seven videos. You did it. Now close the arc honestly. What did you think this was going to be? What actually happened? What do you know now that you didn't before? And where are you going next?",
      "prompts": [
        {
          "label": "When you filmed Video 1, what did you think this challenge was going to be about? What did you expect to happen?",
          "hint": "Think back to the person who pressed record on day one. What were you bracing for? What did you think would be hard? Be honest about the expectations, even the ones that seem naive now.",
          "key": "v6p0",
          "placeholder": "e.g. honestly, I thought this challenge was going to be about overcoming camera fear. I figured by Video 7 I'd just feel comfortable on camera. That's not what happened at all"
        },
        {
          "label": "What actually happened instead? What surprised you most (about the experience, about yourself, about how people responded)?",
          "hint": "The real version. Not the Instagram version. What was harder than expected? What was easier? What completely blindsided you?",
          "key": "v6p1",
          "placeholder": "e.g. what actually happened is that the camera got comfortable faster than I expected, and what surprised me most is that the videos I almost didn't post were the ones people responded to most"
        },
        {
          "label": "What's the one thing you know now that you didn't know before Video 1? Not a tip. A truth. Something you can only learn by doing, not by thinking about it.",
          "hint": "The elixir. The thing you're bringing back from this journey. If you could go back and whisper one sentence to the person you were before this challenge, what would it be?",
          "key": "v6p2",
          "placeholder": "e.g. the one thing I know now is that showing up is the work, not what you show up saying. I kept thinking I needed better ideas. What I needed was just to start"
        },
        {
          "label": "If someone is watching this right now and they're exactly where you were seven videos ago (scared, uncertain, overthinking it): what do you want to say to them?",
          "hint": "Not advice from a guru. A message from someone who JUST went through it. What's the honest truth from the other side?",
          "key": "v6p3",
          "placeholder": "e.g. I want to say: it's not going to feel the way you think it will. It's going to feel harder in some ways and easier in others. But the version of you on the other side of Video 7 is worth it"
        },
        {
          "label": "What's next for you? You don't need a plan, just a direction. What did this challenge open up that you want to keep going with?",
          "hint": "You don't need to have figured out the rest of your life. But this challenge showed you something: a direction, a possibility, a next step. Saying it out loud is the beginning of making it real.",
          "key": "v6p4",
          "placeholder": "e.g. what's next for me is keeping going, not as a challenge, but because I finally understand that this is what showing up actually looks like, and I want to keep doing it"
        }
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
      "note": "This is the video most people skip because it feels too vulnerable. That's exactly why it matters. The internal battle about claiming your expertise publicly, said out loud on camera, is what makes the next epiphany earned.",
      "prompts": [
        {
          "label": "What's the internal battle you're fighting about putting yourself out there as someone with real expertise? The thing that makes you hesitate even though you KNOW you're good at this.",
          "hint": "Imposter syndrome. Comparison. The fear of being 'that person' who promotes themselves. The voice that says your experience doesn't count because you don't have the right credentials, the right following, the right whatever. What's YOUR version of that battle?",
          "key": "v4p0",
          "placeholder": "e.g. my version of this is the credential question — I don't have letters after my name. I learned everything I know from fifteen years of doing this work with real people. But the voice still shows up asking who I think I am."
        },
        {
          "label": "What's the specific fear? If you imagine fully owning your expertise publicly — being visible, being known for what you know — what's the worst thing that could happen? Say it out loud.",
          "hint": "Sometimes the fear is concrete: 'people from my old life will judge me.' Sometimes it's abstract: 'what if I put myself out there and nobody cares.' Sometimes it's deeper: 'what if I'm not actually as good as I think I am.' Name the actual fear. Not the category — the specific thought.",
          "key": "v4p1",
          "placeholder": "e.g. the specific fear is that someone I respect will watch one of these videos and think 'she's overreaching.' That one imaginary judgment has cost me more than two years of staying quiet."
        },
        {
          "label": "What's it been costing you to stay small? Not in money, but in impact, in fulfillment, in the people you could be helping but aren't because you've been hiding.",
          "hint": "You know there are people who need what you know. You've probably met some of them. What happens to them because you haven't stepped into this fully? And what happens to YOU... what are you leaving on the table by playing it safe?",
          "key": "v4p2",
          "placeholder": "e.g. what it's been costing me is harder to name than money. There are people right now making the exact mistakes I know how to prevent, and I haven't shown up for them because I've been waiting to feel ready."
        },
        {
          "label": "Despite all of that... why are you still here? Why haven't you quit? What's the thing that keeps pulling you forward even when the doubt is loud?",
          "hint": "Something is stronger than the fear. A purpose, a person, a vision, a stubborn refusal to let the doubt win. That thing, whatever it is, is the real engine underneath everything you've built so far. Name it.",
          "key": "v4p3",
          "placeholder": "e.g. I'm still here because I keep meeting people who are stuck in the exact place I was stuck in. And when I talk to them, even for twenty minutes, something shifts. That shift is what I'm here for. The doubt is just the admission fee."
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
