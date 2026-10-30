# StorySculpt: what a screen reader hears

Browser: `chromium`. Captured from the rendered accessibility tree; every network call was stubbed.

**Limit:** this is an accessibility-tree inspection, not a real VoiceOver session. It proves roles, names, selected state, live-region wiring and heading structure, not every spoken behavior of a particular screen reader.

## first-visit

Screenshot: `docs/storysculpt-walk/chromium/shots/034-a11y-first-visit.jpg`
Transcript: `a11y/first-visit.yml`

Heading outline: h1 “StorySculpt” → h2 “Chats” → h2 “Start a script the way you talk.” → h3 “Turn raw thoughts into video scripts that sound like you.” → h4 “Why the 5E interview keeps your voice” → h4 “What to expect: 5 to 10 minutes” → h4 “What happens when your script is ready”

```yaml
- banner:
  - link "SS StorySculpt":
    - /url: /
    - text: SS
    - heading "StorySculpt" [level=1]
  - link "My Studio":
    - /url: /
    - img
    - text: My Studio
  - button "Change color theme":
    - img
  - button "W"
- main:
  - complementary:
    - heading "Chats" [level=2]:
      - button "Chats":
        - text: Chats
        - img
    - button "Start a new StorySculpt chat":
      - img
  - paragraph: StorySculpt · First Script Orientation
  - heading "Start a script the way you talk." [level=2]
  - paragraph: Talk through rough thoughts in a conversational interview. StorySculpt asks one question at a time and shapes your answers into a video script that sounds like you.
  - region "Turn raw thoughts into video scripts that sound like you.":
    - img
    - text: First Script Orientation
    - heading "Turn raw thoughts into video scripts that sound like you." [level=3]
    - paragraph: Getting on camera is hard when a blank page stares back at you, or when generic tools turn your thoughts into stiff corporate slogans. StorySculpt solves that. You talk through raw thoughts in a focused interview, and the system shapes your exact phrasing into a ready-to-film script.
    - text: "1"
    - heading "Why the 5E interview keeps your voice" [level=4]
    - paragraph:
      - text: "Generic tools guess what you mean and flatten your personality. StorySculpt asks 4 to 6 focused questions to draw out the core emotional direction of your video:"
      - strong: Entertainment, Enragement, Epiphany, Empathy, or Education.
    - paragraph: It keeps your actual phrasing, natural cadence, and rough opinions so the finished script sounds like you talking to a friend.
    - text: "2"
    - 'heading "What to expect: 5 to 10 minutes" [level=4]'
    - paragraph: "An interview takes about 5 to 10 minutes across 4 to 6 conversational turns. No preparation or polished outline is required: unedited thoughts and honest rants give the framework the real detail it needs."
    - paragraph: Pick a format below, answer each question in your own words, and pause whenever you want. Your work saves as you go.
    - text: "3"
    - heading "What happens when your script is ready" [level=4]
    - paragraph: Your finished script appears in the script panel with line-by-line editing, instant note refinement, and one-click export for your teleprompter.
    - paragraph: When you record, mark the script filmed to track your momentum. Build a steady library of filmed videos, keep your story profile updated, and start your next script anytime.
    - text: Step 1
    - strong: Choose your format
    - text: Pick a format below and answer questions in your own words. Step 2
    - strong: Review your script
    - text: Refine lines with a quick note, edit text inline, or export. Step 3
    - strong: Record and mark filmed
    - text: Get on camera, track your momentum, and repeat. Choose your format to begin
    - paragraph: "Each format shapes your video for a specific audience reaction:"
    - paragraph: You can't change this later; start a new script for a different format.
  - region "Script format options":
    - button "Controversial Take A sharp point of view that challenges accepted wisdom.":
      - img
      - strong: Controversial Take
      - text: A sharp point of view that challenges accepted wisdom.
    - button "Mini-Webinar A compact lesson with a story to teach one insight clearly.":
      - img
      - strong: Mini-Webinar
      - text: A compact lesson with a story to teach one insight clearly.
    - button "5E Talking Head A raw thought with emotional momentum and personal honesty.":
      - img
      - strong: 5E Talking Head
      - text: A raw thought with emotional momentum and personal honesty.
    - button "UGC / Product Video A creator-led breakdown that highlights a product naturally.":
      - img
      - strong: UGC / Product Video
      - text: A creator-led breakdown that highlights a product naturally.
```

## interview

Screenshot: `docs/storysculpt-walk/chromium/shots/035-a11y-interview.jpg`
Transcript: `a11y/interview.yml`

Heading outline: h1 “StorySculpt” → h2 “Chats1” → h2 “Script Editor”

