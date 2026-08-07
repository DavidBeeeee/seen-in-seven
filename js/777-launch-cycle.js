(function () {
  'use strict';

  const cycle = Object.freeze({
    timezone: 'America/Denver',
    challengeStart: '2026-09-07T06:00:00Z',
    kickoffStarts: '2026-09-07T17:00:00Z',
    kickoffEnds: '2026-09-07T19:00:00Z',
    kickoffReplayCloses: '2026-09-15T06:00:00Z',
    graduationStarts: '2026-09-15T17:00:00Z',
    graduationEnds: '2026-09-15T19:00:00Z',
    cartCloses: '2026-09-20T06:00:00Z',
    routes: Object.freeze({
      kickoffRegistration: 'https://content.coloradomastermind.com/kickoff',
      kickoffRoom: '',
      kickoffReplay: '',
      graduationRegistration: 'https://content.coloradomastermind.com/graduation',
      graduationRoom: '',
      graduationReplay: '',
      eeeCheckout: 'https://content.coloradomastermind.com/yeseee',
      eeeDetails: 'https://content.coloradomastermind.com/yeees',
      studio: 'https://studio.coloradomastermind.com/',
      seenInSeven: 'https://studio.coloradomastermind.com/seeninseven'
    })
  });

  function eventState(now, starts, ends, replayCloses) {
    if (now < starts) return 'registration';
    if (now < ends) return 'live';
    if (now < replayCloses) return 'replay';
    return 'closed';
  }

  function launchState(input) {
    const now = input instanceof Date ? input : new Date(input || Date.now());
    const time = now.getTime();
    const kickoff = eventState(time, Date.parse(cycle.kickoffStarts), Date.parse(cycle.kickoffEnds), Date.parse(cycle.kickoffReplayCloses));
    const graduation = eventState(time, Date.parse(cycle.graduationStarts), Date.parse(cycle.graduationEnds), Date.parse(cycle.cartCloses));
    const cart = time >= Date.parse(cycle.graduationStarts) && time < Date.parse(cycle.cartCloses) ? 'open' : 'closed';
    const day = Math.max(0, Math.min(7, Math.floor((time - Date.parse(cycle.challengeStart)) / 86400000) + 1));
    return { now, kickoff, graduation, cart, day, cycle };
  }

  function apply(root, input) {
    const scope = root || document;
    const state = launchState(input);
    if (document.body) {
      document.body.dataset.kickoffState = state.kickoff;
      document.body.dataset.graduationState = state.graduation;
      document.body.dataset.cartState = state.cart;
      document.body.dataset.challengeDay = String(state.day);
    }
    scope.querySelectorAll('[data-launch-show]').forEach(function (element) {
      const requirements = element.dataset.launchShow.split(',').map(function (value) { return value.trim(); });
      element.hidden = !requirements.some(function (requirement) {
        const pair = requirement.split(':');
        return pair.length === 2 && state[pair[0]] === pair[1];
      });
    });
    scope.querySelectorAll('[data-launch-href]').forEach(function (element) {
      const destination = cycle.routes[element.dataset.launchHref];
      if (destination) element.setAttribute('href', destination);
      else element.setAttribute('aria-disabled', 'true');
    });
    document.dispatchEvent(new CustomEvent('sevensevenseven:state', { detail: state }));
    return state;
  }

  window.SevenSevenSevenLaunch = { cycle, launchState, apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(document); });
  else apply(document);
})();
