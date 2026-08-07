-- Migrate the original Colorado Mastermind VIP Vault into EEE Studio.
-- The title check keeps this safe to re-run during deployment or recovery.

insert into public.solution_vault_items
  (title, speaker, topic, description, video_url, sort_order)
select seed.title, seed.speaker, seed.topic, seed.description, seed.video_url, seed.sort_order
from (values
  ('Scale Your Leadership with Anastasia Button', 'Anastasia Button', 'Leadership', 'A Colorado Mastermind session about leadership, business growth, and taking responsibility for the next stage of the work.', 'https://api.vadoo.tv/landing_page?vid=yGXP4etaTYfQmfkQNFX7dawEslN4v4U9', 10),
  ('The Art of Negotiation with Elizabeth Suarez', 'Elizabeth Suarez', 'Negotiation', 'A practical conversation about negotiation, communication, and reaching an agreement without giving away the outcome that matters.', 'https://api.vadoo.tv/landing_page?vid=nudoCUIjwreAioE0Eeaq5hBscTPMNJWw', 20),
  ('Fearless Business During Times of Change with Randy Ferguson', 'Randy Ferguson', 'Resilience', 'A Colorado Mastermind session about making business decisions while the market, the plan, or the world around you is changing.', 'https://api.vadoo.tv/landing_page?vid=lmMeMkLXx4rIuWjgSFubeULLFSyq9nWx', 30),
  ('Goal Setting with David Bee', 'David Bee', 'Planning', 'A working session on setting goals that can survive contact with a real schedule and turn into concrete next actions.', 'https://api.vadoo.tv/landing_page?vid=eeD6oxXJi2d6KlBwTrUglLcr5wy40zfG', 40),
  ('Matters of Mindset with Amanda Metzger', 'Amanda Metzger', 'Mindset', 'A conversation about the beliefs, reactions, and internal patterns that shape how a person approaches difficult work.', 'https://api.vadoo.tv/landing_page?vid=p6eH3XUQCopdgomW9BsHoQd5PyTyTC68', 50),
  ('Social Media Marketing with Aimee, Part 1', 'Aimee', 'Marketing', 'Part one of a practical Colorado Mastermind training on social media strategy, communication, and reaching the right audience.', 'https://api.vadoo.tv/landing_page?vid=XayswQDQtRToeS1dLX99wDS0ItKBC-q0', 60),
  ('Social Media Marketing with Aimee, Part 2', 'Aimee', 'Marketing', 'Part two of the social media marketing training, continuing the strategy and implementation work from the first session.', 'https://api.vadoo.tv/landing_page?vid=BpzEKcYcUiR8u1kv5DHYpJahz3UKHUxD', 70),
  ('Use Your Difference to Make a Difference', 'Tayo Rockson', 'Identity', 'Tayo Rockson joins David Bee to discuss identity, difference, communication, and using personal experience in service of meaningful work.', 'https://api.vadoo.tv/landing_page?vid=mROnHs5vsS7Y4Ql2Hnpafcb1yka9ALrT', 80),
  ('Exit Your Business Rich', 'Michelle Seiler Tucker', 'Business Exit', 'Michelle Seiler Tucker discusses building a business with value beyond its owner and preparing it for a strong eventual exit.', 'https://api.vadoo.tv/landing_page?vid=P9R6HODF763O3guonR7OpGYwyprdEweX', 90),
  ('Building a Co-working Business', 'Chad Johnson', 'Business Building', 'Chad Johnson joins David Bee to discuss co-working, physical community, entrepreneurship, and building a business around how people work.', 'https://api.vadoo.tv/landing_page?vid=8ymfdfoCanqKp0aVT4bp8xJl28VbX1P0', 100),
  ('Your Personal Brand Is Your Future', 'Professor Nez', 'Personal Brand', 'Professor Nez joins David Bee for a conversation about personal branding, live video, visibility, and building trust online.', 'https://api.vadoo.tv/landing_page?vid=QjvWCPRwavz0JswddcJ10uiR8MA85Qpm', 110),
  ('Working Like a Spartan', 'Jeremy Knauff', 'Execution', 'Jeremy Knauff joins David Bee to discuss disciplined execution, entrepreneurship, marketing, and doing difficult work consistently.', 'https://api.vadoo.tv/landing_page?vid=HylYIPhybLZjBQBio7SDdfWkklOvM1CM', 120),
  ('Healing Your Money Wounds', 'Trevor Mickelson', 'Money', 'Trevor Mickelson joins David Bee for a conversation about money beliefs, old financial wounds, and the decisions those beliefs quietly influence.', 'https://api.vadoo.tv/landing_page?vid=0X3G3njNqTX8ex7e2Ky3sBFR7vw9N1zR', 130)
) as seed(title, speaker, topic, description, video_url, sort_order)
where not exists (
  select 1 from public.solution_vault_items existing where existing.title = seed.title
);