```yaml
- banner:
  - link "SS StorySculpt":
    - /url: /
    - text: SS
    - heading "StorySculpt" [level=1]
  - link "My Studio":
    - /url: /
    - img
    - text: My Studio
  - button "Change color theme":
    - img
  - button "W"
- main:
  - complementary:
    - heading "Chats 1" [level=2]:
      - button "Chats 1":
        - text: Chats 1
        - img
    - button "Start a new StorySculpt chat":
      - img
  - heading "Script Editor" [level=2]
  - textbox "Chat title": Stop selling features
  - button "Notes":
    - img
    - text: Notes
  - button "Delete":
    - img
    - text: Delete
  - article:
    - text: StorySculpt What is the core thought or frustration on your mind today?
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - article:
    - text: You Everyone in SaaS keeps pitching features instead of outcomes. People do not buy code, they buy certainty.
    - button "Don’t use this":
      - img
      - text: Don’t use this
  - article:
    - text: StorySculpt Tell me about a specific time a client had all the features they thought they wanted and still failed.
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - article:
    - text: You A founder spent nine months building twenty-four integrations. Zero users because nobody understood what problem it actually solved.
    - button "Don’t use this":
      - img
      - text: Don’t use this
  - article:
    - text: StorySculpt What was the one realization that turned it around for them?
    - button "Regenerate":
      - img
      - text: Regenerate
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - status
  - textbox "Your answer":
    - /placeholder: Write it the way you would say it. Rough is useful.
  - button "Speak instead of typing": 🎤
  - button "Send":
    - img
  - paragraph: StorySculpt saves your chat as you go.
```

## finished

Screenshot: `docs/storysculpt-walk/chromium/shots/036-a11y-finished.jpg`
Transcript: `a11y/finished.yml`

Heading outline: h1 “StorySculpt” → h2 “Chats1” → h2 “Script Editor”

```yaml
- banner:
  - link "SS StorySculpt":
    - /url: /
    - text: SS
    - heading "StorySculpt" [level=1]
  - link "My Studio":
    - /url: /
    - img
    - text: My Studio
  - button "Change color theme":
    - img
  - button "W"
- main:
  - complementary:
    - heading "Chats 1" [level=2]:
      - button "Chats 1":
        - text: Chats 1
        - img
    - button "Start a new StorySculpt chat":
      - img
  - heading "Script Editor" [level=2]
  - textbox "Chat title": The Outcome-First Method
  - button "Notes":
    - img
    - text: Notes
  - button "Delete":
    - img
    - text: Delete
  - button "Chat":
    - img
    - text: Chat
  - button "Script v1":
    - img
    - text: Script v1
  - article:
    - text: StorySculpt What is the core thought on your mind today?
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - article:
    - text: You Stop pitching features. Pitch certainty.
    - button "Don’t use this":
      - img
      - text: Don’t use this
  - article:
    - text: StorySculpt Tell me about a time that proved this.
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - article:
    - text: You When we stopped listing features and focused on the outcome, conversion doubled in two weeks.
    - button "Don’t use this":
      - img
      - text: Don’t use this
  - article:
    - text: StorySculpt Your script is assembled and ready to film below.
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - status
  - img
  - paragraph:
    - strong: Interview finished.
    - text: This script is finished. Refine it with a note or start a new chat.
  - button "New chat":
    - img
    - text: New chat
  - paragraph:
    - strong: "Next:"
    - text: Film this script, then mark it Filmed.
  - button "Mark filmed"
  - textbox "What to change in the script":
    - /placeholder: What should change? e.g. make it shorter, cut the repeated lesson, give it a warmer ending.
  - button "Speak instead of typing": 🎤
  - button "Revise":
    - text: Revise
    - img
  - button "Regenerate the script":
    - img
    - text: Regenerate
```

## story-profile

Screenshot: `docs/storysculpt-walk/chromium/shots/037-a11y-story-profile.jpg`
Transcript: `a11y/story-profile.yml`

Heading outline: h1 “StorySculpt” → h2 “Chats1” → h2 “Script Editor” → h2 “Set this once. Every chat reads it.”

