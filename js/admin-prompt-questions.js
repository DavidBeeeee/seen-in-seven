// Admin-only copy of the SeenInSeven question catalog. Keep labels aligned with js/app.js.
const PROMPT_QUESTION_CATALOG = {
  "easy": [
    null,
    {
      "label": "Tell me your origin story",
      "hint": "How did you become the person you are today, and what shaped the way you see things? Could be one pivotal moment, or just the honest version of your background.",
      "key": "easyAnswer_v1"
    },
    {
      "label": "What's a belief you held for a long time that turned out to be wrong?",
      "hint": "What cracked it open? Walk me through how you arrived at seeing it differently. The journey matters more than the conclusion.",
      "key": "easyAnswer_v2"
    },
    {
      "label": "What's actually been happening since you started?",
      "hint": "The real version, not the highlight reel. What's been harder than expected? What surprised you? What's actually working?",
      "key": "easyAnswer_v3"
    },
    {
      "label": "What do you believe that most people in your situation won't say out loud?",
      "hint": "The thing you'd say if you weren't worried about being judged. A conviction, a truth, a flag you want to plant.",
      "key": "easyAnswer_v4"
    },
    {
      "label": "What's something you've been avoiding saying out loud?",
      "hint": "The thing that would make you feel most exposed. Not for shock. For honesty. The thing that would make the right people lean in.",
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
      "title": "The Turning Point",
      "note": "Your audience doesn't follow creators because of what they know. They follow because of who they are. Video 2 is where you let them in. One surprising detail, something they wouldn't expect, and the thing you actually care about.",
      "prompts": [
        {
          "label": "Where are you from, and what's one thing about your background that shaped who you are today?",
          "hint": "Not your whole life story. Just the one detail that if someone knew it, they'd understand you a little better. The town, the household, the experience, the thing that left a mark.",
          "key": "v1p0",
          "placeholder": "e.g. I grew up in a tiny town where the big Friday night event was the gas station... which sounds like nothing until you understand what it taught me about showing up when nobody's watching"
        },
        {
          "label": "What's something about you that surprises people when they find out?",
          "hint": "The thing that doesn't match the rest of your story. The unexpected hobby, the weird skill, the career pivot nobody saw coming, the thing you're secretly passionate about that has nothing to do with anything else.",
          "key": "v1p1",
          "placeholder": "e.g. most people are surprised that I spent three years competing in improv comedy, which probably explains more about how I think than anything on my resume"
        },
        {
          "label": "What do you actually care about, and why does it feel important enough to talk about publicly?",
          "hint": "Not your job description. The thing underneath it. The reason you light up about certain topics. The thing you wish more people understood or paid attention to.",
          "key": "v1p2",
          "placeholder": "e.g. what I actually care about is that people stop waiting to feel ready and start trusting that showing up imperfectly is worth more than not showing up at all"
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
      "title": "The Progress Signal",
      "note": "You showed up again. That alone is the story. Now tell the truth about what this has actually been like: what surprised you, what's shifted, what's still hard. Real-time honesty builds trust faster than any polished content.",
      "prompts": [
        {
          "label": "What's surprised you most about doing this so far, something you didn't expect, good or bad?",
          "hint": "Maybe filming was easier than you thought. Maybe it was harder. Maybe people reacted in a way you didn't anticipate. What caught you off guard?",
          "key": "v3p0",
          "placeholder": "e.g. what surprised me most is how much lighter I feel after each video, like I'm putting something down I didn't realize I was carrying"
        },
        {
          "label": "What's one small thing that's shifted for you, even if it's subtle? A moment, a feeling, a realization, a reaction from someone?",
          "hint": "It doesn't have to be dramatic. Maybe you noticed you were less nervous on Video 3 than Video 1. Maybe someone sent you a message. Name the small shift.",
          "key": "v3p1",
          "placeholder": "e.g. someone I hadn't talked to in two years messaged me after Video 2 and said 'I didn't know you felt that way'... and somehow that one message made the whole thing worth it"
        },
        {
          "label": "What's still hard? What are you still figuring out? Be specific.",
          "hint": "Don't clean this up. The messy middle is where people trust you the most. What's the thing you're wrestling with right now (about this challenge, about yourself, about putting yourself out there)?",
          "key": "v3p2",
          "placeholder": "e.g. I still hate watching myself back. Like physically uncomfortable. I don't know if that goes away or if you just learn to tolerate it"
        },
        {
          "label": "What would you tell someone who's watching you do this and thinking about starting themselves?",
          "hint": "Not advice. Not motivation. Just the honest truth from someone who's a few days ahead of them. What do you know now that you didn't know before Video 1?",
          "key": "v3p3",
          "placeholder": "e.g. I'd tell them the first video is the hardest one, not because of the filming, but because it makes real something you've been keeping theoretical for a long time"
        }
      ]
    },
    {
      "title": "The Second Epiphany",
      "note": "You've earned the right to say something most people won't. This is your second big reframe: a belief you used to hold, what it cost you, and what opened up when you let it go. The more personal and specific, the more universal it lands.",
      "prompts": [
        {
          "label": "What's something you believe that most people around you would disagree with (or at least wouldn't say out loud)?",
          "hint": "Not something designed to be controversial. Something genuinely true for you that goes against what your family, friends, coworkers, or culture treats as obvious.",
          "key": "v4p0",
          "placeholder": "e.g. I believe that most of what we call 'not being ready' is actually just fear of being judged, and the preparation is usually a delay tactic we've convinced ourselves is responsible"
        },
        {
          "label": "Where did this belief come from? What did you experience or witness that made you unable to keep believing the popular version?",
          "hint": "There was a before and an after. Something happened (maybe gradually, maybe in a single moment) that made the conventional wisdom impossible to keep holding.",
          "key": "v4p1",
          "placeholder": "e.g. it came from watching myself get ready for three years. Reading every book, taking every course, building every system. And then watching someone less prepared than me just start... and build something real"
        },
        {
          "label": "What was it costing you when you still believed the old way? Be specific about what you were doing, tolerating, or missing.",
          "hint": "Before you saw this clearly, you were living inside the old belief. What did that actually look like day to day? What were you putting up with? What were you chasing that turned out to be empty?",
          "key": "v4p2",
          "placeholder": "e.g. it was costing me time I'll never get back and conversations I kept not having because I kept waiting to feel qualified enough to have them"
        },
        {
          "label": "What opened up or changed when you let go of the old belief? What became possible that wasn't before?",
          "hint": "The other side. Not a fantasy. Your actual experience of life after the shift. What does the world look like through the new lens?",
          "key": "v4p3",
          "placeholder": "e.g. what opened up was the ability to act before I felt ready, which sounds simple, but it changed everything about how I show up"
        },
        {
          "label": "If you could say this to one specific person who's still stuck in the old belief (someone you care about)... what would you say to them?",
          "hint": "Picture one person. Someone you know who's living in the old belief right now. What do you want to say to them through the camera? Not a lecture. A direct, personal message.",
          "key": "v4p4",
          "placeholder": "e.g. I'd say: you're not getting more ready. Every day you wait, you're not building courage. You're building a bigger story about why you can't start yet"
        }
      ]
    },
    {
      "title": "Why I'm Here",
      "note": "You've been carrying something this whole challenge that you haven't said out loud yet. Video 6 is where you say it. The fear, the doubt, the deeper root, and what becomes possible when you name it. This is the video that turns viewers into believers.",
      "prompts": [
        {
          "label": "What's the thing you've been carrying through this whole challenge that you haven't said on camera yet? The fear, the doubt, the struggle that's still present even though you keep showing up.",
          "hint": "Not the surface-level stuff. Not 'filming is hard.' The REAL thing. Maybe it's the voice that says nobody cares. Maybe it's the comparison. Say the thing you've been avoiding.",
          "key": "v5p0",
          "placeholder": "e.g. the thing I've been carrying is the very specific fear that I'll finish all seven videos, put everything into this, and wake up to silence... and that silence will confirm the thing I've been trying to prove wrong"
        },
        {
          "label": "Where does that come from? Not the logical explanation. The deeper root. When did you first start believing that about yourself?",
          "hint": "This fear or doubt didn't start with the challenge. It was there before. Trace it back. You don't have to go into full detail. Just name the root.",
          "key": "v5p1",
          "placeholder": "e.g. it goes back further than this challenge. I think it started in the years I spent doing good work that nobody outside my immediate circle ever saw, slowly convincing myself that was fine"
        },
        {
          "label": "What would it mean to you, really honestly, if you could let go of that? What becomes possible on the other side of this battle?",
          "hint": "Don't make this aspirational fluff. Think about it practically. What would you DO differently? How would you FEEL differently? What would you stop avoiding?",
          "key": "v5p2",
          "placeholder": "e.g. if I could let go of it, I think I'd stop waiting for proof before I acted. I'd just act. And I'd stop treating my own work like it needs to earn the right to exist before I show it to anyone"
        },
        {
          "label": "What do you want to say to anyone watching this who's fighting their own version of the same battle?",
          "hint": "You've just told your story. The fear, the root, the possibility. What do you want to leave them with? Not advice. A message. The thing you wish someone had said to you when you were in the middle of the fight.",
          "key": "v5p3",
          "placeholder": "e.g. I want to say: the fact that you're watching this means part of you already knows. You don't need more proof. Just decide that this thing you're carrying doesn't get to keep making your decisions"
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
      "note": "Your audience doesn't just want to know what you do. They want to understand how you became someone who knows this. This video tells the origin: how you got here, what you've seen, and why you can't stop caring about it.",
      "prompts": [
        {
          "label": "How did you get into this? Not the professional version. The real story of how you ended up knowing what you know.",
          "hint": "Maybe it was accidental. Maybe you were trying to solve your own problem. Maybe someone else's problem landed in your lap and you realized you were good at this. What actually happened?",
          "key": "v1p0",
          "placeholder": "e.g. I got into this because my sister was drowning in debt after her divorce and I helped her build a plan that got her out in 18 months. Her friends started asking me for help. Then their friends."
        },
        {
          "label": "What's the thing you've noticed that most people get wrong about your area of expertise?",
          "hint": "The mistake you see over and over. The bad advice that makes you cringe. The thing you wish you could shake people and tell them. You don't need to name names. Just describe what you see happening.",
          "key": "v1p1",
          "placeholder": "e.g. everyone thinks the problem is discipline. It's not. Most people's money problems aren't math problems. They're emotional regulation problems wearing a math costume."
        },
        {
          "label": "Why does this matter to you personally (not professionally)?",
          "hint": "Strip away the business angle entirely. Why do you CARE about this? What's the deeper reason this topic or this work gets under your skin in a way you can't ignore?",
          "key": "v1p2",
          "placeholder": "e.g. because I grew up watching money destroy my parents' marriage and I know it doesn't have to be like that."
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
      "title": "The Progress Signal",
      "note": "You're in the middle of this challenge. Report honestly from there. Not a performance of progress. Actual progress. What surprised you, what's working, what's still hard, and what you're starting to understand.",
      "prompts": [
        {
          "label": "What's surprised you about trying to communicate your expertise on camera? What's different about it than you expected?",
          "hint": "Maybe you realized how hard it is to be simple. Maybe you discovered that the thing you thought was your main message isn't actually what resonates. Maybe doing this publicly is teaching you something about your own expertise that you didn't see before.",
          "key": "v3p0",
          "placeholder": "e.g. I assumed the hard part would be the camera. It's not. The hard part is figuring out what to leave out. I know too much and I'm still learning how to be concise without losing the point."
        },
        {
          "label": "What's one moment or result so far that made you think 'okay, this is actually working,' even if it was small?",
          "hint": "A comment from the right kind of person. A conversation that started because of a video. A moment where you explained something and it landed better than you expected. Something that showed you there's traction here.",
          "key": "v3p1",
          "placeholder": "e.g. someone I've never met messaged me after Video 2 to say they'd been thinking about what I said for two days. That was the moment I stopped wondering if this was worth doing."
        },
        {
          "label": "What's still hard about this? What are you still wrestling with (about the content, about showing up, about putting your knowledge out there?",
          "hint": "The real friction. Maybe it's the vulnerability of being visible. Maybe it's the gap between what you know and how to say it concisely. Maybe it's imposter syndrome showing up even though you KNOW you're good at this. Name it.",
          "key": "v3p2",
          "placeholder": "e.g. the thing I'm still wrestling with is the gap between how clearly I can think through this with a client and how fuzzy it feels when I try to say it into a camera in two minutes."
        },
        {
          "label": "What are you starting to understand about your audience, your message, or yourself that you didn't understand before this challenge?",
          "hint": "A few days of putting yourself out there teaches you things that years of planning never could. What's becoming clearer? About who responds to you, about what you actually want to say, about how this could grow into something real?",
          "key": "v3p3",
          "placeholder": "e.g. I'm starting to understand that the people who need me most aren't the ones I was picturing — they're quieter, more self-aware, and they're looking for permission to trust what they already know, not more information."
        }
      ]
    },
    {
      "title": "The Second Epiphany",
      "note": "Deeper. More personal. More convicted. The biggest myth in your field: not a tip, but a genuine paradigm shift earned through doing the work. You're not sharing an opinion, you're sharing what you can't unsee.",
      "prompts": [
        {
          "label": "What's the biggest myth or most overused piece of advice in your field that you've come to believe is actually wrong — or even harmful?",
          "hint": "The sacred cow. The thing every guru says. The advice that gets repeated so often nobody questions it anymore. You question it. You've seen what happens when people follow it. What is it?",
          "key": "v4p0",
          "placeholder": "e.g. the biggest myth in my field is that consistency is the answer. Post every day, show up every day, grind every day. I've watched people burn out following that advice and then blame themselves for failing."
        },
        {
          "label": "Tell the story of your own relationship with this belief. Did you used to follow it? Teach it? What happened that made you turn against it?",
          "hint": "The most powerful version of this is when YOU were a believer first. You followed the playbook. You recommended it to others. And then something happened that made you see it was broken. That personal journey from believer to heretic is what makes this credible, not preachy.",
          "key": "v4p1",
          "placeholder": "e.g. I used to tell my clients this. I believed in it. I built my own routine around it. And then I watched my most dedicated client — someone who followed every rule — completely crater her mental health in pursuit of consistency and end up taking six months off."
        },
        {
          "label": "What's the actual truth — the thing that works but nobody talks about because it's less sexy, less simple, or threatens the established way of doing things?",
          "hint": "The real answer. The thing you've figured out through doing the work, not reading about the work. It might be simpler than the myth. It might be harder. But it's TRUE, and you can back it up with your own experience and results.",
          "key": "v4p2",
          "placeholder": "e.g. depth beats volume every time. One video that changes how someone thinks is worth more than thirty that they half-watch. The people winning aren't the ones posting most. They're the ones saying the most true thing."
        },
        {
          "label": "What happens to people who keep following the myth? What have you watched it cost your peers, your clients, or people in your space?",
          "hint": "Be specific. Not 'they fail.' HOW do they fail? What does it look like? The wasted money, the wasted time, the frustration, the quitting.",
          "key": "v4p3",
          "placeholder": "e.g. they burn out. They create for months, see no results, decide they're not interesting enough, and quit. The myth told them consistency would compound. Nobody told them they also needed to have something worth saying."
        },
        {
          "label": "Who specifically needs to hear this, and what would change for them if they actually believed you?",
          "hint": "Picture one specific person. A client, a peer, someone who asked you for advice last week. If THEY got this — really got it — what would shift for them? That's the emotional engine. That's why you're saying this out loud instead of keeping it to yourself.",
          "key": "v4p4",
          "placeholder": "e.g. this is for the expert who's been posting dutifully for months with nothing to show for it and is starting to think the problem is them. It's not them. They just got sold a system designed for content farms, not humans with something to say."
        }
      ]
    },
    {
      "title": "Why I'm Still Here",
      "note": "This is the video most people skip because it feels too vulnerable. That's exactly why it's the most important one. The internal battle about claiming your expertise publicly — said out loud, on camera — is what makes every other video retroactively believable.",
      "prompts": [
        {
          "label": "What's the internal battle you're fighting about putting yourself out there as someone with real expertise? The thing that makes you hesitate even though you KNOW you're good at this.",
          "hint": "Imposter syndrome. Comparison. The fear of being 'that person' who promotes themselves. The voice that says your experience doesn't count because you don't have the right credentials, the right following, the right whatever. What's YOUR version of that battle?",
          "key": "v5p0",
          "placeholder": "e.g. my version of this is the credential question — I don't have letters after my name. I learned everything I know from fifteen years of doing this work with real people. But the voice still shows up asking who I think I am."
        },
        {
          "label": "What's the specific fear? If you imagine fully owning your expertise publicly — being visible, being known for what you know — what's the worst thing that could happen? Say it out loud.",
          "hint": "Sometimes the fear is concrete: 'people from my old life will judge me.' Sometimes it's abstract: 'what if I put myself out there and nobody cares.' Sometimes it's deeper: 'what if I'm not actually as good as I think I am.' Name the actual fear. Not the category — the specific thought.",
          "key": "v5p1",
          "placeholder": "e.g. the specific fear is that someone I respect will watch one of these videos and think 'she's overreaching.' That one imaginary judgment has cost me more than two years of staying quiet."
        },
        {
          "label": "What's it been costing you to stay small? Not in money, but in impact, in fulfillment, in the people you could be helping but aren't because you've been hiding.",
          "hint": "You know there are people who need what you know. You've probably met some of them. What happens to them because you haven't stepped into this fully? And what happens to YOU... what are you leaving on the table by playing it safe?",
          "key": "v5p2",
          "placeholder": "e.g. what it's been costing me is harder to name than money. There are people right now making the exact mistakes I know how to prevent, and I haven't shown up for them because I've been waiting to feel ready."
        },
        {
          "label": "Despite all of that... why are you still here? Why haven't you quit? What's the thing that keeps pulling you forward even when the doubt is loud?",
          "hint": "Something is stronger than the fear. A purpose, a person, a vision, a stubborn refusal to let the doubt win. That thing — whatever it is — is the real engine underneath everything you've built so far. Name it.",
          "key": "v5p3",
          "placeholder": "e.g. I'm still here because I keep meeting people who are stuck in the exact place I was stuck in. And when I talk to them — even for twenty minutes — something shifts. That shift is what I'm here for. The doubt is just the admission fee."
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
