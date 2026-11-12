# WBR-477: Colorado Mastermind Networking Page Review

Review of the networking preview built in commit 4015d78 (`wbr-477-agnight-20261109`) against David's decision on 2026-11-12.

## The Standard

On November 12, David rejected sending traffic away from his own front door:
> "That's an awful idea lol, why would I get people away from my beautiful CoMM landing page and replace it with the clunky eventbrite page I don't own? That's not how funnels work."

Recorded in `state/VOCABULARY.md`: attention goes to his own landing page (`coloradomastermind.com`), never away from it to a third-party page or an isolated destination that breaks the funnel.

## What in 4015d78 Fits

1. **Own database and data control:** The submissions go into our own Supabase backend (`public.network_directory`), never a third-party directory, external form service, or rent-seeking directory SaaS. David owns the list.
2. **Admin approval queue:** Submissions land in `pending` status. An approval workflow in `admin.html` and `js/admin-studio.js` lets David or WorkerBee review, approve, or hide entries before they become visible to anyone. Public queries only return approved entries.
3. **Exact attendee fields:** Directly answers David's capture: name, what they do, link to website or profile, collaborating interest (yes/no), and explicit permission to list them.

## What Does Not Fit

1. **Brand and surface dislocation:** In 4015d78, the directory is styled as a dark Momentum Hub Studio app (`network.html` with `hub-theme.css` and `studio.css`). It looks like a software dashboard tool rather than an extension of "my beautiful CoMM landing page."
2. **Destination confusion:** If attendees are sent to `studio.coloradomastermind.com/network` or a separate Vercel URL that is not clearly anchored to `coloradomastermind.com`, it pulls people away from the primary invitation and event funnel David is protecting.
3. **Systeme boundary:** David noted in the capture: "maybe I will host it on systeme, i'm not sure yet." But WorkerBee cannot reliably edit raw HTML and script boxes inside Systeme pages without risking formatting breakage. Building the interactive form and live database query directly inside Systeme's editor is brittle.

## Concrete Options for Where the Networking Page Lives

Here are three clear paths. You can pick the number on the card:

### Option 1: Dedicated CoMM subdomain styled to match your landing page (Recommended)

Host the directory at `network.coloradomastermind.com` on Vercel, but restyle `network.html` completely out of the dark Studio palette and into your Colorado Mastermind brand colors, logo, and typography. Include a sticky top header with a direct link back to `coloradomastermind.com`.

- **Why this works:** Keeps the working interactive directory, instant validation, and Supabase admin queue already written in 4015d78, but makes it look and feel like part of your Colorado Mastermind site rather than an internal software tool.
- **Maintenance:** WorkerBee maintains it safely in Git without touching Systeme.

### Option 2: Embeddable directory widget for your existing CoMM landing page

Keep the backend and admin queue on Supabase, but compile the directory into a single lightweight iframe or script snippet that you paste once into a Systeme section on `coloradomastermind.com` (for example, right below the meeting details or on a `/network` page in Systeme).

- **Why this works:** Keeps visitors 100% on `coloradomastermind.com` under your main domain.
- **Maintenance:** You paste the embed block once into Systeme; WorkerBee never has to edit the Systeme page again because all directory updates and approvals flow through the database.

### Option 3: Post-meeting attendee portal (Not on the public front door)

Keep the directory off the public landing page entirely. Treat the roledex as an exclusive perk for people who actually register and attend the Mastermind meetings. The link is shared in the Zoom chat and the post-meeting follow-up email.

- **Why this works:** Protects member privacy (only actual participants browse or join the roledex) and keeps the public landing page 100% focused on one job: getting people to register for the upcoming meeting.
- **Maintenance:** Uses the Vercel-hosted page from Option 1 without cluttering the public acquisition funnel.

## Next Step

Pick Option 1, 2, or 3 on the Board card. If you pick Option 1 or Option 2, the next late-morning lane can apply the migration, restyle the frontend to match CoMM, and deploy the verified build.