```yaml
- banner:
  - link "SS StorySculpt":
    - /url: /
    - text: SS
    - heading "StorySculpt" [level=1]
  - link "My Studio":
    - /url: /
    - img
    - text: My Studio
  - button "Change color theme":
    - img
  - button "W"
- main:
  - complementary:
    - heading "Chats 1" [level=2]:
      - button "Chats 1":
        - text: Chats 1
        - img
    - button "Start a new StorySculpt chat":
      - img
  - heading "Script Editor" [level=2]
  - textbox "Chat title": Stop selling features
  - button "Notes":
    - img
    - text: Notes
  - button "Delete":
    - img
    - text: Delete
  - article:
    - text: StorySculpt What is the core thought or frustration on your mind today?
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - article:
    - text: You Everyone in SaaS keeps pitching features instead of outcomes. People do not buy code, they buy certainty.
    - button "Don’t use this":
      - img
      - text: Don’t use this
  - article:
    - text: StorySculpt Tell me about a specific time a client had all the features they thought they wanted and still failed.
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - article:
    - text: You A founder spent nine months building twenty-four integrations. Zero users because nobody understood what problem it actually solved.
    - button "Don’t use this":
      - img
      - text: Don’t use this
  - article:
    - text: StorySculpt What was the one realization that turned it around for them?
    - button "Regenerate":
      - img
      - text: Regenerate
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - status
  - textbox "Your answer":
    - /placeholder: Write it the way you would say it. Rough is useful.
  - button "Speak instead of typing": 🎤
  - button "Send":
    - img
  - paragraph: StorySculpt saves your chat as you go.
- complementary "Your story profile":
  - paragraph: Your story profile
  - heading "Set this once. Every chat reads it." [level=2]
  - button "Close story profile":
    - img
  - paragraph: These are the standing facts about you and your work. StorySculpt keeps them in mind on every script, so you never re-explain who you are.
  - text: What should StorySculpt call you?
  - textbox "What should StorySculpt call you?":
    - /placeholder: Your name
    - text: Alex
  - text: What do you do?
  - textbox "What do you do?":
    - /placeholder: Coach, founder, creator, consultant
    - text: Founder and positioning coach
  - text: Who are your videos for?
  - textbox "Who are your videos for? Speak instead of typing":
    - /placeholder: The people you are talking to and what they care about.
    - text: Bootstrapped B2B founders selling high-ticket services
  - button "Speak instead of typing": 🎤
  - text: Your voice and phrasing
  - textbox "Your voice and phrasing Speak instead of typing":
    - /placeholder: How you sound, words and phrases you use, and anything you never want to say.
    - text: Direct, calm, practical, no hype words
  - button "Speak instead of typing": 🎤
  - text: Offers and recurring calls to action
  - textbox "Offers and recurring calls to action Speak instead of typing":
    - /placeholder: What you sell or point people to, and the call to action you come back to.
    - text: Quarterly positioning sprint
  - button "Speak instead of typing": 🎤
  - text: Facts and results to reuse
  - textbox "Facts and results to reuse Speak instead of typing":
    - /placeholder: True details, numbers, credentials, or stories you reuse. StorySculpt will not invent these.
    - text: Built three profitable micro-SaaS companies; 12 years consulting
  - button "Speak instead of typing": 🎤
  - text: Anything else
  - textbox "Anything else Speak instead of typing":
    - /placeholder: Anything else StorySculpt should keep in mind.
    - text: Prefers short sentences and concrete examples
  - button "Speak instead of typing": 🎤
  - paragraph
  - button "Save profile":
    - img
    - text: Save profile
```

## help-dialog

Screenshot: `docs/storysculpt-walk/chromium/shots/038-a11y-help-dialog.jpg`
Transcript: `a11y/help-dialog.yml`

Heading outline: h1 “StorySculpt” → h2 “Chats1” → h2 “Script Editor” → h2 “Help & privacy” → h3 “Who makes this?” → h3 “What does membership include, and how does it renew?” → h3 “What happens to my work?” → h3 “Can I change the format?” → h3 “Can I pause and come back?” → h3 “What does finishing a script mean?” → h3 “How long does an interview take?” → h3 “What happens after my first script?” → h3 “Can I archive or delete a chat?” → h3 “What should I do next?” → h3 “Where do I get help?”

```yaml
- banner:
  - link "SS StorySculpt":
    - /url: /
    - text: SS
    - heading "StorySculpt" [level=1]
  - link "My Studio":
    - /url: /
    - img
    - text: My Studio
  - button "Change color theme":
    - img
  - button "W"
- main:
  - complementary:
    - heading "Chats 1" [level=2]:
      - button "Chats 1":
        - text: Chats 1
        - img
    - button "Start a new StorySculpt chat":
      - img
  - heading "Script Editor" [level=2]
  - textbox "Chat title": Stop selling features
  - button "Notes":
    - img
    - text: Notes
  - button "Delete":
    - img
    - text: Delete
  - article:
    - text: StorySculpt What is the core thought or frustration on your mind today?
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - article:
    - text: You Everyone in SaaS keeps pitching features instead of outcomes. People do not buy code, they buy certainty.
    - button "Don’t use this":
      - img
      - text: Don’t use this
  - article:
    - text: StorySculpt Tell me about a specific time a client had all the features they thought they wanted and still failed.
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - article:
    - text: You A founder spent nine months building twenty-four integrations. Zero users because nobody understood what problem it actually solved.
    - button "Don’t use this":
      - img
      - text: Don’t use this
  - article:
    - text: StorySculpt What was the one realization that turned it around for them?
    - button "Regenerate":
      - img
      - text: Regenerate
    - button "Copy":
      - img
      - text: Copy
    - button "Use as Script":
      - img
      - text: Use as Script
  - status
  - textbox "Your answer":
    - /placeholder: Write it the way you would say it. Rough is useful.
  - button "Speak instead of typing": 🎤
  - button "Send":
    - img
  - paragraph: StorySculpt saves your chat as you go.
- dialog "Help & privacy":
  - paragraph: StorySculpt
  - heading "Help & privacy" [level=2]
  - button "Close help":
    - img
  - heading "Who makes this?" [level=3]
  - paragraph: Built and supported by David Bee. StorySculpt is part of The Momentum Hub, and every step of it follows David's own scriptwriting method.
  - heading "What does membership include, and how does it renew?" [level=3]
  - paragraph: StorySculpt is included with The Momentum Hub's $250 USD monthly membership, plus any applicable tax. It renews automatically each month until cancelled. Your checkout states the terms for your purchase; a separate program or manual access grant can have different terms.
  - paragraph:
    - text: For cancellation, contact
    - link "email@davidbee.me":
      - /url: mailto:email@davidbee.me?subject=Momentum%20Hub%20membership
    - text: . When Studio processes a cancellation, access from that purchase ends without an automatic wait until the billing period ends. Another active grant can still provide access. Cancellation does not automatically delete your saved work, but keeping records does not guarantee continued access or permanent storage. Copy or download scripts you want to keep before access ends. Read the
    - link "billing, access, and cancellation terms":
      - /url: /terms#pricing-cancellation
    - text: .
  - heading "What happens to my work?" [level=3]
  - paragraph: Your chats, project titles, notes, finished scripts, and story profile are saved to your Studio account so you can return to them. When you ask StorySculpt to continue or revise, your title, profile, notes, and recent messages are processed by the AI model that writes your next question or draft, guided by David's method and your own words. Do not enter anything you do not want processed by an AI service.
  - paragraph: "Step away whenever you like. Nothing is deleted when you stop: your chats and scripts stay in your account until you delete them. You can delete a chat and its saved script with the Delete button inside that chat. Your standing story profile is separate and can be edited from Story profile."
  - heading "Can I change the format?" [level=3]
  - paragraph: The format is locked after creation. Start a new script to use a different format; your existing chat stays in your list.
  - heading "Can I pause and come back?" [level=3]
  - paragraph: "Yes. Leaving does not delete your project. Reopen the chat to resume the interview where you stopped. Check the save indicator before closing the browser: Saving means a write is pending, Saved means it was acknowledged, and Not saved means the latest change has not reached your account yet. Changes kept only on this device are not available on another device until saved."
  - heading "What does finishing a script mean?" [level=3]
  - paragraph: Finishing closes the interview to new turns and assembles your answers into a script you can record. Once a script is finished, the interview is locked so your script stays stable. A new answer cannot be added to a finished interview; use Refine with a note to change the script, or start a new chat for your next script. Copy it or download the text file when you are ready to film. Your saved script does not expire; it stays in your account until you delete it.
  - heading "How long does an interview take?" [level=3]
  - paragraph: An interview takes about 5 to 10 minutes across 4 to 6 conversational turns. You talk through raw, unedited thoughts one question at a time in your natural phrasing, without needing an outline, slide deck, or prepared notes. Rough answers give the 5E framework the real emotional tension and personal perspective your video needs.
  - heading "What happens after my first script?" [level=3]
  - paragraph: When your first script is finished, it is ready to record. You can copy it directly to your teleprompter or download the text file to film your video. Once you film, mark it filmed or start your next script to build momentum. Your saved scripts stay in your library and your standing story profile carries forward what StorySculpt learned about your voice and audience into every new script you create.
  - heading "Can I archive or delete a chat?" [level=3]
  - paragraph: "Leaving pauses your chat; it does not delete anything. Check that your changes say Saved before closing the browser. Archive puts a chat away without deleting its notes, answers or script. Use the Archive button beside its title, then open Archived and choose Restore chat to bring it back to All. Delete is different: after you confirm, it permanently removes the chat and its saved script."
  - heading "What should I do next?" [level=3]
  - paragraph:
    - strong: "Next:"
    - text: Answer the next question to finish this script.
  - button "Continue"
  - heading "Where do I get help?" [level=3]
  - paragraph:
    - text: For a question about a script, chat, or your story profile, email
    - link "email@davidbee.me":
      - /url: mailto:email@davidbee.me?subject=StorySculpt%20support
    - text: and say what you were doing. For Studio sign-in, access, or billing, use the
    - link "Studio home":
      - /url: /eee
    - text: and its account support options, or email the same address with “Studio account” in the subject.
  - paragraph:
    - text: Review our
    - link "Terms of Service, AI usage, and FAQ":
      - /url: /terms
    - text: .
```
